const path = require('path');
const admin = require('firebase-admin');

const hasFirebaseCredentials = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT
  || process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || process.env.GOOGLE_APPLICATION_CREDENTIALS
  || process.env.FIRESTORE_EMULATOR_HOST
);

function parseServiceAccount(rawValue) {
  const trimmed = rawValue.trim();
  const json = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');
  const serviceAccount = JSON.parse(json);

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  return serviceAccount;
}

function initializeFirebase() {
  if (admin.apps.length) {
    return admin.app();
  }

  const options = {};

  if (process.env.FIREBASE_PROJECT_ID) {
    options.projectId = process.env.FIREBASE_PROJECT_ID;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    options.credential = admin.credential.cert(parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH.trim());
    options.credential = admin.credential.cert(require(serviceAccountPath));
  } else {
    options.credential = admin.credential.applicationDefault();
  }

  return admin.initializeApp(options);
}

initializeFirebase();

module.exports = {
  admin,
  db: admin.firestore(),
  hasFirebaseCredentials
};
