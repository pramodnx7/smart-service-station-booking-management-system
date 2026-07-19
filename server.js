require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('./src/firestore-store');

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-change-me';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '12mb' }));

const uploadRoot = path.join(__dirname, 'uploads', 'service-files');
fs.mkdirSync(uploadRoot, { recursive: true });

function emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(pair.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7);
  }

  const cookies = parseCookies(req);
  return cookies['autocare-token'] || '';
}

function buildAuthCookie(token) {
  const maxAge = 8 * 60 * 60;
  const parts = [
    `autocare-token=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax'
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  parts.push('HttpOnly');
  return parts.join('; ');
}

function clearAuthCookie() {
  const parts = [
    'autocare-token=',
    'Path=/',
    'Max-Age=0',
    'SameSite=Lax',
    'HttpOnly'
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function sendAuthCookie(res, token) {
  res.setHeader('Set-Cookie', buildAuthCookie(token));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', clearAuthCookie());
}

function signUser(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, jwtSecret, { expiresIn: '8h' });
}

function requireAuth(role) {
  return (req, res, next) => {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    try {
      req.user = jwt.verify(token, jwtSecret);
      if (role && req.user.role !== role) {
        return res.status(403).json({ message: 'Access denied.' });
      }
      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired session.' });
    }
  };
}

function requireDashboardAccess(role) {
  return (req, res, next) => {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.redirect('/index.html');
    }

    try {
      const session = jwt.verify(token, jwtSecret);
      if (session.role !== role) {
        return res.redirect('/index.html');
      }

      return next();
    } catch (error) {
      return res.redirect('/index.html');
    }
  };
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => !String(body[field] || '').trim());
  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

function validateProfileAvatar(avatar) {
  const value = String(avatar || '');
  if (!value) return '';
  if (!/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value)) {
    const error = new Error('Profile picture must be a JPG, PNG or WebP image.');
    error.status = 400;
    throw error;
  }
  if (Buffer.byteLength(value, 'utf8') > 700 * 1024) {
    const error = new Error('Profile picture is too large. Please choose a smaller image.');
    error.status = 400;
    throw error;
  }
  return value;
}

function storeUploadedFile(file) {
  const fileName = String(file.fileName || '').trim();
  const extension = fileName.split('.').pop().toLowerCase();
  const allowed = ['jpg', 'jpeg', 'png', 'pdf', 'docx'];
  const content = String(file.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const sizeBytes = Buffer.byteLength(content, 'base64');
  if (!fileName || !allowed.includes(extension)) {
    const error = new Error('Unsupported file type. Allowed formats: JPG, PNG, PDF, DOCX.');
    error.status = 400;
    throw error;
  }
  if (!content || sizeBytes > 5 * 1024 * 1024) {
    const error = new Error('File is required and must be 5MB or smaller.');
    error.status = 400;
    throw error;
  }
  const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
  const absolutePath = path.join(uploadRoot, safeName);
  fs.writeFileSync(absolutePath, Buffer.from(content, 'base64'));
  return {
    absolutePath,
    relativePath: `uploads/service-files/${safeName}`,
    originalName: fileName,
    mimeType: file.mimeType || 'application/octet-stream',
    sizeBytes: fs.statSync(absolutePath).size
  };
}

function assertImageUpload(file, label = 'Image') {
  const fileName = String(file?.fileName || '').trim();
  const extension = fileName.split('.').pop().toLowerCase();
  if (!['jpg', 'jpeg', 'png'].includes(extension)) {
    const error = new Error(`${label} must be a JPG or PNG file.`);
    error.status = 400;
    throw error;
  }
}

async function handleFileUpload(req, res, next, kind) {
  try {
    requireFields(req.body, ['serviceJobId']);
    const files = Array.isArray(req.body.files) ? req.body.files : [req.body];
    const saved = [];
    for (const file of files) {
      const storedFile = storeUploadedFile(file);
      const payload = { ...req.body, ...file };
      try {
        saved.push(kind === 'photo'
          ? await store.recordStoredPhoto(req.user, payload, storedFile)
          : await store.recordStoredDocument(req.user, payload, storedFile));
      } catch (error) {
        if (storedFile.absolutePath && fs.existsSync(storedFile.absolutePath)) {
          fs.unlinkSync(storedFile.absolutePath);
        }
        throw error;
      }
    }
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
}

app.get('/api/health', async (req, res, next) => {
  try {
    res.json(await store.checkConnection());
  } catch (error) {
    next(error);
  }
});

app.get('/api/public/service-ratings', async (req, res, next) => {
  try {
    res.json({ services: await store.getPublicServiceRatings() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { role = 'customer', name, email, password, phone = '' } = req.body;
    requireFields(req.body, ['name', 'email', 'password']);

    if (role !== 'customer') {
      return res.status(400).json({ message: 'Public registration is available for customers only.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await store.createUser({ role, name, email, phone, passwordHash });
    const token = signUser(user);
    sendAuthCookie(res, token);
    res.status(201).json({ user, token });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { role, email, password } = req.body;
    requireFields(req.body, ['role', 'email', 'password']);

    const userRecord = await store.findUserByEmailRole(email, role);
    const isValid = userRecord ? await bcrypt.compare(password, userRecord.passwordHash) : false;

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email, password or selected role.' });
    }

    const user = store.publicUser(userRecord);
    const token = signUser(user);
    sendAuthCookie(res, token);
    res.json({ user, token });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/session', requireAuth(), (req, res) => {
  res.json({ user: req.user, token: getTokenFromRequest(req) });
});

app.put('/api/profile', requireAuth(), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone']);
    const payload = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(payload, 'avatar')) payload.avatar = validateProfileAvatar(payload.avatar);
    const user = await store.updateProfile(req.user.id, payload);
    const token = signUser(user);
    sendAuthCookie(res, token);
    res.json({ user, token });
  } catch (error) {
    next(error);
  }
});

app.get('/admin-dashboard.html', requireDashboardAccess('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.get('/customer-dashboard.html', requireDashboardAccess('customer'), (req, res) => {
  res.sendFile(path.join(__dirname, 'customer-dashboard.html'));
});

app.get('/technician-dashboard.html', requireDashboardAccess('technician'), (req, res) => {
  res.sendFile(path.join(__dirname, 'technician-dashboard.html'));
});

app.use(express.static(path.join(__dirname)));

app.get('/api/customer/dashboard', requireAuth('customer'), async (req, res, next) => {
  try {
    res.json(await store.getCustomerDashboard(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/notifications/:id/read', requireAuth('customer'), async (req, res, next) => {
  try {
    const notification = await store.markCustomerNotificationRead(req.user.id, req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/notifications/read-all', requireAuth('customer'), async (req, res, next) => {
  try {
    res.json(await store.markAllCustomerNotificationsRead(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/dashboard', requireAuth('admin'), async (req, res, next) => {
  try {
    res.json(await store.getAdminDashboard(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/technician/dashboard', requireAuth('technician'), async (req, res, next) => {
  try {
    res.json(await store.getTechnicianDashboard(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.put('/api/technician/notifications/:id/read', requireAuth('technician'), async (req, res, next) => {
  try {
    const notification = await store.markUserNotificationRead(req.user.id, req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/technician/notifications', requireAuth('technician'), async (req, res, next) => {
  try {
    res.json(await store.getUserNotifications(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.put('/api/technician/notifications/read-all', requireAuth('technician'), async (req, res, next) => {
  try {
    res.json(await store.markAllUserNotificationsRead(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/technician/jobs', requireAuth('technician'), async (req, res, next) => {
  try {
    res.json((await store.getTechnicianDashboard(req.user.id)).jobs);
  } catch (error) {
    next(error);
  }
});

app.get('/api/technician/inventory', requireAuth('technician'), async (req, res, next) => {
  try {
    res.json((await store.getTechnicianDashboard(req.user.id)).inventoryParts);
  } catch (error) {
    next(error);
  }
});

app.get('/api/technician/jobs/:id', requireAuth('technician'), async (req, res, next) => {
  try {
    const job = await store.getAssignedServiceJob(req.user.id, req.params.id);
    if (!job) return res.status(404).json({ message: 'Assigned service job not found.' });
    res.json(job);
  } catch (error) {
    next(error);
  }
});

app.post('/api/technician/jobs/:id/progress', requireAuth('technician'), async (req, res, next) => {
  try {
    requireFields(req.body, ['progressPercentage', 'status']);
    res.status(201).json(await store.updateTechnicianProgress(req.user.id, { ...req.body, serviceJobId: req.params.id }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/technician/jobs/:id/notes', requireAuth('technician'), async (req, res, next) => {
  try {
    requireFields(req.body, ['note']);
    res.status(201).json(await store.addTechnicianNote(req.user.id, { ...req.body, serviceJobId: req.params.id }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/technician/jobs/:id/parts', requireAuth('technician'), async (req, res, next) => {
  let storedPartPhoto = null;
  try {
    requireFields(req.body, ['partId', 'quantity']);
    if (req.body.partPhoto) {
      assertImageUpload(req.body.partPhoto, 'Part photo');
      storedPartPhoto = storeUploadedFile(req.body.partPhoto);
    }
    res.status(201).json(await store.addUsedPart(req.user.id, { ...req.body, partPhoto: storedPartPhoto, serviceJobId: req.params.id }));
  } catch (error) {
    if (storedPartPhoto?.absolutePath && fs.existsSync(storedPartPhoto.absolutePath)) {
      fs.unlinkSync(storedPartPhoto.absolutePath);
    }
    next(error);
  }
});

app.post('/api/technician/jobs/:id/parts/request', requireAuth('technician'), async (req, res, next) => {
  try {
    requireFields(req.body, ['request']);
    res.status(201).json(await store.requestAdditionalParts(req.user.id, { ...req.body, serviceJobId: req.params.id }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/technician/jobs/:id/parts/return', requireAuth('technician'), async (req, res, next) => {
  try {
    requireFields(req.body, ['partId', 'quantity']);
    res.status(201).json(await store.returnUnusedPart(req.user.id, { ...req.body, serviceJobId: req.params.id }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/technician/jobs/:id/replaced-parts', requireAuth('technician'), async (req, res, next) => {
  try {
    requireFields(req.body, ['removedPartName', 'condition', 'replacementReason']);
    res.status(201).json(await store.recordReplacedPart(req.user.id, { ...req.body, serviceJobId: req.params.id }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/technician/jobs/:id/images', requireAuth('technician'), async (req, res, next) => {
  try {
    requireFields(req.body, ['imageUrl']);
    res.status(201).json(await store.uploadServiceImage(req.user.id, { ...req.body, serviceJobId: req.params.id }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/technician/jobs/:id/photos/upload', requireAuth('technician'), async (req, res, next) => {
  req.body.serviceJobId = req.params.id;
  await handleFileUpload(req, res, next, 'photo');
});

app.post('/api/technician/jobs/:id/documents/upload', requireAuth('technician'), async (req, res, next) => {
  req.body.serviceJobId = req.params.id;
  await handleFileUpload(req, res, next, 'document');
});

app.put('/api/technician/jobs/:id/complete', requireAuth('technician'), async (req, res, next) => {
  try {
    res.json(await store.completeTechnicianJob(req.user.id, req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/vehicles', requireAuth('customer'), async (req, res, next) => {
  let storedVehicleImage = null;
  try {
    requireFields(req.body, ['make', 'model', 'plate', 'year']);
    if (req.body.vehicleImage) {
      assertImageUpload(req.body.vehicleImage, 'Vehicle image');
      storedVehicleImage = storeUploadedFile(req.body.vehicleImage);
    }
    res.status(201).json(await store.createVehicle(req.user.id, {
      ...req.body,
      image: storedVehicleImage?.relativePath || req.body.image
    }));
  } catch (error) {
    if (storedVehicleImage?.absolutePath && fs.existsSync(storedVehicleImage.absolutePath)) {
      fs.unlinkSync(storedVehicleImage.absolutePath);
    }
    next(error);
  }
});

app.put('/api/customer/vehicles/:id', requireAuth('customer'), async (req, res, next) => {
  let storedVehicleImage = null;
  try {
    requireFields(req.body, ['make', 'model', 'plate', 'year']);
    if (req.body.vehicleImage) {
      assertImageUpload(req.body.vehicleImage, 'Vehicle image');
      storedVehicleImage = storeUploadedFile(req.body.vehicleImage);
    }
    const vehicle = await store.updateVehicle(req.params.id, req.user.id, {
      ...req.body,
      image: storedVehicleImage?.relativePath || req.body.image
    }, true);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json(vehicle);
  } catch (error) {
    if (storedVehicleImage?.absolutePath && fs.existsSync(storedVehicleImage.absolutePath)) {
      fs.unlinkSync(storedVehicleImage.absolutePath);
    }
    next(error);
  }
});

app.delete('/api/customer/vehicles/:id', requireAuth('customer'), async (req, res, next) => {
  try {
    await store.deleteVehicle(req.params.id, req.user.id, true);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/customer/booking-slots', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.query, ['service', 'date']);
    res.json(await store.getBookingSlots({
      service: req.query.service,
      date: req.query.date,
      excludeBookingId: req.query.excludeBookingId
    }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/bookings', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['vehicleId', 'service', 'date', 'time']);
    res.status(201).json(await store.createBooking(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/bookings/:id', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['vehicleId', 'service', 'date', 'time']);
    const booking = await store.updateBooking(req.params.id, req.user.id, req.body, true);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    res.json(booking);
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/bookings/:id/cancel', requireAuth('customer'), async (req, res, next) => {
  try {
    const cancelled = await store.cancelBooking(req.params.id, req.user.id, true);
    if (!cancelled) return res.status(404).json({ message: 'Booking not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/emergency', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['location', 'problem']);
    const request = await store.createEmergency(req.user.id, req.body);
    res.status(201).json({ id: request.id, customerId: request.userId, location: request.location, problem: request.problem, status: request.status });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/feedback', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['service', 'rating', 'feedback']);
    await store.createFeedback(req.user.id, req.body);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/profile', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone']);
    const payload = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(payload, 'avatar')) payload.avatar = validateProfileAvatar(payload.avatar);
    const user = await store.updateProfile(req.user.id, payload);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/invoices/:id/pdf', requireAuth(), async (req, res, next) => {
  try {
    const pdf = await store.getInvoicePdf(req.params.id, req.user);
    if (!pdf) return res.status(404).send('Invoice not found.');
    res.type('application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="AutoCare-Invoice-${req.params.id}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

app.post('/api/invoices/:id/email', requireAuth('admin'), async (req, res, next) => {
  try {
    await store.markInvoiceEmailed(req.params.id, req.user.id);
    res.json({ ok: true, message: 'Invoice email recorded for sending.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/files/:kind/:id/download', requireAuth(), async (req, res, next) => {
  try {
    const file = await store.getFileForDownload(req.user, req.params.kind, req.params.id);
    if (!file || !file.filePath || !fs.existsSync(file.filePath)) return res.status(404).send('File not found.');
    res.download(file.filePath, file.fileName || path.basename(file.filePath));
  } catch (error) {
    next(error);
  }
});

app.get('/api/part-usages/:id/photo', requireAuth(), async (req, res, next) => {
  try {
    const file = await store.getPartUsagePhotoForDownload(req.user, req.params.id);
    if (!file || !file.filePath || !fs.existsSync(file.filePath)) return res.status(404).send('File not found.');
    res.download(file.filePath, file.fileName || path.basename(file.filePath));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/bookings/:id/status', requireAuth('admin'), async (req, res, next) => {
  try {
    const booking = await store.advanceBooking(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    res.json(booking);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/bookings/:id/cancel', requireAuth('admin'), async (req, res, next) => {
  try {
    const cancelled = await store.cancelBooking(req.params.id, req.user.id, false);
    if (!cancelled) return res.status(404).json({ message: 'Booking not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/customer/bookings/:id', requireAuth('customer'), async (req, res, next) => {
  try {
    const deleted = await store.deleteBooking(req.params.id, req.user.id, true);
    if (!deleted) return res.status(404).json({ message: 'Booking not found or access denied.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/notifications', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['userId', 'type', 'message']);
    const notification = await store.createNotification(req.body, req.user.id);
    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/notifications/:id/read', requireAuth('admin'), async (req, res, next) => {
  try {
    const notification = await store.markUserNotificationRead(req.user.id, req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/notifications', requireAuth('admin'), async (req, res, next) => {
  try {
    res.json(await store.getUserNotifications(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/message-center', requireAuth('admin'), async (req, res, next) => {
  try {
    res.json(await store.getAdminMessageCenter(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/notification-drafts', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['userId', 'type', 'message']);
    res.status(201).json(await store.createNotificationDraft(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/notification-drafts/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const deleted = await store.deleteNotificationDraft(req.user.id, req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Notification draft not found.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/notifications/read-all', requireAuth('admin'), async (req, res, next) => {
  try {
    res.json(await store.markAllUserNotificationsRead(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/customers', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone']);
    const passwordHash = await bcrypt.hash(req.body.password || 'customer123', 12);
    const user = await store.createCustomer({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      status: req.body.status || 'active'
    }, passwordHash);
    res.status(201).json({ id: user.id, name: user.name, email: user.email, phone: user.phone, status: 'Active' });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/customers/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone']);
    const user = await store.updateCustomer(req.params.id, req.body);
    if (!user) return res.status(404).json({ message: 'Customer not found.' });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/customers/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const deleted = await store.deleteCustomer(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Customer not found.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/technicians', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone', 'employeeNo', 'specialization', 'experienceYears']);
    const passwordHash = await bcrypt.hash(req.body.password || 'tech123', 12);
    res.status(201).json(await store.createTechnician(req.body, passwordHash));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/technicians/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone', 'employeeNo', 'specialization', 'experienceYears', 'status']);
    const technician = await store.updateTechnician(req.params.id, req.body);
    if (!technician) return res.status(404).json({ message: 'Technician not found.' });
    res.json(technician);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/technicians/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const deleted = await store.deleteTechnician(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Technician not found.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/technicians/workload', requireAuth('admin'), async (req, res, next) => {
  try {
    res.json(await store.getTechnicianWorkload());
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/technicians/performance', requireAuth('admin'), async (req, res, next) => {
  try {
    res.json(await store.getTechnicianPerformance());
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/inventory/reports', requireAuth('admin'), async (req, res, next) => {
  try {
    res.json(await store.getInventoryReports());
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/reports/sales/pdf', requireAuth('admin'), async (req, res, next) => {
  try {
    const pdf = await store.getOverallSalesReportPdf();
    res.type('application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="AutoCare-Overall-Sales-Report.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/reports/overall/pdf', requireAuth('admin'), async (req, res, next) => {
  try {
    const pdf = await store.getOverallSystemReportPdf();
    res.type('application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="AutoCare-Overall-System-Report.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/service-jobs/:id/photos/upload', requireAuth('admin'), async (req, res, next) => {
  req.body.serviceJobId = req.params.id;
  await handleFileUpload(req, res, next, 'photo');
});

app.post('/api/admin/service-jobs/:id/documents/upload', requireAuth('admin'), async (req, res, next) => {
  req.body.serviceJobId = req.params.id;
  await handleFileUpload(req, res, next, 'document');
});

app.delete('/api/admin/files/:kind/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const file = await store.deleteStoredFile(req.user, req.params.kind, req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found.' });
    if (file.filePath && fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/inventory/items', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['itemCode', 'partName', 'category', 'brand', 'purchasePrice', 'sellingPrice', 'stockQuantity', 'minimumStockLevel']);
    res.status(201).json(await store.createInventoryItem(req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/inventory/items/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['itemCode', 'partName', 'category', 'brand', 'purchasePrice', 'sellingPrice', 'stockQuantity', 'minimumStockLevel']);
    const item = await store.updateInventoryItem(req.params.id, req.body);
    if (!item) return res.status(404).json({ message: 'Inventory item not found.' });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/inventory/items/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    await store.deleteInventoryItem(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/inventory/suppliers', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name']);
    res.status(201).json(await store.createInventorySupplier(req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/inventory/suppliers/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name']);
    const supplier = await store.updateInventorySupplier(req.params.id, req.body);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/vehicles', requireAuth('admin'), async (req, res, next) => {
  let storedVehicleImage = null;
  try {
    requireFields(req.body, ['customerId', 'make', 'model', 'plate', 'year']);
    if (req.body.vehicleImage) {
      assertImageUpload(req.body.vehicleImage, 'Vehicle image');
      storedVehicleImage = storeUploadedFile(req.body.vehicleImage);
    }
    res.status(201).json(await store.createVehicle(Number(req.body.customerId), {
      ...req.body,
      image: storedVehicleImage?.relativePath || req.body.image
    }));
  } catch (error) {
    if (storedVehicleImage?.absolutePath && fs.existsSync(storedVehicleImage.absolutePath)) {
      fs.unlinkSync(storedVehicleImage.absolutePath);
    }
    next(error);
  }
});

app.put('/api/admin/vehicles/:id', requireAuth('admin'), async (req, res, next) => {
  let storedVehicleImage = null;
  try {
    requireFields(req.body, ['customerId', 'make', 'model', 'plate', 'year']);
    if (req.body.vehicleImage) {
      assertImageUpload(req.body.vehicleImage, 'Vehicle image');
      storedVehicleImage = storeUploadedFile(req.body.vehicleImage);
    }
    const vehicle = await store.updateVehicle(req.params.id, Number(req.body.customerId), {
      ...req.body,
      image: storedVehicleImage?.relativePath || req.body.image
    }, false);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json(vehicle);
  } catch (error) {
    if (storedVehicleImage?.absolutePath && fs.existsSync(storedVehicleImage.absolutePath)) {
      fs.unlinkSync(storedVehicleImage.absolutePath);
    }
    next(error);
  }
});

app.delete('/api/admin/vehicles/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    await store.deleteVehicle(req.params.id, req.user.id, false);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/services', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'price', 'duration', 'description']);
    res.status(201).json(await store.createService(req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/services/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'price', 'duration', 'description']);
    const service = await store.updateService(req.params.id, req.body);
    if (!service) return res.status(404).json({ message: 'Service package not found.' });
    res.json(service);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/booking-slots', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.query, ['service', 'date']);
    res.json(await store.getBookingSlots({
      service: req.query.service,
      date: req.query.date,
      excludeBookingId: req.query.excludeBookingId
    }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/bookings', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'vehicleId', 'service', 'date', 'time', 'status']);
    res.status(201).json(await store.createBooking(Number(req.body.customerId), req.body, req.body.status));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/bookings/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'vehicleId', 'service', 'date', 'time', 'status']);
    const booking = await store.updateBooking(req.params.id, Number(req.body.customerId), req.body, false);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    res.json(booking);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/service-jobs', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['bookingId', 'serviceType', 'priority', 'expectedCompletionDate']);
    res.status(201).json(await store.createServiceJob(req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/service-jobs/:id/assign', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['technicianId']);
    res.json(await store.assignTechnician(req.params.id, req.body.technicianId));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/service-jobs/:id/details', requireAuth('admin'), async (req, res, next) => {
  try {
    const details = await store.getAdminServiceJobDetails(req.params.id);
    if (!details) return res.status(404).json({ message: 'Service job not found.' });
    res.json(details);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/invoices', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'service', 'amount', 'payment', 'date']);
    res.status(201).json(await store.createInvoice(req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/invoices/:id/pay', requireAuth('admin'), async (req, res, next) => {
  try {
    const invoice = await store.updateDocument(store.collections.invoices, req.params.id, { paymentStatus: 'Paid' });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/emergencies/:id/close', requireAuth('admin'), async (req, res, next) => {
  try {
    const request = await store.updateDocument(store.collections.emergencyRequests, req.params.id, { status: 'Closed' });
    if (!request) return res.status(404).json({ message: 'Emergency request not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  const message = String(error.message || '');
  const isCredentialError = message.includes('spawn EPERM')
    || message.toLowerCase().includes('credential')
    || message.toLowerCase().includes('service account');
  if (isCredentialError) {
    console.warn(message);
  } else {
    console.error(error);
  }
  res.status(error.status || 500).json({
    message: message || 'Server error.'
  });
});

store.ensureSeedData()
  .then(() => {
    console.log('Firestore seed data is ready.');
  })
  .catch((error) => {
    const message = String(error.message || '');
    console.warn(`Firestore seed skipped: ${message}`);
  });

app.listen(port, () => {
  console.log(`AutoCare server running at http://localhost:${port}`);
});
