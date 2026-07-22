require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db } = require('../src/firebase');
const storage = require('../src/utils/uploadImage');

const projectRoot = path.resolve(__dirname, '..');
const execute = process.argv.includes('--execute');
const supportedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);
const collectionFields = {
  vehicles: ['imageUrl', 'frontImage', 'rearImage', 'leftImage', 'rightImage', 'interiorImage', 'engineImage'],
  technicians: ['profileImage', 'nicImage'],
  servicePackages: ['image'],
  pricingPlans: ['image'],
  inventoryParts: ['image'],
  serviceJobs: ['beforeImages', 'afterImages', 'damageImages', 'completedImages'],
  servicePhotos: ['imageUrl'],
  documents: ['fileUrl'],
  replacedParts: ['photoEvidence'],
  appSettings: ['logo', 'invoiceLogo', 'banner', 'image']
};

const mimeByExtension = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'
};

const stats = {
  documentsScanned: 0,
  documentsUpdated: 0,
  imagesFound: 0,
  imagesUploaded: 0,
  alreadySupabase: 0,
  unsupported: 0,
  missing: 0
};

const uploadCache = new Map();

function isSupabaseUrl(value) {
  return /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(String(value || ''));
}

function folderFor(collection, document) {
  if (collection === 'users') {
    if (document.role === 'technician') return 'mechanics';
    if (document.role === 'admin') return 'company';
    return 'customers';
  }
  return {
    vehicles: 'vehicles', technicians: 'mechanics', servicePackages: 'services', pricingPlans: 'services',
    inventoryParts: 'inventory', serviceJobs: 'services', servicePhotos: 'services', documents: 'documents',
    replacedParts: 'services', appSettings: 'company'
  }[collection] || 'services';
}

function sourceFromValue(value) {
  const text = String(value || '').trim();
  if (!text || isSupabaseUrl(text)) return null;
  const dataMatch = text.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (dataMatch) {
    const extension = dataMatch[1].split('/')[1].replace('jpeg', 'jpg');
    return {
      cacheKey: `data:${crypto.createHash('sha256').update(text).digest('hex')}`,
      fileName: `embedded-${crypto.createHash('sha1').update(text).digest('hex').slice(0, 12)}.${extension}`,
      mimeType: dataMatch[1].toLowerCase(),
      contentBase64: dataMatch[2]
    };
  }
  if (/^https?:\/\//i.test(text) || text.startsWith('/api/')) return null;
  const relative = text.replace(/^\/+/, '').replace(/\//g, path.sep);
  const absolute = path.isAbsolute(text) ? text : path.resolve(projectRoot, relative);
  const extension = path.extname(absolute).slice(1).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    stats.unsupported += 1;
    return null;
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    stats.missing += 1;
    return null;
  }
  return {
    cacheKey: `file:${absolute.toLowerCase()}`,
    fileName: path.basename(absolute),
    mimeType: mimeByExtension[extension],
    contentBase64: fs.readFileSync(absolute).toString('base64')
  };
}

async function migrateValue(value, folder, uploadsForDocument) {
  if (isSupabaseUrl(value)) {
    stats.alreadySupabase += 1;
    return value;
  }
  const source = sourceFromValue(value);
  if (!source) return value;
  stats.imagesFound += 1;
  const cacheKey = `${folder}:${source.cacheKey}`;
  if (uploadCache.has(cacheKey)) return uploadCache.get(cacheKey).url;
  if (!execute) return `DRY_RUN:${folder}/${source.fileName}`;
  const uploaded = await storage.uploadFile(source, folder);
  uploadCache.set(cacheKey, uploaded);
  uploadsForDocument.push({ cacheKey, uploaded });
  stats.imagesUploaded += 1;
  return uploaded.url;
}

async function migrateDocument(collection, snapshot) {
  stats.documentsScanned += 1;
  const document = snapshot.data();
  const fields = collection === 'users'
    ? ['avatar', 'profileImage']
    : (collectionFields[collection] || []);
  const updates = {};
  const uploadsForDocument = [];
  const folder = folderFor(collection, document);

  for (const field of fields) {
    const current = document[field];
    if (Array.isArray(current)) {
      const migrated = [];
      for (const value of current) migrated.push(await migrateValue(value, folder, uploadsForDocument));
      if (JSON.stringify(migrated) !== JSON.stringify(current)) updates[field] = migrated;
    } else if (typeof current === 'string' && current.trim()) {
      const migrated = await migrateValue(current, folder, uploadsForDocument);
      if (migrated !== current) updates[field] = migrated;
    }
  }

  if (!Object.keys(updates).length) return;
  stats.documentsUpdated += 1;
  if (!execute) return;
  try {
    await snapshot.ref.update({ ...updates, imageStorageMigratedAt: new Date().toISOString() });
  } catch (error) {
    for (const item of uploadsForDocument) {
      uploadCache.delete(item.cacheKey);
      await storage.deleteFile(item.uploaded.path).catch(() => {});
    }
    throw error;
  }
}

async function main() {
  const collections = ['users', ...Object.keys(collectionFields)];
  for (const collection of collections) {
    const snapshot = await db.collection(collection).get();
    for (const document of snapshot.docs) await migrateDocument(collection, document);
  }
  console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', ...stats }, null, 2));
}

main().catch((error) => {
  console.error(`Image migration failed: ${error.message}`);
  process.exit(1);
});
