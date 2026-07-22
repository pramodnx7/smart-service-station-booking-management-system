const crypto = require('crypto');
const path = require('path');
const { assertSupabaseConfigured, supabase } = require('../supabase');

const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'service-station').trim();
const maxFileBytes = 5 * 1024 * 1024;
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const documentMimeTypes = new Set([
  ...imageMimeTypes,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const allowedFolders = new Set([
  'customers', 'vehicles', 'mechanics', 'services', 'inventory', 'company', 'documents'
]);

function storageError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeFolder(folder) {
  const normalized = String(folder || '').trim().replace(/^\/+|\/+$/g, '');
  if (!allowedFolders.has(normalized)) throw storageError('Invalid upload folder.');
  return normalized;
}

function decodeFile(file, allowPdf = false) {
  const fileName = path.basename(String(file?.fileName || '').trim());
  const mimeType = String(file?.mimeType || '').toLowerCase();
  const accepted = allowPdf ? documentMimeTypes : imageMimeTypes;
  if (!fileName || !accepted.has(mimeType)) {
    throw storageError(allowPdf
      ? 'Choose a JPG, JPEG, PNG, WebP, PDF or DOCX file.'
      : 'Choose a JPG, JPEG, PNG or WebP image.');
  }
  const content = String(file?.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  let buffer;
  try {
    buffer = Buffer.from(content, 'base64');
  } catch (error) {
    throw storageError('The selected file is invalid.');
  }
  if (!content || !buffer.length) throw storageError('The selected file is empty or invalid.');
  if (buffer.length > maxFileBytes) throw storageError('The selected file must be 5 MB or smaller.');
  const signatures = {
    'image/jpeg': buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    'image/png': buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
    'application/pdf': buffer.subarray(0, 5).toString() === '%PDF-',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': buffer[0] === 0x50 && buffer[1] === 0x4b
  };
  if (!signatures[mimeType]) throw storageError('The file contents do not match the selected file type.');
  return { buffer, fileName, mimeType };
}

function extensionFor(fileName, mimeType) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  if (extension) return extension === 'jpeg' ? 'jpg' : extension;
  return {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
  }[mimeType];
}

async function uploadFile(file, folder, options = {}) {
  assertSupabaseConfigured();
  const safeFolder = normalizeFolder(folder);
  const decoded = decodeFile(file, Boolean(options.allowPdf));
  const objectPath = `${safeFolder}/${Date.now()}-${crypto.randomUUID()}.${extensionFor(decoded.fileName, decoded.mimeType)}`;
  const { error } = await supabase.storage.from(bucket).upload(objectPath, decoded.buffer, {
    contentType: decoded.mimeType,
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw storageError(`Upload failed: ${error.message}`, 502);
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    await supabase.storage.from(bucket).remove([objectPath]);
    throw storageError('Upload completed, but the public URL could not be created.', 502);
  }
  return {
    url: data.publicUrl,
    path: objectPath,
    folder: safeFolder,
    fileName: decoded.fileName,
    mimeType: decoded.mimeType,
    sizeBytes: decoded.buffer.length
  };
}

function pathFromPublicUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const parsed = new URL(value);
    const markerIndex = parsed.pathname.indexOf(marker);
    return markerIndex === -1 ? '' : decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch (error) {
    return '';
  }
}

async function deleteFile(value) {
  assertSupabaseConfigured();
  const objectPath = String(value || '').startsWith('http') ? pathFromPublicUrl(value) : String(value || '');
  if (!objectPath) return false;
  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  if (error) throw storageError(`Image deletion failed: ${error.message}`, 502);
  return true;
}

async function deleteFiles(values) {
  const paths = [...new Set((values || []).map((value) => (
    String(value || '').startsWith('http') ? pathFromPublicUrl(value) : String(value || '')
  )).filter(Boolean))];
  if (!paths.length) return 0;
  assertSupabaseConfigured();
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw storageError(`Image cleanup failed: ${error.message}`, 502);
  return paths.length;
}

async function replaceFile(file, folder, oldUrl, options = {}) {
  const uploaded = await uploadFile(file, folder, options);
  try {
    if (oldUrl) await deleteFile(oldUrl);
    return uploaded;
  } catch (error) {
    await deleteFile(uploaded.path).catch(() => {});
    throw error;
  }
}

module.exports = {
  bucket,
  deleteFile,
  deleteFiles,
  maxFileBytes,
  pathFromPublicUrl,
  replaceFile,
  uploadFile
};
