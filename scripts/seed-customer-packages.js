require('dotenv').config();

const { admin, db, firebaseConfigurationError } = require('../src/firebase');

const checkOnly = process.argv.includes('--check');
const seedBatch = 'customer-packages-v1';

function requireConfiguredTarget() {
  if (!db) throw new Error(firebaseConfigurationError || 'Firebase Admin is not configured.');
  if (String(process.env.FIREBASE_PROJECT_ID || '') !== 'smartmanagement-b07fa') {
    throw new Error('This seed is restricted to smartmanagement-b07fa.');
  }
  if (String(process.env.FIRESTORE_DATABASE_ID || '(default)') !== '(default)') {
    throw new Error('This seed is restricted to the (default) Firestore database.');
  }
}

function documents(snapshot) {
  return snapshot.docs.map((document) => ({ id: Number(document.id), ...document.data() }));
}

async function loadPackageData() {
  const [usersSnapshot, plansSnapshot, packagesSnapshot] = await Promise.all([
    db.collection('users').get(),
    db.collection('pricingPlans').get(),
    db.collection('customerPackages').get()
  ]);
  return {
    customers: documents(usersSnapshot).filter((user) => (
      user.role === 'customer'
      && String(user.status).toLowerCase() === 'active'
      && user.archived !== true
    )),
    plans: documents(plansSnapshot)
      .filter((plan) => plan.active !== false && plan.archived !== true)
      .sort((left, right) => Number(left.displayOrder || 0) - Number(right.displayOrder || 0) || left.id - right.id),
    packages: documents(packagesSnapshot)
  };
}

async function checkPackages() {
  requireConfiguredTarget();
  const { customers, plans, packages } = await loadPackageData();
  const usersById = new Map(customers.map((customer) => [customer.id, customer]));
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const activePackages = packages.filter((customerPackage) => customerPackage.status === 'active');
  const errors = [];

  customers.forEach((customer) => {
    const selected = activePackages.find((customerPackage) => Number(customerPackage.userId) === customer.id);
    if (!selected) errors.push(`users/${customer.id} has no active customerPackages record`);
  });
  activePackages.forEach((customerPackage) => {
    if (!usersById.has(Number(customerPackage.userId))) {
      errors.push(`customerPackages/${customerPackage.id}.userId is not an active customer`);
    }
    if (!plansById.has(Number(customerPackage.pricingPlanId))) {
      errors.push(`customerPackages/${customerPackage.id}.pricingPlanId is not an active pricing plan`);
    }
    if (!Array.isArray(customerPackage.benefits) || !customerPackage.benefits.length) {
      errors.push(`customerPackages/${customerPackage.id} has no applied benefits`);
    }
  });

  console.log(JSON.stringify({
    ok: errors.length === 0,
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
    activeCustomers: customers.length,
    activePricingPlans: plans.length,
    activeCustomerPackages: activePackages.length,
    packageNames: [...new Set(activePackages.map((customerPackage) => customerPackage.packageName))],
    errors
  }, null, 2));
  if (errors.length) process.exitCode = 1;
}

async function seedPackages() {
  requireConfiguredTarget();
  const { customers, plans, packages } = await loadPackageData();
  if (!plans.length) throw new Error('At least one active pricing plan is required.');

  const existingCustomerIds = new Set(
    packages
      .filter((customerPackage) => customerPackage.status === 'active')
      .map((customerPackage) => Number(customerPackage.userId))
  );
  const missingCustomers = customers.filter((customer) => !existingCustomerIds.has(customer.id));
  const batch = db.batch();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  missingCustomers.forEach((customer, index) => {
    const plan = plans[index % plans.length];
    batch.set(db.collection('customerPackages').doc(String(customer.id)), {
      id: customer.id,
      userId: customer.id,
      pricingPlanId: plan.id,
      packageName: plan.name || 'Service Plan',
      badge: plan.badge || '',
      price: Number(plan.price || 0),
      billingPeriod: plan.billingPeriod || 'service',
      benefits: Array.isArray(plan.features) ? plan.features.filter(Boolean) : [],
      status: 'active',
      activatedAt: timestamp,
      updatedAt: timestamp,
      seedBatch
    });
  });
  if (missingCustomers.length) await batch.commit();

  console.log(JSON.stringify({
    ok: true,
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
    created: missingCustomers.length,
    preserved: customers.length - missingCustomers.length,
    assignments: missingCustomers.map((customer, index) => ({
      customerId: customer.id,
      customer: customer.name,
      package: plans[index % plans.length].name
    }))
  }, null, 2));
}

(checkOnly ? checkPackages() : seedPackages()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
