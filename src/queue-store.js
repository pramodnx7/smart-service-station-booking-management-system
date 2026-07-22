const { admin, db, firebaseConfigurationError } = require('./firebase');
const store = require('./firestore-store');

const queueCollection = 'queueEntries';
const serviceBayCollection = 'serviceBays';
const terminalStatuses = ['Completed', 'Cancelled', 'No Show'];
const queueStatuses = ['Waiting', 'Called', 'In Service', 'Completed', 'Skipped', 'Cancelled', 'No Show'];
const queueTypes = ['Appointment', 'Walk-in', 'Emergency'];
const serviceBayCount = Math.max(1, Number(process.env.SERVICE_BAY_COUNT || 8));
const appointmentGraceMinutes = Math.max(0, Number(process.env.QUEUE_APPOINTMENT_GRACE_MINUTES || 15));
const defaultServiceMinutes = Math.max(10, Number(process.env.QUEUE_DEFAULT_SERVICE_MINUTES || 45));
const queueContextCacheMs = Math.max(5000, Number(process.env.QUEUE_CONTEXT_CACHE_MS || 60000));
const referenceCacheMs = Math.max(60000, Number(process.env.QUEUE_REFERENCE_CACHE_MS || 10 * 60 * 1000));
const cache = new Map();

function assertConfigured() {
  if (db) return;
  const error = new Error(firebaseConfigurationError || 'Firebase Admin credentials are not configured.');
  error.status = 500;
  throw error;
}

function fieldValue() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function docRef(collection, id) {
  return db.collection(collection).doc(String(id));
}

async function all(collection) {
  assertConfigured();
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map((document) => ({ id: Number(document.id), ...document.data() }));
}

function snapshotData(snapshot) {
  return snapshot.exists ? { id: Number(snapshot.id), ...snapshot.data() } : null;
}

async function cached(key, ttl, loader) {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  const value = Promise.resolve().then(loader);
  cache.set(key, { expiresAt: Date.now() + ttl, value });
  try {
    return await value;
  } catch (error) {
    if (cache.get(key)?.value === value) cache.delete(key);
    throw error;
  }
}

function invalidateCache(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function invalidateQueueContext() {
  invalidateCache('queue-context:');
}

function invalidateReferenceData(...collections) {
  collections.forEach((collection) => {
    cache.delete(`collection:${collection}`);
    invalidateCache(`document:${collection}:`);
  });
  invalidateQueueContext();
}

function invalidateCollectionCache(collection, id) {
  cache.delete(`collection:${collection}`);
  if (id !== undefined && id !== null) cache.delete(`document:${collection}:${id}`);
}

async function cachedCollection(collection) {
  return cached(`collection:${collection}`, referenceCacheMs, async () => {
    const items = await all(collection);
    items.forEach((item) => cache.set(`document:${collection}:${item.id}`, {
      expiresAt: Date.now() + referenceCacheMs,
      value: Promise.resolve(item)
    }));
    return items;
  });
}

async function cachedDocuments(collection, ids) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!uniqueIds.length) return [];

  const results = new Map();
  const missing = [];
  await Promise.all(uniqueIds.map(async (id) => {
    const key = `document:${collection}:${id}`;
    const existing = cache.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      const item = await existing.value;
      if (item) results.set(id, item);
    } else {
      missing.push(id);
    }
  }));

  if (missing.length) {
    const snapshots = await db.getAll(...missing.map((id) => docRef(collection, id)));
    snapshots.forEach((snapshot, index) => {
      const id = missing[index];
      const item = snapshotData(snapshot);
      cache.set(`document:${collection}:${id}`, {
        expiresAt: Date.now() + referenceCacheMs,
        value: Promise.resolve(item)
      });
      if (item) results.set(id, item);
    });
  }

  return uniqueIds.map((id) => results.get(id)).filter(Boolean);
}

async function getById(collection, id) {
  assertConfigured();
  const snapshot = await docRef(collection, id).get();
  return snapshot.exists ? { id: Number(snapshot.id), ...snapshot.data() } : null;
}

async function updateDocument(collection, id, changes) {
  const ref = docRef(collection, id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  await ref.set({ ...changes, updatedAt: fieldValue() }, { merge: true });
  const updated = await ref.get();
  const item = { id: Number(updated.id), ...updated.data() };
  invalidateCollectionCache(collection, id);
  if (collection === queueCollection) invalidateQueueContext();
  return item;
}

async function createNumericDocument(collection, data) {
  assertConfigured();
  const item = await db.runTransaction(async (transaction) => {
    const counterRef = db.collection('meta').doc('counters');
    const counterSnapshot = await transaction.get(counterRef);
    const counters = counterSnapshot.exists ? counterSnapshot.data() : {};
    const id = Number(counters[collection] || 0) + 1;
    transaction.set(counterRef, { [collection]: id }, { merge: true });
    transaction.set(docRef(collection, id), { ...data, id, createdAt: fieldValue() });
    return { ...data, id };
  });
  invalidateCollectionCache(collection, item.id);
  return item;
}

function dateParts(value = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIME_ZONE || 'Asia/Colombo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function today() {
  const parts = dateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentTime() {
  const parts = dateParts();
  return `${parts.hour}:${parts.minute}`;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampIso(value) {
  const milliseconds = timestampMillis(value);
  return milliseconds ? new Date(milliseconds).toISOString() : '';
}

function minutesSince(value, now = Date.now()) {
  const start = timestampMillis(value);
  return start ? Math.max(0, Math.floor((now - start) / 60000)) : 0;
}

function scheduledMillis(entry) {
  if (!entry.appointmentDate || !entry.appointmentTime) return 0;
  const value = new Date(`${entry.appointmentDate}T${entry.appointmentTime}:00`).getTime();
  return Number.isFinite(value) ? value : 0;
}

function priorityScore(entry, now = Date.now()) {
  if (entry.queueType === 'Emergency' && entry.emergencyApproved) return 10000 + minutesSince(entry.checkedInAt, now) * 10;
  const waitingMinutes = minutesSince(entry.checkedInAt, now);
  if (entry.queueType === 'Appointment') {
    const scheduled = scheduledMillis(entry);
    const arrival = timestampMillis(entry.checkedInAt) || now;
    const late = scheduled && arrival > scheduled + appointmentGraceMinutes * 60000;
    return (late ? 120 : 300) + waitingMinutes * (late ? 3 : 2);
  }
  return 100 + waitingMinutes * 4;
}

function parseDurationMinutes(value) {
  const text = String(value || '').toLowerCase();
  const hours = Number(text.match(/([\d.]+)\s*(?:hour|hr)/)?.[1] || 0);
  const minutes = Number(text.match(/([\d.]+)\s*(?:minute|min)/)?.[1] || 0);
  return Math.max(10, Math.round(hours * 60 + minutes) || defaultServiceMinutes);
}

function tokenPrefix(queueType) {
  return { Appointment: 'A', 'Walk-in': 'W', Emergency: 'E' }[queueType];
}

async function createQueueEntry(data) {
  assertConfigured();
  const prefix = tokenPrefix(data.queueType);
  const queueDate = data.queueDate || today();
  const item = await db.runTransaction(async (transaction) => {
    const counterRef = db.collection('meta').doc('counters');
    const tokenRef = db.collection('meta').doc(`queue-token-${queueDate}-${prefix}`);
    const [counterSnapshot, tokenSnapshot] = await Promise.all([
      transaction.get(counterRef), transaction.get(tokenRef)
    ]);
    const counters = counterSnapshot.exists ? counterSnapshot.data() : {};
    const id = Number(counters[queueCollection] || 0) + 1;
    const sequence = Number(tokenSnapshot.exists ? tokenSnapshot.data().lastSequence : 0) + 1;
    const token = `${prefix}-${String(sequence).padStart(3, '0')}`;
    const entry = {
      ...data,
      id,
      token,
      queueDate,
      status: data.status || 'Waiting',
      storedPosition: 0,
      checkedInAt: fieldValue(),
      createdAt: fieldValue()
    };
    transaction.set(counterRef, { [queueCollection]: id }, { merge: true });
    transaction.set(tokenRef, { lastSequence: sequence, queueDate, prefix, updatedAt: fieldValue() }, { merge: true });
    transaction.set(docRef(queueCollection, id), entry);
    return { ...data, id, token, queueDate, status: entry.status };
  });
  invalidateCollectionCache(queueCollection, item.id);
  invalidateQueueContext();
  return item;
}

async function createNotification(userId, type, message) {
  if (!userId) return null;
  return createNumericDocument(store.collections.notifications, {
    userId: Number(userId), type, message, unread: true
  });
}

function createContext(entries, users, vehicles, bookings, services, technicians, jobs, savedBays) {
  return {
    entries, users, vehicles, bookings, services, technicians, jobs, savedBays,
    usersById: new Map(users.map((item) => [Number(item.id), item])),
    vehiclesById: new Map(vehicles.map((item) => [Number(item.id), item])),
    bookingsById: new Map(bookings.map((item) => [Number(item.id), item])),
    servicesById: new Map(services.map((item) => [Number(item.id), item])),
    techniciansById: new Map(technicians.map((item) => [Number(item.id), item])),
    jobsById: new Map(jobs.map((item) => [Number(item.id), item])),
    savedBaysById: new Map(savedBays.map((item) => [Number(item.id), item]))
  };
}

async function loadOperationalContext() {
  const queueDate = today();
  return cached(`queue-context:${queueDate}`, queueContextCacheMs, async () => {
    assertConfigured();
    const [entrySnapshot, technicians, savedBays] = await Promise.all([
      db.collection(queueCollection).where('queueDate', '==', queueDate).get(),
      cachedCollection(store.collections.technicians),
      cachedCollection(serviceBayCollection)
    ]);
    const entries = entrySnapshot.docs.map((document) => ({ id: Number(document.id), ...document.data() }));
    const [users, vehicles, services, jobs] = await Promise.all([
      cachedDocuments(store.collections.users, [
        ...entries.map((entry) => entry.customerId),
        ...technicians.map((technician) => technician.userId)
      ]),
      cachedDocuments(store.collections.vehicles, entries.map((entry) => entry.vehicleId)),
      cachedDocuments(store.collections.servicePackages, entries.map((entry) => entry.servicePackageId)),
      cachedDocuments(store.collections.serviceJobs, entries.map((entry) => entry.serviceJobId))
    ]);
    return createContext(entries, users, vehicles, [], services, technicians, jobs, savedBays);
  });
}

async function loadContext({ includeCatalog = false } = {}) {
  const context = await loadOperationalContext();
  if (!includeCatalog) return context;
  const [users, vehicles, services] = await Promise.all([
    cachedCollection(store.collections.users),
    cachedCollection(store.collections.vehicles),
    cachedCollection(store.collections.servicePackages)
  ]);
  return createContext(
    context.entries, users, vehicles, [], services, context.technicians, context.jobs, context.savedBays
  );
}

function technicianName(technician, usersById) {
  return technician ? (usersById.get(Number(technician.userId))?.name || technician.name || `Technician ${technician.id}`) : '';
}

function queueBayViews(context, activeEntries = context.entries.filter((entry) => entry.queueDate === today())) {
  return Array.from({ length: serviceBayCount }, (_, offset) => {
    const id = offset + 1;
    const saved = context.savedBaysById.get(id) || {};
    const occupant = activeEntries.find((entry) => Number(entry.serviceBayId) === id && ['Called', 'In Service'].includes(entry.status));
    const manualStatus = saved.status || 'Available';
    return {
      id,
      name: saved.name || `Bay ${String(id).padStart(2, '0')}`,
      status: manualStatus === 'Maintenance' ? 'Maintenance' : (occupant ? 'Busy' : 'Available'),
      queueEntryId: occupant?.id || null,
      token: occupant?.token || ''
    };
  });
}

function averageServiceDuration(entries) {
  const durations = entries
    .filter((entry) => entry.status === 'Completed' && entry.serviceStartedAt && entry.completedAt)
    .map((entry) => Math.round((timestampMillis(entry.completedAt) - timestampMillis(entry.serviceStartedAt)) / 60000))
    .filter((duration) => duration > 0 && duration < 1440);
  return durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : defaultServiceMinutes;
}

function buildQueueViews(context) {
  const queueDate = today();
  const now = Date.now();
  const todaysEntries = context.entries.filter((entry) => entry.queueDate === queueDate);
  const waiting = todaysEntries
    .filter((entry) => entry.status === 'Waiting')
    .sort((left, right) => priorityScore(right, now) - priorityScore(left, now) || timestampMillis(left.checkedInAt) - timestampMillis(right.checkedInAt));
  const bays = queueBayViews(context, todaysEntries);
  const activeTechnicians = context.technicians.filter((item) => String(item.status || '').toLowerCase() === 'active');
  const capacity = Math.max(1, Math.min(activeTechnicians.length || 1, bays.filter((bay) => bay.status !== 'Maintenance').length || 1));
  const averageMinutes = averageServiceDuration(context.entries);
  const positions = new Map(waiting.map((entry, index) => [Number(entry.id), index + 1]));
  const view = (entry) => {
    const customer = context.usersById.get(Number(entry.customerId)) || {};
    const vehicle = context.vehiclesById.get(Number(entry.vehicleId)) || {};
    const service = context.servicesById.get(Number(entry.servicePackageId)) || {};
    const technician = context.techniciansById.get(Number(entry.assignedTechnicianId));
    const position = positions.get(Number(entry.id)) || 0;
    return {
      id: entry.id,
      token: entry.token,
      queueType: entry.queueType,
      status: entry.status,
      customerId: entry.customerId,
      customerName: customer.name || 'Unknown customer',
      customerPhone: customer.phone || '',
      vehicleId: entry.vehicleId,
      vehicle: `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Unknown vehicle',
      vehicleNumber: vehicle.plateNumber || vehicle.plate || '',
      servicePackageId: entry.servicePackageId,
      service: service.name || entry.serviceName || 'General Service',
      bookingId: entry.bookingId || null,
      serviceJobId: entry.serviceJobId || null,
      assignedTechnicianId: entry.assignedTechnicianId || null,
      mechanic: technicianName(technician, context.usersById) || 'Unassigned',
      serviceBayId: entry.serviceBayId || null,
      serviceBay: entry.serviceBayId ? (bays.find((bay) => bay.id === Number(entry.serviceBayId))?.name || `Bay ${entry.serviceBayId}`) : 'Unassigned',
      queuePosition: position,
      priorityScore: priorityScore(entry, now),
      estimatedWaitingMinutes: position ? Math.max(0, Math.ceil((position - 1) / capacity) * averageMinutes) : 0,
      waitingMinutes: minutesSince(entry.checkedInAt, now),
      elapsedServiceMinutes: minutesSince(entry.serviceStartedAt, now),
      checkInTime: timestampIso(entry.checkedInAt),
      appointmentDate: entry.appointmentDate || '',
      appointmentTime: entry.appointmentTime || '',
      emergencyReason: entry.emergencyReason || '',
      emergencyApproved: Boolean(entry.emergencyApproved)
    };
  };
  return { queueDate, now, todaysEntries, waiting, bays, capacity, averageMinutes, positions, view };
}

async function syncStoredPositions(context) {
  const queue = buildQueueViews(context);
  const changes = queue.waiting.filter((entry) => Number(entry.storedPosition || 0) !== Number(queue.positions.get(Number(entry.id))));
  if (!changes.length) return;
  const batch = db.batch();
  changes.forEach((entry) => {
    batch.set(docRef(queueCollection, entry.id), {
      storedPosition: queue.positions.get(Number(entry.id)), updatedAt: fieldValue()
    }, { merge: true });
  });
  await batch.commit();
  await Promise.all(changes.filter((entry) => Number(entry.storedPosition || 0) > 0).map((entry) => (
    createNotification(entry.customerId, 'Queue Position Updated', `${entry.token} is now queue position ${queue.positions.get(Number(entry.id))}.`)
  )));
}

function queueReports(context, todaysViews, averageMinutes) {
  const completed = context.entries.filter((entry) => entry.status === 'Completed');
  const waits = completed.map((entry) => Math.max(0, Math.round((timestampMillis(entry.serviceStartedAt) - timestampMillis(entry.checkedInAt)) / 60000))).filter(Number.isFinite);
  const byHour = todaysViews.reduce((hours, entry) => {
    const hour = entry.checkInTime ? new Date(entry.checkInTime).getHours() : 0;
    hours[hour] = (hours[hour] || 0) + 1;
    return hours;
  }, {});
  const peakHour = Object.entries(byHour).sort((left, right) => right[1] - left[1])[0];
  return {
    averageWaitingMinutes: waits.length ? Math.round(waits.reduce((sum, value) => sum + value, 0) / waits.length) : 0,
    averageServiceMinutes: averageMinutes,
    walkIns: todaysViews.filter((entry) => entry.queueType === 'Walk-in').length,
    appointments: todaysViews.filter((entry) => entry.queueType === 'Appointment').length,
    emergencies: todaysViews.filter((entry) => entry.queueType === 'Emergency').length,
    completionRate: todaysViews.length ? Math.round(todaysViews.filter((entry) => entry.status === 'Completed').length / todaysViews.length * 100) : 0,
    peakServiceHour: peakHour ? `${String(peakHour[0]).padStart(2, '0')}:00` : 'No data',
    mechanicUtilization: context.technicians.filter((item) => String(item.status || '').toLowerCase() === 'active').map((technician) => {
      const jobs = completed.filter((entry) => Number(entry.assignedTechnicianId) === Number(technician.id));
      return { technicianId: technician.id, name: technicianName(technician, context.usersById), completed: jobs.length };
    })
  };
}

function buildQueueDashboard(context, includeCatalog = true) {
  const queue = buildQueueViews(context);
  const views = queue.todaysEntries.map(queue.view);
  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      waiting: views.filter((entry) => entry.status === 'Waiting').length,
      inService: views.filter((entry) => entry.status === 'In Service').length,
      completedToday: views.filter((entry) => entry.status === 'Completed').length,
      walkInsToday: views.filter((entry) => entry.queueType === 'Walk-in').length,
      appointments: views.filter((entry) => entry.queueType === 'Appointment').length,
      emergencies: views.filter((entry) => entry.queueType === 'Emergency').length,
      averageWaitingMinutes: queueReports(context, views, queue.averageMinutes).averageWaitingMinutes,
      activeServiceBays: queue.bays.filter((bay) => bay.status !== 'Maintenance').length
    },
    nowServing: views.filter((entry) => ['Called', 'In Service'].includes(entry.status)).sort((left, right) => left.serviceBayId - right.serviceBayId),
    nextCustomers: queue.waiting.slice(0, 5).map(queue.view),
    entries: views.sort((left, right) => {
      const statusOrder = { 'In Service': 0, Called: 1, Waiting: 2, Skipped: 3, Completed: 4, Cancelled: 5, 'No Show': 6 };
      return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9) || left.queuePosition - right.queuePosition;
    }),
    serviceBays: queue.bays,
    technicians: context.technicians.filter((item) => String(item.status || '').toLowerCase() === 'active').map((item) => ({
      id: item.id, name: technicianName(item, context.usersById), specialization: item.specialization || ''
    })),
    customers: includeCatalog ? context.users.filter((item) => item.role === 'customer').map((item) => ({ id: item.id, name: item.name, phone: item.phone || '', email: item.email || '' })) : [],
    vehicles: includeCatalog ? context.vehicles.map((item) => ({ id: item.id, customerId: item.userId, name: `${item.make || ''} ${item.model || ''}`.trim(), plate: item.plateNumber || '' })) : [],
    services: includeCatalog ? context.services.filter((item) => item.active !== false).map((item) => ({ id: item.id, name: item.name, duration: item.duration || '' })) : [],
    reports: queueReports(context, views, queue.averageMinutes)
  };
}

async function getQueueDashboard() {
  const context = await loadContext({ includeCatalog: true });
  return buildQueueDashboard(context);
}

async function searchAppointments(query) {
  const bookings = await all(store.collections.bookings);
  const [users, vehicles, services] = await Promise.all([
    cachedDocuments(store.collections.users, bookings.map((booking) => booking.userId)),
    cachedDocuments(store.collections.vehicles, bookings.map((booking) => booking.vehicleId)),
    cachedDocuments(store.collections.servicePackages, bookings.map((booking) => booking.servicePackageId))
  ]);
  const context = createContext([], users, vehicles, bookings, services, [], [], []);
  const search = String(query || '').trim().toLowerCase();
  return context.bookings
    .filter((booking) => !terminalStatuses.includes(booking.status))
    .map((booking) => {
      const customer = context.usersById.get(Number(booking.userId)) || {};
      const vehicle = context.vehiclesById.get(Number(booking.vehicleId)) || {};
      const service = context.servicesById.get(Number(booking.servicePackageId)) || {};
      return {
        id: booking.id, customerId: booking.userId, customerName: customer.name || '', phone: customer.phone || '',
        vehicleId: booking.vehicleId, vehicle: `${vehicle.make || ''} ${vehicle.model || ''}`.trim(), vehicleNumber: vehicle.plateNumber || '',
        servicePackageId: booking.servicePackageId, service: service.name || booking.serviceName || '', date: booking.bookingDate, time: booking.bookingTime, status: booking.status
      };
    })
    .filter((booking) => !search || [`bk-${booking.id}`, String(booking.id), booking.phone, booking.vehicleNumber, booking.customerName].some((value) => String(value).toLowerCase().includes(search)))
    .slice(0, 25);
}

async function findDuplicateQueue(bookingId) {
  const snapshot = await db.collection(queueCollection).where('bookingId', '==', Number(bookingId)).get();
  const entries = snapshot.docs.map((document) => ({ id: Number(document.id), ...document.data() }));
  return entries.find((entry) => Number(entry.bookingId) === Number(bookingId) && !terminalStatuses.includes(entry.status));
}

async function checkInAppointment(bookingId, adminUserId) {
  const booking = await getById(store.collections.bookings, bookingId);
  if (!booking || terminalStatuses.includes(booking.status)) {
    const error = new Error('Active appointment not found.');
    error.status = 404;
    throw error;
  }
  if (String(booking.bookingDate || '').slice(0, 10) !== today()) {
    const error = new Error('Only appointments scheduled for today can be checked in.');
    error.status = 409;
    throw error;
  }
  const duplicate = await findDuplicateQueue(bookingId);
  if (duplicate) {
    const error = new Error(`Appointment is already checked in as ${duplicate.token}.`);
    error.status = 409;
    throw error;
  }
  const entry = await createQueueEntry({
    queueType: 'Appointment', bookingId: Number(booking.id), customerId: Number(booking.userId), vehicleId: Number(booking.vehicleId),
    servicePackageId: Number(booking.servicePackageId), appointmentDate: String(booking.bookingDate || '').slice(0, 10),
    appointmentTime: String(booking.bookingTime || '').slice(0, 5), emergencyApproved: false, createdByUserId: Number(adminUserId)
  });
  await updateDocument(store.collections.bookings, booking.id, { status: 'Checked In', progress: 20 });
  await createNotification(entry.customerId, 'Appointment Checked In', `You are checked in with queue token ${entry.token}.`);
  await syncStoredPositions(await loadContext());
  return entry;
}

async function serviceById(servicePackageId) {
  const service = await getById(store.collections.servicePackages, servicePackageId);
  if (!service || service.active === false) {
    const error = new Error('Active service package not found.');
    error.status = 400;
    throw error;
  }
  return service;
}

async function createQueueBooking(customerId, vehicleId, service, queueType) {
  return createNumericDocument(store.collections.bookings, {
    userId: Number(customerId), vehicleId: Number(vehicleId), servicePackageId: Number(service.id),
    serviceName: service.name, bookingDate: today(), bookingTime: currentTime(), status: 'Checked In', progress: 20,
    queuePosition: 0, durationMinutes: parseDurationMinutes(service.duration), source: queueType
  });
}

async function registerArrival(queueType, data, adminUserId) {
  if (!queueTypes.includes(queueType) || queueType === 'Appointment') {
    const error = new Error('Invalid arrival type.');
    error.status = 400;
    throw error;
  }
  const [customer, vehicle, service] = await Promise.all([
    getById(store.collections.users, data.customerId), getById(store.collections.vehicles, data.vehicleId), serviceById(data.servicePackageId)
  ]);
  if (!customer || customer.role !== 'customer') {
    const error = new Error('Customer not found.'); error.status = 404; throw error;
  }
  if (!vehicle || Number(vehicle.userId) !== Number(customer.id)) {
    const error = new Error('Vehicle does not belong to the selected customer.'); error.status = 400; throw error;
  }
  const booking = await createQueueBooking(customer.id, vehicle.id, service, queueType);
  const entry = await createQueueEntry({
    queueType, bookingId: booking.id, customerId: customer.id, vehicleId: vehicle.id, servicePackageId: service.id,
    emergencyReason: queueType === 'Emergency' ? String(data.emergencyReason || '').trim() : '',
    emergencyApproved: queueType === 'Emergency', createdByUserId: Number(adminUserId)
  });
  await createNotification(customer.id, queueType === 'Emergency' ? 'Emergency Queue Approved' : 'Walk-in Checked In', `Your queue token is ${entry.token}.`);
  await syncStoredPositions(await loadContext());
  return entry;
}

function availableResources(context, entry) {
  const activeEntries = context.entries.filter((item) => item.queueDate === today() && ['Called', 'In Service'].includes(item.status) && Number(item.id) !== Number(entry.id));
  const occupiedBays = new Set(activeEntries.map((item) => Number(item.serviceBayId)).filter(Boolean));
  const occupiedTechnicians = new Set(activeEntries.map((item) => Number(item.assignedTechnicianId)).filter(Boolean));
  const bays = queueBayViews(context, activeEntries).filter((bay) => bay.status === 'Available' && !occupiedBays.has(bay.id));
  const serviceName = String(context.servicesById.get(Number(entry.servicePackageId))?.name || '').toLowerCase();
  const technicians = context.technicians.filter((item) => (
    String(item.status || '').toLowerCase() === 'active' && !occupiedTechnicians.has(Number(item.id))
  ));
  const preferredTechnicians = technicians.filter((item) => {
    const specializations = Array.isArray(item.specialization)
      ? item.specialization
      : String(item.specialization || '').split(/[,|]/);
    const normalized = specializations.map((value) => String(value).trim().toLowerCase()).filter(Boolean);
    return !normalized.length || normalized.some((value) => (
      value === 'all services' || value === 'general service' || value.includes(serviceName) || serviceName.includes(value)
    ));
  });
  return { bay: bays[0] || null, technician: preferredTechnicians[0] || technicians[0] || null };
}

async function ensureServiceJob(entry, changes, context, status = 'Assigned') {
  const bookingId = Number(entry.bookingId);
  let job = context.jobs.find((item) => Number(item.bookingId) === bookingId && item.status !== 'Cancelled');
  if (!job) {
    const snapshot = await db.collection(store.collections.serviceJobs).where('bookingId', '==', bookingId).get();
    job = snapshot.docs
      .map((document) => ({ id: Number(document.id), ...document.data() }))
      .find((item) => item.status !== 'Cancelled');
  }
  if (job) return job;
  const service = context.servicesById.get(Number(entry.servicePackageId)) || {};
  job = await createNumericDocument(store.collections.serviceJobs, {
    bookingId, vehicleId: Number(entry.vehicleId), customerId: Number(entry.customerId),
    assignedTechnicianId: Number(changes.assignedTechnicianId || entry.assignedTechnicianId), serviceType: service.name || entry.serviceName || 'General Service',
    priority: entry.queueType === 'Emergency' ? 'Urgent' : 'Normal', status, progress: status === 'In Progress' ? 10 : 0,
    startDate: today(), expectedCompletionDate: today(), assignedDate: today(), queueEntryId: Number(entry.id)
  });
  return job;
}

async function updateQueueEntry(id, action, data = {}) {
  const context = await loadContext();
  const entry = context.entries.find((item) => Number(item.id) === Number(id));
  if (!entry) return null;
  let changes = {};
  let notification = null;
  if (action === 'call') {
    if (entry.status !== 'Waiting') throw Object.assign(new Error('Only waiting customers can be called.'), { status: 409 });
    const resources = availableResources(context, entry);
    if (!resources.bay || !resources.technician) throw Object.assign(new Error('No service bay and mechanic are currently available.'), { status: 409 });
    changes = { status: 'Called', calledAt: fieldValue(), serviceBayId: resources.bay.id, assignedTechnicianId: resources.technician.id };
    const job = await ensureServiceJob(entry, changes, context, 'Assigned');
    changes.serviceJobId = job.id;
    await updateDocument(store.collections.serviceJobs, job.id, {
      assignedTechnicianId: changes.assignedTechnicianId, status: 'Assigned', queueEntryId: Number(entry.id)
    });
    await updateDocument(store.collections.bookings, entry.bookingId, { status: 'Approved', progress: 30, serviceBayId: changes.serviceBayId, assignedTechnicianId: changes.assignedTechnicianId });
    await createNotification(resources.technician.userId, 'Queue Job Assigned', `${entry.token} has been assigned to you in ${resources.bay.name}.`);
    notification = ['Called for Service', `${entry.token} is being called to ${resources.bay.name}.`];
  } else if (action === 'skip') {
    if (!['Waiting', 'Called'].includes(entry.status)) throw Object.assign(new Error('Only waiting or called customers can be skipped.'), { status: 409 });
    changes = { status: 'Skipped', skippedAt: fieldValue(), serviceBayId: null, assignedTechnicianId: null };
    if (entry.serviceJobId) {
      await updateDocument(store.collections.serviceJobs, entry.serviceJobId, {
        assignedTechnicianId: null, status: 'Pending', progress: 0
      });
    }
    notification = ['Queue Turn Skipped', `${entry.token} was skipped. Please contact reception to be recalled.`];
  } else if (action === 'recall') {
    if (entry.status !== 'Skipped') throw Object.assign(new Error('Only skipped customers can be recalled.'), { status: 409 });
    changes = { status: 'Waiting', recalledAt: fieldValue() };
    notification = ['Queue Recalled', `${entry.token} has returned to the waiting queue.`];
  } else if (action === 'assign') {
    if (data.technicianId) {
      const technician = context.techniciansById.get(Number(data.technicianId));
      if (!technician || String(technician.status || '').toLowerCase() !== 'active') throw Object.assign(new Error('Active mechanic not found.'), { status: 400 });
      changes.assignedTechnicianId = Number(data.technicianId);
    }
    if (data.serviceBayId) {
      const bay = queueBayViews(context).find((item) => item.id === Number(data.serviceBayId));
      if (!bay || bay.status !== 'Available') throw Object.assign(new Error('Selected service bay is not available.'), { status: 409 });
      changes.serviceBayId = Number(data.serviceBayId);
    }
    if (entry.serviceJobId && changes.assignedTechnicianId) {
      await updateDocument(store.collections.serviceJobs, entry.serviceJobId, { assignedTechnicianId: changes.assignedTechnicianId });
    }
    await updateDocument(store.collections.bookings, entry.bookingId, {
      ...(changes.assignedTechnicianId ? { assignedTechnicianId: changes.assignedTechnicianId } : {}),
      ...(changes.serviceBayId ? { serviceBayId: changes.serviceBayId } : {})
    });
  } else if (action === 'start') {
    if (!['Waiting', 'Called'].includes(entry.status)) throw Object.assign(new Error('Only waiting or called customers can start service.'), { status: 409 });
    const resources = availableResources(context, entry);
    changes = {
      status: 'In Service', serviceStartedAt: fieldValue(),
      serviceBayId: Number(data.serviceBayId || entry.serviceBayId || resources.bay?.id),
      assignedTechnicianId: Number(data.technicianId || entry.assignedTechnicianId || resources.technician?.id)
    };
    if (!changes.serviceBayId || !changes.assignedTechnicianId) throw Object.assign(new Error('Assign an available service bay and mechanic before starting.'), { status: 409 });
    const job = await ensureServiceJob(entry, changes, context);
    changes.serviceJobId = job.id;
    await updateDocument(store.collections.serviceJobs, job.id, {
      assignedTechnicianId: changes.assignedTechnicianId, status: 'In Progress', progress: Math.max(10, Number(job.progress || 0)), startDate: today(), queueEntryId: Number(entry.id)
    });
    await updateDocument(store.collections.bookings, entry.bookingId, { status: 'In Progress', progress: 40, serviceBayId: changes.serviceBayId, assignedTechnicianId: changes.assignedTechnicianId });
    notification = ['Service Started', `${entry.token} service has started in Bay ${String(changes.serviceBayId).padStart(2, '0')}.`];
  } else if (action === 'complete') {
    if (entry.status !== 'In Service') throw Object.assign(new Error('Only in-service customers can be completed.'), { status: 409 });
    changes = { status: 'Completed', completedAt: fieldValue() };
    await updateDocument(store.collections.bookings, entry.bookingId, { status: 'Completed', progress: 100 });
    if (entry.serviceJobId) await updateDocument(store.collections.serviceJobs, entry.serviceJobId, { status: 'Completed', progress: 100, completionDate: today() });
    notification = ['Service Completed', `${entry.token} service is complete. Your invoice will be prepared shortly.`];
  } else if (action === 'cancel' || action === 'no-show') {
    changes = { status: action === 'cancel' ? 'Cancelled' : 'No Show', closedAt: fieldValue(), serviceBayId: null, assignedTechnicianId: null };
    await updateDocument(store.collections.bookings, entry.bookingId, { status: changes.status, progress: 0 });
    if (entry.serviceJobId) await updateDocument(store.collections.serviceJobs, entry.serviceJobId, { status: 'Cancelled', progress: 0 });
    notification = [changes.status, `${entry.token} was marked ${changes.status.toLowerCase()}.`];
  } else {
    throw Object.assign(new Error('Unknown queue action.'), { status: 400 });
  }
  const updated = await updateDocument(queueCollection, id, changes);
  if (notification) await createNotification(entry.customerId, notification[0], notification[1]);
  await syncStoredPositions(await loadContext());
  return updated;
}

async function callNextCustomer() {
  const context = await loadContext();
  const queue = buildQueueViews(context);
  const next = queue.waiting[0];
  if (!next) throw Object.assign(new Error('There are no waiting customers.'), { status: 409 });
  return updateQueueEntry(next.id, 'call');
}

async function updateServiceBay(id, status) {
  const bayId = Number(id);
  if (!Number.isInteger(bayId) || bayId < 1 || bayId > serviceBayCount || !['Available', 'Maintenance'].includes(status)) {
    throw Object.assign(new Error('Invalid service bay status.'), { status: 400 });
  }
  const context = await loadOperationalContext();
  const active = context.entries.find((entry) => Number(entry.serviceBayId) === bayId && ['Called', 'In Service'].includes(entry.status));
  if (active && status === 'Maintenance') throw Object.assign(new Error(`Bay is occupied by ${active.token}.`), { status: 409 });
  await docRef(serviceBayCollection, bayId).set({ id: bayId, name: `Bay ${String(bayId).padStart(2, '0')}`, status, updatedAt: fieldValue() }, { merge: true });
  invalidateCollectionCache(serviceBayCollection, bayId);
  invalidateQueueContext();
  return { id: bayId, status };
}

async function getPublicDisplay() {
  const context = await loadContext();
  const dashboard = buildQueueDashboard(context, false);
  return {
    generatedAt: dashboard.generatedAt,
    nowServing: dashboard.nowServing.map(({ token, serviceBay, mechanic, elapsedServiceMinutes, status }) => ({ token, serviceBay, mechanic, elapsedServiceMinutes, status })),
    nextCustomers: dashboard.nextCustomers.slice(0, 3).map(({ token, queuePosition, estimatedWaitingMinutes }) => ({ token, queuePosition, estimatedWaitingMinutes }))
  };
}

async function getCustomerQueue(customerId) {
  const context = await loadContext();
  const dashboard = buildQueueDashboard(context, false);
  return dashboard.entries.filter((entry) => Number(entry.customerId) === Number(customerId) && !['Cancelled', 'No Show'].includes(entry.status));
}

module.exports = {
  callNextCustomer,
  checkInAppointment,
  getCustomerQueue,
  getPublicDisplay,
  getQueueDashboard,
  invalidateReferenceData,
  queueCollection,
  registerArrival,
  searchAppointments,
  updateQueueEntry,
  updateServiceBay
};
