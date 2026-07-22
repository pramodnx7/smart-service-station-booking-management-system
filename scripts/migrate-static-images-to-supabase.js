require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { db } = require('../src/firebase');

const projectRoot = path.resolve(__dirname, '..');
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'service-station';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const mimeTypes = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf'
};

function supportedFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return supportedFiles(fullPath);
    return mimeTypes[path.extname(entry.name).toLowerCase()] ? [fullPath] : [];
  });
}

function objectPath(filePath) {
  const normalizedName = path.basename(filePath).replace(/[^a-z0-9._-]+/gi, '-');
  return filePath.includes(`${path.sep}uploads${path.sep}`)
    ? `services/legacy/${normalizedName}`
    : `company/system-assets/${normalizedName}`;
}

async function upload(filePath) {
  const destination = objectPath(filePath);
  const { error } = await supabase.storage.from(bucket).upload(destination, fs.readFileSync(filePath), {
    contentType: mimeTypes[path.extname(filePath).toLowerCase()],
    cacheControl: '86400',
    upsert: true
  });
  if (error) throw new Error(`${path.basename(filePath)}: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(destination).data.publicUrl;
}

async function main() {
  const existingSnapshot = await db.collection('appSettings').doc('static-image-assets').get();
  const files = [
    ...supportedFiles(path.join(projectRoot, 'assets', 'images')),
    ...supportedFiles(path.join(projectRoot, 'uploads', 'service-files'))
  ];
  const mapping = { ...(existingSnapshot.data()?.assets || {}) };
  for (const file of files) {
    const key = path.relative(projectRoot, file).replace(/\\/g, '/');
    mapping[key] = await upload(file);
    console.log(`UPLOADED=${key}`);
  }

  await db.collection('appSettings').doc('static-image-assets').set({
    assets: mapping,
    imageCount: Object.keys(mapping).length,
    migratedAt: new Date().toISOString()
  }, { merge: true });

  const landing = {
    recentWork: [
      ['Suspension Inspection', 'assets/images/service-wheel-closeup.png'],
      ['Exhaust System Repair', 'assets/images/workshop-lift-mechanic.png'],
      ['Engine Diagnostics', 'assets/images/about-mechanic-red-car.png']
    ],
    news: [
      ['A well-maintained car is like a well tuned instrument.', 'assets/images/about-mechanic-red-car.png'],
      ['The best car service is the one that keeps you moving forward.', 'assets/images/workshop-lift-mechanic.png'],
      ['We provide peace of mind with top-notch car service.', 'assets/images/hero-blue-workshop.png']
    ]
  };
  for (const [section, items] of Object.entries(landing)) {
    for (let slot = 0; slot < items.length; slot += 1) {
      const [title, imageKey] = items[slot];
      await db.collection('appSettings').doc(`landing-content-${section}-${slot}`).set({
        title,
        image: mapping[imageKey],
        active: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  }

  console.log(JSON.stringify({ uploaded: files.length, firestoreMappingSaved: true, landingImagesUpdated: 6 }));
}

main().catch((error) => {
  console.error(`Static image migration failed: ${error.message}`);
  process.exit(1);
});
