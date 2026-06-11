require('dotenv').config();

const path = require('path');
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
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

function signUser(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, jwtSecret, { expiresIn: '8h' });
}

function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

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

function requireFields(body, fields) {
  const missing = fields.filter((field) => !String(body[field] || '').trim());
  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

app.get('/api/health', async (req, res, next) => {
  try {
    res.json(await store.checkConnection());
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { role = 'customer', name, email, password, phone = '' } = req.body;
    requireFields(req.body, ['name', 'email', 'password']);

    if (!['admin', 'customer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid user role.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await store.createUser({ role, name, email, phone, passwordHash });
    res.status(201).json({ user, token: signUser(user) });
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
    res.json({ user, token: signUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/customer/dashboard', requireAuth('customer'), async (req, res, next) => {
  try {
    res.json(await store.getCustomerDashboard(req.user.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/dashboard', requireAuth('admin'), async (req, res, next) => {
  try {
    res.json(await store.getAdminDashboard());
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/vehicles', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['make', 'model', 'plate', 'year']);
    res.status(201).json(await store.createVehicle(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/vehicles/:id', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['make', 'model', 'plate', 'year']);
    const vehicle = await store.updateVehicle(req.params.id, req.user.id, req.body, true);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json(vehicle);
  } catch (error) {
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
    requireFields(req.body, ['rating', 'feedback']);
    await store.createFeedback(req.user.id, req.body);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/profile', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone']);
    const user = await store.updateProfile(req.user.id, req.body);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/invoices/:id/download', requireAuth(), async (req, res, next) => {
  try {
    const text = await store.getInvoiceText(req.params.id, req.user);
    if (!text) return res.status(404).send('Invoice not found.');
    res.type('text/plain').send(text);
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
    await store.cancelBooking(req.params.id, req.user.id, false);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/bookings/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const deleted = await store.deleteBooking(req.params.id, null, false);
    if (!deleted) return res.status(404).json({ message: 'Booking not found.' });
    res.status(204).end();
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
    requireFields(req.body, ['type', 'message']);
    await store.createNotification(req.body);
    res.status(201).json({ ok: true });
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

app.post('/api/admin/vehicles', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'make', 'model', 'plate', 'year']);
    res.status(201).json(await store.createVehicle(Number(req.body.customerId), req.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/vehicles/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'make', 'model', 'plate', 'year']);
    const vehicle = await store.updateVehicle(req.params.id, Number(req.body.customerId), req.body, false);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json(vehicle);
  } catch (error) {
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
  const isCredentialError = message.includes('spawn EPERM') || message.toLowerCase().includes('credential');
  if (isCredentialError) {
    console.warn(message);
  } else {
    console.error(error);
  }
  res.status(error.status || 500).json({
    message: isCredentialError
      ? 'Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_PATH in .env.'
      : message || 'Server error.'
  });
});

store.ensureSeedData()
  .then(() => {
    console.log('Firestore seed data is ready.');
  })
  .catch((error) => {
    const message = String(error.message || '');
    const hint = message.includes('spawn EPERM') || message.toLowerCase().includes('credential')
      ? 'Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_PATH in .env.'
      : message;
    console.warn(`Firestore seed skipped: ${hint}`);
  });

app.listen(port, () => {
  console.log(`AutoCare server running at http://localhost:${port}`);
});
