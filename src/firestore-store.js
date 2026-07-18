const bcrypt = require('bcryptjs');
const { admin, db, firebaseConfigurationError } = require('./firebase');

const collections = {
  users: 'users',
  vehicles: 'vehicles',
  servicePackages: 'servicePackages',
  bookings: 'bookings',
  invoices: 'invoices',
  emergencyRequests: 'emergencyRequests',
  notifications: 'notifications',
  feedback: 'feedback',
  technicians: 'technicians',
  serviceJobs: 'serviceJobs',
  technicianNotes: 'technicianNotes',
  technicianProgress: 'technicianProgress',
  serviceJobParts: 'serviceJobParts',
  inventoryParts: 'inventoryParts',
  inventoryCategories: 'inventoryCategories',
  inventorySuppliers: 'inventorySuppliers',
  inventoryMovements: 'inventoryMovements',
  replacedParts: 'replacedParts',
  serviceImages: 'servicePhotos',
  documents: 'documents',
  uploadAuditLogs: 'uploadAuditLogs'
};

const defaultImage = 'assets/images/hero-blue-workshop.png';
const serviceJobStatuses = ['Pending', 'Assigned', 'In Progress', 'Waiting For Parts', 'Quality Check', 'Completed', 'Cancelled'];
const inventoryCategories = ['Engine Parts', 'Brake System', 'Electrical', 'Suspension', 'Cooling System', 'Filters', 'Fluids & Lubricants', 'Batteries', 'Tires & Wheels', 'Accessories'];
const partConditions = ['Brand New', 'Used', 'Refurbished', 'Reconditioned', 'Customer Supplied'];
const lowStockThreshold = 5;
const photoTypes = ['Before Service', 'During Service', 'After Service', 'Replaced Part', 'Vehicle Inspection'];
const documentTypes = ['Service Report', 'Inspection Report', 'Warranty Document', 'Customer Attachment', 'Vehicle Registration Document', 'Insurance Document', 'Service Checklist', 'Invoice PDF'];
const allowedUploadExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'docx'];
const maxUploadBytes = 5 * 1024 * 1024;
const serviceBayCount = Number(process.env.SERVICE_BAY_COUNT || 8);
const serviceDayStartHour = Number(process.env.SERVICE_DAY_START_HOUR || 8);
const serviceDayEndHour = Number(process.env.SERVICE_DAY_END_HOUR || 17);
const serviceSlotMinutes = Number(process.env.SERVICE_SLOT_MINUTES || 60);
const serviceSpecializations = [
  'General Service',
  'Oil Change',
  'Brake Service',
  'Electrical Repair',
  'Engine Repair',
  'Suspension Repair',
  'Hybrid/EV Service'
];
const serviceAliases = {
  'Full Service': 'General Service',
  'Engine Diagnostics': 'Engine Repair'
};

function fieldValue() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function asId(value) {
  return Number(value);
}

function emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function titleCase(value) {
  const text = String(value || '').trim();
  return text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : text;
}

function formatDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value.toDate) return value.toDate().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function today(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function sortById(items) {
  return items.sort((a, b) => Number(a.id) - Number(b.id));
}

function sortDateDesc(items, dateField, timeField = '') {
  return items.sort((a, b) => {
    const left = `${b[dateField] || ''} ${b[timeField] || ''}`;
    const right = `${a[dateField] || ''} ${a[timeField] || ''}`;
    return left.localeCompare(right);
  });
}

function pdfEscape(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pdfText(text, x, y, options = {}) {
  const size = Number(options.size || 10);
  const font = options.bold ? 'F2' : 'F1';
  const color = options.color || '0.12 0.22 0.34';
  const value = pdfEscape(text);
  const estimatedWidth = value.length * size * (options.bold ? 0.56 : 0.51);
  const textX = options.align === 'right' ? x - estimatedWidth : x;
  return `BT ${color} rg /${font} ${size} Tf ${textX.toFixed(1)} ${y} Td (${value}) Tj ET`;
}

function pdfRect(x, y, width, height, options = {}) {
  const commands = [];
  if (options.fill) commands.push(`${options.fill} rg ${x} ${y} ${width} ${height} re f`);
  if (options.stroke) commands.push(`${options.stroke} RG ${options.lineWidth || 1} w ${x} ${y} ${width} ${height} re S`);
  return commands.join('\n');
}

function createPdfDocument(pageContents) {
  const pageCount = pageContents.length;
  const firstPageId = 3;
  const regularFontId = firstPageId + pageCount;
  const boldFontId = regularFontId + 1;
  const firstContentId = boldFontId + 1;
  const pageIds = pageContents.map((_, index) => firstPageId + index);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...pageContents.map((_, index) => (
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${firstContentId + index} 0 R >>`
    )),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ...pageContents.map((content) => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function createInvoicePdfBuffer(details) {
  const { invoice, user, service, job, vehicle, technicianName, parts } = details;
  const partChunks = [];
  const firstPageRows = 8;
  const followingPageRows = 12;
  partChunks.push(parts.slice(0, firstPageRows));
  for (let index = firstPageRows; index < parts.length; index += followingPageRows) {
    partChunks.push(parts.slice(index, index + followingPageRows));
  }
  if (!partChunks.length) partChunks.push([]);

  return createPdfDocument(partChunks.map((pageParts, pageIndex) => {
    const commands = [];
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex === partChunks.length - 1;
    const navy = '0.055 0.145 0.255';
    const blue = '0.055 0.55 0.78';
    const pale = '0.94 0.97 0.985';
    const muted = '0.38 0.46 0.54';
    const green = '0.08 0.58 0.38';

    commands.push(pdfRect(0, 682, 612, 110, { fill: navy }));
    commands.push(pdfRect(0, 676, 612, 6, { fill: blue }));
    commands.push(pdfText('AUTOCARE', 44, 744, { size: 24, bold: true, color: '1 1 1' }));
    commands.push(pdfText('SMART SERVICE STATION', 45, 726, { size: 8, color: '0.62 0.84 0.94' }));
    commands.push(pdfText('INVOICE', 568, 744, { size: 20, bold: true, color: '1 1 1', align: 'right' }));
    commands.push(pdfText(`#INV-${invoice.id}`, 568, 724, { size: 11, color: '0.78 0.9 0.96', align: 'right' }));
    commands.push(pdfText(`Page ${pageIndex + 1} of ${partChunks.length}`, 568, 707, { size: 8, color: '0.72 0.8 0.86', align: 'right' }));

    let tableTop;
    if (isFirstPage) {
      commands.push(pdfText('BILLED TO', 44, 646, { size: 8, bold: true, color: blue }));
      commands.push(pdfText(user?.name || 'Customer', 44, 626, { size: 13, bold: true }));
      commands.push(pdfText(user?.email || '-', 44, 609, { size: 9, color: muted }));
      commands.push(pdfText(user?.phone || '-', 44, 594, { size: 9, color: muted }));

      commands.push(pdfRect(318, 584, 250, 67, { fill: pale }));
      commands.push(pdfText('ISSUE DATE', 334, 632, { size: 7, bold: true, color: muted }));
      commands.push(pdfText(formatDate(invoice.invoiceDate) || '-', 334, 613, { size: 10, bold: true }));
      commands.push(pdfText('PAYMENT STATUS', 454, 632, { size: 7, bold: true, color: muted }));
      commands.push(pdfText(invoice.paymentStatus || 'Pending', 454, 613, { size: 10, bold: true, color: invoice.paymentStatus === 'Paid' ? green : blue }));

      commands.push(pdfRect(44, 500, 524, 62, { stroke: '0.84 0.88 0.91' }));
      commands.push(pdfText('VEHICLE', 59, 542, { size: 7, bold: true, color: muted }));
      commands.push(pdfText(vehicle ? `${vehicle.make} ${vehicle.model}` : 'Not assigned', 59, 523, { size: 10, bold: true }));
      commands.push(pdfText(vehicle?.plateNumber || '-', 59, 508, { size: 8, color: muted }));
      commands.push(pdfText('SERVICE', 240, 542, { size: 7, bold: true, color: muted }));
      commands.push(pdfText(service?.name || 'Service', 240, 523, { size: 10, bold: true }));
      commands.push(pdfText(job ? `Job #SJ-${job.id}` : 'General invoice', 240, 508, { size: 8, color: muted }));
      commands.push(pdfText('TECHNICIAN', 414, 542, { size: 7, bold: true, color: muted }));
      commands.push(pdfText(technicianName || 'Unassigned', 414, 523, { size: 9, bold: true }));
      tableTop = 473;
    } else {
      commands.push(pdfText('ITEMIZED PARTS - CONTINUED', 44, 642, { size: 12, bold: true }));
      tableTop = 618;
    }

    commands.push(pdfRect(44, tableTop - 24, 524, 24, { fill: navy }));
    commands.push(pdfText('ITEM / DESCRIPTION', 56, tableTop - 16, { size: 8, bold: true, color: '1 1 1' }));
    commands.push(pdfText('QTY', 371, tableTop - 16, { size: 8, bold: true, color: '1 1 1', align: 'right' }));
    commands.push(pdfText('UNIT PRICE', 464, tableTop - 16, { size: 8, bold: true, color: '1 1 1', align: 'right' }));
    commands.push(pdfText('AMOUNT', 556, tableTop - 16, { size: 8, bold: true, color: '1 1 1', align: 'right' }));

    if (!pageParts.length) {
      commands.push(pdfRect(44, tableTop - 55, 524, 31, { fill: '0.98 0.985 0.99' }));
      commands.push(pdfText('No replacement parts recorded for this service.', 56, tableTop - 44, { size: 9, color: muted }));
    }
    pageParts.forEach((part, index) => {
      const rowTop = tableTop - 24 - (index * 31);
      if (index % 2 === 0) commands.push(pdfRect(44, rowTop - 31, 524, 31, { fill: '0.975 0.985 0.992' }));
      const label = [part.partName || 'Part', part.brand, part.condition].filter(Boolean).join(' - ').slice(0, 52);
      commands.push(pdfText(label, 56, rowTop - 20, { size: 8.5 }));
      commands.push(pdfText(Number(part.quantity || 0), 371, rowTop - 20, { size: 8.5, align: 'right' }));
      commands.push(pdfText(money(part.unitPrice), 464, rowTop - 20, { size: 8.5, align: 'right' }));
      commands.push(pdfText(money(part.totalPrice || Number(part.quantity || 0) * Number(part.unitPrice || 0)), 556, rowTop - 20, { size: 8.5, bold: true, align: 'right' }));
    });

    if (isLastPage) {
      const rowCount = Math.max(pageParts.length, 1);
      const totalsTop = tableTop - 24 - (rowCount * 31) - 18;
      const totalRows = [
        ['Parts subtotal', invoice.partsTotal],
        ['Labor charges', invoice.laborCost],
        ['Service charges', invoice.serviceCharges],
        ['Tax', invoice.tax],
        ['Discount', -Number(invoice.discount || 0)]
      ];
      totalRows.forEach(([label, value], index) => {
        commands.push(pdfText(label, 414, totalsTop - (index * 18), { size: 8.5, color: muted, align: 'right' }));
        commands.push(pdfText(money(value), 556, totalsTop - (index * 18), { size: 8.5, align: 'right' }));
      });
      const grandY = totalsTop - 112;
      commands.push(pdfRect(350, grandY - 12, 218, 38, { fill: navy }));
      commands.push(pdfText('TOTAL', 414, grandY + 2, { size: 10, bold: true, color: '1 1 1', align: 'right' }));
      commands.push(pdfText(money(invoice.amount), 556, grandY + 2, { size: 12, bold: true, color: '1 1 1', align: 'right' }));
    }

    commands.push(pdfRect(44, 40, 524, 1, { fill: '0.82 0.87 0.9' }));
    commands.push(pdfText('Thank you for choosing AutoCare. Drive safe!', 44, 23, { size: 8, bold: true, color: navy }));
    commands.push(pdfText('Computer-generated invoice', 568, 23, { size: 7.5, color: muted, align: 'right' }));
    return commands.filter(Boolean).join('\n');
  }));
}

function docRef(collection, id) {
  return db.collection(collection).doc(String(id));
}

function assertFirebaseConfigured() {
  if (db) return;

  const error = new Error(
    firebaseConfigurationError
    || 'Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID and one credential option in .env.'
  );
  error.status = 500;
  throw error;
}

async function all(collection) {
  assertFirebaseConfigured();
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map((doc) => ({ id: Number(doc.id), ...doc.data() }));
}

async function getById(collection, id) {
  assertFirebaseConfigured();
  const snapshot = await docRef(collection, id).get();
  return snapshot.exists ? { id: Number(snapshot.id), ...snapshot.data() } : null;
}

async function nextId(transaction, collection) {
  const counterRef = db.collection('meta').doc('counters');
  const snapshot = await transaction.get(counterRef);
  const counters = snapshot.exists ? snapshot.data() : {};
  const id = Number(counters[collection] || 0) + 1;
  transaction.set(counterRef, { [collection]: id }, { merge: true });
  return id;
}

async function nextIds(transaction, collection, count) {
  const counterRef = db.collection('meta').doc('counters');
  const snapshot = await transaction.get(counterRef);
  const counters = snapshot.exists ? snapshot.data() : {};
  const start = Number(counters[collection] || 0) + 1;
  const ids = Array.from({ length: count }, (_, index) => start + index);
  transaction.set(counterRef, { [collection]: start + count - 1 }, { merge: true });
  return ids;
}

async function nextIdsForCollections(transaction, requests) {
  const counterRef = db.collection('meta').doc('counters');
  const snapshot = await transaction.get(counterRef);
  const counters = snapshot.exists ? snapshot.data() : {};
  const updates = {};
  const idsByCollection = {};

  Object.entries(requests).forEach(([collection, count]) => {
    const start = Number(counters[collection] || 0) + 1;
    idsByCollection[collection] = Array.from({ length: count }, (_, index) => start + index);
    updates[collection] = start + count - 1;
  });

  transaction.set(counterRef, updates, { merge: true });
  return idsByCollection;
}

async function createDocument(collection, data) {
  assertFirebaseConfigured();
  return db.runTransaction(async (transaction) => {
    const id = await nextId(transaction, collection);
    const ref = docRef(collection, id);
    transaction.set(ref, { ...data, id, createdAt: fieldValue() });
    return { ...data, id };
  });
}

async function updateDocument(collection, id, data) {
  assertFirebaseConfigured();
  const ref = docRef(collection, id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  await ref.set({ ...data, updatedAt: fieldValue() }, { merge: true });
  return getById(collection, id);
}

async function deleteDocument(collection, id) {
  assertFirebaseConfigured();
  await docRef(collection, id).delete();
}

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone || ''
  };
}

function customerView(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    status: titleCase(user.status || 'active')
  };
}

function technicianView(technician, user) {
  const profile = user || technician.user;
  return {
    id: technician.id,
    userId: technician.userId,
    name: profile?.name || technician.name || 'Unknown technician',
    email: profile?.email || technician.email || '',
    employeeNo: technician.employeeNo,
    specialization: technician.specialization,
    phone: technician.phone || profile?.phone || '',
    experienceYears: Number(technician.experienceYears || 0),
    status: titleCase(technician.status || 'active')
  };
}

function vehicleView(vehicle) {
  const vehicleName = String(vehicle.name || '').trim();
  return {
    id: vehicle.id,
    customerId: vehicle.userId,
    name: vehicleName || `${vehicle.make} ${vehicle.model}`.trim(),
    make: vehicle.make,
    model: vehicle.model,
    plate: vehicle.plateNumber,
    year: vehicle.year,
    image: vehicle.imageUrl || defaultImage
  };
}

function partView(part) {
  const stock = Number(part.stock ?? part.stockQuantity ?? 0);
  const minimumStockLevel = Number(part.minimumStockLevel ?? part.minStock ?? 0);
  const sellingPrice = Number(part.sellingPrice ?? part.unitPrice ?? 0);
  const purchasePrice = Number(part.purchasePrice || 0);
  return {
    id: part.id,
    itemCode: part.itemCode || part.sku || '',
    name: part.name || part.partName || '',
    partName: part.partName || part.name || '',
    category: part.category || '',
    brand: part.brand || '',
    manufacturer: part.manufacturer || '',
    supplierId: part.supplierId || null,
    supplier: part.supplier || '',
    description: part.description || '',
    purchasePrice,
    sellingPrice,
    stock,
    stockQuantity: stock,
    minimumStockLevel,
    location: part.location || '',
    warrantyPeriod: part.warrantyPeriod || '',
    warrantyProvider: part.warrantyProvider || part.supplier || '',
    status: stock <= 0 ? 'Out of Stock' : stock <= lowStockThreshold ? 'Low Stock' : (part.status === 'Inactive' ? 'Inactive' : 'Active'),
    inventoryValue: stock * purchasePrice,
    retailValue: stock * sellingPrice
  };
}

function inventoryStockStatus(stock, currentStatus = 'Active') {
  if (currentStatus === 'Inactive') return 'Inactive';
  if (Number(stock) <= 0) return 'Out of Stock';
  if (Number(stock) <= lowStockThreshold) return 'Low Stock';
  return 'Active';
}

function bookingView(booking, serviceById) {
  const service = serviceById.get(Number(booking.servicePackageId));
  return {
    id: booking.id,
    customerId: booking.userId,
    vehicleId: booking.vehicleId,
    service: service?.name || booking.serviceName || 'Unknown Service',
    date: formatDate(booking.bookingDate),
    time: String(booking.bookingTime || '').slice(0, 5),
    status: booking.status,
    queue: booking.queuePosition || 0,
    progress: booking.progress || 0,
    assignedTechnicianId: booking.assignedTechnicianId || null,
    serviceBayId: booking.serviceBayId || null,
    serviceBayName: booking.serviceBayName || (booking.serviceBayId ? bayLabel(booking.serviceBayId) : ''),
    durationMinutes: Number(booking.durationMinutes || parseDurationMinutes(service?.duration)),
    startAt: booking.startAt || '',
    endAt: booking.endAt || ''
  };
}

function serviceJobView(job, context = {}) {
  const booking = context.bookingsById?.get(Number(job.bookingId));
  const vehicle = context.vehiclesById?.get(Number(job.vehicleId));
  const customer = context.usersById?.get(Number(job.customerId));
  const technician = context.techniciansById?.get(Number(job.assignedTechnicianId));
  const technicianUser = technician ? context.usersById?.get(Number(technician.userId)) : null;

  return {
    id: job.id,
    bookingId: job.bookingId,
    vehicleId: job.vehicleId,
    customerId: job.customerId,
    assignedTechnicianId: job.assignedTechnicianId || null,
    serviceType: job.serviceType,
    priority: job.priority || 'Normal',
    status: job.status || 'Pending',
    progress: Number(job.progress || 0),
    startDate: formatDate(job.startDate),
    expectedCompletionDate: formatDate(job.expectedCompletionDate),
    completionDate: formatDate(job.completionDate),
    assignedDate: formatDate(job.assignedDate || job.createdAt),
    bookingDate: formatDate(booking?.bookingDate),
    bookingTime: String(booking?.bookingTime || '').slice(0, 5),
    vehicleNumber: vehicle?.plateNumber || '',
    vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}`.trim() : 'Unknown vehicle',
    customerName: customer?.name || 'Unknown customer',
    customerPhone: customer?.phone || '',
    customerEmail: customer?.email || '',
    technicianName: technicianUser?.name || technician?.name || 'Unassigned'
  };
}

function fileView(file, kind = 'photo') {
  const id = Number(file.id);
  return {
    id,
    kind,
    serviceJobId: file.serviceJobId || null,
    vehicleId: file.vehicleId || null,
    customerId: file.customerId || null,
    technicianId: file.technicianId || null,
    photoType: file.photoType || '',
    documentType: file.documentType || '',
    fileName: file.fileName || '',
    fileUrl: `/api/files/${kind}/${id}/download`,
    previewUrl: `/api/files/${kind}/${id}/download`,
    description: file.description || '',
    uploadedBy: file.uploadedBy || '',
    uploadedAt: formatDate(file.uploadedAt || file.createdAt),
    mimeType: file.mimeType || '',
    sizeBytes: Number(file.sizeBytes || 0)
  };
}

function invoiceView(invoice, serviceById) {
  const service = serviceById.get(Number(invoice.servicePackageId));
  return {
    id: invoice.id,
    customerId: invoice.userId,
    serviceJobId: invoice.serviceJobId || null,
    service: service?.name || invoice.serviceName || 'Unknown Service',
    amount: Number(invoice.amount),
    partsTotal: Number(invoice.partsTotal || 0),
    laborCost: Number(invoice.laborCost || 0),
    serviceCharges: Number(invoice.serviceCharges || 0),
    tax: Number(invoice.tax || 0),
    discount: Number(invoice.discount || 0),
    payment: invoice.paymentStatus,
    date: formatDate(invoice.invoiceDate)
  };
}

async function servicesById() {
  const services = await all(collections.servicePackages);
  return new Map(services.map((service) => [Number(service.id), service]));
}

async function dashboardContext() {
  const [users, vehicles, bookings, technicians] = await Promise.all([
    all(collections.users),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.technicians)
  ]);

  return {
    users,
    vehicles,
    bookings,
    technicians,
    usersById: new Map(users.map((user) => [Number(user.id), user])),
    vehiclesById: new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle])),
    bookingsById: new Map(bookings.map((booking) => [Number(booking.id), booking])),
    techniciansById: new Map(technicians.map((technician) => [Number(technician.id), technician]))
  };
}

async function adminUsers() {
  return (await all(collections.users)).filter((user) => user.role === 'admin');
}

async function createUserNotification(userId, type, message) {
  return createDocument(collections.notifications, {
    userId: asId(userId),
    type,
    message,
    unread: true
  });
}

function vehicleNotificationLabel(vehicle) {
  return [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(Boolean)
    .join(' ')
    .trim() || vehicle?.name || 'vehicle';
}

function bookingNotificationMessage(action, booking, service, vehicle) {
  const vehicleText = vehicle ? `${vehicleNotificationLabel(vehicle)} (${vehicle.plateNumber})` : 'your vehicle';
  const serviceText = service?.name || 'service';
  return `${action}: ${serviceText} for ${vehicleText} on ${booking.bookingDate} at ${booking.bookingTime}.`;
}

async function markCustomerNotificationRead(userId, notificationId) {
  const notification = await getById(collections.notifications, notificationId);
  if (!notification || Number(notification.userId) !== Number(userId)) return null;
  return updateDocument(collections.notifications, notificationId, { unread: false });
}

async function markAllCustomerNotificationsRead(userId) {
  const notifications = await all(collections.notifications);
  const owned = notifications.filter((item) => Number(item.userId) === Number(userId) && item.unread);
  await Promise.all(owned.map((item) => updateDocument(collections.notifications, item.id, { unread: false })));
  return { updated: owned.length };
}

async function notifyAdmins(type, message) {
  const admins = await adminUsers();
  await Promise.all(admins.map((user) => createUserNotification(user.id, type, message)));
}

async function getTechnicianByUserId(userId) {
  const technicians = await all(collections.technicians);
  return technicians.find((technician) => Number(technician.userId) === Number(userId)) || null;
}

async function assertTechnician(id, requireActive = true) {
  const technician = await getById(collections.technicians, id);
  if (!technician) {
    const error = new Error('Technician not found.');
    error.status = 404;
    throw error;
  }

  if (requireActive && String(technician.status || '').toLowerCase() !== 'active') {
    const error = new Error('Only active technicians can be assigned to jobs.');
    error.status = 400;
    throw error;
  }

  return technician;
}

function assertServiceJobStatus(status) {
  if (!serviceJobStatuses.includes(status)) {
    const error = new Error('Invalid service job status.');
    error.status = 400;
    throw error;
  }
}

async function findServiceByName(name, activeOnly = false) {
  const services = await all(collections.servicePackages);
  return services.find((service) => {
    const isSameName = String(service.name).toLowerCase() === String(name).toLowerCase();
    return isSameName && (!activeOnly || service.active !== false);
  });
}

async function findUserByEmailRole(email, role) {
  assertFirebaseConfigured();
  const snapshot = await db.collection(collections.users)
    .where('emailLower', '==', emailKey(email))
    .where('role', '==', role)
    .limit(1)
    .get();

  return snapshot.empty ? null : { id: Number(snapshot.docs[0].id), ...snapshot.docs[0].data() };
}

async function emailExists(email, ignoreId) {
  const snapshot = await db.collection(collections.users)
    .where('emailLower', '==', emailKey(email))
    .limit(1)
    .get();

  if (snapshot.empty) return false;
  return Number(snapshot.docs[0].id) !== Number(ignoreId);
}

async function ensureUserByEmailRole({ id, role, name, email, phone = '', passwordHash, status = 'active', syncPassword = false }) {
  assertFirebaseConfigured();
  const existing = await findUserByEmailRole(email, role);
  if (existing) {
    if (syncPassword) {
      await updateDocument(collections.users, existing.id, {
        name,
        phone: String(phone || '').trim(),
        passwordHash,
        status: String(status || 'active').toLowerCase()
      });
    }
    return existing;
  }

  const preferredRef = docRef(collections.users, id);
  const preferredSnapshot = await preferredRef.get();
  const userData = {
    role,
    name,
    email: emailKey(email),
    emailLower: emailKey(email),
    phone: String(phone || '').trim(),
    passwordHash,
    status: String(status || 'active').toLowerCase()
  };

  if (!preferredSnapshot.exists) {
    await preferredRef.set({ ...userData, id, createdAt: fieldValue() });
    return { id, ...userData };
  }

  return createDocument(collections.users, userData);
}

async function createUser({ role, name, email, phone = '', passwordHash, status = 'active' }) {
  if (await emailExists(email)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }

  const user = await createDocument(collections.users, {
    role,
    name: name.trim(),
    email: emailKey(email),
    emailLower: emailKey(email),
    phone: String(phone || '').trim(),
    passwordHash,
    status: String(status || 'active').toLowerCase()
  });

  return publicUser(user);
}

async function getCustomerDashboard(userId) {
  const [user, vehicles, bookings, invoices, notifications, serviceMap, jobs, parts, usages, images, documents] = await Promise.all([
    getById(collections.users, userId),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.invoices),
    all(collections.notifications),
    servicesById(),
    all(collections.serviceJobs),
    all(collections.inventoryParts),
    all(collections.serviceJobParts),
    all(collections.serviceImages),
    all(collections.documents)
  ]);

  const packages = Array.from(serviceMap.values())
    .filter((service) => service.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((service) => service.name);

  const customerJobs = jobs.filter((job) => Number(job.customerId) === Number(userId));
  const customerJobIds = new Set(customerJobs.map((job) => Number(job.id)));
  const context = {
    usersById: new Map([[Number(user.id), user]]),
    vehiclesById: new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle])),
    jobsById: new Map(customerJobs.map((job) => [Number(job.id), job])),
    partsById: new Map(parts.map((part) => [Number(part.id), part])),
    techniciansById: new Map()
  };

  return {
    profile: { name: user.name, email: user.email, phone: user.phone || '' },
    vehicles: sortById(vehicles.filter((item) => item.userId === userId)).map(vehicleView),
    bookings: sortDateDesc(bookings.filter((item) => item.userId === userId).map((item) => bookingView(item, serviceMap)), 'date', 'time'),
    invoices: sortDateDesc(invoices.filter((item) => item.userId === userId).map((item) => invoiceView(item, serviceMap)), 'date'),
    notifications: sortById(notifications.filter((item) => item.userId === userId)).reverse().map(({ id, type, message, unread }) => ({ id, type, message, unread })),
    usedParts: sortById(usages.filter((usage) => customerJobIds.has(Number(usage.serviceJobId)))).reverse().map((usage) => usageView(usage, context)),
    serviceImages: sortById(images.filter((image) => customerJobIds.has(Number(image.serviceJobId)))).reverse().map((image) => fileView(image, 'photo')),
    documents: sortById(documents.filter((document) => Number(document.customerId) === Number(userId) || customerJobIds.has(Number(document.serviceJobId)))).reverse().map((document) => fileView(document, 'document')),
    packages
  };
}

function buildTechnicianWorkload(technicians, jobs, usersById) {
  return technicians.map((technician) => {
    const assigned = jobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id));
    const active = assigned.filter((job) => !['Completed', 'Cancelled'].includes(job.status));
    return {
      technicianId: technician.id,
      name: usersById.get(Number(technician.userId))?.name || technician.name || 'Unknown technician',
      specialization: technician.specialization,
      activeJobs: active.length,
      pendingJobs: active.filter((job) => job.status === 'Assigned' || job.status === 'Pending').length,
      inProgressJobs: active.filter((job) => job.status === 'In Progress').length,
      waitingForParts: active.filter((job) => job.status === 'Waiting For Parts').length,
      completedJobs: assigned.filter((job) => job.status === 'Completed').length
    };
  });
}

function buildTechnicianPerformance(technicians, jobs, usersById) {
  return technicians.map((technician) => {
    const completed = jobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id) && job.status === 'Completed');
    const totalDays = completed.reduce((sum, job) => {
      if (!job.startDate || !job.completionDate) return sum;
      const start = new Date(job.startDate);
      const end = new Date(job.completionDate);
      return sum + Math.max(1, Math.ceil((end - start) / 86400000));
    }, 0);

    return {
      technicianId: technician.id,
      name: usersById.get(Number(technician.userId))?.name || technician.name || 'Unknown technician',
      jobsCompleted: completed.length,
      totalServicesCompleted: completed.length,
      activeJobs: jobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id) && !['Completed', 'Cancelled'].includes(job.status)).length,
      averageCompletionDays: completed.length ? Math.round((totalDays / completed.length) * 10) / 10 : 0,
      customerRating: 0
    };
  });
}

function movementView(movement, partsById = new Map(), techniciansById = new Map(), usersById = new Map(), jobsById = new Map()) {
  const part = partsById.get(Number(movement.partId));
  const technician = techniciansById.get(Number(movement.technicianId || movement.usedByTechnician));
  const technicianUser = technician ? usersById.get(Number(technician.userId)) : null;
  const job = jobsById.get(Number(movement.serviceJobId));
  return {
    id: movement.id,
    partId: movement.partId,
    partName: movement.partName || part?.partName || part?.name || 'Unknown part',
    itemCode: movement.itemCode || part?.itemCode || part?.sku || '',
    serviceJobId: movement.serviceJobId || null,
    technicianId: movement.technicianId || movement.usedByTechnician || null,
    technicianName: technicianUser?.name || 'System',
    vehicleId: movement.vehicleId || job?.vehicleId || null,
    customerId: movement.customerId || job?.customerId || null,
    type: movement.type,
    quantity: Number(movement.quantity || 0),
    condition: movement.condition || '',
    unitPrice: Number(movement.unitPrice || 0),
    totalPrice: Number(movement.totalPrice || 0),
    note: movement.note || '',
    createdAt: formatDate(movement.createdAt)
  };
}

function usageView(usage, context = {}) {
  const part = context.partsById?.get(Number(usage.partId));
  const job = context.jobsById?.get(Number(usage.serviceJobId));
  const vehicle = job ? context.vehiclesById?.get(Number(job.vehicleId)) : null;
  const customer = job ? context.usersById?.get(Number(job.customerId)) : null;
  const technician = context.techniciansById?.get(Number(usage.usedByTechnician));
  const technicianUser = technician ? context.usersById?.get(Number(technician.userId)) : null;
  const unitPrice = Number(usage.unitPrice ?? part?.sellingPrice ?? part?.unitPrice ?? 0);
  const quantity = Number(usage.quantity || 0);
  return {
    id: usage.id,
    serviceJobId: usage.serviceJobId,
    partId: usage.partId,
    itemCode: usage.itemCode || part?.itemCode || part?.sku || '',
    partName: usage.partName || part?.partName || part?.name || 'Unknown part',
    brand: usage.brand || part?.brand || '',
    condition: usage.condition || 'Brand New',
    quantity,
    unitPrice,
    totalPrice: Number(usage.totalPrice ?? quantity * unitPrice),
    warrantyProvider: usage.warrantyProvider || part?.warrantyProvider || part?.supplier || '',
    warrantyPeriod: usage.warrantyPeriod || part?.warrantyPeriod || '',
    warrantyStartDate: formatDate(usage.warrantyStartDate),
    warrantyExpiryDate: formatDate(usage.warrantyExpiryDate),
    usedByTechnician: usage.usedByTechnician,
    technicianName: technicianUser?.name || 'Unknown technician',
    vehicleId: job?.vehicleId || null,
    vehicleNumber: vehicle?.plateNumber || '',
    vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}`.trim() : '',
    customerId: job?.customerId || null,
    customerName: customer?.name || '',
    note: usage.note || '',
    photoUrl: usage.photoUrl || '',
    photoFileName: usage.photoFileName || '',
    photoMimeType: usage.photoMimeType || '',
    photoSizeBytes: Number(usage.photoSizeBytes || 0)
  };
}

function buildInventoryReports(parts, movements, usages, context = {}) {
  const partViews = parts.map(partView);
  const lowStock = partViews.filter((part) => part.stock > 0 && part.stock <= lowStockThreshold);
  const outOfStock = partViews.filter((part) => part.stock <= 0);
  const totalPurchaseValue = partViews.reduce((sum, part) => sum + part.inventoryValue, 0);
  const totalRetailValue = partViews.reduce((sum, part) => sum + part.retailValue, 0);
  const usageViews = usages.map((usage) => usageView(usage, context));
  const month = today().slice(0, 7);
  return {
    inventory: partViews,
    lowStock,
    outOfStock,
    stockMovements: sortById(movements).reverse().map((movement) => movementView(movement, context.partsById, context.techniciansById, context.usersById, context.jobsById)),
    technicianUsage: usageViews,
    vehicleParts: usageViews,
    monthlyUsage: usageViews.filter((usage) => String(usage.warrantyStartDate || '').startsWith(month)),
    inventoryValue: {
      totalPurchaseValue,
      totalRetailValue,
      itemCount: partViews.length,
      stockUnits: partViews.reduce((sum, part) => sum + part.stock, 0)
    }
  };
}

async function getAdminDashboard() {
  const [users, vehicles, bookings, packages, invoices, emergencies, notifications, feedback, technicians, serviceJobs, inventoryParts, suppliers, categories, movements, usages, photos, documents, serviceMap] = await Promise.all([
    all(collections.users),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.servicePackages),
    all(collections.invoices),
    all(collections.emergencyRequests),
    all(collections.notifications),
    all(collections.feedback),
    all(collections.technicians),
    all(collections.serviceJobs),
    all(collections.inventoryParts),
    all(collections.inventorySuppliers),
    all(collections.inventoryCategories),
    all(collections.inventoryMovements),
    all(collections.serviceJobParts),
    all(collections.serviceImages),
    all(collections.documents),
    servicesById()
  ]);

  const context = {
    usersById: new Map(users.map((user) => [Number(user.id), user])),
    vehiclesById: new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle])),
    bookingsById: new Map(bookings.map((booking) => [Number(booking.id), booking])),
    techniciansById: new Map(technicians.map((technician) => [Number(technician.id), technician])),
    jobsById: new Map(serviceJobs.map((job) => [Number(job.id), job])),
    partsById: new Map(inventoryParts.map((part) => [Number(part.id), part]))
  };
  const jobViews = sortById(serviceJobs).map((item) => serviceJobView(item, context));
  const inventoryReports = buildInventoryReports(inventoryParts, movements, usages, context);

  return {
    customers: sortById(users.filter((user) => user.role === 'customer')).map(customerView),
    technicians: sortById(technicians).map((technician) => technicianView(technician, context.usersById.get(Number(technician.userId)))),
    vehicles: sortById(vehicles).map(vehicleView),
    bookings: sortDateDesc(bookings.map((item) => bookingView(item, serviceMap)), 'date', 'time'),
    serviceJobs: jobViews,
    inventoryParts: sortById(inventoryParts).map(partView),
    inventorySuppliers: sortById(suppliers),
    inventoryCategories: sortById(categories),
    stockMovements: inventoryReports.stockMovements,
    partUsageHistory: inventoryReports.technicianUsage,
    servicePhotos: sortById(photos).reverse().map((photo) => fileView(photo, 'photo')),
    documents: sortById(documents).reverse().map((document) => fileView(document, 'document')),
    inventoryReports,
    technicianWorkload: buildTechnicianWorkload(technicians, jobViews, context.usersById),
    technicianPerformance: buildTechnicianPerformance(technicians, jobViews, context.usersById),
    packages: sortById(packages).map(({ id, name, price, duration, description }) => ({ id, name, price: Number(price), duration, description })),
    invoices: sortDateDesc(invoices.map((item) => invoiceView(item, serviceMap)), 'date'),
    emergencies: sortById(emergencies).reverse().map(({ id, userId, customerId, location, problem, status }) => ({ id, customerId: customerId || userId, location, problem, status })),
    notifications: sortById(notifications).reverse().slice(0, 20).map(({ id, type, message, unread }) => ({ id, type, message, unread })),
    feedback: sortById(feedback).reverse().map(({ id, userId, customerId, rating, comment }) => ({ id, customerId: customerId || userId, rating, comment }))
  };
}

async function getAdminServiceJobDetails(serviceJobId) {
  const [job, context, notes, progress, usages, replacedParts, photos, documents] = await Promise.all([
    getById(collections.serviceJobs, serviceJobId),
    dashboardContext(),
    all(collections.technicianNotes),
    all(collections.technicianProgress),
    all(collections.serviceJobParts),
    all(collections.replacedParts),
    all(collections.serviceImages),
    all(collections.documents)
  ]);

  if (!job) return null;

  const id = Number(serviceJobId);
  return {
    job: serviceJobView(job, context),
    progress: sortById(progress.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => ({
      id: item.id,
      progressPercentage: Number(item.progressPercentage || 0),
      status: item.status || '',
      remarks: item.remarks || '',
      createdAt: formatDate(item.createdAt)
    })),
    notes: sortById(notes.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => ({
      id: item.id,
      note: item.note || '',
      createdAt: formatDate(item.createdAt)
    })),
    usedParts: sortById(usages.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => usageView(item, context)),
    replacedParts: sortById(replacedParts.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => ({
      id: item.id,
      removedPartName: item.removedPartName || '',
      condition: item.condition || '',
      replacementReason: item.replacementReason || '',
      photoEvidence: item.photoEvidence || '',
      note: item.note || '',
      createdAt: formatDate(item.createdAt)
    })),
    photos: sortById(photos.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => fileView(item, 'photo')),
    documents: sortById(documents.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => fileView(item, 'document'))
  };
}

async function createVehicle(userId, data) {
  const vehicle = await createDocument(collections.vehicles, {
    userId,
    name: String(data.name || `${data.make} ${data.model}`).trim(),
    make: data.make.trim(),
    model: data.model.trim(),
    plateNumber: data.plate.trim().toUpperCase(),
    year: String(data.year).trim(),
    imageUrl: String(data.image || defaultImage).trim()
  });
  await createUserNotification(
    userId,
    'Vehicle Added',
    `${vehicleNotificationLabel(vehicle)} (${vehicle.plateNumber}) was added to your account.`
  );
  return vehicleView(vehicle);
}

async function updateVehicle(id, userId, data, enforceOwner = true) {
  const current = await getById(collections.vehicles, id);
  if (!current || (enforceOwner && current.userId !== userId)) return null;

  const vehicle = await updateDocument(collections.vehicles, id, {
    userId,
    name: String(data.name || `${data.make} ${data.model}`).trim(),
    make: data.make.trim(),
    model: data.model.trim(),
    plateNumber: data.plate.trim().toUpperCase(),
    year: String(data.year).trim(),
    imageUrl: String(data.image || current.imageUrl || defaultImage).trim()
  });

  await createUserNotification(
    userId,
    'Vehicle Updated',
    `${vehicleNotificationLabel(vehicle)} (${vehicle.plateNumber}) details were updated.`
  );

  return vehicleView(vehicle);
}

async function deleteVehicle(id, userId, enforceOwner = true) {
  const current = await getById(collections.vehicles, id);
  if (current && (!enforceOwner || current.userId === userId)) {
    await deleteDocument(collections.vehicles, id);
  }
}

function bookingProgress(status) {
  return status === 'Completed' ? 100 : status === 'In Progress' ? 70 : status === 'Approved' ? 35 : status === 'Cancelled' ? 0 : 10;
}

function normalizeServiceType(value) {
  const text = String(value || '').trim();
  const known = serviceSpecializations.find((item) => item.toLowerCase() === text.toLowerCase());
  if (known) return known;
  const alias = Object.entries(serviceAliases).find(([name]) => name.toLowerCase() === text.toLowerCase());
  return alias ? alias[1] : text;
}

function technicianSpecializations(technician) {
  return String(technician.specialization || '')
    .split(/[,/|]/)
    .map((item) => normalizeServiceType(item))
    .filter(Boolean);
}

function normalizeTechnicianSpecialization(value) {
  const specializations = technicianSpecializations({ specialization: value });
  const invalid = specializations.find((item) => !serviceSpecializations.includes(item));
  if (!specializations.length || invalid) {
    const error = new Error(`Technician specialization must be one of: ${serviceSpecializations.join(', ')}.`);
    error.status = 400;
    throw error;
  }
  return [...new Set(specializations)].join(', ');
}

function technicianCanDoService(technician, serviceName) {
  const required = normalizeServiceType(serviceName);
  const specializations = technicianSpecializations(technician);
  return specializations.includes('General Service') || specializations.some((item) => item.toLowerCase() === required.toLowerCase());
}

function parseDurationMinutes(duration) {
  const text = String(duration || '').toLowerCase();
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:min|minute)/)?.[1] || 0);
  if (hours || minutes) return Math.max(15, Math.round((hours * 60) + minutes));
  const numeric = Number(text.match(/\d+(?:\.\d+)?/)?.[0] || 0);
  return numeric > 0 ? Math.max(15, Math.round(numeric)) : 60;
}

function dateTimeMs(date, time) {
  const cleanDate = formatDate(date);
  const cleanTime = String(time || '').slice(0, 5);
  const value = new Date(`${cleanDate}T${cleanTime || '00:00'}:00`);
  return Number.isNaN(value.getTime()) ? null : value.getTime();
}

function localDateTimeString(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function bookingWindow(booking, serviceById) {
  const start = booking.startAt ? dateTimeMs(formatDate(booking.startAt), String(booking.startAt).slice(11, 16)) : dateTimeMs(booking.bookingDate, booking.bookingTime);
  const service = serviceById.get(Number(booking.servicePackageId));
  const duration = Number(booking.durationMinutes || parseDurationMinutes(service?.duration));
  if (!start) return null;
  return { start, end: start + (duration * 60 * 1000), duration };
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function bookingIsActive(booking) {
  return !['Completed', 'Cancelled'].includes(booking.status);
}

function bayLabel(id) {
  return `Bay ${String(id).padStart(2, '0')}`;
}

function availableBayIds(bookings, serviceById, requestedWindow, excludeBookingId) {
  const occupied = new Set();
  let legacyOccupiedCount = 0;

  bookings.filter(bookingIsActive).forEach((booking) => {
    if (Number(booking.id) === Number(excludeBookingId)) return;
    const window = bookingWindow(booking, serviceById);
    if (!window || !overlaps(requestedWindow, window)) return;
    if (booking.serviceBayId) {
      occupied.add(Number(booking.serviceBayId));
    } else {
      legacyOccupiedCount += 1;
    }
  });

  const available = Array.from({ length: serviceBayCount }, (_, index) => index + 1)
    .filter((id) => !occupied.has(id));
  return available.slice(legacyOccupiedCount);
}

function availableTechnicians(technicians, bookings, serviceById, serviceName, requestedWindow, excludeBookingId) {
  return technicians
    .filter((technician) => String(technician.status || '').toLowerCase() === 'active')
    .filter((technician) => technicianCanDoService(technician, serviceName))
    .filter((technician) => !bookings.filter(bookingIsActive).some((booking) => {
      if (Number(booking.id) === Number(excludeBookingId)) return false;
      const assignedTechnicianId = Number(booking.assignedTechnicianId);
      if (!assignedTechnicianId || assignedTechnicianId !== Number(technician.id)) return false;
      const window = bookingWindow(booking, serviceById);
      return window && overlaps(requestedWindow, window);
    }));
}

async function bookingAvailability({ serviceName, date, time, excludeBookingId = null }) {
  const service = await findServiceByName(serviceName, true);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const [bookings, technicians, users, serviceMap] = await Promise.all([
    all(collections.bookings),
    all(collections.technicians),
    all(collections.users),
    servicesById()
  ]);
  const usersById = new Map(users.map((user) => [Number(user.id), user]));
  const durationMinutes = parseDurationMinutes(service.duration);
  const start = dateTimeMs(date, time);
  if (!start) {
    const error = new Error('Booking date and time are invalid.');
    error.status = 400;
    throw error;
  }

  const requestedWindow = { start, end: start + (durationMinutes * 60 * 1000) };
  const techniciansAvailable = availableTechnicians(technicians, bookings, serviceMap, service.name, requestedWindow, excludeBookingId);
  const baysAvailable = availableBayIds(bookings, serviceMap, requestedWindow, excludeBookingId);
  const maxCapacity = Math.min(
    technicians.filter((technician) => String(technician.status || '').toLowerCase() === 'active' && technicianCanDoService(technician, service.name)).length,
    serviceBayCount
  );

  return {
    service,
    durationMinutes,
    requestedWindow,
    maxCapacity,
    remainingCapacity: Math.min(techniciansAvailable.length, baysAvailable.length),
    availableTechnicians: techniciansAvailable.map((technician) => ({ ...technician, user: usersById.get(Number(technician.userId)) })),
    availableBays: baysAvailable
  };
}

function assertBookingCapacity(availability, data) {
  if (!availability.availableTechnicians.length) {
    const error = new Error('No qualified technician is available for this service time.');
    error.status = 409;
    throw error;
  }
  if (!availability.availableBays.length) {
    const error = new Error('No service bay is available for this service time.');
    error.status = 409;
    throw error;
  }
  if (availability.remainingCapacity <= 0) {
    const error = new Error('Service capacity is full for this time slot.');
    error.status = 409;
    throw error;
  }

  const requestedTechnicianId = data.technicianId || data.assignedTechnicianId;
  const requestedBayId = data.serviceBayId;
  if (requestedTechnicianId && !availability.availableTechnicians.some((technician) => Number(technician.id) === Number(requestedTechnicianId))) {
    const error = new Error('Selected technician is not qualified or is already assigned during this period.');
    error.status = 409;
    throw error;
  }
  if (requestedBayId && !availability.availableBays.includes(Number(requestedBayId))) {
    const error = new Error('Selected service bay is already occupied during this period.');
    error.status = 409;
    throw error;
  }
}

function assignedBookingResources(availability, data = {}) {
  const requestedTechnicianId = data.technicianId || data.assignedTechnicianId;
  const requestedBayId = data.serviceBayId;
  const technician = requestedTechnicianId
    ? availability.availableTechnicians.find((item) => Number(item.id) === Number(requestedTechnicianId))
    : availability.availableTechnicians[0];
  const serviceBayId = requestedBayId ? Number(requestedBayId) : availability.availableBays[0];

  return {
    assignedTechnicianId: technician.id,
    serviceBayId,
    serviceBayName: bayLabel(serviceBayId),
    durationMinutes: availability.durationMinutes,
    startAt: localDateTimeString(availability.requestedWindow.start),
    endAt: localDateTimeString(availability.requestedWindow.end)
  };
}

async function getBookingSlots({ service, date, excludeBookingId = null }) {
  const slots = [];
  const dayStart = new Date(`${date}T${String(serviceDayStartHour).padStart(2, '0')}:00:00`);
  const dayEnd = new Date(`${date}T${String(serviceDayEndHour).padStart(2, '0')}:00:00`);

  for (let slot = new Date(dayStart); slot < dayEnd; slot = new Date(slot.getTime() + (serviceSlotMinutes * 60 * 1000))) {
    const time = slot.toTimeString().slice(0, 5);
    try {
      const availability = await bookingAvailability({ serviceName: service, date, time, excludeBookingId });
      if (slot.getTime() + (availability.durationMinutes * 60 * 1000) <= dayEnd.getTime()) {
        slots.push({
          time,
          label: `${time} (${availability.remainingCapacity}/${availability.maxCapacity} Slots Available)`,
          remainingCapacity: availability.remainingCapacity,
          maxCapacity: availability.maxCapacity,
          status: availability.remainingCapacity > 0 ? 'Available' : 'Full',
          availableTechnicians: availability.availableTechnicians.map((technician) => technicianView(technician)),
          availableBays: availability.availableBays.map((id) => ({ id, name: bayLabel(id) }))
        });
      }
    } catch (error) {
      slots.push({ time, label: `${time} (Unavailable)`, remainingCapacity: 0, maxCapacity: 0, status: 'Unavailable', availableTechnicians: [], availableBays: [] });
    }
  }

  return slots;
}

async function createBooking(userId, data, status = 'Pending') {
  const service = await findServiceByName(data.service, true);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const availability = await bookingAvailability({ serviceName: data.service, date: data.date, time: data.time });
  assertBookingCapacity(availability, data);
  const resources = assignedBookingResources(availability, data);
  const bookings = await all(collections.bookings);
  const queuePosition = bookings.filter((booking) => (
    booking.bookingDate === data.date && !['Completed', 'Cancelled'].includes(booking.status)
  )).length + 1;

  const booking = await createDocument(collections.bookings, {
    userId,
    vehicleId: asId(data.vehicleId),
    servicePackageId: service.id,
    bookingDate: data.date,
    bookingTime: data.time,
    status,
    queuePosition,
    progress: bookingProgress(status),
    ...resources
  });

  const vehicle = await getById(collections.vehicles, data.vehicleId);
  await createUserNotification(userId, 'Booking Created', bookingNotificationMessage('Booking created', booking, service, vehicle));

  return bookingView(booking, new Map([[service.id, service]]));
}

async function updateBooking(id, userId, data, enforceOwner = true) {
  const current = await getById(collections.bookings, id);
  if (!current || (enforceOwner && current.userId !== userId)) return null;

  const service = await findServiceByName(data.service, false);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const status = data.status || current.status;
  const availability = await bookingAvailability({ serviceName: data.service, date: data.date, time: data.time, excludeBookingId: id });
  assertBookingCapacity(availability, data);
  const resources = assignedBookingResources(availability, data);
  const booking = await updateDocument(collections.bookings, id, {
    userId,
    vehicleId: asId(data.vehicleId),
    servicePackageId: service.id,
    bookingDate: data.date,
    bookingTime: data.time,
    status,
    progress: bookingProgress(status),
    ...resources
  });

  const vehicle = await getById(collections.vehicles, data.vehicleId);
  await createUserNotification(userId, 'Booking Updated', bookingNotificationMessage('Booking updated', booking, service, vehicle));

  return bookingView(booking, new Map([[service.id, service]]));
}

async function cancelBooking(id, userId, enforceOwner = true) {
  const current = await getById(collections.bookings, id);
  if (!current || (enforceOwner && current.userId !== userId)) return false;
  const booking = await updateDocument(collections.bookings, id, { status: 'Cancelled', progress: 0 });
  const [service, vehicle] = await Promise.all([
    getById(collections.servicePackages, current.servicePackageId),
    getById(collections.vehicles, current.vehicleId)
  ]);
  await createUserNotification(userId, 'Booking Cancelled', bookingNotificationMessage('Booking cancelled', booking, service, vehicle));
  return true;
}

async function deleteBooking(id, userId = null, enforceOwner = true) {
  const current = await getById(collections.bookings, id);
  if (!current) return false;
  if (enforceOwner && userId && Number(current.userId) !== Number(userId)) return false;
  await deleteDocument(collections.bookings, id);
  return true;
}

async function advanceBooking(id) {
  const current = await getById(collections.bookings, id);
  if (!current) return null;

  const flow = {
    Pending: ['Approved', 35],
    Approved: ['In Progress', 70],
    'In Progress': ['Completed', 100],
    Completed: ['Completed', 100]
  };
  const [status, progress] = flow[current.status] || ['Approved', 35];
  return updateDocument(collections.bookings, id, { status, progress });
}

async function createEmergency(userId, data) {
  const emergency = await createDocument(collections.emergencyRequests, {
    userId,
    location: data.location.trim(),
    problem: data.problem.trim(),
    status: 'Open'
  });
  await createUserNotification(userId, 'Emergency Request Sent', `Emergency request sent from ${emergency.location}: ${emergency.problem}.`);
  return emergency;
}

async function createFeedback(userId, data) {
  await createDocument(collections.feedback, {
    userId,
    rating: Number(data.rating),
    comment: data.feedback.trim()
  });
  await createUserNotification(userId, 'Feedback Submitted', `Thank you. Your ${Number(data.rating)} star feedback was submitted.`);
}

async function updateProfile(userId, data) {
  if (await emailExists(data.email, userId)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }

  const user = await updateDocument(collections.users, userId, {
    name: data.name.trim(),
    email: emailKey(data.email),
    emailLower: emailKey(data.email),
    phone: data.phone.trim()
  });
  return publicUser(user);
}

async function updateCustomer(id, data) {
  const current = await getById(collections.users, id);
  if (!current || current.role !== 'customer') return null;

  if (await emailExists(data.email, id)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }

  const user = await updateDocument(collections.users, id, {
    name: data.name.trim(),
    email: emailKey(data.email),
    emailLower: emailKey(data.email),
    phone: data.phone.trim(),
    status: String(data.status || 'active').toLowerCase()
  });

  return customerView(user);
}

async function itemCodeExists(itemCode, ignoreId) {
  const normalized = String(itemCode || '').trim().toUpperCase();
  const parts = await all(collections.inventoryParts);
  return parts.some((part) => String(part.itemCode || part.sku || '').toUpperCase() === normalized && Number(part.id) !== Number(ignoreId));
}

function normalizeInventoryPayload(data) {
  const itemCode = String(data.itemCode || data.sku || '').trim().toUpperCase();
  if (!itemCode) {
    const error = new Error('Item code is required.');
    error.status = 400;
    throw error;
  }
  if (!inventoryCategories.includes(data.category)) {
    const error = new Error('Invalid inventory category.');
    error.status = 400;
    throw error;
  }

  const stock = Number(data.stockQuantity ?? data.stock ?? 0);
  const minimumStockLevel = Number(data.minimumStockLevel ?? 0);
  const purchasePrice = Number(data.purchasePrice ?? 0);
  const sellingPrice = Number(data.sellingPrice ?? data.unitPrice ?? 0);
  if ([stock, minimumStockLevel, purchasePrice, sellingPrice].some((value) => !Number.isFinite(value) || value < 0)) {
    const error = new Error('Inventory quantities and prices must be zero or greater.');
    error.status = 400;
    throw error;
  }

  return {
    itemCode,
    sku: itemCode,
    partName: String(data.partName || data.name || '').trim(),
    name: String(data.partName || data.name || '').trim(),
    category: data.category,
    brand: String(data.brand || '').trim(),
    manufacturer: String(data.manufacturer || '').trim(),
    supplierId: data.supplierId ? asId(data.supplierId) : null,
    supplier: String(data.supplier || '').trim(),
    description: String(data.description || '').trim(),
    purchasePrice,
    sellingPrice,
    unitPrice: sellingPrice,
    stock,
    stockQuantity: stock,
    minimumStockLevel,
    location: String(data.location || '').trim(),
    warrantyPeriod: String(data.warrantyPeriod || '').trim(),
    warrantyProvider: String(data.warrantyProvider || data.supplier || '').trim(),
    status: inventoryStockStatus(stock, String(data.status || 'Active').trim())
  };
}

async function createInventoryItem(data) {
  const payload = normalizeInventoryPayload(data);
  if (await itemCodeExists(payload.itemCode)) {
    const error = new Error('An inventory item with this item code already exists.');
    error.status = 409;
    throw error;
  }
  const part = await createDocument(collections.inventoryParts, payload);
  await createInventoryMovement({
    partId: part.id,
    type: 'Opening Stock',
    quantity: payload.stock,
    unitPrice: payload.purchasePrice,
    note: 'Inventory item created.'
  });
  return partView(part);
}

async function updateInventoryItem(id, data) {
  const current = await getById(collections.inventoryParts, id);
  if (!current) return null;
  const payload = normalizeInventoryPayload(data);
  if (await itemCodeExists(payload.itemCode, id)) {
    const error = new Error('An inventory item with this item code already exists.');
    error.status = 409;
    throw error;
  }
  const stockDelta = Number(payload.stock) - Number(current.stock || 0);
  const part = await updateDocument(collections.inventoryParts, id, payload);
  if (stockDelta !== 0) {
    await createInventoryMovement({
      partId: id,
      type: stockDelta > 0 ? 'Stock Adjustment In' : 'Stock Adjustment Out',
      quantity: Math.abs(stockDelta),
      unitPrice: payload.purchasePrice,
      note: 'Admin stock adjustment.'
    });
  }
  return partView(part);
}

async function deleteInventoryItem(id) {
  const usages = await all(collections.serviceJobParts);
  if (usages.some((usage) => Number(usage.partId) === Number(id))) {
    const error = new Error('Inventory item has service usage history and cannot be deleted.');
    error.status = 409;
    throw error;
  }
  await deleteDocument(collections.inventoryParts, id);
  return true;
}

async function createInventorySupplier(data) {
  return createDocument(collections.inventorySuppliers, {
    name: data.name.trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    address: String(data.address || '').trim(),
    status: data.status || 'Active'
  });
}

async function updateInventorySupplier(id, data) {
  return updateDocument(collections.inventorySuppliers, id, {
    name: data.name.trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    address: String(data.address || '').trim(),
    status: data.status || 'Active'
  });
}

async function createInventoryMovement(data) {
  const part = data.partId ? await getById(collections.inventoryParts, data.partId) : null;
  return createDocument(collections.inventoryMovements, {
    partId: data.partId ? asId(data.partId) : null,
    partName: data.partName || part?.partName || part?.name || '',
    itemCode: data.itemCode || part?.itemCode || part?.sku || '',
    serviceJobId: data.serviceJobId ? asId(data.serviceJobId) : null,
    technicianId: data.technicianId ? asId(data.technicianId) : null,
    vehicleId: data.vehicleId ? asId(data.vehicleId) : null,
    customerId: data.customerId ? asId(data.customerId) : null,
    type: data.type,
    quantity: Number(data.quantity || 0),
    condition: data.condition || '',
    unitPrice: Number(data.unitPrice || 0),
    totalPrice: Number(data.totalPrice || Number(data.quantity || 0) * Number(data.unitPrice || 0)),
    note: data.note || ''
  });
}

async function maybeCreateLowStockAlert(part) {
  const view = partView(part);
  if (view.stock > lowStockThreshold) return;
  const message = view.stock <= 0
    ? `${view.partName} is out of stock.`
    : `${view.partName} is low in stock (${view.stock} left).`;
  await notifyAdmins('Inventory Alert', message);
}

async function getInventoryReports() {
  const [users, vehicles, technicians, jobs, parts, movements, usages] = await Promise.all([
    all(collections.users),
    all(collections.vehicles),
    all(collections.technicians),
    all(collections.serviceJobs),
    all(collections.inventoryParts),
    all(collections.inventoryMovements),
    all(collections.serviceJobParts)
  ]);
  const context = {
    usersById: new Map(users.map((user) => [Number(user.id), user])),
    vehiclesById: new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle])),
    techniciansById: new Map(technicians.map((technician) => [Number(technician.id), technician])),
    jobsById: new Map(jobs.map((job) => [Number(job.id), job])),
    partsById: new Map(parts.map((part) => [Number(part.id), part]))
  };
  return buildInventoryReports(parts, movements, usages, context);
}

async function employeeNoExists(employeeNo, ignoreId) {
  const normalized = String(employeeNo || '').trim().toUpperCase();
  const technicians = await all(collections.technicians);
  return technicians.some((technician) => (
    technician.employeeNo === normalized && Number(technician.id) !== Number(ignoreId)
  ));
}

async function createTechnician(data, passwordHash) {
  if (await employeeNoExists(data.employeeNo)) {
    const error = new Error('A technician with this employee number already exists.');
    error.status = 409;
    throw error;
  }

  const user = await createUser({
    role: 'technician',
    name: data.name,
    email: data.email,
    phone: data.phone,
    passwordHash,
    status: data.status || 'active'
  });

  const technician = await createDocument(collections.technicians, {
    userId: user.id,
    employeeNo: String(data.employeeNo).trim().toUpperCase(),
    specialization: normalizeTechnicianSpecialization(data.specialization),
    phone: String(data.phone || '').trim(),
    experienceYears: Number(data.experienceYears || 0),
    status: String(data.status || 'active').toLowerCase()
  });

  return technicianView(technician, user);
}

async function updateTechnician(id, data) {
  const current = await getById(collections.technicians, id);
  if (!current) return null;
  if (await emailExists(data.email, current.userId)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }
  if (await employeeNoExists(data.employeeNo, id)) {
    const error = new Error('A technician with this employee number already exists.');
    error.status = 409;
    throw error;
  }

  const user = await updateDocument(collections.users, current.userId, {
    name: data.name.trim(),
    email: emailKey(data.email),
    emailLower: emailKey(data.email),
    phone: String(data.phone || '').trim(),
    status: String(data.status || 'active').toLowerCase()
  });

  const technician = await updateDocument(collections.technicians, id, {
    employeeNo: String(data.employeeNo).trim().toUpperCase(),
    specialization: normalizeTechnicianSpecialization(data.specialization),
    phone: String(data.phone || '').trim(),
    experienceYears: Number(data.experienceYears || 0),
    status: String(data.status || 'active').toLowerCase()
  });

  return technicianView(technician, user);
}

async function deleteTechnician(id) {
  const technician = await getById(collections.technicians, id);
  if (!technician) return false;

  const jobs = await all(collections.serviceJobs);
  const hasJobs = jobs.some((job) => Number(job.assignedTechnicianId) === Number(id));
  if (hasJobs) {
    const error = new Error('Technician has service jobs and cannot be deleted. Deactivate the technician instead.');
    error.status = 409;
    throw error;
  }

  const notifications = await all(collections.notifications);
  await Promise.all(notifications
    .filter((notification) => Number(notification.userId) === Number(technician.userId))
    .map((notification) => deleteDocument(collections.notifications, notification.id)));
  await deleteDocument(collections.technicians, id);
  await deleteDocument(collections.users, technician.userId);
  return true;
}

async function createServiceJob(data) {
  const booking = await getById(collections.bookings, data.bookingId);
  if (!booking) {
    const error = new Error('Booking not found.');
    error.status = 404;
    throw error;
  }

  const existing = (await all(collections.serviceJobs)).find((job) => Number(job.bookingId) === Number(data.bookingId) && job.status !== 'Cancelled');
  if (existing) {
    const error = new Error('A service job already exists for this booking.');
    error.status = 409;
    throw error;
  }

  const service = await findServiceByName(data.serviceType || booking.serviceName, false);
  const serviceType = data.serviceType || service?.name || 'General Service';
  const assignedTechnicianId = data.assignedTechnicianId || booking.assignedTechnicianId || null;
  if (assignedTechnicianId) {
    await assertTechnician(assignedTechnicianId, true);
    const availability = await bookingAvailability({
      serviceName: serviceType,
      date: formatDate(booking.bookingDate),
      time: booking.bookingTime,
      excludeBookingId: booking.id
    });
    if (!availability.availableTechnicians.some((technician) => Number(technician.id) === Number(assignedTechnicianId))) {
      const error = new Error('Selected technician is not qualified or is already assigned during this booking period.');
      error.status = 409;
      throw error;
    }
  }

  const status = assignedTechnicianId ? 'Assigned' : 'Pending';
  const job = await createDocument(collections.serviceJobs, {
    bookingId: asId(data.bookingId),
    vehicleId: asId(data.vehicleId || booking.vehicleId),
    customerId: asId(data.customerId || booking.userId),
    assignedTechnicianId: assignedTechnicianId ? asId(assignedTechnicianId) : null,
    serviceType,
    priority: data.priority || 'Normal',
    status,
    progress: 0,
    startDate: data.startDate || today(),
    expectedCompletionDate: data.expectedCompletionDate || today(1),
    completionDate: '',
    assignedDate: assignedTechnicianId ? today() : ''
  });

  await updateDocument(collections.bookings, booking.id, {
    status: status === 'Assigned' ? 'Approved' : booking.status,
    progress: status === 'Assigned' ? 35 : booking.progress,
    ...(assignedTechnicianId ? { assignedTechnicianId: asId(assignedTechnicianId) } : {})
  });

  if (job.assignedTechnicianId) {
    const technician = await getById(collections.technicians, job.assignedTechnicianId);
    await createUserNotification(technician.userId, 'Service Job Assigned', `Service job #SJ-${job.id} has been assigned to you.`);
  }

  const context = await dashboardContext();
  return serviceJobView(job, context);
}

async function assignTechnician(serviceJobId, technicianId) {
  const [job, technician] = await Promise.all([
    getById(collections.serviceJobs, serviceJobId),
    assertTechnician(technicianId, true)
  ]);

  if (!job) {
    const error = new Error('Service job not found.');
    error.status = 404;
    throw error;
  }

  if (Number(job.assignedTechnicianId) === Number(technicianId)) {
    const error = new Error('This technician is already assigned to the service job.');
    error.status = 409;
    throw error;
  }

  const booking = job.bookingId ? await getById(collections.bookings, job.bookingId) : null;
  if (booking) {
    const availability = await bookingAvailability({
      serviceName: job.serviceType,
      date: formatDate(booking.bookingDate),
      time: booking.bookingTime,
      excludeBookingId: booking.id
    });
    if (!availability.availableTechnicians.some((item) => Number(item.id) === Number(technicianId))) {
      const error = new Error('Selected technician is not qualified or is already assigned during this booking period.');
      error.status = 409;
      throw error;
    }
    await updateDocument(collections.bookings, booking.id, { assignedTechnicianId: asId(technicianId) });
  }

  const updated = await updateDocument(collections.serviceJobs, serviceJobId, {
    assignedTechnicianId: asId(technicianId),
    status: 'Assigned',
    assignedDate: today()
  });

  await createUserNotification(technician.userId, 'Service Job Assigned', `Service job #SJ-${serviceJobId} has been assigned to you.`);
  await notifyAdmins('Technician Assignment', `Service job #SJ-${serviceJobId} was assigned to technician #${technician.employeeNo}.`);

  const context = await dashboardContext();
  return serviceJobView(updated, context);
}

async function getTechnicianWorkload() {
  const [technicians, jobs, context] = await Promise.all([
    all(collections.technicians),
    all(collections.serviceJobs),
    dashboardContext()
  ]);
  return buildTechnicianWorkload(technicians, jobs.map((job) => serviceJobView(job, context)), context.usersById);
}

async function getTechnicianPerformance() {
  const [technicians, jobs, context] = await Promise.all([
    all(collections.technicians),
    all(collections.serviceJobs),
    dashboardContext()
  ]);
  return buildTechnicianPerformance(technicians, jobs.map((job) => serviceJobView(job, context)), context.usersById);
}

async function getTechnicianDashboard(userId) {
  const technician = await getTechnicianByUserId(userId);
  if (!technician) {
    const error = new Error('Technician profile not found.');
    error.status = 404;
    throw error;
  }

  const [jobs, notes, progressEntries, partsUsed, inventoryParts, notifications, photos, documents, context] = await Promise.all([
    all(collections.serviceJobs),
    all(collections.technicianNotes),
    all(collections.technicianProgress),
    all(collections.serviceJobParts),
    all(collections.inventoryParts),
    all(collections.notifications),
    all(collections.serviceImages),
    all(collections.documents),
    dashboardContext()
  ]);

  const assignedJobs = jobs
    .filter((job) => Number(job.assignedTechnicianId) === Number(technician.id))
    .map((job) => serviceJobView(job, context));
  const assignedJobIds = new Set(assignedJobs.map((job) => Number(job.id)));
  const todayText = today();

  return {
    profile: technicianView(technician, context.usersById.get(Number(technician.userId))),
    jobs: assignedJobs,
    todayJobs: assignedJobs.filter((job) => job.assignedDate === todayText || job.startDate === todayText),
    pendingJobs: assignedJobs.filter((job) => ['Pending', 'Assigned'].includes(job.status)).length,
    inProgressJobs: assignedJobs.filter((job) => job.status === 'In Progress').length,
    completedJobs: assignedJobs.filter((job) => job.status === 'Completed').length,
    activeJobs: assignedJobs.filter((job) => !['Completed', 'Cancelled'].includes(job.status)).length,
    performance: buildTechnicianPerformance([technician], assignedJobs, context.usersById)[0],
    notes: notes.filter((note) => Number(note.technicianId) === Number(technician.id)),
    progress: progressEntries.filter((entry) => Number(entry.technicianId) === Number(technician.id)),
    partsUsed: partsUsed.filter((part) => Number(part.usedByTechnician) === Number(technician.id)),
    inventoryParts: inventoryParts.map(partView),
    servicePhotos: sortById(photos.filter((photo) => assignedJobIds.has(Number(photo.serviceJobId)))).reverse().map((photo) => fileView(photo, 'photo')),
    documents: sortById(documents.filter((document) => assignedJobIds.has(Number(document.serviceJobId)))).reverse().map((document) => fileView(document, 'document')),
    notifications: sortById(notifications.filter((item) => item.userId === userId)).reverse().map(({ id, type, message, unread }) => ({ id, type, message, unread }))
  };
}

async function getAssignedServiceJob(userId, jobId) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, jobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) return null;
  const [notes, progressEntries, partsUsed, images, context] = await Promise.all([
    all(collections.technicianNotes),
    all(collections.technicianProgress),
    all(collections.serviceJobParts),
    all(collections.serviceImages),
    dashboardContext()
  ]);
  return {
    ...serviceJobView(job, context),
    notes: sortById(notes.filter((note) => Number(note.serviceJobId) === Number(jobId))).reverse(),
    progressHistory: sortById(progressEntries.filter((entry) => Number(entry.serviceJobId) === Number(jobId))).reverse(),
    usedParts: sortById(partsUsed.filter((part) => Number(part.serviceJobId) === Number(jobId))).reverse(),
    images: sortById(images.filter((image) => Number(image.serviceJobId) === Number(jobId))).reverse().map((image) => fileView(image, 'photo'))
  };
}

async function canAccessServiceJob(user, job) {
  if (!job) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'customer') return Number(job.customerId) === Number(user.id);
  if (user.role === 'technician') {
    const technician = await getTechnicianByUserId(user.id);
    return technician && Number(job.assignedTechnicianId) === Number(technician.id);
  }
  return false;
}

function validateUploadFile(file) {
  const fileName = String(file.fileName || '').trim();
  const extension = fileName.split('.').pop().toLowerCase();
  const content = String(file.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const sizeBytes = Buffer.byteLength(content, 'base64');
  if (!fileName || !allowedUploadExtensions.includes(extension)) {
    const error = new Error('Unsupported file type. Allowed formats: JPG, PNG, PDF, DOCX.');
    error.status = 400;
    throw error;
  }
  if (!content || sizeBytes > maxUploadBytes) {
    const error = new Error('File is required and must be 5MB or smaller.');
    error.status = 400;
    throw error;
  }
  return { fileName, extension, content, sizeBytes };
}

async function createUploadAudit(data) {
  return createDocument(collections.uploadAuditLogs, data);
}

async function recordStoredPhoto(user, data, storedFile) {
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!await canAccessServiceJob(user, job)) {
    const error = new Error('You cannot upload files for this service job.');
    error.status = 403;
    throw error;
  }
  if (!photoTypes.includes(data.photoType)) {
    const error = new Error('Invalid photo type.');
    error.status = 400;
    throw error;
  }
  const duplicate = (await all(collections.serviceImages)).find((item) => (
    Number(item.serviceJobId) === Number(data.serviceJobId)
    && item.fileName === storedFile.originalName
    && item.photoType === data.photoType
  ));
  if (duplicate) {
    const error = new Error('This photo was already uploaded for the selected service job and type.');
    error.status = 409;
    throw error;
  }
  const technician = user.role === 'technician' ? await getTechnicianByUserId(user.id) : null;
  const photo = await createDocument(collections.serviceImages, {
    serviceJobId: asId(data.serviceJobId),
    vehicleId: asId(data.vehicleId || job.vehicleId),
    customerId: asId(job.customerId),
    technicianId: technician?.id || data.technicianId || null,
    photoType: data.photoType,
    imageUrl: storedFile.relativePath,
    filePath: storedFile.absolutePath,
    fileName: storedFile.originalName,
    mimeType: storedFile.mimeType,
    sizeBytes: storedFile.sizeBytes,
    description: String(data.description || '').trim(),
    uploadedBy: user.role,
    uploadedAt: fieldValue()
  });
  await createUploadAudit({ fileKind: 'photo', fileId: photo.id, action: 'Uploaded', userId: user.id, role: user.role });
  await createUserNotification(job.customerId, 'Service Photo Uploaded', `${data.photoType} photo uploaded for service job #SJ-${job.id}.`);
  return fileView(photo, 'photo');
}

async function recordStoredDocument(user, data, storedFile) {
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!await canAccessServiceJob(user, job)) {
    const error = new Error('You cannot upload documents for this service job.');
    error.status = 403;
    throw error;
  }
  if (!documentTypes.includes(data.documentType)) {
    const error = new Error('Invalid document type.');
    error.status = 400;
    throw error;
  }
  const duplicate = (await all(collections.documents)).find((item) => (
    Number(item.serviceJobId) === Number(data.serviceJobId)
    && item.fileName === storedFile.originalName
    && item.documentType === data.documentType
  ));
  if (duplicate) {
    const error = new Error('This document was already uploaded for the selected service job and type.');
    error.status = 409;
    throw error;
  }
  const document = await createDocument(collections.documents, {
    serviceJobId: asId(data.serviceJobId),
    vehicleId: asId(data.vehicleId || job.vehicleId),
    customerId: asId(job.customerId),
    documentType: data.documentType,
    fileName: storedFile.originalName,
    fileUrl: storedFile.relativePath,
    filePath: storedFile.absolutePath,
    mimeType: storedFile.mimeType,
    sizeBytes: storedFile.sizeBytes,
    uploadedBy: user.role,
    uploadedAt: fieldValue(),
    description: String(data.description || '').trim()
  });
  await createUploadAudit({ fileKind: 'document', fileId: document.id, action: 'Uploaded', userId: user.id, role: user.role });
  if (data.documentType === 'Warranty Document') {
    await createUserNotification(job.customerId, 'Warranty Document Available', `Warranty document uploaded for service job #SJ-${job.id}.`);
  }
  return fileView(document, 'document');
}

async function getFileForDownload(user, kind, id) {
  const collection = kind === 'photo' ? collections.serviceImages : collections.documents;
  const file = await getById(collection, id);
  if (!file) return null;
  const job = await getById(collections.serviceJobs, file.serviceJobId);
  if (!await canAccessServiceJob(user, job)) return null;
  await createUploadAudit({ fileKind: kind, fileId: Number(id), action: 'Downloaded', userId: user.id, role: user.role });
  return file;
}

async function getPartUsagePhotoForDownload(user, id) {
  const usage = await getById(collections.serviceJobParts, id);
  if (!usage?.photoPath) return null;
  const job = await getById(collections.serviceJobs, usage.serviceJobId);
  if (!await canAccessServiceJob(user, job)) return null;
  await createUploadAudit({ fileKind: 'partPhoto', fileId: Number(id), action: 'Downloaded', userId: user.id, role: user.role });
  return {
    filePath: usage.photoPath,
    fileName: usage.photoFileName || `part-photo-${id}.jpg`
  };
}

async function deleteStoredFile(user, kind, id) {
  if (user.role !== 'admin') {
    const error = new Error('Only admin can permanently delete files.');
    error.status = 403;
    throw error;
  }
  const collection = kind === 'photo' ? collections.serviceImages : collections.documents;
  const file = await getById(collection, id);
  if (!file) return null;
  await deleteDocument(collection, id);
  await createUploadAudit({ fileKind: kind, fileId: Number(id), action: 'Deleted', userId: user.id, role: user.role });
  return file;
}

async function updateTechnicianProgress(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can update this job.');
    error.status = 403;
    throw error;
  }

  const progress = Number(data.progressPercentage);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    const error = new Error('Progress must be between 0 and 100.');
    error.status = 400;
    throw error;
  }

  const status = data.status || job.status;
  assertServiceJobStatus(status);
  if (status === 'Completed' && progress < 100) {
    const error = new Error('Progress must be 100% before completing a job.');
    error.status = 400;
    throw error;
  }

  const progressEntry = await createDocument(collections.technicianProgress, {
    serviceJobId: asId(data.serviceJobId),
    technicianId: technician.id,
    progressPercentage: progress,
    status,
    remarks: String(data.remarks || '').trim()
  });

  const update = {
    progress,
    status,
    completionDate: status === 'Completed' ? today() : job.completionDate || ''
  };
  const updated = await updateDocument(collections.serviceJobs, data.serviceJobId, update);
  await notifyAdmins('Service Status Updated', `Service job #SJ-${data.serviceJobId} changed to ${status}.`);

  if (status === 'Completed') {
    await createUserNotification(job.customerId, 'Service Completed', `Your ${job.serviceType} service job has been completed.`);
  }

  const context = await dashboardContext();
  return { progress: progressEntry, job: serviceJobView(updated, context) };
}

async function addTechnicianNote(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can add notes to this job.');
    error.status = 403;
    throw error;
  }

  return createDocument(collections.technicianNotes, {
    serviceJobId: asId(data.serviceJobId),
    technicianId: technician.id,
    note: data.note.trim()
  });
}

async function addUsedPart(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can add parts to this job.');
    error.status = 403;
    throw error;
  }

  const quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('Part quantity must be greater than zero.');
    error.status = 400;
    throw error;
  }

  const condition = data.condition || 'Brand New';
  if (!partConditions.includes(condition)) {
    const error = new Error('Invalid part condition.');
    error.status = 400;
    throw error;
  }

  const usage = await db.runTransaction(async (transaction) => {
    const partRef = docRef(collections.inventoryParts, data.partId);
    const partSnapshot = await transaction.get(partRef);
    if (!partSnapshot.exists) {
      const error = new Error('Inventory part not found.');
      error.status = 404;
      throw error;
    }

    const part = { id: Number(partSnapshot.id), ...partSnapshot.data() };
    const currentStock = Number(part.stock || 0);
    const isCustomerSupplied = condition === 'Customer Supplied';
    if (!isCustomerSupplied && quantity > currentStock) {
      const error = new Error('Cannot use more spare parts than available stock.');
      error.status = 400;
      throw error;
    }

    const unitPrice = Number(data.unitPrice || part.sellingPrice || part.unitPrice || 0);
    const warrantyStartDate = data.warrantyStartDate || today();
    const warrantyExpiryDate = data.warrantyExpiryDate || warrantyStartDate;
    const ids = await nextIdsForCollections(transaction, {
      [collections.serviceJobParts]: 1,
      [collections.inventoryMovements]: 1
    });
    const id = ids[collections.serviceJobParts][0];
    const movementId = ids[collections.inventoryMovements][0];
    const usageRef = docRef(collections.serviceJobParts, id);
    const partPhoto = data.partPhoto || null;
    const photoUrl = partPhoto ? `/api/part-usages/${id}/photo` : String(data.photoUrl || '').trim();
    const usageData = {
      id,
      serviceJobId: asId(data.serviceJobId),
      partId: asId(data.partId),
      itemCode: part.itemCode || part.sku || '',
      partName: part.partName || part.name,
      brand: part.brand || '',
      condition,
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
      usedByTechnician: technician.id,
      warrantyProvider: data.warrantyProvider || part.warrantyProvider || part.supplier || '',
      warrantyPeriod: data.warrantyPeriod || part.warrantyPeriod || '',
      warrantyStartDate,
      warrantyExpiryDate,
      note: String(data.note || '').trim(),
      photoUrl,
      photoPath: partPhoto?.absolutePath || '',
      photoFileName: partPhoto?.originalName || '',
      photoMimeType: partPhoto?.mimeType || '',
      photoSizeBytes: Number(partPhoto?.sizeBytes || 0),
      createdAt: fieldValue()
    };
    transaction.set(usageRef, usageData);

    if (!isCustomerSupplied) {
      const remaining = currentStock - quantity;
      transaction.set(partRef, {
        stock: remaining,
        stockQuantity: remaining,
        status: inventoryStockStatus(remaining, part.status),
        updatedAt: fieldValue()
      }, { merge: true });
    }

    transaction.set(docRef(collections.inventoryMovements, movementId), {
      id: movementId,
      partId: asId(data.partId),
      partName: part.partName || part.name,
      itemCode: part.itemCode || part.sku || '',
      serviceJobId: asId(data.serviceJobId),
      technicianId: technician.id,
      vehicleId: job.vehicleId,
      customerId: job.customerId,
      type: isCustomerSupplied ? 'Customer Supplied Part Used' : 'Part Used',
      quantity,
      condition,
      unitPrice,
      totalPrice: quantity * unitPrice,
      note: String(data.note || '').trim(),
      createdAt: fieldValue()
    });

    return usageData;
  });

  const updatedPart = await getById(collections.inventoryParts, data.partId);
  if (updatedPart) await maybeCreateLowStockAlert(updatedPart);
  await createUserNotification(job.customerId, 'Parts Used', `${usage.partName} was used for your service job #SJ-${job.id}.`);
  return usage;
}

async function requestAdditionalParts(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can request parts for this job.');
    error.status = 403;
    throw error;
  }

  const requestText = data.request.trim();
  const note = await createDocument(collections.technicianNotes, {
    serviceJobId: asId(data.serviceJobId),
    technicianId: technician.id,
    note: `Parts request: ${requestText}`
  });
  await updateDocument(collections.serviceJobs, data.serviceJobId, { status: 'Waiting For Parts' });
  await notifyAdmins('Parts Request', `Service job #SJ-${data.serviceJobId} needs additional parts: ${requestText}`);
  return note;
}

async function returnUnusedPart(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can return parts for this job.');
    error.status = 403;
    throw error;
  }

  const quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('Return quantity must be greater than zero.');
    error.status = 400;
    throw error;
  }

  const result = await db.runTransaction(async (transaction) => {
    const partRef = docRef(collections.inventoryParts, data.partId);
    const partSnapshot = await transaction.get(partRef);
    if (!partSnapshot.exists) {
      const error = new Error('Inventory part not found.');
      error.status = 404;
      throw error;
    }
    const part = { id: Number(partSnapshot.id), ...partSnapshot.data() };
    const stock = Number(part.stock || 0) + quantity;
    const movementId = await nextId(transaction, collections.inventoryMovements);
    transaction.set(partRef, {
      stock,
      stockQuantity: stock,
      status: inventoryStockStatus(stock, part.status),
      updatedAt: fieldValue()
    }, { merge: true });

    const movement = {
      id: movementId,
      partId: asId(data.partId),
      partName: part.partName || part.name,
      itemCode: part.itemCode || part.sku || '',
      serviceJobId: asId(data.serviceJobId),
      technicianId: technician.id,
      vehicleId: job.vehicleId,
      customerId: job.customerId,
      type: 'Part Returned',
      quantity,
      condition: data.condition || 'Brand New',
      unitPrice: Number(part.sellingPrice || part.unitPrice || 0),
      totalPrice: quantity * Number(part.sellingPrice || part.unitPrice || 0),
      note: String(data.note || '').trim(),
      createdAt: fieldValue()
    };
    transaction.set(docRef(collections.inventoryMovements, movementId), movement);
    return movement;
  });

  return result;
}

async function recordReplacedPart(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can record replaced parts for this job.');
    error.status = 403;
    throw error;
  }
  return createDocument(collections.replacedParts, {
    serviceJobId: asId(data.serviceJobId),
    technicianId: technician.id,
    vehicleId: job.vehicleId,
    customerId: job.customerId,
    removedPartName: data.removedPartName.trim(),
    condition: data.condition.trim(),
    replacementReason: data.replacementReason.trim(),
    photoEvidence: String(data.photoEvidence || '').trim(),
    note: String(data.note || '').trim()
  });
}

async function uploadServiceImage(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can upload images for this job.');
    error.status = 403;
    throw error;
  }

  return createDocument(collections.serviceImages, {
    serviceJobId: asId(data.serviceJobId),
    vehicleId: job.vehicleId,
    customerId: job.customerId,
    technicianId: technician.id,
    photoType: data.photoType || 'During Service',
    imageUrl: data.imageUrl.trim(),
    fileName: data.imageUrl.trim().split('/').pop() || 'service-photo.jpg',
    caption: String(data.caption || '').trim()
  });
}

async function completeTechnicianJob(userId, serviceJobId) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can complete this job.');
    error.status = 403;
    throw error;
  }

  const progressEntries = await all(collections.technicianProgress);
  const latestProgress = progressEntries
    .filter((entry) => Number(entry.serviceJobId) === Number(serviceJobId) && Number(entry.technicianId) === Number(technician.id))
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
  if (!latestProgress || Number(latestProgress.progressPercentage) < 100) {
    const error = new Error('Technician cannot complete a job without updating progress to 100%.');
    error.status = 400;
    throw error;
  }

  const updated = await updateDocument(collections.serviceJobs, serviceJobId, {
    status: 'Completed',
    progress: 100,
    completionDate: today()
  });
  await notifyAdmins('Service Job Completed', `Service job #SJ-${serviceJobId} is ready for admin review.`);
  await createUserNotification(job.customerId, 'Service Completed', `Your ${job.serviceType} service job has been completed.`);

  const context = await dashboardContext();
  return serviceJobView(updated, context);
}

async function createService(data) {
  const service = await createDocument(collections.servicePackages, {
    name: data.name.trim(),
    price: Number(data.price),
    duration: data.duration.trim(),
    description: data.description.trim(),
    active: true
  });
  return { id: service.id, name: service.name, price: service.price, duration: service.duration, description: service.description };
}

async function updateService(id, data) {
  const service = await updateDocument(collections.servicePackages, id, {
    name: data.name.trim(),
    price: Number(data.price),
    duration: data.duration.trim(),
    description: data.description.trim()
  });
  return service ? { id: service.id, name: service.name, price: service.price, duration: service.duration, description: service.description } : null;
}

async function createInvoice(data) {
  let serviceJob = null;
  let partsTotal = 0;
  if (data.serviceJobId) {
    serviceJob = await getById(collections.serviceJobs, data.serviceJobId);
    if (!serviceJob || serviceJob.status !== 'Completed') {
      const error = new Error('Billing can only be generated after job completion.');
      error.status = 400;
      throw error;
    }
    const usages = await all(collections.serviceJobParts);
    partsTotal = usages
      .filter((usage) => Number(usage.serviceJobId) === Number(data.serviceJobId))
      .reduce((sum, usage) => sum + Number(usage.totalPrice || Number(usage.quantity || 0) * Number(usage.unitPrice || 0)), 0);
  }

  const service = await findServiceByName(data.service, false);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const laborCost = Number(data.laborCost || data.amount || 0);
  const serviceCharges = Number(data.serviceCharges || 0);
  const tax = Number(data.tax || 0);
  const discount = Number(data.discount || 0);
  const grandTotal = partsTotal + laborCost + serviceCharges + tax - discount;

  const invoice = await createDocument(collections.invoices, {
    userId: asId(data.customerId),
    serviceJobId: data.serviceJobId ? asId(data.serviceJobId) : null,
    servicePackageId: service.id,
    partsTotal,
    laborCost,
    serviceCharges,
    tax,
    discount,
    amount: grandTotal,
    paymentStatus: data.payment,
    invoiceDate: data.date
  });

  return invoiceView(invoice, new Map([[service.id, service]]));
}

async function createNotification(data) {
  const customers = sortById((await all(collections.users)).filter((user) => user.role === 'customer'));
  if (!customers[0]) {
    const error = new Error('No customer account available.');
    error.status = 400;
    throw error;
  }

  return createDocument(collections.notifications, {
    userId: customers[0].id,
    type: data.type.trim(),
    message: data.message.trim(),
    unread: true
  });
}

async function getInvoicePdf(id, requester) {
  const invoice = await getById(collections.invoices, id);
  if (!invoice || (requester.role !== 'admin' && invoice.userId !== requester.id)) return null;

  const [user, service, job, parts, vehicles, technicians, users] = await Promise.all([
    getById(collections.users, invoice.userId),
    getById(collections.servicePackages, invoice.servicePackageId),
    invoice.serviceJobId ? getById(collections.serviceJobs, invoice.serviceJobId) : null,
    all(collections.serviceJobParts),
    all(collections.vehicles),
    all(collections.technicians),
    all(collections.users)
  ]);
  const vehicle = job ? vehicles.find((item) => Number(item.id) === Number(job.vehicleId)) : null;
  const technician = job ? technicians.find((item) => Number(item.id) === Number(job.assignedTechnicianId)) : null;
  const technicianUser = technician ? users.find((item) => Number(item.id) === Number(technician.userId)) : null;
  const invoiceParts = parts.filter((part) => Number(part.serviceJobId) === Number(invoice.serviceJobId));

  return createInvoicePdfBuffer({
    invoice,
    user,
    service,
    job,
    vehicle,
    technicianName: technicianUser?.name || technician?.name || 'Unassigned',
    parts: invoiceParts
  });
}

async function markInvoiceEmailed(id, adminUserId) {
  const invoice = await getById(collections.invoices, id);
  if (!invoice) {
    const error = new Error('Invoice not found.');
    error.status = 404;
    throw error;
  }
  await createDocument(collections.uploadAuditLogs, {
    fileKind: 'invoice',
    fileId: Number(id),
    action: 'Email Requested',
    userId: Number(adminUserId),
    role: 'admin'
  });
  await createUserNotification(invoice.userId, 'Invoice Generated', `Invoice #INV-${id} is ready.`);
  return true;
}

async function syncCounters() {
  const counterData = {};
  await Promise.all(Object.values(collections).map(async (collection) => {
    const items = await all(collection);
    counterData[collection] = Math.max(0, ...items.map((item) => Number(item.id) || 0));
  }));
  await db.collection('meta').doc('counters').set(counterData, { merge: true });
}

async function writeIfMissing(collection, id, data) {
  assertFirebaseConfigured();
  const ref = docRef(collection, id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    await ref.set({ ...data, id, createdAt: fieldValue() });
  }
}

async function ensureSeedData() {
  const [adminHash, customerHash] = await Promise.all([
    bcrypt.hash('admin123', 12),
    bcrypt.hash('customer123', 12)
  ]);
  const techHash = await bcrypt.hash('tech123', 12);

  await writeIfMissing(collections.users, 1, {
    role: 'admin',
    name: 'Admin Manager',
    email: 'admin@autocare.lk',
    emailLower: 'admin@autocare.lk',
    phone: '+94 77 023 4567',
    passwordHash: adminHash,
    status: 'active'
  });

  await writeIfMissing(collections.users, 2, {
    role: 'customer',
    name: 'Demo Customer',
    email: 'customer@autocare.lk',
    emailLower: 'customer@autocare.lk',
    phone: '+94 77 345 6789',
    passwordHash: customerHash,
    status: 'active'
  });

  const technicianUser = await ensureUserByEmailRole({
    id: 3,
    role: 'technician',
    name: 'Kasun Technician',
    email: 'tech@autocare.lk',
    phone: '+94 77 222 3344',
    passwordHash: techHash,
    status: 'active',
    syncPassword: true
  });

  await writeIfMissing(collections.technicians, 1, {
    userId: technicianUser.id,
    employeeNo: 'TECH-001',
    specialization: 'General Service',
    phone: '+94 77 222 3344',
    experienceYears: 4,
    status: 'active'
  });
  await updateDocument(collections.technicians, 1, {
    userId: technicianUser.id,
    employeeNo: 'TECH-001',
    specialization: 'General Service',
    phone: '+94 77 222 3344',
    experienceYears: 4,
    status: 'active'
  });

  const services = [
    [1, 'Oil Change', 6000, '45 min', 'Engine oil, filter replacement and quick inspection.'],
    [2, 'Brake Service', 7500, '1 hr', 'Brake pads, fluid check and safety testing.'],
    [3, 'Full Service', 18500, '3 hr', 'Complete inspection, fluids, diagnostics and tune-up.'],
    [4, 'Engine Diagnostics', 12000, '1.5 hr', 'Computer scan, issue report and repair estimate.'],
    [5, 'General Service', 8500, '1 hr', 'Standard maintenance service and inspection.'],
    [6, 'Electrical Repair', 14000, '2 hr', 'Electrical fault diagnosis and repair.'],
    [7, 'Engine Repair', 22000, '3 hr', 'Engine repair, tuning and mechanical correction.'],
    [8, 'Suspension Repair', 16000, '2 hr', 'Suspension inspection, repair and alignment checks.'],
    [9, 'Hybrid/EV Service', 26000, '2 hr', 'Hybrid and electric vehicle safety inspection and service.']
  ];

  await Promise.all(services.map(([id, name, price, duration, description]) => (
    writeIfMissing(collections.servicePackages, id, { name, price, duration, description, active: true })
  )));

  await writeIfMissing(collections.vehicles, 1, {
    userId: 2,
    make: 'Toyota Corolla',
    model: 'Axio',
    plateNumber: 'ABC-854',
    year: '2019',
    imageUrl: 'assets/images/newsletter-red-sports-car.png'
  });

  await writeIfMissing(collections.vehicles, 2, {
    userId: 2,
    make: 'Honda Civic',
    model: 'EX',
    plateNumber: 'XZ-5676',
    year: '2019',
    imageUrl: defaultImage
  });

  await writeIfMissing(collections.bookings, 1, {
    userId: 2,
    vehicleId: 1,
    servicePackageId: 5,
    bookingDate: today(2),
    bookingTime: '10:00',
    status: 'Approved',
    queuePosition: 3,
    progress: 35
  });

  await writeIfMissing(collections.serviceJobs, 1, {
    bookingId: 1,
    vehicleId: 1,
    customerId: 2,
    assignedTechnicianId: 1,
    serviceType: 'General Service',
    priority: 'Normal',
    status: 'Assigned',
    progress: 35,
    startDate: today(),
    expectedCompletionDate: today(1),
    completionDate: '',
    assignedDate: today()
  });

  await Promise.all(inventoryCategories.map((name, index) => (
    writeIfMissing(collections.inventoryCategories, index + 1, { name, status: 'Active' })
  )));

  await writeIfMissing(collections.inventorySuppliers, 1, {
    name: 'AutoParts Lanka',
    phone: '+94 77 555 1122',
    email: 'sales@autopartslanka.lk',
    address: 'Colombo',
    status: 'Active'
  });

  const inventorySeed = [
    [1, 'OIL-5W30', 'Engine Oil 5W30', 'Fluids & Lubricants', 'Castrol', 'Castrol', 1, 3200, 4500, 24, 6, 'A1', '6 months'],
    [2, 'OIL-10W40', 'Engine Oil 10W40', 'Fluids & Lubricants', 'Mobil', 'Mobil', 1, 3000, 4200, 18, 6, 'A1', '6 months'],
    [3, 'FLT-OIL', 'Oil Filter', 'Filters', 'Bosch', 'Bosch', 1, 900, 1500, 20, 5, 'B1', '3 months'],
    [4, 'FLT-AIR', 'Air Filter', 'Filters', 'Toyota Genuine', 'Toyota', 1, 1400, 2400, 15, 5, 'B1', '3 months'],
    [5, 'FLT-FUEL', 'Fuel Filter', 'Filters', 'Denso', 'Denso', 1, 1800, 2900, 10, 4, 'B2', '3 months'],
    [6, 'BRK-FPAD', 'Front Brake Pad', 'Brake System', 'Brembo', 'Brembo', 1, 5200, 7500, 12, 4, 'C1', '12 months'],
    [7, 'BRK-RPAD', 'Rear Brake Pad', 'Brake System', 'Brembo', 'Brembo', 1, 4800, 7000, 10, 4, 'C1', '12 months'],
    [8, 'BRK-FLUID', 'Brake Fluid', 'Brake System', 'Bosch', 'Bosch', 1, 1100, 1900, 16, 5, 'C2', '6 months'],
    [9, 'BAT-12V', 'Car Battery 12V', 'Batteries', 'Exide', 'Exide', 1, 21500, 29500, 7, 2, 'D1', '18 months'],
    [10, 'SPK-PLUG', 'Spark Plug', 'Engine Parts', 'NGK', 'NGK', 1, 850, 1400, 40, 10, 'E1', '6 months'],
    [11, 'ALT-BELT', 'Alternator Belt', 'Engine Parts', 'Mitsuboshi', 'Mitsuboshi', 1, 2400, 3800, 8, 3, 'E2', '6 months'],
    [12, 'LED-HL', 'LED Headlight Bulb', 'Electrical', 'Philips', 'Philips', 1, 3600, 5200, 14, 4, 'F1', '12 months'],
    [13, 'COOLANT', 'Coolant', 'Cooling System', 'Toyota Genuine', 'Toyota', 1, 1500, 2600, 22, 6, 'G1', '6 months'],
    [14, 'RAD-HOSE', 'Radiator Hose', 'Cooling System', 'Gates', 'Gates', 1, 1900, 3200, 9, 3, 'G2', '6 months'],
    [15, 'SHK-FRONT', 'Front Shock Absorber', 'Suspension', 'KYB', 'KYB', 1, 9800, 14500, 6, 2, 'H1', '12 months'],
    [16, 'SHK-REAR', 'Rear Shock Absorber', 'Suspension', 'KYB', 'KYB', 1, 8900, 13200, 6, 2, 'H1', '12 months'],
    [17, 'TIRE-VALVE', 'Tire Valve', 'Tires & Wheels', 'TR413', 'Schrader', 1, 250, 500, 60, 15, 'I1', '1 month'],
    [18, 'WHL-BEAR', 'Wheel Bearing', 'Tires & Wheels', 'Koyo', 'Koyo', 1, 4200, 6800, 8, 3, 'I2', '12 months'],
    [19, 'WIPER', 'Wiper Blade', 'Accessories', 'Bosch', 'Bosch', 1, 1300, 2200, 20, 5, 'J1', '3 months'],
    [20, 'FLT-CABIN', 'Cabin Air Filter', 'Filters', 'Denso', 'Denso', 1, 1200, 2100, 16, 5, 'B3', '3 months']
  ];

  await Promise.all(inventorySeed.map(async ([id, itemCode, partName, category, brand, manufacturer, supplierId, purchasePrice, sellingPrice, stock, minimumStockLevel, location, warrantyPeriod]) => {
    const data = {
      itemCode,
      sku: itemCode,
      partName,
      name: partName,
      category,
      brand,
      manufacturer,
      supplierId,
      supplier: 'AutoParts Lanka',
      description: `${brand} ${partName}`,
      purchasePrice,
      sellingPrice,
      unitPrice: sellingPrice,
      stock,
      stockQuantity: stock,
      minimumStockLevel,
      location,
      warrantyPeriod,
      warrantyProvider: brand,
      status: inventoryStockStatus(stock)
    };
    await writeIfMissing(collections.inventoryParts, id, data);
    await updateDocument(collections.inventoryParts, id, data);
  }));

  await writeIfMissing(collections.invoices, 1, {
    userId: 2,
    servicePackageId: 1,
    amount: 6000,
    paymentStatus: 'Paid',
    invoiceDate: today(-5)
  });

  await writeIfMissing(collections.notifications, 1, {
    userId: 2,
    type: 'Booking Approved',
    message: 'Your General Service booking has been approved.',
    unread: true
  });

  await syncCounters();
}

async function checkConnection() {
  assertFirebaseConfigured();
  await db.collection(collections.users).limit(1).get();
  return { ok: true, database: 'firebase-firestore' };
}

module.exports = {
  addTechnicianNote,
  addUsedPart,
  advanceBooking,
  assignTechnician,
  cancelBooking,
  checkConnection,
  collections,
  createBooking,
  createCustomer: async (data, passwordHash) => createUser({ role: 'customer', ...data, passwordHash }),
  createEmergency,
  createFeedback,
  createInvoice,
  createInventoryItem,
  createInventorySupplier,
  createNotification,
  createService,
  createServiceJob,
  createTechnician,
  createUser,
  createVehicle,
  deleteInventoryItem,
  deleteTechnician,
  deleteVehicle,
  ensureSeedData,
  findUserByEmailRole,
  getAdminDashboard,
  getAdminServiceJobDetails,
  getById,
  getCustomerDashboard,
  getBookingSlots,
  getInventoryReports,
  getFileForDownload,
  getInvoicePdf,
  getPartUsagePhotoForDownload,
  getTechnicianDashboard,
  getTechnicianPerformance,
  getTechnicianWorkload,
  publicUser,
  recordReplacedPart,
  recordStoredDocument,
  recordStoredPhoto,
  requestAdditionalParts,
  returnUnusedPart,
  deleteStoredFile,
  markInvoiceEmailed,
  markAllCustomerNotificationsRead,
  markCustomerNotificationRead,
  completeTechnicianJob,
  updateBooking,
  updateCustomer,
  updateDocument,
  updateInventoryItem,
  updateInventorySupplier,
  updateProfile,
  updateService,
  updateTechnician,
  updateTechnicianProgress,
  uploadServiceImage,
  updateVehicle
};
