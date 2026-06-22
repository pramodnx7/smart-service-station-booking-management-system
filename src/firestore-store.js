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
  serviceImages: 'serviceImages'
};

const defaultImage = 'assets/images/hero-blue-workshop.png';
const serviceJobStatuses = ['Pending', 'Assigned', 'In Progress', 'Waiting For Parts', 'Quality Check', 'Completed', 'Cancelled'];
const inventoryCategories = ['Engine Parts', 'Brake System', 'Electrical', 'Suspension', 'Cooling System', 'Filters', 'Fluids & Lubricants', 'Batteries', 'Tires & Wheels', 'Accessories'];
const partConditions = ['Brand New', 'Used', 'Refurbished', 'Reconditioned', 'Customer Supplied'];
const lowStockThreshold = 5;

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
  return {
    id: technician.id,
    userId: technician.userId,
    name: user?.name || technician.name || 'Unknown technician',
    email: user?.email || technician.email || '',
    employeeNo: technician.employeeNo,
    specialization: technician.specialization,
    phone: technician.phone || user?.phone || '',
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
    progress: booking.progress || 0
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
  const [user, vehicles, bookings, invoices, notifications, serviceMap, jobs, parts, usages, images] = await Promise.all([
    getById(collections.users, userId),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.invoices),
    all(collections.notifications),
    servicesById(),
    all(collections.serviceJobs),
    all(collections.inventoryParts),
    all(collections.serviceJobParts),
    all(collections.serviceImages)
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
    serviceImages: sortById(images.filter((image) => customerJobIds.has(Number(image.serviceJobId)))).reverse(),
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
    photoUrl: usage.photoUrl || ''
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
  const [users, vehicles, bookings, packages, invoices, emergencies, notifications, feedback, technicians, serviceJobs, inventoryParts, suppliers, categories, movements, usages, serviceMap] = await Promise.all([
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

async function createVehicle(userId, data) {
  const vehicle = await createDocument(collections.vehicles, {
    userId,
    name: String(data.name || `${data.make} ${data.model}`).trim(),
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
    name: String(data.name || `${data.make} ${data.model}`).trim(),
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
    specialization: data.specialization.trim(),
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
    specialization: data.specialization.trim(),
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

  if (data.assignedTechnicianId) {
    await assertTechnician(data.assignedTechnicianId, true);
  }

  const service = await findServiceByName(data.serviceType || booking.serviceName, false);
  const serviceType = data.serviceType || service?.name || 'General Service';
  const status = data.assignedTechnicianId ? 'Assigned' : 'Pending';
  const job = await createDocument(collections.serviceJobs, {
    bookingId: asId(data.bookingId),
    vehicleId: asId(data.vehicleId || booking.vehicleId),
    customerId: asId(data.customerId || booking.userId),
    assignedTechnicianId: data.assignedTechnicianId ? asId(data.assignedTechnicianId) : null,
    serviceType,
    priority: data.priority || 'Normal',
    status,
    progress: 0,
    startDate: data.startDate || today(),
    expectedCompletionDate: data.expectedCompletionDate || today(1),
    completionDate: '',
    assignedDate: data.assignedTechnicianId ? today() : ''
  });

  await updateDocument(collections.bookings, booking.id, {
    status: status === 'Assigned' ? 'Approved' : booking.status,
    progress: status === 'Assigned' ? 35 : booking.progress
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

  const [jobs, notes, progressEntries, partsUsed, inventoryParts, notifications, context] = await Promise.all([
    all(collections.serviceJobs),
    all(collections.technicianNotes),
    all(collections.technicianProgress),
    all(collections.serviceJobParts),
    all(collections.inventoryParts),
    all(collections.notifications),
    dashboardContext()
  ]);

  const assignedJobs = jobs
    .filter((job) => Number(job.assignedTechnicianId) === Number(technician.id))
    .map((job) => serviceJobView(job, context));
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
    images: sortById(images.filter((image) => Number(image.serviceJobId) === Number(jobId))).reverse()
  };
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
      photoUrl: String(data.photoUrl || '').trim(),
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
    technicianId: technician.id,
    imageUrl: data.imageUrl.trim(),
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

async function getInvoiceText(id, requester) {
  const invoice = await getById(collections.invoices, id);
  if (!invoice || (requester.role !== 'admin' && invoice.userId !== requester.id)) return null;

  const [user, service, parts] = await Promise.all([
    getById(collections.users, invoice.userId),
    getById(collections.servicePackages, invoice.servicePackageId),
    all(collections.serviceJobParts)
  ]);
  const invoiceParts = parts.filter((part) => Number(part.serviceJobId) === Number(invoice.serviceJobId));
  const partLines = invoiceParts.length
    ? invoiceParts.map((part) => `${part.partName} | ${part.brand || '-'} | ${part.condition || '-'} | Qty ${part.quantity} | LKR ${Number(part.unitPrice || 0).toLocaleString('en-LK')} | LKR ${Number(part.totalPrice || 0).toLocaleString('en-LK')}`)
    : ['No parts recorded.'];

  return [
    'AutoCare Service Station Invoice',
    `Invoice: #INV-${invoice.id}`,
    `Customer: ${user?.name || 'Unknown customer'}`,
    `Service: ${service?.name || 'Unknown Service'}`,
    'Parts:',
    ...partLines,
    `Parts Total: LKR ${Number(invoice.partsTotal || 0).toLocaleString('en-LK')}`,
    `Labor Cost: LKR ${Number(invoice.laborCost || 0).toLocaleString('en-LK')}`,
    `Service Charges: LKR ${Number(invoice.serviceCharges || 0).toLocaleString('en-LK')}`,
    `Tax: LKR ${Number(invoice.tax || 0).toLocaleString('en-LK')}`,
    `Discount: LKR ${Number(invoice.discount || 0).toLocaleString('en-LK')}`,
    `Grand Total: LKR ${Number(invoice.amount).toLocaleString('en-LK')}`,
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
    specialization: 'Engine Diagnostics',
    phone: '+94 77 222 3344',
    experienceYears: 4,
    status: 'active'
  });
  await updateDocument(collections.technicians, 1, {
    userId: technicianUser.id,
    employeeNo: 'TECH-001',
    specialization: 'Engine Diagnostics',
    phone: '+94 77 222 3344',
    experienceYears: 4,
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
  getById,
  getCustomerDashboard,
  getInventoryReports,
  getInvoiceText,
  getTechnicianDashboard,
  getTechnicianPerformance,
  getTechnicianWorkload,
  publicUser,
  recordReplacedPart,
  requestAdditionalParts,
  returnUnusedPart,
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
