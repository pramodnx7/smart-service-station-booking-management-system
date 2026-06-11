const bcrypt = require('bcryptjs');
const { admin, db, hasFirebaseCredentials } = require('./firebase');

const collections = {
  users: 'users',
  vehicles: 'vehicles',
  servicePackages: 'servicePackages',
  bookings: 'bookings',
  invoices: 'invoices',
  emergencyRequests: 'emergencyRequests',
  notifications: 'notifications',
  feedback: 'feedback'
};

const defaultImage = 'assets/images/hero-blue-workshop.png';

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

function docRef(collection, id) {
  return db.collection(collection).doc(String(id));
}

function assertFirebaseConfigured() {
  if (hasFirebaseCredentials) return;

  const error = new Error('Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_PATH in .env.');
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

function vehicleView(vehicle) {
  return {
    id: vehicle.id,
    customerId: vehicle.userId,
    make: vehicle.make,
    model: vehicle.model,
    plate: vehicle.plateNumber,
    year: vehicle.year,
    image: vehicle.imageUrl || defaultImage
  };
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
    progress: booking.progress || 0
  };
}

function invoiceView(invoice, serviceById) {
  const service = serviceById.get(Number(invoice.servicePackageId));
  return {
    id: invoice.id,
    customerId: invoice.userId,
    service: service?.name || invoice.serviceName || 'Unknown Service',
    amount: Number(invoice.amount),
    payment: invoice.paymentStatus,
    date: formatDate(invoice.invoiceDate)
  };
}

async function servicesById() {
  const services = await all(collections.servicePackages);
  return new Map(services.map((service) => [Number(service.id), service]));
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
  const [user, vehicles, bookings, invoices, notifications, serviceMap] = await Promise.all([
    getById(collections.users, userId),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.invoices),
    all(collections.notifications),
    servicesById()
  ]);

  const packages = Array.from(serviceMap.values())
    .filter((service) => service.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((service) => service.name);

  return {
    profile: { name: user.name, email: user.email, phone: user.phone || '' },
    vehicles: sortById(vehicles.filter((item) => item.userId === userId)).map(vehicleView),
    bookings: sortDateDesc(bookings.filter((item) => item.userId === userId).map((item) => bookingView(item, serviceMap)), 'date', 'time'),
    invoices: sortDateDesc(invoices.filter((item) => item.userId === userId).map((item) => invoiceView(item, serviceMap)), 'date'),
    notifications: sortById(notifications.filter((item) => item.userId === userId)).reverse().map(({ id, type, message, unread }) => ({ id, type, message, unread })),
    packages
  };
}

async function getAdminDashboard() {
  const [users, vehicles, bookings, packages, invoices, emergencies, notifications, feedback, serviceMap] = await Promise.all([
    all(collections.users),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.servicePackages),
    all(collections.invoices),
    all(collections.emergencyRequests),
    all(collections.notifications),
    all(collections.feedback),
    servicesById()
  ]);

  return {
    customers: sortById(users.filter((user) => user.role === 'customer')).map(customerView),
    vehicles: sortById(vehicles).map(vehicleView),
    bookings: sortDateDesc(bookings.map((item) => bookingView(item, serviceMap)), 'date', 'time'),
    packages: sortById(packages).map(({ id, name, price, duration, description }) => ({ id, name, price: Number(price), duration, description })),
    invoices: sortDateDesc(invoices.map((item) => invoiceView(item, serviceMap)), 'date'),
    emergencies: sortById(emergencies).reverse().map(({ id, userId, customerId, location, problem, status }) => ({ id, customerId: customerId || userId, location, problem, status })),
    notifications: sortById(notifications).reverse().slice(0, 20).map(({ id, type, message, unread }) => ({ id, type, message, unread })),
    feedback: sortById(feedback).reverse().map(({ id, userId, customerId, rating, comment }) => ({ id, customerId: customerId || userId, rating, comment }))
  };
}

async function createVehicle(userId, data) {
  const vehicle = await createDocument(collections.vehicles, {
    userId,
    make: data.make.trim(),
    model: data.model.trim(),
    plateNumber: data.plate.trim().toUpperCase(),
    year: String(data.year).trim(),
    imageUrl: data.image || defaultImage
  });
  return vehicleView(vehicle);
}

async function updateVehicle(id, userId, data, enforceOwner = true) {
  const current = await getById(collections.vehicles, id);
  if (!current || (enforceOwner && current.userId !== userId)) return null;

  const vehicle = await updateDocument(collections.vehicles, id, {
    userId,
    make: data.make.trim(),
    model: data.model.trim(),
    plateNumber: data.plate.trim().toUpperCase(),
    year: String(data.year).trim()
  });

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

async function createBooking(userId, data, status = 'Pending') {
  const service = await findServiceByName(data.service, true);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

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
    progress: bookingProgress(status)
  });

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
  const booking = await updateDocument(collections.bookings, id, {
    userId,
    vehicleId: asId(data.vehicleId),
    servicePackageId: service.id,
    bookingDate: data.date,
    bookingTime: data.time,
    status,
    progress: bookingProgress(status)
  });

  return bookingView(booking, new Map([[service.id, service]]));
}

async function cancelBooking(id, userId, enforceOwner = true) {
  const current = await getById(collections.bookings, id);
  if (!current || (enforceOwner && current.userId !== userId)) return false;
  await updateDocument(collections.bookings, id, { status: 'Cancelled', progress: 0 });
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
  return createDocument(collections.emergencyRequests, {
    userId,
    location: data.location.trim(),
    problem: data.problem.trim(),
    status: 'Open'
  });
}

async function createFeedback(userId, data) {
  await createDocument(collections.feedback, {
    userId,
    rating: Number(data.rating),
    comment: data.feedback.trim()
  });
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
  const service = await findServiceByName(data.service, false);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const invoice = await createDocument(collections.invoices, {
    userId: asId(data.customerId),
    servicePackageId: service.id,
    amount: Number(data.amount),
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

async function getInvoiceText(id, requester) {
  const invoice = await getById(collections.invoices, id);
  if (!invoice || (requester.role !== 'admin' && invoice.userId !== requester.id)) return null;

  const [user, service] = await Promise.all([
    getById(collections.users, invoice.userId),
    getById(collections.servicePackages, invoice.servicePackageId)
  ]);

  return [
    'AutoCare Service Station Invoice',
    `Invoice: #INV-${invoice.id}`,
    `Customer: ${user?.name || 'Unknown customer'}`,
    `Service: ${service?.name || 'Unknown Service'}`,
    `Amount: LKR ${Number(invoice.amount).toLocaleString('en-LK')}`,
    `Payment: ${invoice.paymentStatus}`,
    `Date: ${formatDate(invoice.invoiceDate)}`
  ].join('\n');
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

  const services = [
    [1, 'Oil Change', 6000, '45 min', 'Engine oil, filter replacement and quick inspection.'],
    [2, 'Brake Service', 7500, '1 hr', 'Brake pads, fluid check and safety testing.'],
    [3, 'Full Service', 18500, '3 hr', 'Complete inspection, fluids, diagnostics and tune-up.'],
    [4, 'Engine Diagnostics', 12000, '1.5 hr', 'Computer scan, issue report and repair estimate.'],
    [5, 'General Service', 8500, '1 hr', 'Standard maintenance service and inspection.']
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
  advanceBooking,
  cancelBooking,
  checkConnection,
  collections,
  createBooking,
  createCustomer: async (data, passwordHash) => createUser({ role: 'customer', ...data, passwordHash }),
  createEmergency,
  createFeedback,
  createInvoice,
  createNotification,
  createService,
  createUser,
  createVehicle,
  deleteVehicle,
  deleteBooking,
  ensureSeedData,
  findUserByEmailRole,
  getAdminDashboard,
  getById,
  getCustomerDashboard,
  getInvoiceText,
  publicUser,
  updateBooking,
  updateCustomer,
  updateDocument,
  updateProfile,
  updateService,
  updateVehicle
};
