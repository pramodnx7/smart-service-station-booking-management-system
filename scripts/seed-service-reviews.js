require('dotenv').config();

const { admin, db, firebaseConfigurationError } = require('../src/firebase');

const minimumReviewsPerService = 3;
const seedBatch = 'service-reviews-v1';
const checkOnly = process.argv.includes('--check');
const reviewTemplates = [
  {
    rating: 5,
    comment: 'Excellent service, clear communication, and the vehicle was ready at the promised time.'
  },
  {
    rating: 4,
    comment: 'The team explained the work clearly and handled the vehicle with great care.'
  },
  {
    rating: 5,
    comment: 'Easy booking, professional technicians, and very good value for the completed work.'
  }
];

function requireConfiguredTarget() {
  if (!db) throw new Error(firebaseConfigurationError || 'Firebase Admin is not configured.');
  if (String(process.env.FIREBASE_PROJECT_ID || '') !== 'smartmanagement-b07fa') {
    throw new Error('This seed is restricted to smartmanagement-b07fa.');
  }
  if (String(process.env.FIRESTORE_DATABASE_ID || '(default)') !== '(default)') {
    throw new Error('This seed is restricted to the (default) Firestore database.');
  }
}

function maximumDocumentId(snapshot) {
  return snapshot.docs.reduce((maximum, document) => (
    Math.max(maximum, Number(document.id) || 0)
  ), 0);
}

function serviceCoverage(services, feedback) {
  return services.docs
    .filter((document) => document.data().active !== false)
    .map((document) => {
      const service = { id: Number(document.id), ...document.data() };
      const reviews = feedback.docs.filter((reviewDocument) => {
        const review = reviewDocument.data();
        return Number(review.servicePackageId) === service.id
          || String(review.serviceName || '').toLowerCase() === String(service.name).toLowerCase();
      });
      return {
        id: service.id,
        name: service.name,
        reviewCount: reviews.length,
        ratings: reviews.map((review) => Number(review.data().rating || 0))
      };
    });
}

async function checkCoverage() {
  requireConfiguredTarget();
  const [services, feedback] = await Promise.all([
    db.collection('servicePackages').get(),
    db.collection('feedback').get()
  ]);
  const coverage = serviceCoverage(services, feedback);
  const missing = coverage.filter((service) => service.reviewCount < minimumReviewsPerService);
  console.log(JSON.stringify({
    ok: missing.length === 0,
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
    minimumReviewsPerService,
    activeServices: coverage.length,
    totalReviews: feedback.size,
    coverage,
    missing: missing.map((service) => service.name)
  }, null, 2));
  if (missing.length) process.exitCode = 1;
}

async function seedReviews() {
  requireConfiguredTarget();
  const result = await db.runTransaction(async (transaction) => {
    const counterRef = db.collection('meta').doc('counters');
    const [services, users, feedback, countersDocument] = await Promise.all([
      transaction.get(db.collection('servicePackages')),
      transaction.get(db.collection('users')),
      transaction.get(db.collection('feedback')),
      transaction.get(counterRef)
    ]);
    const activeServices = services.docs
      .filter((document) => document.data().active !== false)
      .map((document) => ({ id: Number(document.id), ...document.data() }));
    const customers = users.docs
      .map((document) => ({ id: Number(document.id), ...document.data() }))
      .filter((user) => user.role === 'customer' && String(user.status).toLowerCase() === 'active');

    if (!activeServices.length) throw new Error('No active services are available for reviews.');
    if (!customers.length) throw new Error('No active customers are available to author reviews.');

    const existingByService = new Map(activeServices.map((service) => [
      service.id,
      feedback.docs.filter((document) => {
        const review = document.data();
        return Number(review.servicePackageId) === service.id
          || String(review.serviceName || '').toLowerCase() === String(service.name).toLowerCase();
      }).length
    ]));
    const counters = countersDocument.exists ? countersDocument.data() : {};
    let nextFeedbackId = Math.max(
      Number(counters.feedback || 0),
      maximumDocumentId(feedback)
    );
    let created = 0;
    const createdByService = {};
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    activeServices.forEach((service, serviceIndex) => {
      const existingCount = existingByService.get(service.id) || 0;
      const required = Math.max(0, minimumReviewsPerService - existingCount);
      createdByService[service.name] = required;
      for (let reviewIndex = 0; reviewIndex < required; reviewIndex += 1) {
        const sequence = existingCount + reviewIndex;
        const template = reviewTemplates[sequence % reviewTemplates.length];
        const customer = customers[(serviceIndex + sequence) % customers.length];
        nextFeedbackId += 1;
        transaction.set(db.collection('feedback').doc(String(nextFeedbackId)), {
          id: nextFeedbackId,
          userId: customer.id,
          servicePackageId: service.id,
          serviceName: service.name,
          rating: template.rating,
          comment: template.comment,
          seedBatch,
          createdAt: timestamp
        });
        created += 1;
      }
    });

    if (created) transaction.set(counterRef, { feedback: nextFeedbackId }, { merge: true });
    return { created, createdByService };
  });

  console.log(JSON.stringify({
    ok: true,
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
    minimumReviewsPerService,
    ...result
  }, null, 2));
}

(checkOnly ? checkCoverage() : seedReviews()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
