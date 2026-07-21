require('dotenv').config();

const { admin, db, firebaseConfigurationError } = require('../src/firebase');

const seedBatch = 'demo-bookings-v1';
const desiredServices = [
  'General Service', 'Oil Change', 'Brake Service', 'General Service', 'Engine Diagnostics',
  'Oil Change', 'Full Service', 'Electrical Repair', 'General Service', 'Hybrid/EV Service'
];
const preferredTimes = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '08:30', '10:30', '13:30'];

function dateString(daysFromToday) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function durationMinutes(value) {
  const text = String(value || '').toLowerCase();
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:min|minute)/)?.[1] || 0);
  return Math.max(15, Math.round((hours * 60) + minutes) || Number(text.match(/\d+/)?.[0]) || 60);
}

function dateTime(date, time) {
  return new Date(`${date}T${time}:00`).getTime();
}

function overlaps(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function bookingWindow(booking, servicesById) {
  const start = dateTime(booking.bookingDate, booking.bookingTime);
  const service = servicesById.get(Number(booking.servicePackageId));
  const length = Number(booking.durationMinutes || durationMinutes(service?.duration));
  return { start, end: start + (length * 60 * 1000) };
}

function technicianCanDoService(technician, serviceName) {
  const specializations = String(technician.specialization || '').split(/[,/|]/).map((value) => value.trim().toLowerCase());
  return specializations.includes('general service') || specializations.includes(serviceName.toLowerCase());
}

async function seedDemoBookings() {
  if (!db) throw new Error(firebaseConfigurationError || 'Firebase Admin is not configured.');
  const markerRef = db.collection('meta').doc(seedBatch);
  const counterRef = db.collection('meta').doc('counters');

  const result = await db.runTransaction(async (transaction) => {
    const [marker, countersDocument, users, vehicles, technicians, services, bookings, metaDocuments] = await Promise.all([
      transaction.get(markerRef), transaction.get(counterRef), transaction.get(db.collection('users')),
      transaction.get(db.collection('vehicles')), transaction.get(db.collection('technicians')),
      transaction.get(db.collection('servicePackages')), transaction.get(db.collection('bookings')),
      transaction.get(db.collection('meta'))
    ]);
    if (marker.exists && marker.data().completed) return { skipped: true, ...marker.data() };

    const seededCustomers = users.docs.map((document) => document.data())
      .filter((user) => user.seedBatch === 'demo-people-v1' && user.role === 'customer')
      .sort((left, right) => Number(left.id) - Number(right.id));
    const seededVehicles = vehicles.docs.map((document) => document.data())
      .filter((vehicle) => vehicle.seedBatch === 'demo-people-v1')
      .sort((left, right) => Number(left.id) - Number(right.id));
    const activeTechnicians = technicians.docs.map((document) => document.data())
      .filter((technician) => technician.status === 'active');
    const activeServices = services.docs.map((document) => document.data())
      .filter((service) => service.active !== false);
    const servicesByName = new Map(activeServices.map((service) => [service.name, service]));
    const servicesById = new Map(activeServices.map((service) => [Number(service.id), service]));
    const existingBookings = bookings.docs.map((document) => document.data());
    const counters = countersDocument.exists ? countersDocument.data() : {};
    const storedQueueMaximumByDate = new Map(metaDocuments.docs
      .filter((document) => document.id.startsWith('booking-queue-'))
      .map((document) => [document.data().bookingDate, Number(document.data().lastPosition || 0)]));
    const maximumBookingId = bookings.docs.reduce((maximum, document) => Math.max(maximum, Number(document.id) || 0), 0);

    if (seededCustomers.length < 10 || seededVehicles.length < 10) {
      throw new Error('Run npm run firebase:seed-people before seeding bookings.');
    }
    const missingService = desiredServices.find((name) => !servicesByName.has(name));
    if (missingService) throw new Error(`Required active service package is missing: ${missingService}`);

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const firstBookingId = Math.max(Number(counters.bookings || 0), maximumBookingId) + 1;
    const bookingIds = [];
    const createdBookings = [];
    const queueMaximumByDate = new Map();

    desiredServices.forEach((serviceName, index) => {
      const service = servicesByName.get(serviceName);
      const customer = seededCustomers[index];
      const vehicle = seededVehicles.find((item) => Number(item.userId) === Number(customer.id));
      const bookingDate = dateString(index + 1);
      const bookingTime = preferredTimes[index];
      const length = durationMinutes(service.duration);
      const start = dateTime(bookingDate, bookingTime);
      const end = start + (length * 60 * 1000);
      const conflicting = [...existingBookings, ...createdBookings].filter((booking) => {
        if (['Completed', 'Cancelled'].includes(booking.status)) return false;
        const window = bookingWindow(booking, servicesById);
        return overlaps(start, end, window.start, window.end);
      });
      const technician = activeTechnicians.find((item) => (
        technicianCanDoService(item, serviceName)
        && !conflicting.some((booking) => Number(booking.assignedTechnicianId) === Number(item.id))
      ));
      const serviceBayId = Array.from({ length: Number(process.env.SERVICE_BAY_COUNT || 8) }, (_, bayIndex) => bayIndex + 1)
        .find((bayId) => !conflicting.some((booking) => Number(booking.serviceBayId) === bayId));
      if (!vehicle || !technician || !serviceBayId) {
        throw new Error(`No valid vehicle, technician, or service bay is available for booking ${index + 1}.`);
      }

      const id = firstBookingId + index;
      const existingMaximum = existingBookings.filter((booking) => booking.bookingDate === bookingDate)
        .reduce((maximum, booking) => Math.max(maximum, Number(booking.queuePosition || 0)), 0);
      const queuePosition = Math.max(
        queueMaximumByDate.get(bookingDate) || 0,
        existingMaximum,
        storedQueueMaximumByDate.get(bookingDate) || 0
      ) + 1;
      queueMaximumByDate.set(bookingDate, queuePosition);
      const startAt = `${bookingDate}T${bookingTime}:00`;
      const endDate = new Date(end);
      const pad = (value) => String(value).padStart(2, '0');
      const endAt = `${bookingDate}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;
      const booking = {
        id, userId: Number(customer.id), vehicleId: Number(vehicle.id), servicePackageId: Number(service.id),
        bookingDate, bookingTime, status: 'Pending', progress: 10, queuePosition,
        assignedTechnicianId: Number(technician.id), serviceBayId, serviceBayName: `Bay ${String(serviceBayId).padStart(2, '0')}`,
        durationMinutes: length, startAt, endAt, seedBatch, createdAt: timestamp
      };
      transaction.set(db.collection('bookings').doc(String(id)), booking);
      bookingIds.push(id);
      createdBookings.push(booking);
    });

    queueMaximumByDate.forEach((lastPosition, bookingDate) => {
      transaction.set(db.collection('meta').doc(`booking-queue-${bookingDate}`), {
        bookingDate, lastPosition, updatedAt: timestamp
      }, { merge: true });
    });
    transaction.set(counterRef, { bookings: bookingIds.at(-1) }, { merge: true });
    const summary = { completed: true, bookingCount: bookingIds.length, bookingIds, completedAt: timestamp };
    transaction.set(markerRef, summary);
    return { skipped: false, ...summary };
  });

  console.log(result.skipped ? 'Demo booking seed already exists; no records were added.' : 'Demo booking seed completed.');
  console.log(JSON.stringify({ bookings: result.bookingCount, bookingIds: result.bookingIds }, null, 2));
}

seedDemoBookings().catch((error) => {
  console.error(`Demo booking seed failed: ${error.message}`);
  process.exitCode = 1;
});
