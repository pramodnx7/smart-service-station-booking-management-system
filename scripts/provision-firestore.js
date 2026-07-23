require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { admin, db, firebaseConfigurationError } = require('../src/firebase');

const checkOnly = process.argv.includes('--check');
const configuredProjectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const configuredDatabaseId = String(process.env.FIRESTORE_DATABASE_ID || '(default)').trim();
const timestamp = () => admin.firestore.FieldValue.serverTimestamp();

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8'));
}

const counterCollections = [
  'users',
  'vehicles',
  'servicePackages',
  'pricingPlans',
  'customerPackageRequests',
  'bookings',
  'invoices',
  'emergencyRequests',
  'notifications',
  'notificationDrafts',
  'feedback',
  'technicians',
  'serviceJobs',
  'technicianNotes',
  'technicianProgress',
  'serviceJobParts',
  'inventoryParts',
  'inventoryCategories',
  'inventorySuppliers',
  'inventoryMovements',
  'replacedParts',
  'servicePhotos',
  'documents',
  'uploadAuditLogs',
  'newsletterSubscriptions',
  'queueEntries'
];

const services = [
  { name: 'General Service', price: 15000, duration: '2 hours', description: 'Complete routine inspection, fluid checks, and preventive maintenance.' },
  { name: 'Oil Change', price: 8500, duration: '45 minutes', description: 'Engine oil and filter replacement with a basic safety inspection.' },
  { name: 'Brake Service', price: 18000, duration: '2 hours', description: 'Brake-system inspection, adjustment, and component servicing.' },
  { name: 'Full Service', price: 28000, duration: '4 hours', description: 'Comprehensive mechanical, electrical, fluid, and safety inspection.' },
  { name: 'Engine Diagnostics', price: 12000, duration: '1 hour', description: 'Computer-assisted engine diagnosis and fault reporting.' },
  { name: 'Electrical Repair', price: 14000, duration: '2 hours', description: 'Electrical-system diagnosis and repair.' },
  { name: 'Engine Repair', price: 45000, duration: '6 hours', description: 'Engine fault repair and component replacement as required.' },
  { name: 'Suspension Repair', price: 22000, duration: '3 hours', description: 'Suspension inspection, repair, and alignment checks.' },
  { name: 'Hybrid/EV Service', price: 25000, duration: '3 hours', description: 'Specialist inspection and maintenance for hybrid and electric vehicles.' }
];

const pricingPlans = [
  {
    name: 'Essential Care',
    badge: 'Starter',
    price: 15000,
    billingPeriod: 'service',
    features: ['Safety inspection', 'Fluid check', 'Diagnostic report'],
    buttonText: 'Choose Essential',
    featured: false,
    active: true,
    displayOrder: 1
  },
  {
    name: 'Complete Care',
    badge: 'Popular',
    price: 28000,
    billingPeriod: 'service',
    features: ['Full inspection', 'Computer diagnostics', 'Priority booking', 'Service report'],
    buttonText: 'Choose Complete',
    featured: true,
    active: true,
    displayOrder: 2
  },
  {
    name: 'Premium Care',
    badge: 'Premium',
    price: 45000,
    billingPeriod: 'service',
    features: ['Complete service', 'Advanced diagnostics', 'Priority queue', 'Detailed condition report'],
    buttonText: 'Choose Premium',
    featured: false,
    active: true,
    displayOrder: 3
  }
];

const inventoryCategories = [
  'Engine Parts',
  'Brake System',
  'Electrical',
  'Suspension',
  'Cooling System',
  'Filters',
  'Fluids & Lubricants',
  'Batteries',
  'Tires & Wheels',
  'Accessories'
];

function systemAsset(fileName) {
  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'service-station';
  return baseUrl ? `${baseUrl}/storage/v1/object/public/${bucket}/company/system-assets/${fileName}` : '';
}

function assertConfiguration() {
  if (!db) throw new Error(firebaseConfigurationError || 'Firebase Admin is not configured.');
  const cliProjectId = String(readJson('.firebaserc').projects?.default || '').trim();
  const deploymentDatabaseId = String(readJson('firebase.json').firestore?.database || '(default)').trim();
  if (!configuredProjectId || configuredProjectId !== cliProjectId) {
    throw new Error(`Firebase project mismatch: .env uses "${configuredProjectId || '<empty>'}" while .firebaserc uses "${cliProjectId || '<empty>'}".`);
  }
  if (configuredDatabaseId !== deploymentDatabaseId) {
    throw new Error(`Firestore database mismatch: .env uses "${configuredDatabaseId}" while firebase.json uses "${deploymentDatabaseId}".`);
  }
}

async function collectionByField(collectionName, fieldName) {
  const snapshot = await db.collection(collectionName).get();
  return new Map(snapshot.docs.map((document) => [
    String(document.data()[fieldName] || '').trim().toLowerCase(),
    document
  ]));
}

async function nextAvailableIds(collectionName, count) {
  const [collectionSnapshot, countersSnapshot] = await Promise.all([
    db.collection(collectionName).get(),
    db.collection('meta').doc('counters').get()
  ]);
  const documentMaximum = collectionSnapshot.docs.reduce(
    (maximum, document) => Math.max(maximum, Number(document.id) || 0),
    0
  );
  const counterMaximum = Number(countersSnapshot.data()?.[collectionName] || 0);
  const firstId = Math.max(documentMaximum, counterMaximum) + 1;
  return Array.from({ length: count }, (_, index) => firstId + index);
}

async function ensureCounters(report) {
  const reference = db.collection('meta').doc('counters');
  const snapshot = await reference.get();
  const current = snapshot.exists ? snapshot.data() : {};
  const missing = Object.fromEntries(
    counterCollections.filter((name) => !Number.isFinite(Number(current[name]))).map((name) => [name, 0])
  );
  if (!Object.keys(missing).length) return;
  report.missing.push(`meta/counters fields: ${Object.keys(missing).join(', ')}`);
  if (!checkOnly) {
    await reference.set({ ...missing, updatedAt: timestamp() }, { merge: true });
    report.created.push('meta/counters');
  }
}

async function ensureNamedDocuments(collectionName, items, report, imageName = '') {
  const existing = await collectionByField(collectionName, 'name');
  const missing = items.filter((item) => !existing.has(String(item.name).toLowerCase()));
  if (!missing.length) return;
  report.missing.push(`${collectionName}: ${missing.map((item) => item.name).join(', ')}`);
  if (checkOnly) return;

  const ids = await nextAvailableIds(collectionName, missing.length);
  const batch = db.batch();
  missing.forEach((item, index) => {
    const id = ids[index];
    const payload = {
      id,
      ...item,
      ...(imageName ? { image: systemAsset(imageName) } : {}),
      createdAt: timestamp()
    };
    batch.set(db.collection(collectionName).doc(String(id)), payload);
  });
  batch.set(db.collection('meta').doc('counters'), {
    [collectionName]: ids.at(-1),
    updatedAt: timestamp()
  }, { merge: true });
  await batch.commit();
  report.created.push(...missing.map((item) => `${collectionName}/${item.name}`));
}

async function ensureInventoryCategories(report) {
  await ensureNamedDocuments(
    'inventoryCategories',
    inventoryCategories.map((name) => ({ name, active: true })),
    report
  );
}

async function ensureServiceBays(report) {
  const bayCount = Math.max(1, Number(process.env.SERVICE_BAY_COUNT || 8));
  const references = Array.from({ length: bayCount }, (_, index) => (
    db.collection('serviceBays').doc(String(index + 1))
  ));
  const snapshots = await db.getAll(...references);
  const missing = snapshots
    .map((snapshot, index) => ({ snapshot, id: index + 1 }))
    .filter(({ snapshot }) => !snapshot.exists);
  if (!missing.length) return;
  report.missing.push(`serviceBays: ${missing.map(({ id }) => id).join(', ')}`);
  if (checkOnly) return;
  const batch = db.batch();
  missing.forEach(({ id }) => {
    batch.set(db.collection('serviceBays').doc(String(id)), {
      id,
      name: `Bay ${String(id).padStart(2, '0')}`,
      status: 'Available',
      createdAt: timestamp(),
      updatedAt: timestamp()
    });
  });
  await batch.commit();
  report.created.push(...missing.map(({ id }) => `serviceBays/${id}`));
}

async function ensureSystemSettings(report) {
  const settings = [
    {
      id: 'company',
      data: {
        logo: systemAsset('hero-blue-workshop.png'),
        invoiceLogo: systemAsset('hero-blue-workshop.png'),
        banner: systemAsset('workshop-lift-mechanic.png')
      }
    },
    {
      id: 'landing-stats',
      data: { happyCustomers: 20000, expertTechnicians: 10 }
    },
    {
      id: 'landing-content-recentWork-0',
      data: { title: 'Suspension Inspection', image: systemAsset('service-wheel-closeup.png'), active: true }
    },
    {
      id: 'landing-content-recentWork-1',
      data: { title: 'Exhaust System Repair', image: systemAsset('workshop-lift-mechanic.png'), active: true }
    },
    {
      id: 'landing-content-recentWork-2',
      data: { title: 'Engine Diagnostics', image: systemAsset('about-mechanic-red-car.png'), active: true }
    },
    {
      id: 'landing-content-news-0',
      data: { date: '2026-01-23', category: 'Maintenance', title: 'A well-maintained car is like a well tuned instrument.', image: systemAsset('about-mechanic-red-car.png'), active: true }
    },
    {
      id: 'landing-content-news-1',
      data: { date: '2026-01-11', category: 'Auto Service', title: 'The best car service is the one that keeps you moving forward.', image: systemAsset('workshop-lift-mechanic.png'), active: true }
    },
    {
      id: 'landing-content-news-2',
      data: { date: '2026-01-07', category: 'Car Care', title: 'We provide peace of mind with top-notch car service.', image: systemAsset('hero-blue-workshop.png'), active: true }
    }
  ];
  const references = settings.map(({ id }) => db.collection('appSettings').doc(id));
  const snapshots = await db.getAll(...references);
  const missing = settings.filter((_, index) => !snapshots[index].exists);
  if (!missing.length) return;
  report.missing.push(`appSettings: ${missing.map(({ id }) => id).join(', ')}`);
  if (checkOnly) return;
  const batch = db.batch();
  missing.forEach(({ id, data }) => {
    batch.set(db.collection('appSettings').doc(id), { ...data, createdAt: timestamp(), updatedAt: timestamp() });
  });
  await batch.commit();
  report.created.push(...missing.map(({ id }) => `appSettings/${id}`));
}

async function ensureBootstrapAdmin(report) {
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || '').trim();
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  const supplied = [name, email, password].filter(Boolean).length;
  if (!supplied) return;
  if (supplied !== 3) {
    throw new Error('Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD together.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL is invalid.');
  if (password.length < 8 || password.length > 128) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain between 8 and 128 characters.');
  }
  const snapshot = await db.collection('users')
    .where('emailLower', '==', email)
    .where('role', '==', 'admin')
    .limit(1)
    .get();
  if (!snapshot.empty) return;
  report.missing.push(`admin user: ${email}`);
  if (checkOnly) return;
  const [id] = await nextAvailableIds('users', 1);
  const passwordHash = await bcrypt.hash(password, 12);
  const batch = db.batch();
  batch.set(db.collection('users').doc(String(id)), {
    id,
    role: 'admin',
    name,
    email,
    emailLower: email,
    phone: '',
    passwordHash,
    status: 'active',
    createdAt: timestamp()
  });
  batch.set(db.collection('meta').doc('counters'), { users: id, updatedAt: timestamp() }, { merge: true });
  await batch.commit();
  report.created.push(`users/${id} (admin)`);
}

async function provision() {
  assertConfiguration();
  const report = {
    projectId: configuredProjectId,
    databaseId: configuredDatabaseId,
    mode: checkOnly ? 'check' : 'provision',
    missing: [],
    created: []
  };

  await ensureCounters(report);
  await ensureNamedDocuments('servicePackages', services, report, 'service-wheel-closeup.png');
  await ensureNamedDocuments('pricingPlans', pricingPlans, report, 'workshop-lift-mechanic.png');
  await ensureInventoryCategories(report);
  await ensureServiceBays(report);
  await ensureSystemSettings(report);
  await ensureBootstrapAdmin(report);

  report.ok = checkOnly ? report.missing.length === 0 : true;
  console.log(JSON.stringify(report, null, 2));
  if (checkOnly && !report.ok) process.exitCode = 1;
}

provision().catch((error) => {
  console.error(`Firestore ${checkOnly ? 'schema check' : 'provisioning'} failed: ${error.message}`);
  process.exitCode = 1;
});
