const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

let firebaseConfigurationError = null;

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
    try {
      options.credential = admin.credential.cert(parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT));
    } catch (error) {
      firebaseConfigurationError = `FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64-encoded JSON: ${error.message}`;
      return null;
    }
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH.trim());
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const serviceAccount = require(serviceAccountPath);
        const configuredProjectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
        if (configuredProjectId && serviceAccount.project_id && configuredProjectId !== serviceAccount.project_id) {
          firebaseConfigurationError = `FIREBASE_PROJECT_ID (${configuredProjectId}) does not match the service account project (${serviceAccount.project_id}).`;
          return null;
        }
        options.credential = admin.credential.cert(serviceAccount);
      } catch (error) {
        firebaseConfigurationError = `Firebase service account file is invalid: ${serviceAccountPath} (${error.message})`;
        return null;
      }
    } else {
      firebaseConfigurationError = `Firebase service account file not found: ${serviceAccountPath}`;
      return null;
    }
  }

  if (!options.credential && !process.env.FIRESTORE_EMULATOR_HOST) {
    try {
      options.credential = admin.credential.applicationDefault();
    } catch (error) {
      console.warn('Firebase Admin credentials unavailable; continuing without Firestore initialization.', error.message);
    }
  }

  try {
    return admin.initializeApp(options);
  } catch (error) {
    console.warn('Firebase Admin initialization skipped:', error.message);
    return null;
  }
}

const app = initializeFirebase();
const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();
const hasFirebaseCredentials = Boolean(app);

if (firebaseConfigurationError) {
  console.warn(firebaseConfigurationError);
}

module.exports = {
  admin,
  db: app ? (databaseId ? getFirestore(app, databaseId) : getFirestore(app)) : null,
  hasFirebaseCredentials,
  firebaseConfigurationError
};
