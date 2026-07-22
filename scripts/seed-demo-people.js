require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { admin, db, firebaseConfigurationError } = require('../src/firebase');

const seedBatch = 'demo-people-v1';
const customerNames = [
  'Kasun Perera', 'Nimali Fernando', 'Dilan Silva', 'Tharushi Jayasinghe', 'Ravindu Bandara',
  'Sachini Gunawardena', 'Isuru Wijesinghe', 'Piumi Rathnayake', 'Chamara Ekanayake', 'Dinithi Herath',
  'Akila Senanayake', 'Hiruni Wickramasinghe', 'Nuwan Karunaratne', 'Shalini Abeysekara', 'Kavindu Madushanka',
  'Ishara Dissanayake', 'Malith Weerasinghe', 'Anjali Samarasinghe', 'Roshan Kulatunga', 'Udari Ranasinghe'
];
const technicianNames = [
  'Sahan de Alwis', 'Gayan Kumara', 'Pradeep Lakmal', 'Thilina Rajapaksha', 'Manoj Weerakoon',
  'Rukshan Peiris', 'Asanka Gamage', 'Lahiru Nissanka', 'Supun Pathirana', 'Janith Kodithuwakku'
];
const vehicleModels = [
  ['Toyota', 'Corolla'], ['Honda', 'Civic'], ['Suzuki', 'Wagon R'], ['Nissan', 'Sunny'], ['Toyota', 'Aqua'],
  ['Mitsubishi', 'Lancer'], ['Honda', 'Vezel'], ['Suzuki', 'Swift'], ['Toyota', 'Prius'], ['Nissan', 'X-Trail'],
  ['Mazda', 'Axela'], ['Kia', 'Picanto'], ['Hyundai', 'Grand i10'], ['Toyota', 'Vitz'], ['Honda', 'Fit'],
  ['Suzuki', 'Alto'], ['Nissan', 'Leaf'], ['Mitsubishi', 'Outlander'], ['Toyota', 'Premio'], ['Honda', 'Grace'],
  ['BMW', '320i'], ['Mercedes-Benz', 'C180'], ['Audi', 'A4'], ['Ford', 'Ranger'], ['Isuzu', 'D-Max'],
  ['Toyota', 'Hilux'], ['Kia', 'Sportage'], ['Hyundai', 'Tucson'], ['Micro', 'Panda'], ['Perodua', 'Axia']
];
const preferredSpecializations = [
  'General Service', 'Oil Change', 'Brake Service', 'Full Service', 'Engine Diagnostics',
  'Electrical Repair', 'Engine Repair', 'Suspension Repair', 'Hybrid/EV Service', 'General Service'
];

function maximumDocumentId(snapshot) {
  return snapshot.docs.reduce((maximum, document) => Math.max(maximum, Number(document.id) || 0), 0);
}

function assertNoConflicts(snapshot, field, values, label) {
  const existing = new Set(snapshot.docs.map((document) => String(document.data()[field] || '').toLowerCase()));
  const conflict = values.find((value) => existing.has(String(value).toLowerCase()));
  if (conflict) throw new Error(`${label} already exists: ${conflict}`);
}

async function seedDemoPeople() {
  if (!db) throw new Error(firebaseConfigurationError || 'Firebase Admin is not configured.');

  const unavailablePassword = crypto.randomBytes(32).toString('base64url');
  const passwordHash = await bcrypt.hash(unavailablePassword, 12);
  const markerRef = db.collection('meta').doc(seedBatch);
  const counterRef = db.collection('meta').doc('counters');

  const result = await db.runTransaction(async (transaction) => {
    const [marker, countersDocument, users, vehicles, technicians, services] = await Promise.all([
      transaction.get(markerRef),
      transaction.get(counterRef),
      transaction.get(db.collection('users')),
      transaction.get(db.collection('vehicles')),
      transaction.get(db.collection('technicians')),
      transaction.get(db.collection('servicePackages'))
    ]);

    if (marker.exists && marker.data().completed) {
      return { skipped: true, ...marker.data() };
    }

    const customerEmails = customerNames.map((_, index) => `demo.customer${String(index + 1).padStart(2, '0')}@autocare.test`);
    const technicianEmails = technicianNames.map((_, index) => `demo.technician${String(index + 1).padStart(2, '0')}@autocare.test`);
    const employeeNumbers = technicianNames.map((_, index) => `T-SEED-${String(index + 1).padStart(3, '0')}`);
    const plates = vehicleModels.map((_, index) => `CAA-${String(1001 + index)}`);
    assertNoConflicts(users, 'emailLower', [...customerEmails, ...technicianEmails], 'Seed email');
    assertNoConflicts(technicians, 'employeeNo', employeeNumbers, 'Seed employee number');
    assertNoConflicts(vehicles, 'plateNumber', plates, 'Seed vehicle number');

    const counters = countersDocument.exists ? countersDocument.data() : {};
    const firstUserId = Math.max(Number(counters.users || 0), maximumDocumentId(users)) + 1;
    const firstVehicleId = Math.max(Number(counters.vehicles || 0), maximumDocumentId(vehicles)) + 1;
    const firstTechnicianId = Math.max(Number(counters.technicians || 0), maximumDocumentId(technicians)) + 1;
    const customerIds = customerNames.map((_, index) => firstUserId + index);
    const technicianUserIds = technicianNames.map((_, index) => firstUserId + customerNames.length + index);
    const vehicleIds = vehicleModels.map((_, index) => firstVehicleId + index);
    const technicianIds = technicianNames.map((_, index) => firstTechnicianId + index);
    const activeServices = new Set(services.docs.filter((document) => document.data().active !== false).map((document) => document.data().name));
    const fallbackSpecialization = activeServices.has('General Service') ? 'General Service' : [...activeServices][0];
    if (!fallbackSpecialization) throw new Error('At least one active service package is required before adding technicians.');
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    customerNames.forEach((name, index) => {
      const id = customerIds[index];
      transaction.set(db.collection('users').doc(String(id)), {
        id, role: 'customer', name, email: customerEmails[index], emailLower: customerEmails[index],
        phone: `0771${String(index + 1).padStart(6, '0')}`, passwordHash, status: 'active',
        mustResetPassword: true, seedBatch, createdAt: timestamp
      });
    });

    technicianNames.forEach((name, index) => {
      const userId = technicianUserIds[index];
      const technicianId = technicianIds[index];
      const specialization = activeServices.has(preferredSpecializations[index]) ? preferredSpecializations[index] : fallbackSpecialization;
      const phone = `0762${String(index + 1).padStart(6, '0')}`;
      transaction.set(db.collection('users').doc(String(userId)), {
        id: userId, role: 'technician', name, email: technicianEmails[index], emailLower: technicianEmails[index],
        phone, passwordHash, status: 'active', mustResetPassword: true, seedBatch, createdAt: timestamp
      });
      transaction.set(db.collection('technicians').doc(String(technicianId)), {
        id: technicianId, userId, employeeNo: employeeNumbers[index], specialization, phone,
        experienceYears: 2 + (index % 9), status: 'active', seedBatch, createdAt: timestamp
      });
    });

    vehicleModels.forEach(([make, model], index) => {
      const id = vehicleIds[index];
      const customerId = customerIds[index % customerIds.length];
      transaction.set(db.collection('vehicles').doc(String(id)), {
        id, userId: customerId, name: `${make} ${model}`, make, model, plateNumber: plates[index],
        year: String(2013 + (index % 13)), imageUrl: 'https://ieliygatevqevgssroze.supabase.co/storage/v1/object/public/service-station/company/system-assets/hero-blue-workshop.png',
        seedBatch, createdAt: timestamp
      });
    });

    transaction.set(counterRef, {
      users: technicianUserIds.at(-1), vehicles: vehicleIds.at(-1), technicians: technicianIds.at(-1)
    }, { merge: true });
    const summary = {
      completed: true, customerCount: customerIds.length, vehicleCount: vehicleIds.length,
      technicianCount: technicianIds.length, customerIds, vehicleIds, technicianIds, completedAt: timestamp
    };
    transaction.set(markerRef, summary);
    return { skipped: false, ...summary };
  });

  console.log(result.skipped ? 'Demo people seed already exists; no records were added.' : 'Demo people seed completed.');
  console.log(JSON.stringify({
    customers: result.customerCount,
    vehicles: result.vehicleCount,
    technicians: result.technicianCount
  }, null, 2));
}

seedDemoPeople().catch((error) => {
  console.error(`Demo people seed failed: ${error.message}`);
  process.exitCode = 1;
});
