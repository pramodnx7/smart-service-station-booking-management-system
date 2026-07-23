const bcrypt = require('bcryptjs');
const { admin, db, firebaseConfigurationError } = require('./firebase');

const collections = {
  users: 'users',
  vehicles: 'vehicles',
  servicePackages: 'servicePackages',
  pricingPlans: 'pricingPlans',
  customerPackages: 'customerPackages',
  customerPackageRequests: 'customerPackageRequests',
  bookings: 'bookings',
  invoices: 'invoices',
  emergencyRequests: 'emergencyRequests',
  notifications: 'notifications',
  notificationDrafts: 'notificationDrafts',
  feedback: 'feedback',
  technicians: 'technicians',
  serviceJobs: 'serviceJobs',
  technicianNotes: 'technicianNotes',
  technicianProgress: 'technicianProgress',
  serviceJobParts: 'serviceJobParts',
  inventoryParts: 'inventoryParts',
  inventoryCategories: 'inventoryCategories',
  inventorySuppliers: 'inventorySuppliers',
  inventoryMovements: 'inventoryMovements',
  replacedParts: 'replacedParts',
  serviceImages: 'servicePhotos',
  documents: 'documents',
  uploadAuditLogs: 'uploadAuditLogs',
  newsletterSubscriptions: 'newsletterSubscriptions',
  appSettings: 'appSettings',
  queueEntries: 'queueEntries',
  serviceBays: 'serviceBays'
};

const landingStatsDocument = 'landing-stats';
const companySettingsDocument = 'company';
const systemAssetBase = `${String(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || 'service-station'}/company/system-assets`;
const systemAsset = (fileName) => `${systemAssetBase}/${fileName}`;
const landingContentDocumentPrefix = 'landing-content';
const landingStatDefaults = {
  happyCustomers: 20000,
  expertTechnicians: 10
};
const landingContentDefaults = {
  recentWork: [
    { title: 'Suspension Inspection', image: systemAsset('service-wheel-closeup.png'), active: true },
    { title: 'Exhaust System Repair', image: systemAsset('workshop-lift-mechanic.png'), active: true },
    { title: 'Engine Diagnostics', image: systemAsset('about-mechanic-red-car.png'), active: true }
  ],
  news: [
    { date: '2026-01-23', category: 'Maintenance', title: 'A well-maintained car is like a well tuned instrument.', image: systemAsset('about-mechanic-red-car.png'), active: true },
    { date: '2026-01-11', category: 'Auto Service', title: 'The best car service is the one that keeps you moving forward.', image: systemAsset('workshop-lift-mechanic.png'), active: true },
    { date: '2026-01-07', category: 'Car Care', title: 'We provide peace of mind with top-notch car service.', image: systemAsset('hero-blue-workshop.png'), active: true }
  ]
};

const defaultImage = systemAsset('hero-blue-workshop.png');
const defaultServiceImage = systemAsset('service-wheel-closeup.png');
const serviceJobStatuses = ['Pending', 'Assigned', 'In Progress', 'Waiting For Parts', 'Quality Check', 'Completed', 'Cancelled'];
const inventoryCategories = ['Engine Parts', 'Brake System', 'Electrical', 'Suspension', 'Cooling System', 'Filters', 'Fluids & Lubricants', 'Batteries', 'Tires & Wheels', 'Accessories'];
const partConditions = ['Brand New', 'Used', 'Refurbished', 'Reconditioned', 'Customer Supplied'];
const lowStockThreshold = 5;
const photoTypes = ['Before Service', 'During Service', 'After Service', 'Replaced Part', 'Vehicle Inspection'];
const documentTypes = ['Service Report', 'Inspection Report', 'Warranty Document', 'Customer Attachment', 'Vehicle Registration Document', 'Insurance Document', 'Service Checklist', 'Invoice PDF'];
const allowedUploadExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'docx'];
const maxUploadBytes = 5 * 1024 * 1024;
const serviceBayCount = Number(process.env.SERVICE_BAY_COUNT || 8);
const serviceDayStartHour = Number(process.env.SERVICE_DAY_START_HOUR || 8);
const serviceDayEndHour = Number(process.env.SERVICE_DAY_END_HOUR || 17);
const serviceSlotMinutes = Number(process.env.SERVICE_SLOT_MINUTES || 60);
const readCache = new Map();
const stableCollectionCacheMs = {
  [collections.servicePackages]: Math.max(60000, Number(process.env.SERVICE_PACKAGE_CACHE_MS) || 5 * 60 * 1000),
  [collections.pricingPlans]: Math.max(60000, Number(process.env.PRICING_PLAN_CACHE_MS) || 5 * 60 * 1000),
  [collections.inventoryCategories]: Math.max(60000, Number(process.env.INVENTORY_CATEGORY_CACHE_MS) || 10 * 60 * 1000)
};
const publicProjectionCacheMs = {
  serviceRatings: Math.max(15000, Number(process.env.PUBLIC_RATINGS_CACHE_MS) || 60 * 1000),
  pricingPlans: Math.max(60000, Number(process.env.PUBLIC_PRICING_CACHE_MS) || 5 * 60 * 1000),
  stats: Math.max(15000, Number(process.env.PUBLIC_STATS_CACHE_MS) || 60 * 1000),
  landingContent: Math.max(60000, Number(process.env.PUBLIC_CONTENT_CACHE_MS) || 5 * 60 * 1000)
};
const publicProjectionDependencies = {
  [collections.servicePackages]: ['serviceRatings'],
  [collections.feedback]: ['serviceRatings'],
  [collections.users]: ['serviceRatings', 'stats'],
  [collections.pricingPlans]: ['pricingPlans'],
  [collections.technicians]: ['stats'],
  [collections.serviceJobs]: ['stats'],
  [collections.appSettings]: ['stats', 'landingContent']
};
const readCacheStats = {
  startedAt: new Date().toISOString(),
  hits: 0,
  misses: 0,
  invalidations: 0
};

async function cachedRead(key, ttl, loader) {
  const existing = readCache.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    readCacheStats.hits += 1;
    return existing.value;
  }

  readCacheStats.misses += 1;
  const value = Promise.resolve().then(loader);
  readCache.set(key, { expiresAt: Date.now() + ttl, value });
  try {
    return await value;
  } catch (error) {
    if (readCache.get(key)?.value === value) readCache.delete(key);
    throw error;
  }
}

function invalidateReadCaches(collection) {
  if (readCache.delete(`collection:${collection}`)) readCacheStats.invalidations += 1;
  (publicProjectionDependencies[collection] || []).forEach((projection) => {
    if (readCache.delete(`public:${projection}`)) readCacheStats.invalidations += 1;
  });
  if (collection === collections.appSettings && readCache.delete('settings:landing-content')) {
    readCacheStats.invalidations += 1;
  }
}

function getFirestoreReadCacheStats() {
  const now = Date.now();
  return {
    ...readCacheStats,
    activeEntries: [...readCache.entries()]
      .filter(([, entry]) => entry.expiresAt > now)
      .map(([key, entry]) => ({ key, expiresInMs: entry.expiresAt - now }))
      .sort((left, right) => left.key.localeCompare(right.key))
  };
}

function fieldValue() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function asId(value) {
  return Number(value);
}

function emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function titleCase(value) {
  const text = String(value || '').trim();
  return text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : text;
}

function formatDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value.toDate) return value.toDate().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function today(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function sortById(items) {
  return items.sort((a, b) => Number(a.id) - Number(b.id));
}

function sortDateDesc(items, dateField, timeField = '') {
  return items.sort((a, b) => {
    const left = `${b[dateField] || ''} ${b[timeField] || ''}`;
    const right = `${a[dateField] || ''} ${a[timeField] || ''}`;
    return left.localeCompare(right);
  });
}

function pdfEscape(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pdfText(text, x, y, options = {}) {
  const size = Number(options.size || 10);
  const font = options.bold ? 'F2' : 'F1';
  const color = options.color || '0.12 0.22 0.34';
  const value = pdfEscape(text);
  const estimatedWidth = value.length * size * (options.bold ? 0.56 : 0.51);
  const textX = options.align === 'right' ? x - estimatedWidth : x;
  return `BT ${color} rg /${font} ${size} Tf ${textX.toFixed(1)} ${y} Td (${value}) Tj ET`;
}

function pdfRect(x, y, width, height, options = {}) {
  const commands = [];
  if (options.fill) commands.push(`${options.fill} rg ${x} ${y} ${width} ${height} re f`);
  if (options.stroke) commands.push(`${options.stroke} RG ${options.lineWidth || 1} w ${x} ${y} ${width} ${height} re S`);
  return commands.join('\n');
}

function createPdfDocument(pageContents) {
  const pageCount = pageContents.length;
  const firstPageId = 3;
  const regularFontId = firstPageId + pageCount;
  const boldFontId = regularFontId + 1;
  const firstContentId = boldFontId + 1;
  const pageIds = pageContents.map((_, index) => firstPageId + index);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...pageContents.map((_, index) => (
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${firstContentId + index} 0 R >>`
    )),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ...pageContents.map((content) => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function createInvoicePdfBuffer(details) {
  const { invoice, user, service, job, vehicle, technicianName, parts } = details;
  const billableItems = [
    ...parts.map((part) => ({ ...part, itemType: 'Spare Part' })),
    ...(Number(invoice.laborCost || 0) > 0 ? [{
      partName: `${service?.name || 'Service'} Labour`,
      itemType: 'Labour',
      quantity: 1,
      unitPrice: Number(invoice.laborCost),
      totalPrice: Number(invoice.laborCost)
    }] : []),
    ...(Number(invoice.serviceCharges || 0) > 0 ? [{
      partName: invoice.invoiceType === 'Package' ? `${service?.name || invoice.serviceName || 'Package'} Package` : 'Service Charges',
      itemType: invoice.invoiceType === 'Package' ? 'Package' : 'Service',
      quantity: 1,
      unitPrice: Number(invoice.serviceCharges),
      totalPrice: Number(invoice.serviceCharges)
    }] : [])
  ];
  const partChunks = [];
  const firstPageRows = 4;
  const followingPageRows = 8;
  partChunks.push(billableItems.slice(0, firstPageRows));
  for (let index = firstPageRows; index < billableItems.length; index += followingPageRows) {
    partChunks.push(billableItems.slice(index, index + followingPageRows));
  }
  if (!partChunks.length) partChunks.push([]);

  return createPdfDocument(partChunks.map((pageParts, pageIndex) => {
    const commands = [];
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex === partChunks.length - 1;
    const navy = '0.055 0.145 0.255';
    const blue = '0.055 0.55 0.78';
    const pale = '0.94 0.97 0.985';
    const muted = '0.38 0.46 0.54';
    const green = '0.08 0.58 0.38';

    commands.push(pdfRect(0, 686, 612, 106, { fill: navy }));
    commands.push(pdfRect(0, 680, 612, 6, { fill: '0.98 0.66 0.04' }));
    commands.push(pdfText('AUTO', 44, 747, { size: 23, bold: true, color: '1 1 1' }));
    commands.push(pdfText('CARE', 106, 747, { size: 23, bold: true, color: '0.98 0.66 0.04' }));
    commands.push(pdfText('SMART SERVICE STATION', 45, 728, { size: 8, color: '0.72 0.84 0.92' }));
    commands.push(pdfText(process.env.BUSINESS_PHONE || '+94 77 123 4567', 270, 750, { size: 8, color: '1 1 1' }));
    commands.push(pdfText(process.env.BUSINESS_EMAIL || 'info@autocare.lk', 270, 731, { size: 8, color: '0.78 0.88 0.94' }));
    commands.push(pdfText(process.env.BUSINESS_ADDRESS || 'Colombo, Sri Lanka', 270, 712, { size: 8, color: '0.78 0.88 0.94' }));
    commands.push(pdfText('INVOICE', 568, 747, { size: 20, bold: true, color: '1 1 1', align: 'right' }));
    commands.push(pdfText(`#INV-${invoice.id}`, 568, 726, { size: 11, color: '0.98 0.66 0.04', bold: true, align: 'right' }));
    commands.push(pdfText(`Page ${pageIndex + 1} of ${partChunks.length}`, 568, 708, { size: 8, color: '0.72 0.8 0.86', align: 'right' }));

    let tableTop;
    if (isFirstPage) {
      commands.push(pdfRect(38, 548, 166, 105, { stroke: '0.84 0.88 0.91' }));
      commands.push(pdfText('BILL TO', 51, 633, { size: 9, bold: true, color: navy }));
      commands.push(pdfRect(51, 615, 24, 2, { fill: '0.98 0.66 0.04' }));
      commands.push(pdfText(user?.name || 'Customer', 51, 596, { size: 11, bold: true }));
      commands.push(pdfText(user?.phone || '-', 51, 578, { size: 8, color: muted }));
      commands.push(pdfText((user?.email || '-').slice(0, 30), 51, 562, { size: 8, color: muted }));

      commands.push(pdfRect(214, 548, 166, 105, { stroke: '0.84 0.88 0.91' }));
      commands.push(pdfText('VEHICLE DETAILS', 227, 633, { size: 9, bold: true, color: navy }));
      commands.push(pdfRect(227, 615, 24, 2, { fill: '0.98 0.66 0.04' }));
      commands.push(pdfText('Vehicle No.', 227, 596, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(vehicle?.plateNumber || '-', 365, 596, { size: 8.5, bold: true, align: 'right' }));
      commands.push(pdfText('Make / Model', 227, 578, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(vehicle ? `${vehicle.make} ${vehicle.model}`.slice(0, 22) : '-', 365, 578, { size: 8, align: 'right' }));
      commands.push(pdfText('Year / Mileage', 227, 560, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(`${vehicle?.year || '-'} / ${vehicle?.mileage ? `${Number(vehicle.mileage).toLocaleString('en-LK')} km` : 'N/A'}`, 365, 560, { size: 7.5, align: 'right' }));

      commands.push(pdfRect(390, 548, 184, 105, { fill: pale, stroke: '0.82 0.87 0.9' }));
      commands.push(pdfRect(390, 625, 184, 28, { fill: navy }));
      commands.push(pdfText('INVOICE INFORMATION', 403, 635, { size: 8.5, bold: true, color: '1 1 1' }));
      commands.push(pdfText('Invoice date', 403, 606, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(formatDate(invoice.invoiceDate) || '-', 560, 606, { size: 8, align: 'right' }));
      const invoiceDate = new Date(formatDate(invoice.invoiceDate));
      invoiceDate.setDate(invoiceDate.getDate() + Number(process.env.INVOICE_DUE_DAYS || 7));
      commands.push(pdfText('Due date', 403, 590, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(Number.isNaN(invoiceDate.getTime()) ? '-' : formatDate(invoiceDate), 560, 590, { size: 8, align: 'right' }));
      commands.push(pdfText('Booking no.', 403, 574, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(job?.bookingId ? `BK-${job.bookingId}` : '-', 560, 574, { size: 8, align: 'right' }));
      commands.push(pdfText('Payment', 403, 558, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(`${invoice.paymentStatus || 'Pending'} / ${invoice.paymentMethod || 'N/A'}`, 560, 558, { size: 7.5, bold: true, color: invoice.paymentStatus === 'Paid' ? green : blue, align: 'right' }));

      commands.push(pdfRect(38, 470, 536, 57, { fill: '0.975 0.985 0.992', stroke: '0.84 0.88 0.91' }));
      commands.push(pdfText('SERVICE SUMMARY', 51, 510, { size: 9, bold: true, color: navy }));
      commands.push(pdfRect(51, 493, 24, 2, { fill: '0.98 0.66 0.04' }));
      commands.push(pdfText('Service type', 51, 478, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText((service?.name || 'General Service').slice(0, 25), 175, 478, { size: 8.5, bold: true }));
      commands.push(pdfText('Service advisor', 190, 510, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText((process.env.SERVICE_ADVISOR_NAME || 'AutoCare Service Team').slice(0, 24), 315, 510, { size: 8, align: 'right' }));
      commands.push(pdfText('Technician', 328, 510, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText((technicianName || 'Unassigned').slice(0, 22), 560, 510, { size: 8, bold: true, align: 'right' }));
      commands.push(pdfText('Service job', 328, 486, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(job ? `SJ-${job.id}` : '-', 560, 486, { size: 8.5, align: 'right' }));
      tableTop = 452;
    } else {
      commands.push(pdfText('ITEMIZED PARTS - CONTINUED', 44, 642, { size: 12, bold: true }));
      tableTop = 618;
    }

    commands.push(pdfRect(44, tableTop - 24, 524, 24, { fill: navy }));
    commands.push(pdfText('#', 56, tableTop - 16, { size: 8, bold: true, color: '1 1 1' }));
    commands.push(pdfText('DESCRIPTION', 76, tableTop - 16, { size: 8, bold: true, color: '1 1 1' }));
    commands.push(pdfText('TYPE', 332, tableTop - 16, { size: 8, bold: true, color: '1 1 1', align: 'right' }));
    commands.push(pdfText('QTY', 386, tableTop - 16, { size: 8, bold: true, color: '1 1 1', align: 'right' }));
    commands.push(pdfText('UNIT PRICE', 475, tableTop - 16, { size: 8, bold: true, color: '1 1 1', align: 'right' }));
    commands.push(pdfText('AMOUNT', 556, tableTop - 16, { size: 8, bold: true, color: '1 1 1', align: 'right' }));

    if (!pageParts.length) {
      commands.push(pdfRect(44, tableTop - 55, 524, 31, { fill: '0.98 0.985 0.99' }));
      commands.push(pdfText('No replacement parts recorded for this service.', 56, tableTop - 44, { size: 9, color: muted }));
    }
    pageParts.forEach((part, index) => {
      const rowTop = tableTop - 24 - (index * 31);
      if (index % 2 === 0) commands.push(pdfRect(44, rowTop - 31, 524, 31, { fill: '0.975 0.985 0.992' }));
      const label = [part.partName || 'Part', part.brand].filter(Boolean).join(' - ').slice(0, 38);
      const itemNumber = pageIndex === 0
        ? index + 1
        : firstPageRows + ((pageIndex - 1) * followingPageRows) + index + 1;
      commands.push(pdfText(itemNumber, 56, rowTop - 20, { size: 8, color: muted }));
      commands.push(pdfText(label, 76, rowTop - 20, { size: 8.5 }));
      commands.push(pdfText(part.itemType || 'Spare Part', 332, rowTop - 20, { size: 7.5, color: muted, align: 'right' }));
      commands.push(pdfText(Number(part.quantity || 0), 386, rowTop - 20, { size: 8.5, align: 'right' }));
      commands.push(pdfText(money(part.unitPrice), 475, rowTop - 20, { size: 8.5, align: 'right' }));
      commands.push(pdfText(money(part.totalPrice || Number(part.quantity || 0) * Number(part.unitPrice || 0)), 556, rowTop - 20, { size: 8.5, bold: true, align: 'right' }));
    });

    if (isLastPage) {
      const rowCount = Math.max(pageParts.length, 1);
      const totalsTop = tableTop - 24 - (rowCount * 31) - 18;
      const totalRows = [
        ['Parts subtotal', invoice.partsTotal],
        ['Labor charges', invoice.laborCost],
        ['Service charges', invoice.serviceCharges],
        ['Tax', invoice.tax],
        ['Discount', -Number(invoice.discount || 0)]
      ];
      totalRows.forEach(([label, value], index) => {
        commands.push(pdfText(label, 414, totalsTop - (index * 18), { size: 8.5, color: muted, align: 'right' }));
        commands.push(pdfText(money(value), 556, totalsTop - (index * 18), { size: 8.5, align: 'right' }));
      });
      const grandY = totalsTop - 112;
      commands.push(pdfRect(350, grandY - 12, 218, 38, { fill: navy }));
      commands.push(pdfText('TOTAL', 414, grandY + 2, { size: 10, bold: true, color: '1 1 1', align: 'right' }));
      commands.push(pdfText(money(invoice.amount), 556, grandY + 2, { size: 12, bold: true, color: '1 1 1', align: 'right' }));
      const paidAmount = String(invoice.paymentStatus || '').toLowerCase() === 'paid' ? Number(invoice.amount || 0) : 0;
      commands.push(pdfText('Paid amount', 414, grandY - 28, { size: 8, color: muted, align: 'right' }));
      commands.push(pdfText(money(paidAmount), 556, grandY - 28, { size: 8.5, bold: true, align: 'right' }));
      commands.push(pdfRect(350, grandY - 67, 218, 28, { stroke: green }));
      commands.push(pdfText('BALANCE', 414, grandY - 57, { size: 8.5, bold: true, color: green, align: 'right' }));
      commands.push(pdfText(money(Number(invoice.amount || 0) - paidAmount), 556, grandY - 57, { size: 9, bold: true, color: green, align: 'right' }));

      commands.push(pdfRect(44, 181, 270, 52, { fill: '0.98 0.985 0.99', stroke: '0.84 0.88 0.91' }));
      commands.push(pdfText('NOTES', 57, 215, { size: 8.5, bold: true, color: navy }));
      commands.push(pdfText('Thank you for choosing AutoCare Service Station.', 57, 198, { size: 7.5, color: muted }));
      commands.push(pdfText('Drive safe! We appreciate your business - We Care.', 57, 186, { size: 7.5, color: muted }));

      commands.push(pdfRect(44, 72, 270, 96, { fill: '0.98 0.985 0.99', stroke: '0.84 0.88 0.91' }));
      commands.push(pdfText('BANK DETAILS', 57, 149, { size: 8.5, bold: true, color: navy }));
      commands.push(pdfText('Bank', 57, 130, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(process.env.BANK_NAME || 'Commercial Bank of Ceylon', 298, 130, { size: 7.5, align: 'right' }));
      commands.push(pdfText('Account name', 57, 113, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(process.env.BANK_ACCOUNT_NAME || 'AutoCare Service Station', 298, 113, { size: 7.5, align: 'right' }));
      commands.push(pdfText('Account no.', 57, 96, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(process.env.BANK_ACCOUNT_NUMBER || 'Contact AutoCare', 298, 96, { size: 7.5, align: 'right' }));
      commands.push(pdfText('Branch', 57, 79, { size: 7.5, bold: true, color: muted }));
      commands.push(pdfText(process.env.BANK_BRANCH || 'Colombo', 298, 79, { size: 7.5, align: 'right' }));

      commands.push(pdfText(`Prepared by: ${process.env.SERVICE_ADVISOR_NAME || 'AutoCare Service Team'}`, 314, 57, { size: 7, color: muted, align: 'right' }));
      commands.push(pdfText(`Authorized by: ${process.env.AUTHORIZED_BY_NAME || 'Operations Manager'}`, 568, 57, { size: 7, color: muted, align: 'right' }));
    }

    commands.push(pdfRect(0, 0, 612, 45, { fill: navy }));
    commands.push(pdfRect(0, 45, 612, 3, { fill: '0.98 0.66 0.04' }));
    commands.push(pdfText(process.env.BUSINESS_ADDRESS || 'Colombo, Sri Lanka', 44, 24, { size: 7.5, color: '1 1 1' }));
    commands.push(pdfText(process.env.BUSINESS_PHONE || '+94 77 123 4567', 306, 24, { size: 7.5, color: '1 1 1', align: 'right' }));
    commands.push(pdfText(process.env.BUSINESS_EMAIL || 'info@autocare.lk', 568, 24, { size: 7.5, color: '1 1 1', align: 'right' }));
    return commands.filter(Boolean).join('\n');
  }));
}

function createReportPdfBuffer({ title, subtitle, metrics, columns, rows }) {
  const chunks = [];
  const rowsPerPage = 19;
  for (let index = 0; index < Math.max(rows.length, 1); index += rowsPerPage) {
    chunks.push(rows.slice(index, index + rowsPerPage));
  }

  return createPdfDocument(chunks.map((pageRows, pageIndex) => {
    const navy = '0.055 0.145 0.255';
    const gold = '0.98 0.66 0.04';
    const muted = '0.38 0.46 0.54';
    const commands = [
      pdfRect(0, 700, 612, 92, { fill: navy }),
      pdfRect(0, 694, 612, 6, { fill: gold }),
      pdfText('AUTO', 44, 750, { size: 21, bold: true, color: '1 1 1' }),
      pdfText('CARE', 101, 750, { size: 21, bold: true, color: gold }),
      pdfText('MANAGEMENT REPORT', 45, 731, { size: 8, color: '0.72 0.84 0.92' }),
      pdfText(title, 568, 750, { size: 17, bold: true, color: '1 1 1', align: 'right' }),
      pdfText(`Generated ${formatDate(new Date())}  |  Page ${pageIndex + 1} of ${chunks.length}`, 568, 729, { size: 8, color: '0.76 0.84 0.9', align: 'right' }),
      pdfText(subtitle, 44, 670, { size: 9, color: muted })
    ];

    const metricWidth = 524 / Math.max(metrics.length, 1);
    metrics.forEach(([label, value], index) => {
      const x = 44 + (index * metricWidth);
      commands.push(pdfRect(x, 610, metricWidth - 8, 45, { fill: '0.95 0.975 0.99', stroke: '0.84 0.88 0.91' }));
      commands.push(pdfText(label, x + 10, 639, { size: 7, bold: true, color: muted }));
      commands.push(pdfText(String(value), x + 10, 620, { size: 11, bold: true, color: navy }));
    });

    const tableTop = 584;
    commands.push(pdfRect(44, tableTop - 25, 524, 25, { fill: navy }));
    columns.forEach((column) => {
      commands.push(pdfText(column.label, column.x, tableTop - 17, {
        size: 7.5,
        bold: true,
        color: '1 1 1',
        align: column.align
      }));
    });
    if (!pageRows.length) {
      commands.push(pdfText('No records are available for this report.', 56, tableTop - 47, { size: 9, color: muted }));
    }
    pageRows.forEach((row, rowIndex) => {
      const y = tableTop - 45 - (rowIndex * 25);
      if (rowIndex % 2 === 0) commands.push(pdfRect(44, y - 8, 524, 25, { fill: '0.975 0.985 0.992' }));
      columns.forEach((column, columnIndex) => {
        commands.push(pdfText(String(row[columnIndex] ?? '-').slice(0, column.maxLength || 32), column.x, y, {
          size: 7.5,
          bold: column.bold,
          color: column.color || '0.12 0.22 0.34',
          align: column.align
        }));
      });
    });

    commands.push(pdfRect(0, 0, 612, 42, { fill: navy }));
    commands.push(pdfRect(0, 42, 612, 3, { fill: gold }));
    commands.push(pdfText(process.env.BUSINESS_ADDRESS || 'Colombo, Sri Lanka', 44, 22, { size: 7.5, color: '1 1 1' }));
    commands.push(pdfText(process.env.BUSINESS_EMAIL || 'info@autocare.lk', 568, 22, { size: 7.5, color: '1 1 1', align: 'right' }));
    return commands.join('\n');
  }));
}

function docRef(collection, id) {
  return db.collection(collection).doc(String(id));
}

function assertFirebaseConfigured() {
  if (db) return;

  const error = new Error(
    firebaseConfigurationError
    || 'Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID and one credential option in .env.'
  );
  error.status = 500;
  throw error;
}

async function all(collection) {
  assertFirebaseConfigured();
  const loadCollection = async () => {
    const snapshot = await db.collection(collection).get();
    return snapshot.docs.map((doc) => ({ id: Number(doc.id), ...doc.data() }));
  };
  const ttl = stableCollectionCacheMs[collection];
  const items = ttl
    ? await cachedRead(`collection:${collection}`, ttl, loadCollection)
    : await loadCollection();
  return items.map((item) => ({ ...item }));
}

async function allWhere(collection, field, value) {
  assertFirebaseConfigured();
  const snapshot = await db.collection(collection).where(field, '==', value).get();
  return snapshot.docs.map((doc) => ({ id: Number(doc.id), ...doc.data() }));
}

async function allWhereAny(collection, field, values) {
  const uniqueValues = [...new Set(values.map(Number).filter(Number.isFinite))];
  if (!uniqueValues.length) return [];
  return (await Promise.all(uniqueValues.map((value) => allWhere(collection, field, value)))).flat();
}

async function getById(collection, id) {
  assertFirebaseConfigured();
  const snapshot = await docRef(collection, id).get();
  return snapshot.exists ? { id: Number(snapshot.id), ...snapshot.data() } : null;
}

async function nextId(transaction, collection) {
  const counterRef = db.collection('meta').doc('counters');
  const snapshot = await transaction.get(counterRef);
  const counters = snapshot.exists ? snapshot.data() : {};
  const id = Number(counters[collection] || 0) + 1;
  transaction.set(counterRef, { [collection]: id }, { merge: true });
  return id;
}

async function nextIds(transaction, collection, count) {
  const counterRef = db.collection('meta').doc('counters');
  const snapshot = await transaction.get(counterRef);
  const counters = snapshot.exists ? snapshot.data() : {};
  const start = Number(counters[collection] || 0) + 1;
  const ids = Array.from({ length: count }, (_, index) => start + index);
  transaction.set(counterRef, { [collection]: start + count - 1 }, { merge: true });
  return ids;
}

async function nextIdsForCollections(transaction, requests) {
  const counterRef = db.collection('meta').doc('counters');
  const snapshot = await transaction.get(counterRef);
  const counters = snapshot.exists ? snapshot.data() : {};
  const updates = {};
  const idsByCollection = {};

  Object.entries(requests).forEach(([collection, count]) => {
    const start = Number(counters[collection] || 0) + 1;
    idsByCollection[collection] = Array.from({ length: count }, (_, index) => start + index);
    updates[collection] = start + count - 1;
  });

  transaction.set(counterRef, updates, { merge: true });
  return idsByCollection;
}

async function createDocument(collection, data) {
  assertFirebaseConfigured();
  const item = await db.runTransaction(async (transaction) => {
    const id = await nextId(transaction, collection);
    const ref = docRef(collection, id);
    transaction.set(ref, { ...data, id, createdAt: fieldValue() });
    return { ...data, id };
  });
  invalidateReadCaches(collection);
  return item;
}

async function createQueuedBookingDocument(data) {
  assertFirebaseConfigured();
  const bookingDate = formatDate(data.bookingDate);
  const queueRef = db.collection('meta').doc(`booking-queue-${bookingDate}`);
  const bookingsForDate = db.collection(collections.bookings).where('bookingDate', '==', bookingDate);

  return db.runTransaction(async (transaction) => {
    const [bookingsSnapshot, queueSnapshot] = await Promise.all([
      transaction.get(bookingsForDate),
      transaction.get(queueRef)
    ]);
    const existingMaximum = bookingsSnapshot.docs.reduce(
      (maximum, snapshot) => bookingIsActive(snapshot.data())
        ? Math.max(maximum, Number(snapshot.data().queuePosition || 0))
        : maximum,
      0
    );
    const storedMaximum = queueSnapshot.exists ? Number(queueSnapshot.data().lastPosition || 0) : 0;
    const queuePosition = Math.max(existingMaximum, storedMaximum) + 1;
    const id = await nextId(transaction, collections.bookings);
    const ref = docRef(collections.bookings, id);

    transaction.set(queueRef, {
      bookingDate,
      lastPosition: queuePosition,
      updatedAt: fieldValue()
    }, { merge: true });
    transaction.set(ref, { ...data, bookingDate, queuePosition, id, createdAt: fieldValue() });
    return { ...data, bookingDate, queuePosition, id };
  });
}

async function moveBookingToDateQueue(id, data) {
  assertFirebaseConfigured();
  const bookingDate = formatDate(data.bookingDate);
  const bookingRef = docRef(collections.bookings, id);
  const queueRef = db.collection('meta').doc(`booking-queue-${bookingDate}`);
  const bookingsForDate = db.collection(collections.bookings).where('bookingDate', '==', bookingDate);

  return db.runTransaction(async (transaction) => {
    const [bookingSnapshot, bookingsSnapshot, queueSnapshot] = await Promise.all([
      transaction.get(bookingRef),
      transaction.get(bookingsForDate),
      transaction.get(queueRef)
    ]);
    if (!bookingSnapshot.exists) return null;
    const existingMaximum = bookingsSnapshot.docs.reduce(
      (maximum, snapshot) => bookingIsActive(snapshot.data())
        ? Math.max(maximum, Number(snapshot.data().queuePosition || 0))
        : maximum,
      0
    );
    const storedMaximum = queueSnapshot.exists ? Number(queueSnapshot.data().lastPosition || 0) : 0;
    const queuePosition = Math.max(existingMaximum, storedMaximum) + 1;

    transaction.set(queueRef, { bookingDate, lastPosition: queuePosition, updatedAt: fieldValue() }, { merge: true });
    transaction.set(bookingRef, { ...data, bookingDate, queuePosition, updatedAt: fieldValue() }, { merge: true });
    return { ...bookingSnapshot.data(), ...data, bookingDate, queuePosition, id: Number(id) };
  });
}

async function updateDocument(collection, id, data) {
  assertFirebaseConfigured();
  const ref = docRef(collection, id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  await ref.set({ ...data, updatedAt: fieldValue() }, { merge: true });
  invalidateReadCaches(collection);
  return getById(collection, id);
}

async function deleteDocument(collection, id) {
  assertFirebaseConfigured();
  await docRef(collection, id).delete();
  invalidateReadCaches(collection);
}

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    avatar: user.avatar || user.profileImage || '',
    profileImage: user.profileImage || user.avatar || ''
  };
}

function customerView(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    status: titleCase(user.status || 'active'),
    avatar: user.avatar || user.profileImage || '',
    profileImage: user.profileImage || user.avatar || ''
  };
}

function technicianView(technician, user) {
  const profile = user || technician.user;
  return {
    id: technician.id,
    userId: technician.userId,
    name: profile?.name || technician.name || 'Unknown technician',
    email: profile?.email || technician.email || '',
    employeeNo: technician.employeeNo,
    specialization: technician.specialization,
    phone: technician.phone || profile?.phone || '',
    experienceYears: Number(technician.experienceYears || 0),
    status: titleCase(technician.status || 'active'),
    avatar: profile?.avatar || technician.profileImage || '',
    profileImage: technician.profileImage || profile?.profileImage || profile?.avatar || '',
    nicImage: technician.nicImage || '',
    certificateUrls: Array.isArray(technician.certificateUrls) ? technician.certificateUrls : []
  };
}

function vehicleView(vehicle) {
  const vehicleName = String(vehicle.name || '').trim();
  return {
    id: vehicle.id,
    customerId: vehicle.userId,
    name: vehicleName || `${vehicle.make} ${vehicle.model}`.trim(),
    vehicleType: vehicle.vehicleType || 'Car',
    make: vehicle.make,
    model: vehicle.model,
    plate: vehicle.plateNumber,
    year: vehicle.year,
    fuelType: vehicle.fuelType || '',
    color: vehicle.color || '',
    image: vehicle.frontImage || vehicle.imageUrl || defaultImage,
    frontImage: vehicle.frontImage || vehicle.imageUrl || '',
    rearImage: vehicle.rearImage || '',
    leftImage: vehicle.leftImage || '',
    rightImage: vehicle.rightImage || '',
    interiorImage: vehicle.interiorImage || '',
    engineImage: vehicle.engineImage || ''
  };
}

function pricingPlanView(plan) {
  return {
    id: plan.id,
    name: plan.name || 'Service Plan',
    badge: plan.badge || '',
    price: Number(plan.price || 0),
    billingPeriod: plan.billingPeriod || 'month',
    image: plan.image || defaultImage,
    features: Array.isArray(plan.features) ? plan.features.filter(Boolean) : [],
    buttonText: plan.buttonText || `Choose ${plan.name || 'Plan'}`,
    featured: Boolean(plan.featured),
    active: plan.active !== false,
    displayOrder: Number(plan.displayOrder || 0)
  };
}

function customerPackageView(customerPackage, plan = null) {
  if (!customerPackage) return null;
  const benefits = Array.isArray(customerPackage.benefits)
    ? customerPackage.benefits.filter(Boolean)
    : Array.isArray(plan?.features) ? plan.features.filter(Boolean) : [];
  return {
    id: customerPackage.id,
    customerId: Number(customerPackage.userId),
    pricingPlanId: Number(customerPackage.pricingPlanId),
    name: customerPackage.packageName || plan?.name || 'Service Plan',
    badge: customerPackage.badge || plan?.badge || '',
    price: Number(customerPackage.price ?? plan?.price ?? 0),
    billingPeriod: customerPackage.billingPeriod || plan?.billingPeriod || 'service',
    benefits,
    status: customerPackage.status || 'active',
    activatedAt: formatDate(customerPackage.activatedAt || customerPackage.createdAt),
    updatedAt: formatDate(customerPackage.updatedAt)
  };
}

function packageRequestView(request, usersById = new Map(), plansById = new Map()) {
  const plan = plansById.get(Number(request.pricingPlanId));
  return {
    id: request.id,
    customerId: Number(request.userId),
    customerName: usersById.get(Number(request.userId))?.name || 'Customer',
    pricingPlanId: Number(request.pricingPlanId),
    packageName: request.packageName || plan?.name || 'Service Plan',
    price: Number(request.price || 0),
    benefits: Array.isArray(request.benefits) ? request.benefits.filter(Boolean) : [],
    paymentMethod: request.paymentMethod || (Number(request.price || 0) <= 0 ? 'Free' : ''),
    paymentStatus: request.paymentStatus || (Number(request.price || 0) <= 0 ? 'Not Required' : 'Unpaid'),
    status: request.status || 'Pending Approval',
    paymentProofUrl: request.paymentProofUrl || '',
    paymentProofName: request.paymentProofName || '',
    requestedAt: formatDate(request.requestedAt || request.createdAt),
    paymentSubmittedAt: formatDate(request.paymentSubmittedAt),
    approvedAt: formatDate(request.approvedAt),
    rejectionReason: request.rejectionReason || ''
  };
}

async function getPublicPricingPlans() {
  return cachedRead('public:pricingPlans', publicProjectionCacheMs.pricingPlans, async () => (
    (await all(collections.pricingPlans))
      .map(pricingPlanView)
      .filter((plan) => plan.active)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
  ));
}

async function createPricingPlan(data) {
  return pricingPlanView(await createDocument(collections.pricingPlans, {
    name: data.name.trim(), badge: data.badge.trim(), price: Number(data.price),
    billingPeriod: String(data.billingPeriod || 'month').trim(), image: data.image,
    features: data.features, buttonText: data.buttonText.trim(), featured: Boolean(data.featured),
    active: data.active !== false, displayOrder: Number(data.displayOrder || 0)
  }));
}

async function updatePricingPlan(id, data) {
  const plan = await updateDocument(collections.pricingPlans, id, {
    name: data.name.trim(), badge: data.badge.trim(), price: Number(data.price),
    billingPeriod: String(data.billingPeriod || 'month').trim(), image: data.image,
    features: data.features, buttonText: data.buttonText.trim(), featured: Boolean(data.featured),
    active: data.active !== false, displayOrder: Number(data.displayOrder || 0)
  });
  return plan ? pricingPlanView(plan) : null;
}

async function deletePricingPlan(id) {
  const plan = await getById(collections.pricingPlans, id);
  if (!plan) return false;
  const [assignments, requests] = await Promise.all([
    allWhere(collections.customerPackages, 'pricingPlanId', Number(id)),
    allWhere(collections.customerPackageRequests, 'pricingPlanId', Number(id))
  ]);
  if (assignments.length || requests.length) {
    await updateDocument(collections.pricingPlans, id, { active: false, archived: true });
    return true;
  }
  await deleteDocument(collections.pricingPlans, id);
  return true;
}

async function selectCustomerPackage(userId, pricingPlanId) {
  const customerId = Number(userId);
  const planId = Number(pricingPlanId);
  if (!Number.isInteger(planId) || planId <= 0) {
    const error = new Error('Select a valid service package.');
    error.status = 400;
    throw error;
  }

  const customerRef = docRef(collections.users, customerId);
  const planRef = docRef(collections.pricingPlans, planId);
  const packageRef = docRef(collections.customerPackages, customerId);
  const result = await db.runTransaction(async (transaction) => {
    const [customerSnapshot, planSnapshot, currentSnapshot] = await Promise.all([
      transaction.get(customerRef),
      transaction.get(planRef),
      transaction.get(packageRef)
    ]);
    const customer = customerSnapshot.data();
    const plan = planSnapshot.data();
    if (!customerSnapshot.exists || customer?.role !== 'customer') {
      const error = new Error('Customer profile not found.');
      error.status = 404;
      throw error;
    }
    if (!planSnapshot.exists || plan?.active === false || plan?.archived === true) {
      const error = new Error('The selected package is not currently available.');
      error.status = 404;
      throw error;
    }
    const current = currentSnapshot.exists ? currentSnapshot.data() : null;
    const unchanged = Number(current?.pricingPlanId) === planId && current?.status === 'active';
    if (!unchanged) {
      transaction.set(packageRef, {
        id: customerId,
        userId: customerId,
        pricingPlanId: planId,
        packageName: plan.name || 'Service Plan',
        badge: plan.badge || '',
        price: Number(plan.price || 0),
        billingPeriod: plan.billingPeriod || 'service',
        benefits: Array.isArray(plan.features) ? plan.features.filter(Boolean) : [],
        status: 'active',
        activatedAt: fieldValue(),
        updatedAt: fieldValue()
      }, { merge: true });
    }
    return { changed: !unchanged, planName: plan.name || 'Service Plan' };
  });

  const selected = await getById(collections.customerPackages, customerId);
  const plan = await getById(collections.pricingPlans, selected.pricingPlanId);
  if (result.changed) {
    await createUserNotification(
      customerId,
      'Package Activated',
      `${result.planName} is now your active package. Its listed benefits have been applied to your account.`
    );
  }
  return { ...customerPackageView(selected, plan), changed: result.changed };
}

async function requestCustomerPackage(userId, pricingPlanId, paymentMethod = '', paymentProof = {}) {
  const customerId = Number(userId);
  const planId = Number(pricingPlanId);
  const [customer, plan, existingRequests] = await Promise.all([
    getById(collections.users, customerId),
    getById(collections.pricingPlans, planId),
    allWhere(collections.customerPackageRequests, 'userId', customerId)
  ]);
  if (!customer || customer.role !== 'customer') {
    const error = new Error('Customer profile not found.');
    error.status = 404;
    throw error;
  }
  if (!plan || plan.active === false || plan.archived === true) {
    const error = new Error('The selected package is not currently available.');
    error.status = 404;
    throw error;
  }
  const price = Number(plan.price || 0);
  const method = price <= 0 ? 'Free' : titleCase(paymentMethod);
  if (price > 0 && !['Online', 'Cashier'].includes(method)) {
    const error = new Error('Choose online payment or payment at the cashier.');
    error.status = 400;
    throw error;
  }
  const paymentProofUrl = String(paymentProof.url || '').trim();
  const paymentProofName = String(paymentProof.name || '').trim().slice(0, 180);
  if (price > 0 && method === 'Online' && !paymentProofUrl) {
    const error = new Error('Upload the bank payment receipt before submitting this request.');
    error.status = 400;
    throw error;
  }
  const openRequest = existingRequests.find((request) => (
    Number(request.pricingPlanId) === planId
    && !['Approved', 'Rejected', 'Cancelled'].includes(request.status)
  ));
  if (openRequest) {
    const error = new Error('You already have a pending request for this package.');
    error.status = 409;
    throw error;
  }

  const request = await createDocument(collections.customerPackageRequests, {
    userId: customerId,
    pricingPlanId: planId,
    packageName: plan.name,
    badge: plan.badge || '',
    price,
    billingPeriod: plan.billingPeriod || 'service',
    benefits: Array.isArray(plan.features) ? plan.features.filter(Boolean) : [],
    paymentMethod: method,
    paymentStatus: price <= 0 ? 'Not Required' : method === 'Online' ? 'Pending Verification' : 'Unpaid',
    status: price <= 0 ? 'Pending Approval' : method === 'Online' ? 'Payment Proof Submitted' : 'Awaiting Cashier Payment',
    paymentProofUrl: method === 'Online' ? paymentProofUrl : '',
    paymentProofName: method === 'Online' ? paymentProofName : '',
    paymentSubmittedAt: method === 'Online' ? fieldValue() : null,
    requestedAt: fieldValue()
  });
  await notifyAdmins(
    'Package Approval Requested',
    `${customer.name} requested ${plan.name}${method === 'Online' ? ' and uploaded a bank payment receipt' : price > 0 ? ' for cashier payment' : ' as a free package'}.`
  );
  return packageRequestView(
    request,
    new Map([[customerId, customer]]),
    new Map([[planId, plan]])
  );
}

async function confirmCustomerPackageCashierPayment(adminUserId, requestId) {
  const request = await getById(collections.customerPackageRequests, requestId);
  if (!request) {
    const error = new Error('Package request not found.');
    error.status = 404;
    throw error;
  }
  if (request.paymentMethod !== 'Cashier' || Number(request.price || 0) <= 0) {
    const error = new Error('This request does not require a cashier payment.');
    error.status = 400;
    throw error;
  }
  await updateDocument(collections.customerPackageRequests, request.id, {
    paymentStatus: 'Paid',
    status: 'Pending Approval',
    paidAt: fieldValue(),
    paidByUserId: Number(adminUserId)
  });
  await createUserNotification(
    request.userId,
    'Cashier Payment Recorded',
    `Cashier payment for ${request.packageName} was recorded. Your package is waiting for administrator approval.`
  );
  return packageRequestView(await getById(collections.customerPackageRequests, request.id));
}

async function markInvoicePaid(id, adminUserId) {
  const invoice = await getById(collections.invoices, id);
  if (!invoice) return null;
  await updateDocument(collections.invoices, id, {
    paymentStatus: 'Paid',
    paidAt: fieldValue(),
    paidByUserId: Number(adminUserId)
  });
  if (invoice.packageRequestId) {
    await updateDocument(collections.customerPackageRequests, invoice.packageRequestId, {
      paymentStatus: 'Paid',
      status: 'Pending Approval',
      paidAt: fieldValue()
    });
    await createUserNotification(invoice.userId, 'Cashier Payment Recorded', `Payment for invoice #INV-${id} was recorded. Your package is waiting for administrator approval.`);
  }
  return getById(collections.invoices, id);
}

async function reviewCustomerPackageRequest(adminUserId, requestId, decision, rejectionReason = '') {
  const request = await getById(collections.customerPackageRequests, requestId);
  if (!request) {
    const error = new Error('Package request not found.');
    error.status = 404;
    throw error;
  }
  if (!['Approve', 'Reject'].includes(decision)) {
    const error = new Error('Choose Approve or Reject.');
    error.status = 400;
    throw error;
  }
  if (decision === 'Approve' && Number(request.price || 0) > 0) {
    const onlineProofReady = request.paymentMethod === 'Online'
      && Boolean(request.paymentProofUrl)
      && ['Pending Verification', 'Paid'].includes(request.paymentStatus);
    const cashierReady = request.paymentMethod === 'Cashier' && request.paymentStatus === 'Paid';
    if (!onlineProofReady && !cashierReady) {
      const error = new Error(request.paymentMethod === 'Online'
        ? 'Review the uploaded payment receipt before approval.'
        : 'Record the cashier payment before approval.');
      error.status = 409;
      throw error;
    }
  }
  if (decision === 'Reject') {
    const reason = String(rejectionReason || '').trim();
    if (reason.length < 3) {
      const error = new Error('Add a rejection reason.');
      error.status = 400;
      throw error;
    }
    await updateDocument(collections.customerPackageRequests, request.id, {
      status: 'Rejected',
      rejectionReason: reason,
      reviewedByUserId: Number(adminUserId),
      reviewedAt: fieldValue()
    });
    await createUserNotification(request.userId, 'Package Request Rejected', `${request.packageName} was not approved: ${reason}`);
    return packageRequestView(await getById(collections.customerPackageRequests, request.id));
  }

  const packageRef = docRef(collections.customerPackages, request.userId);
  await packageRef.set({
    id: Number(request.userId),
    userId: Number(request.userId),
    pricingPlanId: Number(request.pricingPlanId),
    packageName: request.packageName,
    badge: request.badge || '',
    price: Number(request.price || 0),
    billingPeriod: request.billingPeriod || 'service',
    benefits: Array.isArray(request.benefits) ? request.benefits.filter(Boolean) : [],
    status: 'active',
    activatedAt: fieldValue(),
    approvedByUserId: Number(adminUserId),
    packageRequestId: request.id,
    updatedAt: fieldValue()
  }, { merge: true });
  await updateDocument(collections.customerPackageRequests, request.id, {
    status: 'Approved',
    paymentStatus: Number(request.price || 0) > 0 ? 'Paid' : 'Not Required',
    approvedAt: fieldValue(),
    reviewedByUserId: Number(adminUserId)
  });
  await createUserNotification(request.userId, 'Package Approved', `${request.packageName} is now active and its benefits have been applied to your account.`);
  return packageRequestView(await getById(collections.customerPackageRequests, request.id));
}

function partView(part) {
  const stock = Number(part.stock ?? part.stockQuantity ?? 0);
  const minimumStockLevel = Number(part.minimumStockLevel ?? part.minStock ?? 0);
  const sellingPrice = Number(part.sellingPrice ?? part.unitPrice ?? 0);
  const purchasePrice = Number(part.purchasePrice || 0);
  return {
    id: part.id,
    itemCode: part.itemCode || part.sku || '',
    name: part.name || part.partName || '',
    partName: part.partName || part.name || '',
    category: part.category || '',
    brand: part.brand || '',
    manufacturer: part.manufacturer || '',
    supplierId: part.supplierId || null,
    supplier: part.supplier || '',
    description: part.description || '',
    purchasePrice,
    sellingPrice,
    stock,
    stockQuantity: stock,
    minimumStockLevel,
    location: part.location || '',
    warrantyPeriod: part.warrantyPeriod || '',
    warrantyProvider: part.warrantyProvider || part.supplier || '',
    status: inventoryStockStatus(stock, part.status, minimumStockLevel),
    inventoryValue: stock * purchasePrice,
    retailValue: stock * sellingPrice,
    image: part.image || ''
  };
}

function inventoryStockStatus(stock, currentStatus = 'Active', minimumStockLevel = 0) {
  if (currentStatus === 'Inactive') return 'Inactive';
  if (Number(stock) <= 0) return 'Out of Stock';
  const alertLevel = Number(minimumStockLevel) > 0 ? Number(minimumStockLevel) : lowStockThreshold;
  if (Number(stock) <= alertLevel) return 'Low Stock';
  return 'Active';
}

function bookingView(booking, serviceById) {
  const service = serviceById.get(Number(booking.servicePackageId));
  return {
    id: booking.id,
    customerId: booking.userId,
    vehicleId: booking.vehicleId,
    service: service?.name || booking.serviceName || 'Unknown Service',
    date: formatDate(booking.bookingDate),
    time: String(booking.bookingTime || '').slice(0, 5),
    status: booking.status,
    queue: booking.queuePosition || 0,
    progress: booking.progress || 0,
    cancelReason: booking.cancelReason || '',
    cancelledAt: formatDate(booking.cancelledAt),
    cancelledByUserId: booking.cancelledByUserId || null,
    assignedTechnicianId: booking.assignedTechnicianId || null,
    serviceBayId: booking.serviceBayId || null,
    serviceBayName: booking.serviceBayName || (booking.serviceBayId ? bayLabel(booking.serviceBayId) : ''),
    durationMinutes: Number(booking.durationMinutes || parseDurationMinutes(service?.duration)),
    startAt: booking.startAt || '',
    endAt: booking.endAt || ''
  };
}

function serviceJobView(job, context = {}) {
  const booking = context.bookingsById?.get(Number(job.bookingId));
  const vehicle = context.vehiclesById?.get(Number(job.vehicleId));
  const customer = context.usersById?.get(Number(job.customerId));
  const technician = context.techniciansById?.get(Number(job.assignedTechnicianId));
  const technicianUser = technician ? context.usersById?.get(Number(technician.userId)) : null;

  return {
    id: job.id,
    bookingId: job.bookingId,
    vehicleId: job.vehicleId,
    customerId: job.customerId,
    assignedTechnicianId: job.assignedTechnicianId || null,
    serviceType: job.serviceType,
    priority: job.priority || 'Normal',
    status: job.status || 'Pending',
    accepted: Boolean(job.acceptedAt),
    progress: Number(job.progress || 0),
    startDate: formatDate(job.startDate),
    expectedCompletionDate: formatDate(job.expectedCompletionDate),
    completionDate: formatDate(job.completionDate),
    assignedDate: formatDate(job.assignedDate || job.createdAt),
    bookingDate: formatDate(booking?.bookingDate),
    bookingTime: String(booking?.bookingTime || '').slice(0, 5),
    vehicleNumber: vehicle?.plateNumber || '',
    vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}`.trim() : 'Unknown vehicle',
    customerName: customer?.name || 'Unknown customer',
    customerPhone: customer?.phone || '',
    customerEmail: customer?.email || '',
    technicianName: technicianUser?.name || technician?.name || 'Unassigned',
    beforeImages: Array.isArray(job.beforeImages) ? job.beforeImages : [],
    afterImages: Array.isArray(job.afterImages) ? job.afterImages : [],
    damageImages: Array.isArray(job.damageImages) ? job.damageImages : [],
    completedImages: Array.isArray(job.completedImages) ? job.completedImages : []
  };
}

function fileView(file, kind = 'photo') {
  const id = Number(file.id);
  return {
    id,
    kind,
    serviceJobId: file.serviceJobId || null,
    vehicleId: file.vehicleId || null,
    customerId: file.customerId || null,
    technicianId: file.technicianId || null,
    photoType: file.photoType || '',
    documentType: file.documentType || '',
    fileName: file.fileName || '',
    fileUrl: `/api/files/${kind}/${id}/download`,
    previewUrl: `/api/files/${kind}/${id}/download`,
    description: file.description || '',
    uploadedBy: file.uploadedBy || '',
    uploadedAt: formatDate(file.uploadedAt || file.createdAt),
    mimeType: file.mimeType || '',
    sizeBytes: Number(file.sizeBytes || 0)
  };
}

function invoiceView(invoice, serviceById) {
  const service = serviceById.get(Number(invoice.servicePackageId));
  return {
    id: invoice.id,
    customerId: invoice.userId,
    serviceJobId: invoice.serviceJobId || null,
    service: service?.name || invoice.serviceName || 'Unknown Service',
    invoiceType: invoice.invoiceType || 'Service',
    packageRequestId: invoice.packageRequestId || null,
    pricingPlanId: invoice.pricingPlanId || null,
    amount: Number(invoice.amount),
    partsTotal: Number(invoice.partsTotal || 0),
    laborCost: Number(invoice.laborCost || 0),
    serviceCharges: Number(invoice.serviceCharges || 0),
    tax: Number(invoice.tax || 0),
    discount: Number(invoice.discount || 0),
    payment: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod || '',
    date: formatDate(invoice.invoiceDate),
    customerSignature: invoice.customerSignature || '',
    mechanicSignature: invoice.mechanicSignature || ''
  };
}

async function servicesById() {
  const services = await all(collections.servicePackages);
  return new Map(services.map((service) => [Number(service.id), service]));
}

async function dashboardContext() {
  const [users, vehicles, bookings, technicians] = await Promise.all([
    all(collections.users),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.technicians)
  ]);

  return {
    users,
    vehicles,
    bookings,
    technicians,
    usersById: new Map(users.map((user) => [Number(user.id), user])),
    vehiclesById: new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle])),
    bookingsById: new Map(bookings.map((booking) => [Number(booking.id), booking])),
    techniciansById: new Map(technicians.map((technician) => [Number(technician.id), technician]))
  };
}

async function adminUsers() {
  return allWhere(collections.users, 'role', 'admin');
}

async function createUserNotification(userId, type, message) {
  return createDocument(collections.notifications, {
    userId: asId(userId),
    type,
    message,
    unread: true
  });
}

function vehicleNotificationLabel(vehicle) {
  return [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(Boolean)
    .join(' ')
    .trim() || vehicle?.name || 'vehicle';
}

function bookingNotificationMessage(action, booking, service, vehicle) {
  const vehicleText = vehicle ? `${vehicleNotificationLabel(vehicle)} (${vehicle.plateNumber})` : 'your vehicle';
  const serviceText = service?.name || 'service';
  return `${action}: ${serviceText} for ${vehicleText} on ${booking.bookingDate} at ${booking.bookingTime}.`;
}

async function markCustomerNotificationRead(userId, notificationId) {
  return markUserNotificationRead(userId, notificationId);
}

async function markUserNotificationRead(userId, notificationId) {
  const notification = await getById(collections.notifications, notificationId);
  if (!notification || Number(notification.userId) !== Number(userId)) return null;
  return updateDocument(collections.notifications, notificationId, { unread: false });
}

async function markAllCustomerNotificationsRead(userId) {
  return markAllUserNotificationsRead(userId);
}

async function markAllUserNotificationsRead(userId) {
  const notifications = await allWhere(collections.notifications, 'userId', Number(userId));
  const owned = notifications.filter((item) => item.unread);
  await Promise.all(owned.map((item) => updateDocument(collections.notifications, item.id, { unread: false })));
  return { updated: owned.length };
}

async function getUserNotifications(userId) {
  const notifications = await allWhere(collections.notifications, 'userId', Number(userId));
  return sortById(notifications)
    .reverse()
    .map(({ id, type, message, unread }) => ({ id, type, message, unread }));
}

function sentNotificationView(notification, usersById) {
  const recipient = usersById.get(Number(notification.userId));
  return {
    id: notification.id,
    userId: notification.userId,
    recipientName: recipient?.name || 'Unknown recipient',
    recipientRole: notification.recipientRole || recipient?.role || '',
    type: notification.type,
    message: notification.message,
    delivered: true
  };
}

function notificationDraftView(draft, usersById) {
  const recipient = usersById.get(Number(draft.userId));
  return {
    id: draft.id,
    userId: draft.userId,
    recipientName: recipient?.name || 'Unknown recipient',
    recipientRole: draft.recipientRole || recipient?.role || '',
    type: draft.type,
    message: draft.message
  };
}

async function getAdminMessageCenter(userId) {
  const numericUserId = Number(userId);
  const [received, sent, drafts] = await Promise.all([
    allWhere(collections.notifications, 'userId', numericUserId),
    allWhere(collections.notifications, 'senderUserId', numericUserId),
    allWhere(collections.notificationDrafts, 'createdByUserId', numericUserId)
  ]);
  const recipientIds = [...new Set([...sent, ...drafts].map((item) => Number(item.userId)).filter(Boolean))];
  const users = (await Promise.all(recipientIds.map((id) => getById(collections.users, id)))).filter(Boolean);
  const usersById = new Map(users.map((user) => [Number(user.id), user]));
  return {
    received: sortById(received)
      .reverse()
      .map(({ id, type, message, unread }) => ({ id, type, message, unread })),
    sent: sortById(sent)
      .reverse()
      .map((item) => sentNotificationView(item, usersById)),
    drafts: sortById(drafts)
      .reverse()
      .map((item) => notificationDraftView(item, usersById))
  };
}

async function notifyAdmins(type, message) {
  const admins = await adminUsers();
  await Promise.all(admins.map((user) => createUserNotification(user.id, type, message)));
}

async function getTechnicianByUserId(userId) {
  const technicians = await allWhere(collections.technicians, 'userId', Number(userId));
  return technicians[0] || null;
}

async function assertTechnician(id, requireActive = true) {
  const technician = await getById(collections.technicians, id);
  if (!technician) {
    const error = new Error('Technician not found.');
    error.status = 404;
    throw error;
  }

  if (requireActive && String(technician.status || '').toLowerCase() !== 'active') {
    const error = new Error('Only active technicians can be assigned to jobs.');
    error.status = 400;
    throw error;
  }

  return technician;
}

function assertServiceJobStatus(status) {
  if (!serviceJobStatuses.includes(status)) {
    const error = new Error('Invalid service job status.');
    error.status = 400;
    throw error;
  }
}

async function findServiceByName(name, activeOnly = false) {
  const services = await allWhere(collections.servicePackages, 'name', String(name || '').trim());
  return services.find((service) => !activeOnly || service.active !== false) || null;
}

function landingContentView(settings = {}) {
  return Object.fromEntries(Object.entries(landingContentDefaults).map(([section, defaults]) => {
    const savedItems = Array.isArray(settings[section]) ? settings[section] : [];
    return [section, defaults.map((fallback, index) => ({
      ...fallback,
      ...(savedItems[index] || {}),
      slot: index
    }))];
  }));
}

async function getLandingContentSettings() {
  assertFirebaseConfigured();
  return cachedRead('settings:landing-content', publicProjectionCacheMs.landingContent, async () => {
    const entries = Object.entries(landingContentDefaults).flatMap(([section, items]) => items.map((_, slot) => ({ section, slot })));
    const snapshots = await Promise.all(entries.map(({ section, slot }) => (
      db.collection(collections.appSettings).doc(`${landingContentDocumentPrefix}-${section}-${slot}`).get()
    )));
    return entries.reduce((settings, entry, index) => {
      if (!settings[entry.section]) settings[entry.section] = [];
      if (snapshots[index].exists) settings[entry.section][entry.slot] = snapshots[index].data();
      return settings;
    }, {});
  });
}

async function findUserByEmailRole(email, role) {
  assertFirebaseConfigured();
  const snapshot = await db.collection(collections.users)
    .where('emailLower', '==', emailKey(email))
    .where('role', '==', role)
    .limit(1)
    .get();

  return snapshot.empty ? null : { id: Number(snapshot.docs[0].id), ...snapshot.docs[0].data() };
}

async function emailExists(email, ignoreId) {
  const snapshot = await db.collection(collections.users)
    .where('emailLower', '==', emailKey(email))
    .limit(1)
    .get();

  if (snapshot.empty) return false;
  return Number(snapshot.docs[0].id) !== Number(ignoreId);
}

async function ensureUserByEmailRole({ id, role, name, email, phone = '', passwordHash, status = 'active', syncPassword = false }) {
  assertFirebaseConfigured();
  const existing = await findUserByEmailRole(email, role);
  if (existing) {
    if (syncPassword) {
      await updateDocument(collections.users, existing.id, {
        name,
        phone: String(phone || '').trim(),
        passwordHash,
        status: String(status || 'active').toLowerCase()
      });
    }
    return existing;
  }

  const preferredRef = docRef(collections.users, id);
  const preferredSnapshot = await preferredRef.get();
  const userData = {
    role,
    name,
    email: emailKey(email),
    emailLower: emailKey(email),
    phone: String(phone || '').trim(),
    passwordHash,
    status: String(status || 'active').toLowerCase()
  };

  if (!preferredSnapshot.exists) {
    await preferredRef.set({ ...userData, id, createdAt: fieldValue() });
    return { id, ...userData };
  }

  return createDocument(collections.users, userData);
}

async function createUser({ role, name, email, phone = '', passwordHash, status = 'active', profileImage = '' }) {
  if (await emailExists(email)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }

  const user = await createDocument(collections.users, {
    role,
    name: name.trim(),
    email: emailKey(email),
    emailLower: emailKey(email),
    phone: String(phone || '').trim(),
    passwordHash,
    status: String(status || 'active').toLowerCase(),
    profileImage: String(profileImage || '')
  });

  return publicUser(user);
}

async function getCustomerDashboard(userId) {
  const customerId = Number(userId);
  const [user, vehicles, bookings, invoices, notifications, serviceMap, jobs, pricingPlans, selectedPackage, packageRequests, companySettingsSnapshot] = await Promise.all([
    getById(collections.users, userId),
    allWhere(collections.vehicles, 'userId', customerId),
    allWhere(collections.bookings, 'userId', customerId),
    allWhere(collections.invoices, 'userId', customerId),
    allWhere(collections.notifications, 'userId', customerId),
    servicesById(),
    allWhere(collections.serviceJobs, 'customerId', customerId),
    all(collections.pricingPlans),
    getById(collections.customerPackages, customerId),
    allWhere(collections.customerPackageRequests, 'userId', customerId),
    db.collection(collections.appSettings).doc(companySettingsDocument).get()
  ]);

  const packages = Array.from(serviceMap.values())
    .filter((service) => service.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((service) => service.name);

  if (!user || user.role !== 'customer') {
    const error = new Error('Customer profile not found.');
    error.status = 404;
    throw error;
  }

  const customerJobs = jobs;
  const customerJobIds = new Set(customerJobs.map((job) => Number(job.id)));
  const [usages, images, jobDocuments, customerDocuments] = await Promise.all([
    allWhereAny(collections.serviceJobParts, 'serviceJobId', [...customerJobIds]),
    allWhereAny(collections.serviceImages, 'serviceJobId', [...customerJobIds]),
    allWhereAny(collections.documents, 'serviceJobId', [...customerJobIds]),
    allWhere(collections.documents, 'customerId', customerId)
  ]);
  const documents = [...new Map([...jobDocuments, ...customerDocuments].map((document) => [document.id, document])).values()];
  const partIds = usages.map((usage) => Number(usage.partId));
  const parts = (await Promise.all([...new Set(partIds)].map((id) => getById(collections.inventoryParts, id)))).filter(Boolean);
  const context = {
    usersById: new Map([[Number(user.id), user]]),
    vehiclesById: new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle])),
    jobsById: new Map(customerJobs.map((job) => [Number(job.id), job])),
    partsById: new Map(parts.map((part) => [Number(part.id), part])),
    techniciansById: new Map()
  };

  return {
    profile: { name: user.name, email: user.email, phone: user.phone || '', avatar: user.avatar || user.profileImage || '', profileImage: user.profileImage || user.avatar || '' },
    vehicles: sortById(vehicles.filter((vehicle) => vehicle.archived !== true)).map(vehicleView),
    bookings: sortDateDesc(bookings.filter((booking) => booking.hiddenForCustomer !== true).map((item) => bookingView(item, serviceMap)), 'date', 'time'),
    invoices: sortDateDesc(invoices.map((item) => invoiceView(item, serviceMap)), 'date'),
    notifications: sortById(notifications).reverse().map(({ id, type, message, unread }) => ({ id, type, message, unread })),
    usedParts: sortById(usages).reverse().map((usage) => usageView(usage, context)),
    serviceImages: sortById(images).reverse().map((image) => fileView(image, 'photo')),
    documents: sortById(documents).reverse().map((document) => fileView(document, 'document')),
    packages,
    pricingPlans: pricingPlans
      .map(pricingPlanView)
      .filter((plan) => plan.active)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
    currentPackage: customerPackageView(
      selectedPackage,
      pricingPlans.find((plan) => Number(plan.id) === Number(selectedPackage?.pricingPlanId))
    ),
    packageRequests: sortById(packageRequests).reverse().map((request) => packageRequestView(
      request,
      new Map([[customerId, user]]),
      new Map(pricingPlans.map((plan) => [Number(plan.id), plan]))
    )),
    paymentBankDetails: {
      bankName: companySettingsSnapshot.data()?.bankName || process.env.BANK_NAME || 'Commercial Bank of Ceylon',
      accountName: companySettingsSnapshot.data()?.bankAccountName || process.env.BANK_ACCOUNT_NAME || 'AutoCare Service Station',
      accountNumber: companySettingsSnapshot.data()?.bankAccountNumber || process.env.BANK_ACCOUNT_NUMBER || 'Contact AutoCare',
      branch: companySettingsSnapshot.data()?.bankBranch || process.env.BANK_BRANCH || 'Colombo'
    },
    companySettings: companySettingsSnapshot.exists ? companySettingsSnapshot.data() : {}
  };
}

function buildTechnicianWorkload(technicians, jobs, usersById) {
  return technicians.map((technician) => {
    const assigned = jobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id));
    const active = assigned.filter((job) => !['Completed', 'Cancelled'].includes(job.status));
    return {
      technicianId: technician.id,
      name: usersById.get(Number(technician.userId))?.name || technician.name || 'Unknown technician',
      specialization: technician.specialization,
      activeJobs: active.length,
      pendingJobs: active.filter((job) => job.status === 'Assigned' || job.status === 'Pending').length,
      inProgressJobs: active.filter((job) => job.status === 'In Progress').length,
      waitingForParts: active.filter((job) => job.status === 'Waiting For Parts').length,
      completedJobs: assigned.filter((job) => job.status === 'Completed').length
    };
  });
}

function buildTechnicianPerformance(technicians, jobs, usersById) {
  return technicians.map((technician) => {
    const completed = jobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id) && job.status === 'Completed');
    const totalDays = completed.reduce((sum, job) => {
      if (!job.startDate || !job.completionDate) return sum;
      const start = new Date(job.startDate);
      const end = new Date(job.completionDate);
      return sum + Math.max(1, Math.ceil((end - start) / 86400000));
    }, 0);

    return {
      technicianId: technician.id,
      name: usersById.get(Number(technician.userId))?.name || technician.name || 'Unknown technician',
      jobsCompleted: completed.length,
      totalServicesCompleted: completed.length,
      activeJobs: jobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id) && !['Completed', 'Cancelled'].includes(job.status)).length,
      averageCompletionDays: completed.length ? Math.round((totalDays / completed.length) * 10) / 10 : 0,
      customerRating: 0
    };
  });
}

function movementView(movement, partsById = new Map(), techniciansById = new Map(), usersById = new Map(), jobsById = new Map()) {
  const part = partsById.get(Number(movement.partId));
  const technician = techniciansById.get(Number(movement.technicianId || movement.usedByTechnician));
  const technicianUser = technician ? usersById.get(Number(technician.userId)) : null;
  const job = jobsById.get(Number(movement.serviceJobId));
  return {
    id: movement.id,
    partId: movement.partId,
    partName: movement.partName || part?.partName || part?.name || 'Unknown part',
    itemCode: movement.itemCode || part?.itemCode || part?.sku || '',
    serviceJobId: movement.serviceJobId || null,
    technicianId: movement.technicianId || movement.usedByTechnician || null,
    technicianName: technicianUser?.name || 'System',
    vehicleId: movement.vehicleId || job?.vehicleId || null,
    customerId: movement.customerId || job?.customerId || null,
    type: movement.type,
    quantity: Number(movement.quantity || 0),
    condition: movement.condition || '',
    unitPrice: Number(movement.unitPrice || 0),
    totalPrice: Number(movement.totalPrice || 0),
    note: movement.note || '',
    createdAt: formatDate(movement.createdAt)
  };
}

function usageView(usage, context = {}) {
  const part = context.partsById?.get(Number(usage.partId));
  const job = context.jobsById?.get(Number(usage.serviceJobId));
  const vehicle = job ? context.vehiclesById?.get(Number(job.vehicleId)) : null;
  const customer = job ? context.usersById?.get(Number(job.customerId)) : null;
  const technician = context.techniciansById?.get(Number(usage.usedByTechnician));
  const technicianUser = technician ? context.usersById?.get(Number(technician.userId)) : null;
  const unitPrice = Number(usage.unitPrice ?? part?.sellingPrice ?? part?.unitPrice ?? 0);
  const quantity = Number(usage.quantity || 0);
  return {
    id: usage.id,
    serviceJobId: usage.serviceJobId,
    partId: usage.partId,
    itemCode: usage.itemCode || part?.itemCode || part?.sku || '',
    partName: usage.partName || part?.partName || part?.name || 'Unknown part',
    brand: usage.brand || part?.brand || '',
    condition: usage.condition || 'Brand New',
    quantity,
    unitPrice,
    totalPrice: Number(usage.totalPrice ?? quantity * unitPrice),
    warrantyProvider: usage.warrantyProvider || part?.warrantyProvider || part?.supplier || '',
    warrantyPeriod: usage.warrantyPeriod || part?.warrantyPeriod || '',
    warrantyStartDate: formatDate(usage.warrantyStartDate),
    warrantyExpiryDate: formatDate(usage.warrantyExpiryDate),
    usedByTechnician: usage.usedByTechnician,
    technicianName: technicianUser?.name || 'Unknown technician',
    vehicleId: job?.vehicleId || null,
    vehicleNumber: vehicle?.plateNumber || '',
    vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}`.trim() : '',
    customerId: job?.customerId || null,
    customerName: customer?.name || '',
    note: usage.note || '',
    photoUrl: usage.photoUrl || '',
    photoFileName: usage.photoFileName || '',
    photoMimeType: usage.photoMimeType || '',
    photoSizeBytes: Number(usage.photoSizeBytes || 0)
  };
}

function buildInventoryReports(parts, movements, usages, context = {}) {
  const partViews = parts.map(partView);
  const lowStock = partViews.filter((part) => part.stock > 0 && part.stock <= lowStockThreshold);
  const outOfStock = partViews.filter((part) => part.stock <= 0);
  const totalPurchaseValue = partViews.reduce((sum, part) => sum + part.inventoryValue, 0);
  const totalRetailValue = partViews.reduce((sum, part) => sum + part.retailValue, 0);
  const usageViews = usages.map((usage) => usageView(usage, context));
  const month = today().slice(0, 7);
  return {
    inventory: partViews,
    lowStock,
    outOfStock,
    stockMovements: sortById(movements).reverse().map((movement) => movementView(movement, context.partsById, context.techniciansById, context.usersById, context.jobsById)),
    technicianUsage: usageViews,
    vehicleParts: usageViews,
    monthlyUsage: usageViews.filter((usage) => String(usage.warrantyStartDate || '').startsWith(month)),
    inventoryValue: {
      totalPurchaseValue,
      totalRetailValue,
      itemCount: partViews.length,
      stockUnits: partViews.reduce((sum, part) => sum + part.stock, 0)
    }
  };
}

async function getAdminDashboard(userId) {
  assertFirebaseConfigured();
  const [users, vehicles, bookings, packages, pricingPlans, packageRequests, invoices, emergencies, notifications, notificationDrafts, feedback, technicians, serviceJobs, inventoryParts, suppliers, categories, movements, usages, photos, documents, landingStatsSnapshot, landingContentSettings, companySettingsSnapshot] = await Promise.all([
    all(collections.users),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.servicePackages),
    all(collections.pricingPlans),
    all(collections.customerPackageRequests),
    all(collections.invoices),
    all(collections.emergencyRequests),
    all(collections.notifications),
    all(collections.notificationDrafts),
    all(collections.feedback),
    all(collections.technicians),
    all(collections.serviceJobs),
    all(collections.inventoryParts),
    all(collections.inventorySuppliers),
    all(collections.inventoryCategories),
    all(collections.inventoryMovements),
    all(collections.serviceJobParts),
    all(collections.serviceImages),
    all(collections.documents),
    db.collection(collections.appSettings).doc(landingStatsDocument).get(),
    getLandingContentSettings(),
    db.collection(collections.appSettings).doc(companySettingsDocument).get()
  ]);

  const serviceMap = new Map(packages.map((service) => [Number(service.id), service]));
  const context = {
    usersById: new Map(users.map((user) => [Number(user.id), user])),
    vehiclesById: new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle])),
    bookingsById: new Map(bookings.map((booking) => [Number(booking.id), booking])),
    techniciansById: new Map(technicians.map((technician) => [Number(technician.id), technician])),
    jobsById: new Map(serviceJobs.map((job) => [Number(job.id), job])),
    partsById: new Map(inventoryParts.map((part) => [Number(part.id), part]))
  };
  const visibleTechnicians = technicians.filter((technician) => technician.archived !== true);
  const visibleInventoryParts = inventoryParts.filter((part) => part.archived !== true);
  const jobViews = sortById(serviceJobs).map((item) => serviceJobView(item, context));
  const inventoryReports = buildInventoryReports(visibleInventoryParts, movements, usages, context);

  return {
    profile: publicUser(context.usersById.get(Number(userId))),
    customers: sortById(users.filter((user) => user.role === 'customer' && user.archived !== true)).map(customerView),
    technicians: sortById(visibleTechnicians).map((technician) => technicianView(technician, context.usersById.get(Number(technician.userId)))),
    vehicles: sortById(vehicles.filter((vehicle) => vehicle.archived !== true)).map(vehicleView),
    bookings: sortDateDesc(bookings.map((item) => ({
      ...bookingView(item, serviceMap),
      customerName: context.usersById.get(Number(item.userId))?.name || 'Unknown customer',
      vehicleName: vehicleNotificationLabel(context.vehiclesById.get(Number(item.vehicleId))),
      vehicleNumber: context.vehiclesById.get(Number(item.vehicleId))?.plateNumber || ''
    })), 'date', 'time'),
    serviceJobs: jobViews,
    inventoryParts: sortById(visibleInventoryParts).map(partView),
    inventorySuppliers: sortById(suppliers.filter((supplier) => supplier.archived !== true)),
    inventoryCategories: sortById(categories),
    stockMovements: inventoryReports.stockMovements,
    partUsageHistory: inventoryReports.technicianUsage,
    servicePhotos: sortById(photos).reverse().map((photo) => fileView(photo, 'photo')),
    documents: sortById(documents).reverse().map((document) => fileView(document, 'document')),
    inventoryReports,
    technicianWorkload: buildTechnicianWorkload(visibleTechnicians, jobViews, context.usersById),
    technicianPerformance: buildTechnicianPerformance(visibleTechnicians, jobViews, context.usersById),
    packages: sortById(packages.filter((service) => service.archived !== true)).map(({ id, name, price, duration, description, image }) => ({ id, name, price: Number(price), duration, description, image: image || defaultServiceImage })),
    pricingPlans: pricingPlans.map(pricingPlanView).sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
    packageRequests: sortById(packageRequests).reverse().map((request) => packageRequestView(
      request,
      context.usersById,
      new Map(pricingPlans.map((plan) => [Number(plan.id), plan]))
    )),
    invoices: sortDateDesc(invoices.map((item) => invoiceView(item, serviceMap)), 'date'),
    emergencies: sortById(emergencies).reverse().map(({ id, userId, customerId, location, problem, status }) => ({ id, customerId: customerId || userId, location, problem, status })),
    notifications: sortById(notifications.filter((item) => Number(item.userId) === Number(userId))).reverse().map(({ id, type, message, unread }) => ({ id, type, message, unread })),
    sentNotifications: sortById(notifications.filter((item) => Number(item.senderUserId) === Number(userId))).reverse().map((item) => sentNotificationView(item, context.usersById)),
    notificationDrafts: sortById(notificationDrafts.filter((item) => Number(item.createdByUserId) === Number(userId))).reverse().map((item) => notificationDraftView(item, context.usersById)),
    feedback: sortById(feedback).reverse().map(({ id, userId, customerId, rating, comment }) => ({ id, customerId: customerId || userId, rating, comment })),
    landingStats: landingStatsView(
      landingStatsSnapshot.exists ? landingStatsSnapshot.data() : {},
      users.filter((user) => user.archived !== true),
      visibleTechnicians,
      serviceJobs
    ),
    landingContent: landingContentView(landingContentSettings),
    companySettings: companySettingsSnapshot.exists ? companySettingsSnapshot.data() : {}
  };
}

async function updateCompanySettings(data) {
  assertFirebaseConfigured();
  const allowed = ['logo', 'invoiceLogo', 'banner', 'bankName', 'bankAccountName', 'bankAccountNumber', 'bankBranch'];
  const payload = Object.fromEntries(allowed
    .filter((key) => Object.prototype.hasOwnProperty.call(data, key))
    .map((key) => [key, String(data[key] || '').trim()]));
  payload.updatedAt = fieldValue();
  await db.collection(collections.appSettings).doc(companySettingsDocument).set(payload, { merge: true });
  invalidateReadCaches(collections.appSettings);
  const snapshot = await db.collection(collections.appSettings).doc(companySettingsDocument).get();
  return snapshot.data() || {};
}

async function getAdminServiceJobDetails(serviceJobId) {
  const [job, context, notes, progress, usages, replacedParts, photos, documents] = await Promise.all([
    getById(collections.serviceJobs, serviceJobId),
    dashboardContext(),
    all(collections.technicianNotes),
    all(collections.technicianProgress),
    all(collections.serviceJobParts),
    all(collections.replacedParts),
    all(collections.serviceImages),
    all(collections.documents)
  ]);

  if (!job) return null;

  const id = Number(serviceJobId);
  return {
    job: serviceJobView(job, context),
    progress: sortById(progress.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => ({
      id: item.id,
      progressPercentage: Number(item.progressPercentage || 0),
      status: item.status || '',
      remarks: item.remarks || '',
      createdAt: formatDate(item.createdAt)
    })),
    notes: sortById(notes.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => ({
      id: item.id,
      note: item.note || '',
      createdAt: formatDate(item.createdAt)
    })),
    usedParts: sortById(usages.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => usageView(item, context)),
    replacedParts: sortById(replacedParts.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => ({
      id: item.id,
      removedPartName: item.removedPartName || '',
      condition: item.condition || '',
      replacementReason: item.replacementReason || '',
      photoEvidence: item.photoEvidence || '',
      note: item.note || '',
      createdAt: formatDate(item.createdAt)
    })),
    photos: sortById(photos.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => fileView(item, 'photo')),
    documents: sortById(documents.filter((item) => Number(item.serviceJobId) === id)).reverse().map((item) => fileView(item, 'document'))
  };
}

async function createVehicle(userId, data) {
  const vehicle = await createDocument(collections.vehicles, {
    userId,
    name: String(data.name || `${data.make} ${data.model}`).trim(),
    vehicleType: String(data.vehicleType || 'Car').trim(),
    make: data.make.trim(),
    model: data.model.trim(),
    plateNumber: data.plate.trim().toUpperCase(),
    year: String(data.year).trim(),
    fuelType: String(data.fuelType || '').trim(),
    color: String(data.color || '').trim(),
    imageUrl: String(data.frontImage || data.image || defaultImage).trim(),
    frontImage: String(data.frontImage || data.image || '').trim(),
    rearImage: String(data.rearImage || '').trim(),
    leftImage: String(data.leftImage || '').trim(),
    rightImage: String(data.rightImage || '').trim(),
    interiorImage: String(data.interiorImage || '').trim(),
    engineImage: String(data.engineImage || '').trim()
  });
  await createUserNotification(
    userId,
    'Vehicle Added',
    `${vehicleNotificationLabel(vehicle)} (${vehicle.plateNumber}) was added to your account.`
  );
  return vehicleView(vehicle);
}

async function updateVehicle(id, userId, data, enforceOwner = true) {
  const current = await getById(collections.vehicles, id);
  if (!current || (enforceOwner && current.userId !== userId)) return null;

  const vehicle = await updateDocument(collections.vehicles, id, {
    userId,
    name: String(data.name || `${data.make} ${data.model}`).trim(),
    vehicleType: String(data.vehicleType ?? current.vehicleType ?? 'Car').trim(),
    make: data.make.trim(),
    model: data.model.trim(),
    plateNumber: data.plate.trim().toUpperCase(),
    year: String(data.year).trim(),
    fuelType: String(data.fuelType ?? current.fuelType ?? '').trim(),
    color: String(data.color ?? current.color ?? '').trim(),
    imageUrl: String(data.frontImage || data.image || current.frontImage || current.imageUrl || defaultImage).trim(),
    frontImage: String(data.frontImage ?? current.frontImage ?? data.image ?? current.imageUrl ?? '').trim(),
    rearImage: String(data.rearImage ?? current.rearImage ?? '').trim(),
    leftImage: String(data.leftImage ?? current.leftImage ?? '').trim(),
    rightImage: String(data.rightImage ?? current.rightImage ?? '').trim(),
    interiorImage: String(data.interiorImage ?? current.interiorImage ?? '').trim(),
    engineImage: String(data.engineImage ?? current.engineImage ?? '').trim()
  });

  await createUserNotification(
    userId,
    'Vehicle Updated',
    `${vehicleNotificationLabel(vehicle)} (${vehicle.plateNumber}) details were updated.`
  );

  return vehicleView(vehicle);
}

async function deleteVehicle(id, userId, enforceOwner = true) {
  const current = await getById(collections.vehicles, id);
  if (!current || (enforceOwner && Number(current.userId) !== Number(userId))) return false;
  const [bookings, jobs] = await Promise.all([
    allWhere(collections.bookings, 'vehicleId', Number(id)),
    allWhere(collections.serviceJobs, 'vehicleId', Number(id))
  ]);
  if (bookings.length || jobs.length) {
    await updateDocument(collections.vehicles, id, { archived: true, archivedAt: fieldValue() });
    return true;
  }
  await deleteDocument(collections.vehicles, id);
  return true;
}

function bookingProgress(status) {
  return status === 'Completed' ? 100 : status === 'In Progress' ? 70 : status === 'Approved' ? 35 : status === 'Cancelled' ? 0 : 10;
}

function normalizeServiceType(value) {
  return String(value || '').trim();
}

function technicianSpecializations(technician) {
  return String(technician.specialization || '')
    .split(/[,/|]/)
    .map((item) => normalizeServiceType(item))
    .filter(Boolean);
}

async function normalizeTechnicianSpecialization(value) {
  const specializations = technicianSpecializations({ specialization: value });
  const services = await all(collections.servicePackages);
  const servicesByName = new Map(services.map((service) => [String(service.name).toLowerCase(), service.name]));
  const invalid = specializations.find((item) => !servicesByName.has(item.toLowerCase()));
  if (!specializations.length || invalid) {
    const error = new Error('Technician specialization must match an active service package.');
    error.status = 400;
    throw error;
  }
  return [...new Set(specializations.map((item) => servicesByName.get(item.toLowerCase())))].join(', ');
}

function technicianCanDoService(technician, serviceName) {
  const required = normalizeServiceType(serviceName);
  const specializations = technicianSpecializations(technician);
  return specializations.includes('General Service') || specializations.some((item) => item.toLowerCase() === required.toLowerCase());
}

function parseDurationMinutes(duration) {
  const text = String(duration || '').toLowerCase();
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:min|minute)/)?.[1] || 0);
  if (hours || minutes) return Math.max(15, Math.round((hours * 60) + minutes));
  const numeric = Number(text.match(/\d+(?:\.\d+)?/)?.[0] || 0);
  return numeric > 0 ? Math.max(15, Math.round(numeric)) : 60;
}

function dateTimeMs(date, time) {
  const cleanDate = formatDate(date);
  const cleanTime = String(time || '').slice(0, 5);
  const value = new Date(`${cleanDate}T${cleanTime || '00:00'}:00`);
  return Number.isNaN(value.getTime()) ? null : value.getTime();
}

function localDateTimeString(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function bookingWindow(booking, serviceById) {
  const start = booking.startAt ? dateTimeMs(formatDate(booking.startAt), String(booking.startAt).slice(11, 16)) : dateTimeMs(booking.bookingDate, booking.bookingTime);
  const service = serviceById.get(Number(booking.servicePackageId));
  const duration = Number(booking.durationMinutes || parseDurationMinutes(service?.duration));
  if (!start) return null;
  return { start, end: start + (duration * 60 * 1000), duration };
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function bookingIsActive(booking) {
  return !['Completed', 'Cancelled'].includes(booking.status);
}

function bayLabel(id) {
  return `Bay ${String(id).padStart(2, '0')}`;
}

function availableBayIds(bookings, serviceById, requestedWindow, excludeBookingId) {
  const occupied = new Set();
  let legacyOccupiedCount = 0;

  bookings.filter(bookingIsActive).forEach((booking) => {
    if (Number(booking.id) === Number(excludeBookingId)) return;
    const window = bookingWindow(booking, serviceById);
    if (!window || !overlaps(requestedWindow, window)) return;
    if (booking.serviceBayId) {
      occupied.add(Number(booking.serviceBayId));
    } else {
      legacyOccupiedCount += 1;
    }
  });

  const available = Array.from({ length: serviceBayCount }, (_, index) => index + 1)
    .filter((id) => !occupied.has(id));
  return available.slice(legacyOccupiedCount);
}

function availableTechnicians(technicians, bookings, serviceById, serviceName, requestedWindow, excludeBookingId) {
  return technicians
    .filter((technician) => String(technician.status || '').toLowerCase() === 'active')
    .filter((technician) => technicianCanDoService(technician, serviceName))
    .filter((technician) => !bookings.filter(bookingIsActive).some((booking) => {
      if (Number(booking.id) === Number(excludeBookingId)) return false;
      const assignedTechnicianId = Number(booking.assignedTechnicianId);
      if (!assignedTechnicianId || assignedTechnicianId !== Number(technician.id)) return false;
      const window = bookingWindow(booking, serviceById);
      return window && overlaps(requestedWindow, window);
    }));
}

async function bookingAvailability({ serviceName, date, time, excludeBookingId = null }) {
  const service = await findServiceByName(serviceName, true);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const [bookings, technicians, users, serviceMap] = await Promise.all([
    all(collections.bookings),
    all(collections.technicians),
    all(collections.users),
    servicesById()
  ]);
  const usersById = new Map(users.map((user) => [Number(user.id), user]));
  const durationMinutes = parseDurationMinutes(service.duration);
  const start = dateTimeMs(date, time);
  if (!start) {
    const error = new Error('Booking date and time are invalid.');
    error.status = 400;
    throw error;
  }

  const requestedWindow = { start, end: start + (durationMinutes * 60 * 1000) };
  const techniciansAvailable = availableTechnicians(technicians, bookings, serviceMap, service.name, requestedWindow, excludeBookingId);
  const baysAvailable = availableBayIds(bookings, serviceMap, requestedWindow, excludeBookingId);
  const maxCapacity = Math.min(
    technicians.filter((technician) => String(technician.status || '').toLowerCase() === 'active' && technicianCanDoService(technician, service.name)).length,
    serviceBayCount
  );

  return {
    service,
    durationMinutes,
    requestedWindow,
    maxCapacity,
    remainingCapacity: Math.min(techniciansAvailable.length, baysAvailable.length),
    availableTechnicians: techniciansAvailable.map((technician) => ({ ...technician, user: usersById.get(Number(technician.userId)) })),
    availableBays: baysAvailable
  };
}

function assertBookingCapacity(availability, data) {
  if (!availability.availableTechnicians.length) {
    const error = new Error('No qualified technician is available for this service time.');
    error.status = 409;
    throw error;
  }
  if (!availability.availableBays.length) {
    const error = new Error('No service bay is available for this service time.');
    error.status = 409;
    throw error;
  }
  if (availability.remainingCapacity <= 0) {
    const error = new Error('Service capacity is full for this time slot.');
    error.status = 409;
    throw error;
  }

  const requestedTechnicianId = data.technicianId || data.assignedTechnicianId;
  const requestedBayId = data.serviceBayId;
  if (requestedTechnicianId && !availability.availableTechnicians.some((technician) => Number(technician.id) === Number(requestedTechnicianId))) {
    const error = new Error('Selected technician is not qualified or is already assigned during this period.');
    error.status = 409;
    throw error;
  }
  if (requestedBayId && !availability.availableBays.includes(Number(requestedBayId))) {
    const error = new Error('Selected service bay is already occupied during this period.');
    error.status = 409;
    throw error;
  }
}

function assignedBookingResources(availability, data = {}) {
  const requestedTechnicianId = data.technicianId || data.assignedTechnicianId;
  const requestedBayId = data.serviceBayId;
  const technician = requestedTechnicianId
    ? availability.availableTechnicians.find((item) => Number(item.id) === Number(requestedTechnicianId))
    : availability.availableTechnicians[0];
  const serviceBayId = requestedBayId ? Number(requestedBayId) : availability.availableBays[0];

  return {
    assignedTechnicianId: technician.id,
    serviceBayId,
    serviceBayName: bayLabel(serviceBayId),
    durationMinutes: availability.durationMinutes,
    startAt: localDateTimeString(availability.requestedWindow.start),
    endAt: localDateTimeString(availability.requestedWindow.end)
  };
}

async function getBookingSlots({ service, date, excludeBookingId = null }) {
  const slots = [];
  const dayStart = new Date(`${date}T${String(serviceDayStartHour).padStart(2, '0')}:00:00`);
  const dayEnd = new Date(`${date}T${String(serviceDayEndHour).padStart(2, '0')}:00:00`);

  for (let slot = new Date(dayStart); slot < dayEnd; slot = new Date(slot.getTime() + (serviceSlotMinutes * 60 * 1000))) {
    const time = slot.toTimeString().slice(0, 5);
    try {
      const availability = await bookingAvailability({ serviceName: service, date, time, excludeBookingId });
      if (slot.getTime() + (availability.durationMinutes * 60 * 1000) <= dayEnd.getTime()) {
        slots.push({
          time,
          label: `${time} (${availability.remainingCapacity}/${availability.maxCapacity} Slots Available)`,
          remainingCapacity: availability.remainingCapacity,
          maxCapacity: availability.maxCapacity,
          status: availability.remainingCapacity > 0 ? 'Available' : 'Full',
          availableTechnicians: availability.availableTechnicians.map((technician) => technicianView(technician)),
          availableBays: availability.availableBays.map((id) => ({ id, name: bayLabel(id) }))
        });
      }
    } catch (error) {
      slots.push({ time, label: `${time} (Unavailable)`, remainingCapacity: 0, maxCapacity: 0, status: 'Unavailable', availableTechnicians: [], availableBays: [] });
    }
  }

  return slots;
}

async function createBooking(userId, data, status = 'Pending') {
  const service = await findServiceByName(data.service, true);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const vehicle = await getById(collections.vehicles, data.vehicleId);
  if (!vehicle || Number(vehicle.userId) !== Number(userId)) {
    const error = new Error('Selected vehicle does not belong to this customer.');
    error.status = 400;
    throw error;
  }

  const availability = await bookingAvailability({ serviceName: data.service, date: data.date, time: data.time });
  assertBookingCapacity(availability, data);
  const resources = assignedBookingResources(availability, data);

  const booking = await createQueuedBookingDocument({
    userId,
    vehicleId: asId(data.vehicleId),
    servicePackageId: service.id,
    bookingDate: data.date,
    bookingTime: data.time,
    status,
    progress: bookingProgress(status),
    ...resources
  });

  await createUserNotification(userId, 'Booking Created', bookingNotificationMessage('Booking created', booking, service, vehicle));
  const customer = await getById(collections.users, userId);
  await notifyAdmins(
    'New Booking',
    `${customer?.name || 'A customer'} booked ${service.name} for ${vehicleNotificationLabel(vehicle)} (${vehicle.plateNumber}) on ${booking.bookingDate} at ${booking.bookingTime}.`
  );

  return bookingView(booking, new Map([[service.id, service]]));
}

async function updateBooking(id, userId, data, enforceOwner = true) {
  const current = await getById(collections.bookings, id);
  if (!current || (enforceOwner && current.userId !== userId)) return null;

  const vehicle = await getById(collections.vehicles, data.vehicleId);
  if (!vehicle || Number(vehicle.userId) !== Number(userId)) {
    const error = new Error('Selected vehicle does not belong to this customer.');
    error.status = 400;
    throw error;
  }

  const service = await findServiceByName(data.service, false);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const status = data.status || current.status;
  const availability = await bookingAvailability({ serviceName: data.service, date: data.date, time: data.time, excludeBookingId: id });
  assertBookingCapacity(availability, data);
  const resources = assignedBookingResources(availability, data);
  const bookingData = {
    userId,
    vehicleId: asId(data.vehicleId),
    servicePackageId: service.id,
    bookingDate: data.date,
    bookingTime: data.time,
    status,
    progress: bookingProgress(status),
    ...resources
  };
  const booking = formatDate(current.bookingDate) === formatDate(data.date)
    ? await updateDocument(collections.bookings, id, bookingData)
    : await moveBookingToDateQueue(id, bookingData);

  await createUserNotification(userId, 'Booking Updated', bookingNotificationMessage('Booking updated', booking, service, vehicle));

  return bookingView(booking, new Map([[service.id, service]]));
}

async function cancelBooking(id, userId, enforceOwner = true, reason = '') {
  const cancelReason = String(reason || '').trim();
  if (cancelReason.length > 500) {
    const error = new Error('Cancellation reason cannot exceed 500 characters.');
    error.status = 400;
    throw error;
  }
  const current = await getById(collections.bookings, id);
  if (!current || (enforceOwner && current.userId !== userId)) return false;
  if (current.status === 'Cancelled') return true;
  if (current.status === 'Completed') {
    const error = new Error('A completed booking cannot be cancelled.');
    error.status = 409;
    throw error;
  }

  const bookingDate = formatDate(current.bookingDate);
  const bookingsQuery = db.collection(collections.bookings).where('bookingDate', '==', bookingDate);
  const queueRef = db.collection('meta').doc(`booking-queue-${bookingDate}`);
  const booking = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bookingsQuery);
    const target = snapshot.docs.find((document) => Number(document.id) === Number(id));
    if (!target) return null;
    const targetData = target.data();
    if (enforceOwner && Number(targetData.userId) !== Number(userId)) return null;
    if (targetData.status === 'Cancelled') return { ...targetData, id: Number(id) };
    if (targetData.status === 'Completed') {
      const error = new Error('A completed booking cannot be cancelled.');
      error.status = 409;
      throw error;
    }

    const cancelledPosition = Number(targetData.queuePosition || 0);
    let lastPosition = 0;
    snapshot.docs.forEach((document) => {
      const item = document.data();
      if (document.id === target.id || !bookingIsActive(item)) return;
      const oldPosition = Number(item.queuePosition || 0);
      const queuePosition = cancelledPosition > 0 && oldPosition > cancelledPosition ? oldPosition - 1 : oldPosition;
      lastPosition = Math.max(lastPosition, queuePosition);
      if (queuePosition !== oldPosition) {
        transaction.set(document.ref, { queuePosition, updatedAt: fieldValue() }, { merge: true });
      }
    });
    transaction.set(target.ref, {
      status: 'Cancelled', progress: 0, queuePosition: 0, cancelReason,
      cancelledByUserId: Number(userId), cancelledAt: fieldValue(), updatedAt: fieldValue()
    }, { merge: true });
    transaction.set(queueRef, { bookingDate, lastPosition, updatedAt: fieldValue() }, { merge: true });
    return {
      ...targetData, status: 'Cancelled', progress: 0, queuePosition: 0,
      cancelReason, cancelledByUserId: Number(userId), id: Number(id)
    };
  });
  if (!booking) return false;
  const [service, vehicle] = await Promise.all([
    getById(collections.servicePackages, current.servicePackageId),
    getById(collections.vehicles, current.vehicleId)
  ]);
  const reasonMessage = cancelReason ? ` Reason: ${cancelReason}` : '';
  await createUserNotification(current.userId, 'Booking Cancelled', `${bookingNotificationMessage('Booking cancelled', booking, service, vehicle)}${reasonMessage}`);
  return true;
}

async function deleteBooking(id, userId = null, enforceOwner = true) {
  const current = await getById(collections.bookings, id);
  if (!current) return false;
  if (enforceOwner && userId && Number(current.userId) !== Number(userId)) return false;
  const jobs = await allWhere(collections.serviceJobs, 'bookingId', Number(id));
  if (jobs.length) {
    await updateDocument(collections.bookings, id, { hiddenForCustomer: true });
    return true;
  }
  await deleteDocument(collections.bookings, id);
  return true;
}

async function advanceBooking(id) {
  const current = await getById(collections.bookings, id);
  if (!current) return null;

  const flow = {
    Pending: ['Approved', 35],
    Approved: ['In Progress', 70],
    'In Progress': ['Completed', 100],
    Completed: ['Completed', 100]
  };
  const [status, progress] = flow[current.status] || ['Approved', 35];
  const booking = await updateDocument(collections.bookings, id, { status, progress });
  if (status !== current.status) {
    await createUserNotification(current.userId, 'Booking Status Updated', `Your booking #BK-${id} is now ${status}.`);
  }
  return booking;
}

async function createEmergency(userId, data) {
  const emergency = await createDocument(collections.emergencyRequests, {
    userId,
    location: data.location.trim(),
    problem: data.problem.trim(),
    status: 'Open'
  });
  await createUserNotification(userId, 'Emergency Request Sent', `Emergency request sent from ${emergency.location}: ${emergency.problem}.`);
  const customer = await getById(collections.users, userId);
  await notifyAdmins('New Emergency Request', `${customer?.name || 'A customer'} requested emergency assistance at ${emergency.location}: ${emergency.problem}.`);
  return emergency;
}

async function closeEmergency(id) {
  const emergency = await getById(collections.emergencyRequests, id);
  if (!emergency) return null;
  if (emergency.status !== 'Closed') {
    await updateDocument(collections.emergencyRequests, id, { status: 'Closed' });
    await createUserNotification(emergency.userId, 'Emergency Request Resolved', `Emergency request #ER-${id} has been resolved.`);
  }
  return { ...emergency, status: 'Closed' };
}

async function getEmergencyRequests() {
  const emergencies = await all(collections.emergencyRequests);
  return sortById(emergencies)
    .reverse()
    .map(({ id, userId, customerId, location, problem, status }) => ({
      id,
      customerId: customerId || userId,
      location,
      problem,
      status
    }));
}

async function createFeedback(userId, data) {
  const rating = Number(data.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const error = new Error('Rating must be a whole number from 1 to 5.');
    error.status = 400;
    throw error;
  }

  const service = await findServiceByName(data.service, true);
  if (!service) {
    const error = new Error('The selected service is not available.');
    error.status = 400;
    throw error;
  }

  const bookings = await all(collections.bookings);
  const hasCompletedService = bookings.some((booking) => (
    Number(booking.userId) === Number(userId)
    && booking.status === 'Completed'
    && (Number(booking.servicePackageId) === Number(service.id)
      || String(booking.serviceName || '').toLowerCase() === String(service.name).toLowerCase())
  ));
  if (!hasCompletedService) {
    const error = new Error('You can only rate a service you have completed.');
    error.status = 403;
    throw error;
  }

  await createDocument(collections.feedback, {
    userId,
    servicePackageId: service.id,
    serviceName: service.name,
    rating,
    comment: data.feedback.trim()
  });
  await createUserNotification(userId, 'Feedback Submitted', `Thank you. Your ${rating} star feedback for ${service.name} was submitted.`);
}

async function getPublicServiceRatings() {
  return cachedRead('public:serviceRatings', publicProjectionCacheMs.serviceRatings, async () => {
    const [services, feedback, users] = await Promise.all([
      all(collections.servicePackages),
      all(collections.feedback),
      all(collections.users)
    ]);
    const usersById = new Map(users.map((user) => [Number(user.id), user]));

    return services
      .filter((service) => service.active !== false)
      .map((service) => {
        const reviews = feedback.filter((review) => (
          Number(review.servicePackageId) === Number(service.id)
          || String(review.serviceName || '').toLowerCase() === String(service.name).toLowerCase()
        ));
        const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
        return {
          id: service.id,
          name: service.name,
          price: Number(service.price || 0),
          duration: service.duration || '',
          description: service.description || '',
          image: service.image || defaultServiceImage,
          averageRating: reviews.length ? Number((total / reviews.length).toFixed(1)) : 0,
          reviewCount: reviews.length,
          recentReviews: reviews
            .sort((left, right) => Number(right.id) - Number(left.id))
            .slice(0, 2)
            .map((review) => ({
              id: review.id,
              rating: Number(review.rating || 0),
              comment: review.comment || '',
              customerName: usersById.get(Number(review.userId))?.name || 'AutoCare customer'
            }))
        };
      });
  });
}

function landingStatsView(settings, users, technicians, jobs) {
  const fallbackStats = {
    ...landingStatDefaults,
    registeredCustomers: users.filter((user) => user.role === 'customer').length,
    activeTechnicians: technicians.filter((technician) => String(technician.status || '').toLowerCase() === 'active').length,
    completedServices: jobs.filter((job) => job.status === 'Completed').length
  };
  return {
    happyCustomers: Number.isSafeInteger(settings.happyCustomers) ? settings.happyCustomers : fallbackStats.happyCustomers,
    expertTechnicians: Number.isSafeInteger(settings.expertTechnicians) ? settings.expertTechnicians : fallbackStats.expertTechnicians,
    registeredCustomers: Number.isSafeInteger(settings.registeredCustomers) ? settings.registeredCustomers : fallbackStats.registeredCustomers,
    activeTechnicians: Number.isSafeInteger(settings.activeTechnicians) ? settings.activeTechnicians : fallbackStats.activeTechnicians,
    completedServices: Number.isSafeInteger(settings.completedServices) ? settings.completedServices : fallbackStats.completedServices
  };
}

async function getPublicStats() {
  assertFirebaseConfigured();
  return cachedRead('public:stats', publicProjectionCacheMs.stats, async () => {
    const [users, technicians, jobs, settingsSnapshot] = await Promise.all([
      all(collections.users),
      all(collections.technicians),
      all(collections.serviceJobs),
      db.collection(collections.appSettings).doc(landingStatsDocument).get()
    ]);
    const settings = settingsSnapshot.exists ? settingsSnapshot.data() : {};
    return landingStatsView(
      settings,
      users.filter((user) => user.archived !== true),
      technicians.filter((technician) => technician.archived !== true),
      jobs
    );
  });
}

async function getPublicLandingContent() {
  return cachedRead('public:landingContent', publicProjectionCacheMs.landingContent, async () => {
    const content = landingContentView(await getLandingContentSettings());
    return {
      recentWork: content.recentWork.filter((item) => item.active),
      news: content.news.filter((item) => item.active)
    };
  });
}

async function updateLandingContentItem(section, slot, data) {
  assertFirebaseConfigured();
  if (!Object.hasOwn(landingContentDefaults, section) || !Number.isInteger(slot) || slot < 0 || slot >= landingContentDefaults[section].length) {
    const error = new Error('Unknown landing content slot.');
    error.status = 400;
    throw error;
  }
  const ref = db.collection(collections.appSettings).doc(`${landingContentDocumentPrefix}-${section}-${slot}`);
  await ref.set({ ...data, slot, updatedAt: fieldValue() }, { merge: true });
  invalidateReadCaches(collections.appSettings);
  return { ...data, slot };
}

async function updateLandingStat(field, value) {
  assertFirebaseConfigured();
  const allowedFields = ['happyCustomers', 'expertTechnicians', 'registeredCustomers', 'activeTechnicians', 'completedServices'];
  if (!allowedFields.includes(field)) {
    const error = new Error('Unknown landing statistic.');
    error.status = 400;
    throw error;
  }

  const numericValue = Number(value);
  if (!Number.isSafeInteger(numericValue) || numericValue < 0 || numericValue > 999999999) {
    const error = new Error('Statistic value must be a whole number between 0 and 999,999,999.');
    error.status = 400;
    throw error;
  }

  await db.collection(collections.appSettings).doc(landingStatsDocument).set({
    [field]: numericValue,
    updatedAt: fieldValue()
  }, { merge: true });
  invalidateReadCaches(collections.appSettings);
  return { field, value: numericValue };
}

async function createNewsletterSubscription(email) {
  const normalizedEmail = emailKey(email);
  const existing = await allWhere(collections.newsletterSubscriptions, 'emailLower', normalizedEmail);
  if (existing.length) return { id: existing[0].id, email: normalizedEmail, alreadySubscribed: true };
  const subscription = await createDocument(collections.newsletterSubscriptions, {
    email: normalizedEmail,
    emailLower: normalizedEmail,
    status: 'Active'
  });
  return { id: subscription.id, email: normalizedEmail, alreadySubscribed: false };
}

async function updateProfile(userId, data) {
  if (await emailExists(data.email, userId)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }

  const changes = {
    name: data.name.trim(),
    email: emailKey(data.email),
    emailLower: emailKey(data.email),
    phone: data.phone.trim()
  };
  if (Object.prototype.hasOwnProperty.call(data, 'avatar')) changes.avatar = String(data.avatar || '');
  if (Object.prototype.hasOwnProperty.call(data, 'profileImage')) changes.profileImage = String(data.profileImage || '');
  if (data.passwordHash) changes.passwordHash = data.passwordHash;
  const user = await updateDocument(collections.users, userId, changes);
  return publicUser(user);
}

async function updateCustomer(id, data) {
  const current = await getById(collections.users, id);
  if (!current || current.role !== 'customer') return null;

  if (await emailExists(data.email, id)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }

  const changes = {
    name: data.name.trim(),
    email: emailKey(data.email),
    emailLower: emailKey(data.email),
    phone: data.phone.trim(),
    status: String(data.status || 'active').toLowerCase()
  };
  if (Object.prototype.hasOwnProperty.call(data, 'profileImage')) changes.profileImage = String(data.profileImage || '');
  if (data.passwordHash) changes.passwordHash = data.passwordHash;
  const user = await updateDocument(collections.users, id, changes);

  return customerView(user);
}

async function deleteCustomer(id) {
  const customer = await getById(collections.users, id);
  if (!customer || customer.role !== 'customer') return false;

  const [vehicles, bookings, invoices, jobs, emergencies, feedback, notifications, notificationDrafts, queueEntries, customerPackage] = await Promise.all([
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.invoices),
    all(collections.serviceJobs),
    all(collections.emergencyRequests),
    all(collections.feedback),
    all(collections.notifications),
    all(collections.notificationDrafts),
    all(collections.queueEntries),
    getById(collections.customerPackages, id)
  ]);
  const customerId = Number(id);
  const dependencies = [
    ['vehicle', vehicles.some((item) => Number(item.userId) === customerId)],
    ['booking', bookings.some((item) => Number(item.userId) === customerId)],
    ['invoice', invoices.some((item) => Number(item.userId) === customerId)],
    ['service job', jobs.some((item) => Number(item.customerId) === customerId)],
    ['emergency request', emergencies.some((item) => Number(item.userId) === customerId)],
    ['feedback', feedback.some((item) => Number(item.userId) === customerId)]
  ].filter(([, exists]) => exists).map(([label]) => label);

  const customerNotifications = notifications.filter((item) => Number(item.userId) === customerId);
  const customerDrafts = notificationDrafts.filter((item) => Number(item.userId) === customerId);
  if (dependencies.length) {
    const batch = db.batch();
    const timestamp = fieldValue();
    batch.set(docRef(collections.users, customerId), { status: 'removed', archived: true, archivedAt: timestamp, updatedAt: timestamp }, { merge: true });
    vehicles.filter((item) => Number(item.userId) === customerId).forEach((vehicle) => {
      batch.set(docRef(collections.vehicles, vehicle.id), { archived: true, archivedAt: timestamp, updatedAt: timestamp }, { merge: true });
    });
    bookings.filter((item) => Number(item.userId) === customerId && !['Completed', 'Cancelled'].includes(item.status)).forEach((booking) => {
      batch.set(docRef(collections.bookings, booking.id), {
        status: 'Cancelled', progress: 0, queuePosition: 0,
        cancelReason: 'Customer account removed by administrator.', cancelledAt: timestamp, updatedAt: timestamp
      }, { merge: true });
    });
    queueEntries.filter((item) => Number(item.customerId) === customerId && !['Completed', 'Cancelled', 'No Show'].includes(item.status)).forEach((entry) => {
      batch.set(docRef(collections.queueEntries, entry.id), { status: 'Cancelled', closedAt: timestamp, updatedAt: timestamp }, { merge: true });
    });
    customerNotifications.forEach((item) => batch.delete(docRef(collections.notifications, item.id)));
    customerDrafts.forEach((item) => batch.delete(docRef(collections.notificationDrafts, item.id)));
    if (customerPackage) {
      batch.set(docRef(collections.customerPackages, customerId), {
        status: 'cancelled', cancelledAt: timestamp, updatedAt: timestamp
      }, { merge: true });
    }
    await batch.commit();
    return true;
  }

  await Promise.all([
    ...customerNotifications.map((item) => deleteDocument(collections.notifications, item.id)),
    ...customerDrafts.map((item) => deleteDocument(collections.notificationDrafts, item.id)),
    ...(customerPackage ? [deleteDocument(collections.customerPackages, customerId)] : [])
  ]);
  await deleteDocument(collections.users, id);
  return true;
}

async function itemCodeExists(itemCode, ignoreId) {
  const normalized = String(itemCode || '').trim().toUpperCase();
  const parts = await all(collections.inventoryParts);
  return parts.some((part) => String(part.itemCode || part.sku || '').toUpperCase() === normalized && Number(part.id) !== Number(ignoreId));
}

function normalizeInventoryPayload(data) {
  const itemCode = String(data.itemCode || data.sku || '').trim().toUpperCase();
  if (!itemCode) {
    const error = new Error('Item code is required.');
    error.status = 400;
    throw error;
  }
  const stock = Number(data.stockQuantity ?? data.stock ?? 0);
  const minimumStockLevel = Number(data.minimumStockLevel ?? 0);
  const purchasePrice = Number(data.purchasePrice ?? 0);
  const sellingPrice = Number(data.sellingPrice ?? data.unitPrice ?? 0);
  if ([stock, minimumStockLevel, purchasePrice, sellingPrice].some((value) => !Number.isFinite(value) || value < 0)) {
    const error = new Error('Inventory quantities and prices must be zero or greater.');
    error.status = 400;
    throw error;
  }

  return {
    itemCode,
    sku: itemCode,
    partName: String(data.partName || data.name || '').trim(),
    name: String(data.partName || data.name || '').trim(),
    category: data.category,
    brand: String(data.brand || '').trim(),
    manufacturer: String(data.manufacturer || '').trim(),
    supplierId: data.supplierId ? asId(data.supplierId) : null,
    supplier: String(data.supplier || '').trim(),
    description: String(data.description || '').trim(),
    purchasePrice,
    sellingPrice,
    unitPrice: sellingPrice,
    stock,
    stockQuantity: stock,
    minimumStockLevel,
    location: String(data.location || '').trim(),
    warrantyPeriod: String(data.warrantyPeriod || '').trim(),
    warrantyProvider: String(data.warrantyProvider || data.supplier || '').trim(),
    image: String(data.image || '').trim(),
    status: inventoryStockStatus(stock, String(data.status || 'Active').trim(), minimumStockLevel)
  };
}

async function createInventoryItem(data) {
  const categories = await allWhere(collections.inventoryCategories, 'name', data.category);
  if (!categories.some((category) => category.status !== 'Inactive')) {
    const error = new Error('Select an active inventory category from the database.');
    error.status = 400;
    throw error;
  }
  const payload = normalizeInventoryPayload(data);
  if (await itemCodeExists(payload.itemCode)) {
    const error = new Error('An inventory item with this item code already exists.');
    error.status = 409;
    throw error;
  }
  const part = await createDocument(collections.inventoryParts, payload);
  await createInventoryMovement({
    partId: part.id,
    type: 'Opening Stock',
    quantity: payload.stock,
    unitPrice: payload.purchasePrice,
    note: 'Inventory item created.'
  });
  await maybeCreateLowStockAlert(part);
  return partView(part);
}

async function updateInventoryItem(id, data) {
  const current = await getById(collections.inventoryParts, id);
  if (!current) return null;
  const categories = await allWhere(collections.inventoryCategories, 'name', data.category);
  if (!categories.some((category) => category.status !== 'Inactive')) {
    const error = new Error('Select an active inventory category from the database.');
    error.status = 400;
    throw error;
  }
  const payload = normalizeInventoryPayload(data);
  if (await itemCodeExists(payload.itemCode, id)) {
    const error = new Error('An inventory item with this item code already exists.');
    error.status = 409;
    throw error;
  }
  const stockDelta = Number(payload.stock) - Number(current.stock || 0);
  const part = await updateDocument(collections.inventoryParts, id, payload);
  if (stockDelta !== 0) {
    await createInventoryMovement({
      partId: id,
      type: stockDelta > 0 ? 'Stock Adjustment In' : 'Stock Adjustment Out',
      quantity: Math.abs(stockDelta),
      unitPrice: payload.purchasePrice,
      note: 'Admin stock adjustment.'
    });
  }
  const wasLow = ['Low Stock', 'Out of Stock'].includes(partView(current).status);
  const isLow = ['Low Stock', 'Out of Stock'].includes(partView(part).status);
  if (isLow && (!wasLow || stockDelta !== 0)) await maybeCreateLowStockAlert(part);
  return partView(part);
}

async function deleteInventoryItem(id) {
  const part = await getById(collections.inventoryParts, id);
  if (!part) return false;
  const [usages, movements] = await Promise.all([
    allWhere(collections.serviceJobParts, 'partId', Number(id)),
    allWhere(collections.inventoryMovements, 'partId', Number(id))
  ]);
  if (usages.length || movements.some((movement) => movement.type !== 'Opening Stock')) {
    await updateDocument(collections.inventoryParts, id, { archived: true, active: false, archivedAt: fieldValue() });
    return true;
  }
  await Promise.all(movements.map((movement) => deleteDocument(collections.inventoryMovements, movement.id)));
  await deleteDocument(collections.inventoryParts, id);
  return true;
}

async function createInventorySupplier(data) {
  return createDocument(collections.inventorySuppliers, {
    name: data.name.trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    address: String(data.address || '').trim(),
    status: data.status || 'Active'
  });
}

async function updateInventorySupplier(id, data) {
  return updateDocument(collections.inventorySuppliers, id, {
    name: data.name.trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    address: String(data.address || '').trim(),
    status: data.status || 'Active'
  });
}

async function deleteInventorySupplier(id) {
  const supplier = await getById(collections.inventorySuppliers, id);
  if (!supplier) return false;
  const parts = await allWhere(collections.inventoryParts, 'supplierId', Number(id));
  if (parts.length) {
    await updateDocument(collections.inventorySuppliers, id, { archived: true, status: 'Inactive', archivedAt: fieldValue() });
    return true;
  }
  await deleteDocument(collections.inventorySuppliers, id);
  return true;
}

async function createInventoryMovement(data) {
  const part = data.partId ? await getById(collections.inventoryParts, data.partId) : null;
  return createDocument(collections.inventoryMovements, {
    partId: data.partId ? asId(data.partId) : null,
    partName: data.partName || part?.partName || part?.name || '',
    itemCode: data.itemCode || part?.itemCode || part?.sku || '',
    serviceJobId: data.serviceJobId ? asId(data.serviceJobId) : null,
    technicianId: data.technicianId ? asId(data.technicianId) : null,
    vehicleId: data.vehicleId ? asId(data.vehicleId) : null,
    customerId: data.customerId ? asId(data.customerId) : null,
    type: data.type,
    quantity: Number(data.quantity || 0),
    condition: data.condition || '',
    unitPrice: Number(data.unitPrice || 0),
    totalPrice: Number(data.totalPrice || Number(data.quantity || 0) * Number(data.unitPrice || 0)),
    note: data.note || ''
  });
}

async function maybeCreateLowStockAlert(part) {
  const view = partView(part);
  if (!['Low Stock', 'Out of Stock'].includes(view.status)) return;
  const message = view.stock <= 0
    ? `${view.partName} is out of stock.`
    : `${view.partName} is low in stock (${view.stock} left).`;
  await notifyAdmins('Inventory Alert', message);
}

async function getInventoryReports() {
  const [users, vehicles, technicians, jobs, parts, movements, usages] = await Promise.all([
    all(collections.users),
    all(collections.vehicles),
    all(collections.technicians),
    all(collections.serviceJobs),
    all(collections.inventoryParts),
    all(collections.inventoryMovements),
    all(collections.serviceJobParts)
  ]);
  const context = {
    usersById: new Map(users.map((user) => [Number(user.id), user])),
    vehiclesById: new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle])),
    techniciansById: new Map(technicians.map((technician) => [Number(technician.id), technician])),
    jobsById: new Map(jobs.map((job) => [Number(job.id), job])),
    partsById: new Map(parts.map((part) => [Number(part.id), part]))
  };
  return buildInventoryReports(parts, movements, usages, context);
}

async function getOverallSalesReportPdf() {
  const [invoices, packages, users] = await Promise.all([
    all(collections.invoices),
    all(collections.servicePackages),
    all(collections.users)
  ]);
  const servicesByIdMap = new Map(packages.map((service) => [Number(service.id), service]));
  const usersById = new Map(users.map((user) => [Number(user.id), user]));
  const sortedInvoices = [...invoices].sort((left, right) => formatDate(right.invoiceDate).localeCompare(formatDate(left.invoiceDate)));
  const totalRevenue = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const paidRevenue = invoices
    .filter((invoice) => String(invoice.paymentStatus).toLowerCase() === 'paid')
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const outstanding = totalRevenue - paidRevenue;

  return createReportPdfBuffer({
    title: 'OVERALL SALES REPORT',
    subtitle: 'Complete invoice and revenue summary for AutoCare Service Station.',
    metrics: [
      ['TOTAL SALES', money(totalRevenue)],
      ['PAID REVENUE', money(paidRevenue)],
      ['OUTSTANDING', money(outstanding)],
      ['INVOICES', invoices.length]
    ],
    columns: [
      { label: 'INVOICE', x: 56, maxLength: 14, bold: true },
      { label: 'DATE', x: 132, maxLength: 12 },
      { label: 'CUSTOMER', x: 205, maxLength: 24 },
      { label: 'SERVICE', x: 350, maxLength: 20 },
      { label: 'STATUS', x: 470, maxLength: 10 },
      { label: 'AMOUNT', x: 556, maxLength: 20, align: 'right', bold: true }
    ],
    rows: sortedInvoices.map((invoice) => [
      `INV-${invoice.id}`,
      formatDate(invoice.invoiceDate),
      usersById.get(Number(invoice.userId))?.name || 'Unknown',
      servicesByIdMap.get(Number(invoice.servicePackageId))?.name || invoice.serviceName || 'Service',
      invoice.paymentStatus || 'Pending',
      money(invoice.amount)
    ])
  });
}

async function getOverallSystemReportPdf() {
  const [users, vehicles, bookings, jobs, invoices, emergencies, parts] = await Promise.all([
    all(collections.users),
    all(collections.vehicles),
    all(collections.bookings),
    all(collections.serviceJobs),
    all(collections.invoices),
    all(collections.emergencyRequests),
    all(collections.inventoryParts)
  ]);
  const customers = users.filter((user) => user.role === 'customer');
  const completedJobs = jobs.filter((job) => job.status === 'Completed');
  const activeJobs = jobs.filter((job) => !['Completed', 'Cancelled'].includes(job.status));
  const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const stockValue = parts.reduce((sum, part) => sum + (Number(part.stock ?? part.stockQuantity ?? 0) * Number(part.purchasePrice || 0)), 0);
  const lowStock = parts.filter((part) => Number(part.stock ?? part.stockQuantity ?? 0) <= lowStockThreshold);
  const rows = [
    ['Customers', customers.length, 'Registered customer accounts'],
    ['Vehicles', vehicles.length, 'Vehicles registered in the system'],
    ['Bookings', bookings.length, `${bookings.filter((item) => item.status === 'Pending').length} pending approval`],
    ['Service jobs', jobs.length, `${activeJobs.length} active / ${completedJobs.length} completed`],
    ['Invoices', invoices.length, `${money(revenue)} total value`],
    ['Inventory items', parts.length, `${lowStock.length} low or out of stock`],
    ['Inventory cost value', money(stockValue), 'Current purchase-value estimate'],
    ['Emergency requests', emergencies.length, `${emergencies.filter((item) => item.status !== 'Closed').length} currently open`]
  ];

  return createReportPdfBuffer({
    title: 'OVERALL SYSTEM REPORT',
    subtitle: 'Operational, service, customer, inventory and financial overview.',
    metrics: [
      ['CUSTOMERS', customers.length],
      ['BOOKINGS', bookings.length],
      ['COMPLETED JOBS', completedJobs.length],
      ['TOTAL REVENUE', money(revenue)]
    ],
    columns: [
      { label: 'REPORT AREA', x: 56, maxLength: 28, bold: true },
      { label: 'TOTAL / VALUE', x: 320, maxLength: 24, align: 'right', bold: true },
      { label: 'DETAILS', x: 350, maxLength: 38 }
    ],
    rows
  });
}

async function getIndividualReportPdf(reportType) {
  if (reportType === 'technician-workload') {
    const rows = await getTechnicianWorkload();
    return createReportPdfBuffer({
      title: 'TECHNICIAN WORKLOAD',
      subtitle: 'Current assignments and service-job workload by technician.',
      metrics: [
        ['TECHNICIANS', rows.length],
        ['ACTIVE JOBS', rows.reduce((sum, item) => sum + item.activeJobs, 0)],
        ['PENDING', rows.reduce((sum, item) => sum + item.pendingJobs, 0)],
        ['WAITING PARTS', rows.reduce((sum, item) => sum + item.waitingForParts, 0)]
      ],
      columns: [
        { label: 'TECHNICIAN', x: 56, maxLength: 22, bold: true },
        { label: 'SPECIALIZATION', x: 205, maxLength: 19 },
        { label: 'ACTIVE', x: 360, maxLength: 6, align: 'right' },
        { label: 'PENDING', x: 410, maxLength: 6, align: 'right' },
        { label: 'IN PROGRESS', x: 470, maxLength: 6, align: 'right' },
        { label: 'WAITING', x: 522, maxLength: 6, align: 'right' },
        { label: 'DONE', x: 558, maxLength: 6, align: 'right' }
      ],
      rows: rows.map((item) => [item.name, item.specialization, item.activeJobs, item.pendingJobs, item.inProgressJobs, item.waitingForParts, item.completedJobs])
    });
  }

  if (reportType === 'technician-performance') {
    const rows = await getTechnicianPerformance();
    const totalCompleted = rows.reduce((sum, item) => sum + item.jobsCompleted, 0);
    return createReportPdfBuffer({
      title: 'TECHNICIAN PERFORMANCE',
      subtitle: 'Completion, workload, service totals, and customer ratings by technician.',
      metrics: [
        ['TECHNICIANS', rows.length],
        ['COMPLETED JOBS', totalCompleted],
        ['ACTIVE JOBS', rows.reduce((sum, item) => sum + item.activeJobs, 0)],
        ['TOTAL SERVICES', rows.reduce((sum, item) => sum + item.totalServicesCompleted, 0)]
      ],
      columns: [
        { label: 'TECHNICIAN', x: 56, maxLength: 24, bold: true },
        { label: 'COMPLETED', x: 285, maxLength: 8, align: 'right' },
        { label: 'ACTIVE', x: 355, maxLength: 8, align: 'right' },
        { label: 'AVG DAYS', x: 425, maxLength: 8, align: 'right' },
        { label: 'RATING', x: 490, maxLength: 8, align: 'right' },
        { label: 'SERVICES', x: 558, maxLength: 8, align: 'right' }
      ],
      rows: rows.map((item) => [item.name, item.jobsCompleted, item.activeJobs, item.averageCompletionDays, item.customerRating || '-', item.totalServicesCompleted])
    });
  }

  const inventory = await getInventoryReports();
  if (reportType === 'low-stock') {
    const rows = [...inventory.outOfStock, ...inventory.lowStock];
    return createReportPdfBuffer({
      title: 'LOW STOCK REPORT',
      subtitle: 'Inventory items at or below their configured minimum stock level.',
      metrics: [
        ['AFFECTED ITEMS', rows.length],
        ['LOW STOCK', inventory.lowStock.length],
        ['OUT OF STOCK', inventory.outOfStock.length],
        ['UNITS LEFT', rows.reduce((sum, item) => sum + item.stock, 0)]
      ],
      columns: [
        { label: 'ITEM CODE', x: 56, maxLength: 15, bold: true },
        { label: 'PART', x: 150, maxLength: 27 },
        { label: 'CATEGORY', x: 350, maxLength: 18 },
        { label: 'STOCK', x: 470, maxLength: 8, align: 'right' },
        { label: 'MINIMUM', x: 520, maxLength: 8, align: 'right' },
        { label: 'STATUS', x: 558, maxLength: 14, align: 'right' }
      ],
      rows: rows.map((item) => [item.itemCode, item.partName, item.category, item.stock, item.minimumStockLevel, item.status])
    });
  }

  if (reportType === 'inventory-value') {
    const value = inventory.inventoryValue;
    return createReportPdfBuffer({
      title: 'INVENTORY VALUE REPORT',
      subtitle: 'Purchase cost and expected retail value for every inventory item.',
      metrics: [
        ['ITEMS', value.itemCount],
        ['STOCK UNITS', value.stockUnits],
        ['PURCHASE VALUE', money(value.totalPurchaseValue)],
        ['RETAIL VALUE', money(value.totalRetailValue)]
      ],
      columns: [
        { label: 'ITEM CODE', x: 56, maxLength: 15, bold: true },
        { label: 'PART', x: 145, maxLength: 25 },
        { label: 'STOCK', x: 350, maxLength: 8, align: 'right' },
        { label: 'UNIT COST', x: 430, maxLength: 18, align: 'right' },
        { label: 'COST VALUE', x: 500, maxLength: 18, align: 'right' },
        { label: 'RETAIL VALUE', x: 558, maxLength: 18, align: 'right' }
      ],
      rows: inventory.inventory.map((item) => [item.itemCode, item.partName, item.stock, money(item.purchasePrice), money(item.inventoryValue), money(item.retailValue)])
    });
  }

  if (reportType === 'stock-movements') {
    const rows = inventory.stockMovements;
    return createReportPdfBuffer({
      title: 'STOCK MOVEMENT REPORT',
      subtitle: 'Inventory usage, returns, opening stock, and manual adjustments.',
      metrics: [
        ['MOVEMENTS', rows.length],
        ['TOTAL UNITS', rows.reduce((sum, item) => sum + item.quantity, 0)],
        ['PARTS USED', rows.filter((item) => item.type.includes('Used')).reduce((sum, item) => sum + item.quantity, 0)],
        ['TOTAL VALUE', money(rows.reduce((sum, item) => sum + item.totalPrice, 0))]
      ],
      columns: [
        { label: 'PART', x: 56, maxLength: 23, bold: true },
        { label: 'MOVEMENT', x: 210, maxLength: 22 },
        { label: 'TECHNICIAN', x: 360, maxLength: 18 },
        { label: 'JOB', x: 460, maxLength: 10, align: 'right' },
        { label: 'QTY', x: 500, maxLength: 7, align: 'right' },
        { label: 'TOTAL', x: 558, maxLength: 18, align: 'right' }
      ],
      rows: rows.map((item) => [item.partName, item.type, item.technicianName, item.serviceJobId ? `SJ-${item.serviceJobId}` : '-', item.quantity, money(item.totalPrice)])
    });
  }

  if (reportType === 'parts-usage') {
    const rows = inventory.technicianUsage;
    return createReportPdfBuffer({
      title: 'PARTS USAGE REPORT',
      subtitle: 'Parts consumed by vehicle, technician, job, and condition.',
      metrics: [
        ['USAGE RECORDS', rows.length],
        ['TOTAL UNITS', rows.reduce((sum, item) => sum + item.quantity, 0)],
        ['TECHNICIANS', new Set(rows.map((item) => item.usedByTechnician).filter(Boolean)).size],
        ['TOTAL VALUE', money(rows.reduce((sum, item) => sum + item.totalPrice, 0))]
      ],
      columns: [
        { label: 'PART', x: 56, maxLength: 22, bold: true },
        { label: 'VEHICLE', x: 200, maxLength: 17 },
        { label: 'TECHNICIAN', x: 330, maxLength: 18 },
        { label: 'CONDITION', x: 440, maxLength: 15 },
        { label: 'QTY', x: 500, maxLength: 7, align: 'right' },
        { label: 'TOTAL', x: 558, maxLength: 18, align: 'right' }
      ],
      rows: rows.map((item) => [item.partName, item.vehicleNumber || item.vehicleName, item.technicianName, item.condition, item.quantity, money(item.totalPrice)])
    });
  }

  const error = new Error('Unknown report type.');
  error.status = 404;
  throw error;
}

async function employeeNoExists(employeeNo, ignoreId) {
  const normalized = String(employeeNo || '').trim().toUpperCase();
  const technicians = await all(collections.technicians);
  return technicians.some((technician) => (
    technician.employeeNo === normalized && Number(technician.id) !== Number(ignoreId)
  ));
}

async function createTechnician(data, passwordHash) {
  if (await employeeNoExists(data.employeeNo)) {
    const error = new Error('A technician with this employee number already exists.');
    error.status = 409;
    throw error;
  }

  const user = await createUser({
    role: 'technician',
    name: data.name,
    email: data.email,
    phone: data.phone,
    passwordHash,
    status: data.status || 'active'
  });

  const technician = await createDocument(collections.technicians, {
    userId: user.id,
    employeeNo: String(data.employeeNo).trim().toUpperCase(),
    specialization: await normalizeTechnicianSpecialization(data.specialization),
    phone: String(data.phone || '').trim(),
    experienceYears: Number(data.experienceYears || 0),
    status: String(data.status || 'active').toLowerCase()
  });

  return technicianView(technician, user);
}

async function updateTechnician(id, data) {
  const current = await getById(collections.technicians, id);
  if (!current) return null;
  if (await emailExists(data.email, current.userId)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }
  if (await employeeNoExists(data.employeeNo, id)) {
    const error = new Error('A technician with this employee number already exists.');
    error.status = 409;
    throw error;
  }

  const userChanges = {
    name: data.name.trim(),
    email: emailKey(data.email),
    emailLower: emailKey(data.email),
    phone: String(data.phone || '').trim(),
    status: String(data.status || 'active').toLowerCase(),
    profileImage: String(data.profileImage || '').trim(),
    nicImage: String(data.nicImage || '').trim(),
    certificateUrls: Array.isArray(data.certificateUrls) ? data.certificateUrls.filter(Boolean) : []
  };
  if (data.passwordHash) userChanges.passwordHash = data.passwordHash;
  const user = await updateDocument(collections.users, current.userId, userChanges);

  const technician = await updateDocument(collections.technicians, id, {
    employeeNo: String(data.employeeNo).trim().toUpperCase(),
    specialization: await normalizeTechnicianSpecialization(data.specialization),
    phone: String(data.phone || '').trim(),
    experienceYears: Number(data.experienceYears || 0),
    status: String(data.status || 'active').toLowerCase(),
    profileImage: String(data.profileImage ?? current.profileImage ?? '').trim(),
    nicImage: String(data.nicImage ?? current.nicImage ?? '').trim(),
    certificateUrls: Array.isArray(data.certificateUrls) ? data.certificateUrls.filter(Boolean) : (current.certificateUrls || [])
  });

  return technicianView(technician, user);
}

async function deleteTechnician(id) {
  const technician = await getById(collections.technicians, id);
  if (!technician) return false;

  const [jobs, bookings] = await Promise.all([all(collections.serviceJobs), all(collections.bookings)]);
  const hasLinkedWork = jobs.some((job) => Number(job.assignedTechnicianId) === Number(id))
    || bookings.some((booking) => Number(booking.assignedTechnicianId) === Number(id));
  if (hasLinkedWork) {
    const batch = db.batch();
    const timestamp = fieldValue();
    batch.set(docRef(collections.technicians, id), { status: 'inactive', archived: true, archivedAt: timestamp, updatedAt: timestamp }, { merge: true });
    batch.set(docRef(collections.users, technician.userId), { status: 'inactive', archived: true, archivedAt: timestamp, updatedAt: timestamp }, { merge: true });
    jobs.filter((job) => Number(job.assignedTechnicianId) === Number(id) && !['Completed', 'Cancelled'].includes(job.status)).forEach((job) => {
      batch.set(docRef(collections.serviceJobs, job.id), { assignedTechnicianId: null, status: 'Pending', updatedAt: timestamp }, { merge: true });
    });
    bookings.filter((booking) => Number(booking.assignedTechnicianId) === Number(id) && !['Completed', 'Cancelled'].includes(booking.status)).forEach((booking) => {
      batch.set(docRef(collections.bookings, booking.id), { assignedTechnicianId: null, updatedAt: timestamp }, { merge: true });
    });
    await batch.commit();
    return true;
  }

  const [notifications, notificationDrafts] = await Promise.all([
    all(collections.notifications),
    all(collections.notificationDrafts)
  ]);
  await Promise.all([
    ...notifications
      .filter((notification) => Number(notification.userId) === Number(technician.userId))
      .map((notification) => deleteDocument(collections.notifications, notification.id)),
    ...notificationDrafts
      .filter((draft) => Number(draft.userId) === Number(technician.userId))
      .map((draft) => deleteDocument(collections.notificationDrafts, draft.id))
  ]);
  await deleteDocument(collections.technicians, id);
  await deleteDocument(collections.users, technician.userId);
  return true;
}

async function createServiceJob(data) {
  const booking = await getById(collections.bookings, data.bookingId);
  if (!booking) {
    const error = new Error('Booking not found.');
    error.status = 404;
    throw error;
  }

  const existing = (await allWhere(collections.serviceJobs, 'bookingId', Number(data.bookingId)))
    .find((job) => job.status !== 'Cancelled');
  if (existing) {
    const error = new Error('A service job already exists for this booking.');
    error.status = 409;
    throw error;
  }

  const service = await findServiceByName(data.serviceType || booking.serviceName, false);
  const serviceType = data.serviceType || service?.name || 'General Service';
  const assignedTechnicianId = data.assignedTechnicianId || booking.assignedTechnicianId || null;
  if (assignedTechnicianId) {
    await assertTechnician(assignedTechnicianId, true);
    const availability = await bookingAvailability({
      serviceName: serviceType,
      date: formatDate(booking.bookingDate),
      time: booking.bookingTime,
      excludeBookingId: booking.id
    });
    if (!availability.availableTechnicians.some((technician) => Number(technician.id) === Number(assignedTechnicianId))) {
      const error = new Error('Selected technician is not qualified or is already assigned during this booking period.');
      error.status = 409;
      throw error;
    }
  }

  const status = assignedTechnicianId ? 'Assigned' : 'Pending';
  const job = await createDocument(collections.serviceJobs, {
    bookingId: asId(data.bookingId),
    vehicleId: asId(data.vehicleId || booking.vehicleId),
    customerId: asId(data.customerId || booking.userId),
    assignedTechnicianId: assignedTechnicianId ? asId(assignedTechnicianId) : null,
    serviceType,
    priority: data.priority || 'Normal',
    status,
    progress: 0,
    startDate: data.startDate || today(),
    expectedCompletionDate: data.expectedCompletionDate || today(1),
    completionDate: '',
    assignedDate: assignedTechnicianId ? today() : ''
  });

  await updateDocument(collections.bookings, booking.id, {
    status: status === 'Assigned' ? 'Approved' : booking.status,
    progress: status === 'Assigned' ? 35 : booking.progress,
    ...(assignedTechnicianId ? { assignedTechnicianId: asId(assignedTechnicianId) } : {})
  });

  if (job.assignedTechnicianId) {
    const technician = await getById(collections.technicians, job.assignedTechnicianId);
    await createUserNotification(technician.userId, 'Service Job Assigned', `Service job #SJ-${job.id} has been assigned to you.`);
  }

  const context = await dashboardContext();
  return serviceJobView(job, context);
}

async function assignBookingTechnician(bookingId, technicianId, data = {}) {
  const booking = await getById(collections.bookings, bookingId);
  if (!booking) {
    const error = new Error('Booking not found.');
    error.status = 404;
    throw error;
  }
  if (booking.status !== 'Approved') {
    const error = new Error('Approve the booking before assigning a technician.');
    error.status = 409;
    throw error;
  }

  const existingJob = (await allWhere(collections.serviceJobs, 'bookingId', Number(bookingId)))
    .find((job) => job.status !== 'Cancelled');
  if (existingJob) return assignTechnician(existingJob.id, technicianId);

  const service = booking.servicePackageId
    ? await getById(collections.servicePackages, booking.servicePackageId)
    : null;
  return createServiceJob({
    bookingId: Number(bookingId),
    vehicleId: booking.vehicleId,
    customerId: booking.userId,
    serviceType: service?.name || booking.serviceName || 'General Service',
    assignedTechnicianId: Number(technicianId),
    priority: data.priority || 'Normal',
    startDate: data.startDate || formatDate(booking.bookingDate),
    expectedCompletionDate: data.expectedCompletionDate || formatDate(booking.bookingDate)
  });
}

async function assignTechnician(serviceJobId, technicianId) {
  const [job, technician] = await Promise.all([
    getById(collections.serviceJobs, serviceJobId),
    assertTechnician(technicianId, true)
  ]);

  if (!job) {
    const error = new Error('Service job not found.');
    error.status = 404;
    throw error;
  }

  if (Number(job.assignedTechnicianId) === Number(technicianId)) {
    const error = new Error('This technician is already assigned to the service job.');
    error.status = 409;
    throw error;
  }

  const booking = job.bookingId ? await getById(collections.bookings, job.bookingId) : null;
  if (booking) {
    const availability = await bookingAvailability({
      serviceName: job.serviceType,
      date: formatDate(booking.bookingDate),
      time: booking.bookingTime,
      excludeBookingId: booking.id
    });
    if (!availability.availableTechnicians.some((item) => Number(item.id) === Number(technicianId))) {
      const error = new Error('Selected technician is not qualified or is already assigned during this booking period.');
      error.status = 409;
      throw error;
    }
    await updateDocument(collections.bookings, booking.id, { assignedTechnicianId: asId(technicianId) });
  }

  const updated = await updateDocument(collections.serviceJobs, serviceJobId, {
    assignedTechnicianId: asId(technicianId),
    status: 'Assigned',
    assignedDate: today()
  });

  await createUserNotification(technician.userId, 'Service Job Assigned', `Service job #SJ-${serviceJobId} has been assigned to you.`);
  await notifyAdmins('Technician Assignment', `Service job #SJ-${serviceJobId} was assigned to technician #${technician.employeeNo}.`);

  const context = await dashboardContext();
  return serviceJobView(updated, context);
}

async function getTechnicianWorkload() {
  const [technicians, jobs, context] = await Promise.all([
    all(collections.technicians),
    all(collections.serviceJobs),
    dashboardContext()
  ]);
  return buildTechnicianWorkload(technicians, jobs.map((job) => serviceJobView(job, context)), context.usersById);
}

async function getTechnicianPerformance() {
  const [technicians, jobs, context] = await Promise.all([
    all(collections.technicians),
    all(collections.serviceJobs),
    dashboardContext()
  ]);
  return buildTechnicianPerformance(technicians, jobs.map((job) => serviceJobView(job, context)), context.usersById);
}

async function getTechnicianDashboard(userId) {
  const technician = await getTechnicianByUserId(userId);
  if (!technician) {
    const error = new Error('Technician profile not found.');
    error.status = 404;
    throw error;
  }

  const [jobs, notes, progressEntries, partsUsed, inventoryParts, notifications, context] = await Promise.all([
    allWhere(collections.serviceJobs, 'assignedTechnicianId', Number(technician.id)),
    allWhere(collections.technicianNotes, 'technicianId', Number(technician.id)),
    allWhere(collections.technicianProgress, 'technicianId', Number(technician.id)),
    allWhere(collections.serviceJobParts, 'usedByTechnician', Number(technician.id)),
    all(collections.inventoryParts),
    allWhere(collections.notifications, 'userId', Number(userId)),
    dashboardContext()
  ]);

  const assignedJobs = jobs.map((job) => serviceJobView(job, context));
  const assignedJobIds = new Set(assignedJobs.map((job) => Number(job.id)));
  const [photos, documents] = await Promise.all([
    allWhereAny(collections.serviceImages, 'serviceJobId', [...assignedJobIds]),
    allWhereAny(collections.documents, 'serviceJobId', [...assignedJobIds])
  ]);
  const todayText = today();

  return {
    profile: technicianView(technician, context.usersById.get(Number(technician.userId))),
    jobs: assignedJobs,
    todayJobs: assignedJobs.filter((job) => job.assignedDate === todayText || job.startDate === todayText),
    pendingJobs: assignedJobs.filter((job) => ['Pending', 'Assigned'].includes(job.status)).length,
    inProgressJobs: assignedJobs.filter((job) => job.status === 'In Progress').length,
    completedJobs: assignedJobs.filter((job) => job.status === 'Completed').length,
    activeJobs: assignedJobs.filter((job) => !['Completed', 'Cancelled'].includes(job.status)).length,
    performance: buildTechnicianPerformance([technician], assignedJobs, context.usersById)[0],
    notes,
    progress: progressEntries,
    partsUsed,
    inventoryParts: inventoryParts.filter((part) => part.archived !== true).map(partView),
    servicePhotos: sortById(photos).reverse().map((photo) => fileView(photo, 'photo')),
    documents: sortById(documents).reverse().map((document) => fileView(document, 'document')),
    notifications: sortById(notifications).reverse().map(({ id, type, message, unread }) => ({ id, type, message, unread }))
  };
}

async function getAssignedServiceJob(userId, jobId) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, jobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) return null;
  const [notes, progressEntries, partsUsed, images, context] = await Promise.all([
    all(collections.technicianNotes),
    all(collections.technicianProgress),
    all(collections.serviceJobParts),
    all(collections.serviceImages),
    dashboardContext()
  ]);
  return {
    ...serviceJobView(job, context),
    notes: sortById(notes.filter((note) => Number(note.serviceJobId) === Number(jobId))).reverse(),
    progressHistory: sortById(progressEntries.filter((entry) => Number(entry.serviceJobId) === Number(jobId))).reverse(),
    usedParts: sortById(partsUsed.filter((part) => Number(part.serviceJobId) === Number(jobId))).reverse(),
    images: sortById(images.filter((image) => Number(image.serviceJobId) === Number(jobId))).reverse().map((image) => fileView(image, 'photo'))
  };
}

async function canAccessServiceJob(user, job) {
  if (!job) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'customer') return Number(job.customerId) === Number(user.id);
  if (user.role === 'technician') {
    const technician = await getTechnicianByUserId(user.id);
    return technician && Number(job.assignedTechnicianId) === Number(technician.id);
  }
  return false;
}

function validateUploadFile(file) {
  const fileName = String(file.fileName || '').trim();
  const extension = fileName.split('.').pop().toLowerCase();
  const content = String(file.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const sizeBytes = Buffer.byteLength(content, 'base64');
  if (!fileName || !allowedUploadExtensions.includes(extension)) {
    const error = new Error('Unsupported file type. Allowed formats: JPG, PNG, PDF, DOCX.');
    error.status = 400;
    throw error;
  }
  if (!content || sizeBytes > maxUploadBytes) {
    const error = new Error('File is required and must be 5MB or smaller.');
    error.status = 400;
    throw error;
  }
  return { fileName, extension, content, sizeBytes };
}

async function createUploadAudit(data) {
  return createDocument(collections.uploadAuditLogs, data);
}

async function recordStoredPhoto(user, data, storedFile) {
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!await canAccessServiceJob(user, job)) {
    const error = new Error('You cannot upload files for this service job.');
    error.status = 403;
    throw error;
  }
  if (!photoTypes.includes(data.photoType)) {
    const error = new Error('Invalid photo type.');
    error.status = 400;
    throw error;
  }
  const duplicate = (await all(collections.serviceImages)).find((item) => (
    Number(item.serviceJobId) === Number(data.serviceJobId)
    && item.fileName === storedFile.originalName
    && item.photoType === data.photoType
  ));
  if (duplicate) {
    const error = new Error('This photo was already uploaded for the selected service job and type.');
    error.status = 409;
    throw error;
  }
  const technician = user.role === 'technician' ? await getTechnicianByUserId(user.id) : null;
  const photo = await createDocument(collections.serviceImages, {
    serviceJobId: asId(data.serviceJobId),
    vehicleId: asId(data.vehicleId || job.vehicleId),
    customerId: asId(job.customerId),
    technicianId: technician?.id || data.technicianId || null,
    photoType: data.photoType,
    imageUrl: storedFile.relativePath,
    filePath: storedFile.absolutePath,
    storagePath: storedFile.storagePath || '',
    fileName: storedFile.originalName,
    mimeType: storedFile.mimeType,
    sizeBytes: storedFile.sizeBytes,
    description: String(data.description || '').trim(),
    uploadedBy: user.role,
    uploadedAt: fieldValue()
  });
  const galleryField = {
    'Before Service': 'beforeImages',
    'After Service': 'afterImages',
    'Replaced Part': 'damageImages',
    'Vehicle Inspection': 'completedImages'
  }[data.photoType];
  if (galleryField) {
    await docRef(collections.serviceJobs, job.id).set({
      [galleryField]: admin.firestore.FieldValue.arrayUnion(storedFile.relativePath),
      updatedAt: fieldValue()
    }, { merge: true });
  }
  await createUploadAudit({ fileKind: 'photo', fileId: photo.id, action: 'Uploaded', userId: user.id, role: user.role });
  await createUserNotification(job.customerId, 'Service Photo Uploaded', `${data.photoType} photo uploaded for service job #SJ-${job.id}.`);
  return fileView(photo, 'photo');
}

async function recordStoredDocument(user, data, storedFile) {
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!await canAccessServiceJob(user, job)) {
    const error = new Error('You cannot upload documents for this service job.');
    error.status = 403;
    throw error;
  }
  if (!documentTypes.includes(data.documentType)) {
    const error = new Error('Invalid document type.');
    error.status = 400;
    throw error;
  }
  const duplicate = (await all(collections.documents)).find((item) => (
    Number(item.serviceJobId) === Number(data.serviceJobId)
    && item.fileName === storedFile.originalName
    && item.documentType === data.documentType
  ));
  if (duplicate) {
    const error = new Error('This document was already uploaded for the selected service job and type.');
    error.status = 409;
    throw error;
  }
  const document = await createDocument(collections.documents, {
    serviceJobId: asId(data.serviceJobId),
    vehicleId: asId(data.vehicleId || job.vehicleId),
    customerId: asId(job.customerId),
    documentType: data.documentType,
    fileName: storedFile.originalName,
    fileUrl: storedFile.relativePath,
    filePath: storedFile.absolutePath,
    storagePath: storedFile.storagePath || '',
    mimeType: storedFile.mimeType,
    sizeBytes: storedFile.sizeBytes,
    uploadedBy: user.role,
    uploadedAt: fieldValue(),
    description: String(data.description || '').trim()
  });
  await createUploadAudit({ fileKind: 'document', fileId: document.id, action: 'Uploaded', userId: user.id, role: user.role });
  if (data.documentType === 'Warranty Document') {
    await createUserNotification(job.customerId, 'Warranty Document Available', `Warranty document uploaded for service job #SJ-${job.id}.`);
  }
  return fileView(document, 'document');
}

async function getFileForDownload(user, kind, id) {
  const collection = kind === 'photo' ? collections.serviceImages : collections.documents;
  const file = await getById(collection, id);
  if (!file) return null;
  const job = await getById(collections.serviceJobs, file.serviceJobId);
  if (!await canAccessServiceJob(user, job)) return null;
  await createUploadAudit({ fileKind: kind, fileId: Number(id), action: 'Downloaded', userId: user.id, role: user.role });
  return file;
}

async function getPartUsagePhotoForDownload(user, id) {
  const usage = await getById(collections.serviceJobParts, id);
  if (!usage?.photoPath) return null;
  const job = await getById(collections.serviceJobs, usage.serviceJobId);
  if (!await canAccessServiceJob(user, job)) return null;
  await createUploadAudit({ fileKind: 'partPhoto', fileId: Number(id), action: 'Downloaded', userId: user.id, role: user.role });
  return {
    filePath: usage.photoPath,
    fileName: usage.photoFileName || `part-photo-${id}.jpg`
  };
}

async function deleteStoredFile(user, kind, id) {
  if (user.role !== 'admin') {
    const error = new Error('Only admin can permanently delete files.');
    error.status = 403;
    throw error;
  }
  const collection = kind === 'photo' ? collections.serviceImages : collections.documents;
  const file = await getById(collection, id);
  if (!file) return null;
  await deleteDocument(collection, id);
  if (kind === 'photo' && file.serviceJobId && file.imageUrl) {
    const removeUrl = admin.firestore.FieldValue.arrayRemove(file.imageUrl);
    await docRef(collections.serviceJobs, file.serviceJobId).set({
      beforeImages: removeUrl,
      afterImages: removeUrl,
      damageImages: removeUrl,
      completedImages: removeUrl,
      updatedAt: fieldValue()
    }, { merge: true });
  }
  await createUploadAudit({ fileKind: kind, fileId: Number(id), action: 'Deleted', userId: user.id, role: user.role });
  return file;
}

function mediaValues(record, fields) {
  return fields.flatMap((field) => {
    const value = record?.[field];
    return Array.isArray(value) ? value : [value];
  }).filter((value) => /^https:\/\//i.test(String(value || '')));
}

async function getEntityMedia(entity, id) {
  const entityFields = {
    vehicle: [collections.vehicles, ['frontImage', 'rearImage', 'leftImage', 'rightImage', 'interiorImage', 'engineImage', 'imageUrl']],
    technician: [collections.technicians, ['profileImage', 'nicImage', 'certificateUrls']],
    inventory: [collections.inventoryParts, ['image']],
    service: [collections.servicePackages, ['image']],
    pricingPlan: [collections.pricingPlans, ['image']],
    serviceJob: [collections.serviceJobs, ['beforeImages', 'afterImages', 'damageImages', 'completedImages']]
  };
  if (entity === 'customer') {
    const [customer, vehicles] = await Promise.all([
      getById(collections.users, id),
      allWhere(collections.vehicles, 'userId', Number(id))
    ]);
    return [...mediaValues(customer, ['profileImage', 'avatar']), ...vehicles.flatMap((vehicle) => (
      mediaValues(vehicle, ['frontImage', 'rearImage', 'leftImage', 'rightImage', 'interiorImage', 'engineImage', 'imageUrl'])
    ))];
  }
  const config = entityFields[entity];
  if (!config) return [];
  return mediaValues(await getById(config[0], id), config[1]);
}

function collectSupabaseUrls(value, urls = new Set()) {
  if (typeof value === 'string' && /\.supabase\.co\/storage\/v1\/object\/public\//i.test(value)) {
    urls.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectSupabaseUrls(item, urls));
  } else if (value && typeof value === 'object' && !value.toDate) {
    Object.values(value).forEach((item) => collectSupabaseUrls(item, urls));
  }
  return urls;
}

async function getReferencedMediaUrls() {
  const mediaCollections = [
    collections.users, collections.vehicles, collections.technicians, collections.servicePackages,
    collections.pricingPlans, collections.inventoryParts, collections.serviceJobs, collections.serviceImages,
    collections.documents, collections.invoices, collections.appSettings
  ];
  const records = (await Promise.all(mediaCollections.map((collection) => all(collection)))).flat();
  return [...collectSupabaseUrls(records.filter((record) => record.archived !== true))];
}

async function updateTechnicianProgress(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can update this job.');
    error.status = 403;
    throw error;
  }
  if (job.status === 'Completed') {
    const error = new Error('A completed job cannot be updated again.');
    error.status = 409;
    throw error;
  }

  const progress = Number(data.progressPercentage);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    const error = new Error('Progress must be between 0 and 100.');
    error.status = 400;
    throw error;
  }

  const status = data.status || job.status;
  assertServiceJobStatus(status);
  if (status === 'Completed' && progress < 100) {
    const error = new Error('Progress must be 100% before completing a job.');
    error.status = 400;
    throw error;
  }

  const progressEntry = await createDocument(collections.technicianProgress, {
    serviceJobId: asId(data.serviceJobId),
    technicianId: technician.id,
    progressPercentage: progress,
    status,
    remarks: String(data.remarks || '').trim()
  });

  const update = {
    progress,
    status,
    completionDate: status === 'Completed' ? today() : job.completionDate || ''
  };
  const updated = await updateDocument(collections.serviceJobs, data.serviceJobId, update);
  await notifyAdmins('Service Status Updated', `Service job #SJ-${data.serviceJobId} changed to ${status}.`);

  if (status === 'Completed') {
    await createUserNotification(job.customerId, 'Work Completed', `Your ${job.serviceType} work is complete. Your vehicle is ready for final admin review.`);
  }
  const linkedQueueEntries = await allWhere(collections.queueEntries, 'serviceJobId', Number(data.serviceJobId));
  await Promise.all(linkedQueueEntries.map((entry) => updateDocument(collections.queueEntries, entry.id, status === 'Completed'
    ? { status: 'Completed', completedAt: fieldValue() }
    : { status: 'In Service', ...(entry.serviceStartedAt ? {} : { serviceStartedAt: fieldValue() }) })));
  if (status === 'Completed' && job.bookingId) await updateDocument(collections.bookings, job.bookingId, { status: 'Completed', progress: 100 });

  const context = await dashboardContext();
  return { progress: progressEntry, job: serviceJobView(updated, context) };
}

async function addTechnicianNote(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can add notes to this job.');
    error.status = 403;
    throw error;
  }

  return createDocument(collections.technicianNotes, {
    serviceJobId: asId(data.serviceJobId),
    technicianId: technician.id,
    note: data.note.trim()
  });
}

async function addUsedPart(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can add parts to this job.');
    error.status = 403;
    throw error;
  }

  const quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('Part quantity must be greater than zero.');
    error.status = 400;
    throw error;
  }

  const condition = data.condition || 'Brand New';
  if (!partConditions.includes(condition)) {
    const error = new Error('Invalid part condition.');
    error.status = 400;
    throw error;
  }

  const usage = await db.runTransaction(async (transaction) => {
    const partRef = docRef(collections.inventoryParts, data.partId);
    const partSnapshot = await transaction.get(partRef);
    if (!partSnapshot.exists) {
      const error = new Error('Inventory part not found.');
      error.status = 404;
      throw error;
    }

    const part = { id: Number(partSnapshot.id), ...partSnapshot.data() };
    const currentStock = Number(part.stock || 0);
    const isCustomerSupplied = condition === 'Customer Supplied';
    if (!isCustomerSupplied && quantity > currentStock) {
      const error = new Error('Cannot use more spare parts than available stock.');
      error.status = 400;
      throw error;
    }

    const unitPrice = Number(data.unitPrice || part.sellingPrice || part.unitPrice || 0);
    const warrantyStartDate = data.warrantyStartDate || today();
    const warrantyExpiryDate = data.warrantyExpiryDate || warrantyStartDate;
    const ids = await nextIdsForCollections(transaction, {
      [collections.serviceJobParts]: 1,
      [collections.inventoryMovements]: 1
    });
    const id = ids[collections.serviceJobParts][0];
    const movementId = ids[collections.inventoryMovements][0];
    const usageRef = docRef(collections.serviceJobParts, id);
    const partPhoto = data.partPhoto || null;
    const photoUrl = partPhoto ? `/api/part-usages/${id}/photo` : String(data.photoUrl || '').trim();
    const usageData = {
      id,
      serviceJobId: asId(data.serviceJobId),
      partId: asId(data.partId),
      itemCode: part.itemCode || part.sku || '',
      partName: part.partName || part.name,
      brand: part.brand || '',
      condition,
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
      usedByTechnician: technician.id,
      warrantyProvider: data.warrantyProvider || part.warrantyProvider || part.supplier || '',
      warrantyPeriod: data.warrantyPeriod || part.warrantyPeriod || '',
      warrantyStartDate,
      warrantyExpiryDate,
      note: String(data.note || '').trim(),
      photoUrl,
      photoPath: partPhoto?.absolutePath || '',
      photoFileName: partPhoto?.originalName || '',
      photoMimeType: partPhoto?.mimeType || '',
      photoSizeBytes: Number(partPhoto?.sizeBytes || 0),
      createdAt: fieldValue()
    };
    transaction.set(usageRef, usageData);

    if (!isCustomerSupplied) {
      const remaining = currentStock - quantity;
      transaction.set(partRef, {
        stock: remaining,
        stockQuantity: remaining,
        status: inventoryStockStatus(remaining, part.status, part.minimumStockLevel),
        updatedAt: fieldValue()
      }, { merge: true });
    }

    transaction.set(docRef(collections.inventoryMovements, movementId), {
      id: movementId,
      partId: asId(data.partId),
      partName: part.partName || part.name,
      itemCode: part.itemCode || part.sku || '',
      serviceJobId: asId(data.serviceJobId),
      technicianId: technician.id,
      vehicleId: job.vehicleId,
      customerId: job.customerId,
      type: isCustomerSupplied ? 'Customer Supplied Part Used' : 'Part Used',
      quantity,
      condition,
      unitPrice,
      totalPrice: quantity * unitPrice,
      note: String(data.note || '').trim(),
      createdAt: fieldValue()
    });

    return usageData;
  });

  const updatedPart = await getById(collections.inventoryParts, data.partId);
  if (updatedPart) await maybeCreateLowStockAlert(updatedPart);
  await createUserNotification(job.customerId, 'Parts Used', `${usage.partName} was used for your service job #SJ-${job.id}.`);
  return usage;
}

async function requestAdditionalParts(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can request parts for this job.');
    error.status = 403;
    throw error;
  }

  const requestText = data.request.trim();
  const note = await createDocument(collections.technicianNotes, {
    serviceJobId: asId(data.serviceJobId),
    technicianId: technician.id,
    note: `Parts request: ${requestText}`
  });
  await updateDocument(collections.serviceJobs, data.serviceJobId, { status: 'Waiting For Parts' });
  await notifyAdmins('Parts Request', `Service job #SJ-${data.serviceJobId} needs additional parts: ${requestText}`);
  return note;
}

async function returnUnusedPart(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can return parts for this job.');
    error.status = 403;
    throw error;
  }

  const quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('Return quantity must be greater than zero.');
    error.status = 400;
    throw error;
  }

  const result = await db.runTransaction(async (transaction) => {
    const partRef = docRef(collections.inventoryParts, data.partId);
    const partSnapshot = await transaction.get(partRef);
    if (!partSnapshot.exists) {
      const error = new Error('Inventory part not found.');
      error.status = 404;
      throw error;
    }
    const part = { id: Number(partSnapshot.id), ...partSnapshot.data() };
    const stock = Number(part.stock || 0) + quantity;
    const movementId = await nextId(transaction, collections.inventoryMovements);
    transaction.set(partRef, {
      stock,
      stockQuantity: stock,
      status: inventoryStockStatus(stock, part.status, part.minimumStockLevel),
      updatedAt: fieldValue()
    }, { merge: true });

    const movement = {
      id: movementId,
      partId: asId(data.partId),
      partName: part.partName || part.name,
      itemCode: part.itemCode || part.sku || '',
      serviceJobId: asId(data.serviceJobId),
      technicianId: technician.id,
      vehicleId: job.vehicleId,
      customerId: job.customerId,
      type: 'Part Returned',
      quantity,
      condition: data.condition || 'Brand New',
      unitPrice: Number(part.sellingPrice || part.unitPrice || 0),
      totalPrice: quantity * Number(part.sellingPrice || part.unitPrice || 0),
      note: String(data.note || '').trim(),
      createdAt: fieldValue()
    };
    transaction.set(docRef(collections.inventoryMovements, movementId), movement);
    return movement;
  });

  return result;
}

async function recordReplacedPart(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can record replaced parts for this job.');
    error.status = 403;
    throw error;
  }
  return createDocument(collections.replacedParts, {
    serviceJobId: asId(data.serviceJobId),
    technicianId: technician.id,
    vehicleId: job.vehicleId,
    customerId: job.customerId,
    removedPartName: data.removedPartName.trim(),
    condition: data.condition.trim(),
    replacementReason: data.replacementReason.trim(),
    photoEvidence: String(data.photoEvidence || '').trim(),
    note: String(data.note || '').trim()
  });
}

async function uploadServiceImage(userId, data) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, data.serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can upload images for this job.');
    error.status = 403;
    throw error;
  }

  return createDocument(collections.serviceImages, {
    serviceJobId: asId(data.serviceJobId),
    vehicleId: job.vehicleId,
    customerId: job.customerId,
    technicianId: technician.id,
    photoType: data.photoType || 'During Service',
    imageUrl: data.imageUrl.trim(),
    fileName: data.imageUrl.trim().split('/').pop() || 'service-photo.jpg',
    caption: String(data.caption || '').trim()
  });
}

async function completeTechnicianJob(userId, serviceJobId) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can complete this job.');
    error.status = 403;
    throw error;
  }
  if (job.status === 'Completed') {
    const context = await dashboardContext();
    return serviceJobView(job, context);
  }

  const progressEntries = await all(collections.technicianProgress);
  const latestProgress = progressEntries
    .filter((entry) => Number(entry.serviceJobId) === Number(serviceJobId) && Number(entry.technicianId) === Number(technician.id))
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
  if (!latestProgress || Number(latestProgress.progressPercentage) < 100) {
    const error = new Error('Technician cannot complete a job without updating progress to 100%.');
    error.status = 400;
    throw error;
  }

  const updated = await updateDocument(collections.serviceJobs, serviceJobId, {
    status: 'Completed',
    progress: 100,
    completionDate: today()
  });
  await notifyAdmins('Service Job Completed', `Service job #SJ-${serviceJobId} is ready for admin review.`);
  await createUserNotification(job.customerId, 'Work Completed', `Your ${job.serviceType} work is complete. Your vehicle is ready for final admin review.`);

  const linkedQueueEntries = await allWhere(collections.queueEntries, 'serviceJobId', Number(serviceJobId));
  await Promise.all(linkedQueueEntries.map((entry) => updateDocument(collections.queueEntries, entry.id, {
    status: 'Completed', completedAt: fieldValue()
  })));
  if (job.bookingId) await updateDocument(collections.bookings, job.bookingId, { status: 'Completed', progress: 100 });

  const context = await dashboardContext();
  return serviceJobView(updated, context);
}

async function acceptTechnicianJob(userId, serviceJobId) {
  const technician = await getTechnicianByUserId(userId);
  const job = await getById(collections.serviceJobs, serviceJobId);
  if (!technician || !job || Number(job.assignedTechnicianId) !== Number(technician.id)) {
    const error = new Error('Only the assigned technician can accept this job.');
    error.status = 403;
    throw error;
  }
  if (!['Pending', 'Assigned'].includes(job.status)) {
    const error = new Error('Only a pending assignment can be accepted.');
    error.status = 409;
    throw error;
  }
  const updated = await updateDocument(collections.serviceJobs, serviceJobId, {
    status: 'Assigned', acceptedAt: fieldValue()
  });
  await notifyAdmins('Queue Job Accepted', `Service job #SJ-${serviceJobId} was accepted by the assigned technician.`);
  const context = await dashboardContext();
  return serviceJobView(updated, context);
}

async function createService(data) {
  const service = await createDocument(collections.servicePackages, {
    name: data.name.trim(),
    price: Number(data.price),
    duration: data.duration.trim(),
    description: data.description.trim(),
    image: data.image || defaultServiceImage,
    active: true
  });
  return { id: service.id, name: service.name, price: service.price, duration: service.duration, description: service.description, image: service.image };
}

async function updateService(id, data) {
  const service = await updateDocument(collections.servicePackages, id, {
    name: data.name.trim(),
    price: Number(data.price),
    duration: data.duration.trim(),
    description: data.description.trim(),
    image: data.image || defaultServiceImage
  });
  return service ? { id: service.id, name: service.name, price: service.price, duration: service.duration, description: service.description, image: service.image } : null;
}

async function deleteService(id) {
  const service = await getById(collections.servicePackages, id);
  if (!service) return false;
  const [bookings, invoices, feedback] = await Promise.all([
    allWhere(collections.bookings, 'servicePackageId', Number(id)),
    allWhere(collections.invoices, 'servicePackageId', Number(id)),
    allWhere(collections.feedback, 'servicePackageId', Number(id))
  ]);
  if (bookings.length || invoices.length || feedback.length) {
    await updateDocument(collections.servicePackages, id, { active: false, archived: true, archivedAt: fieldValue() });
    return true;
  }
  await deleteDocument(collections.servicePackages, id);
  return true;
}

async function createInvoice(data) {
  let serviceJob = null;
  let partsTotal = 0;
  if (data.serviceJobId) {
    serviceJob = await getById(collections.serviceJobs, data.serviceJobId);
    if (!serviceJob || serviceJob.status !== 'Completed') {
      const error = new Error('Billing can only be generated after job completion.');
      error.status = 400;
      throw error;
    }
    const usages = await all(collections.serviceJobParts);
    partsTotal = usages
      .filter((usage) => Number(usage.serviceJobId) === Number(data.serviceJobId))
      .reduce((sum, usage) => sum + Number(usage.totalPrice || Number(usage.quantity || 0) * Number(usage.unitPrice || 0)), 0);
  }

  const service = await findServiceByName(data.service, false);
  if (!service) {
    const error = new Error('Selected service package was not found.');
    error.status = 400;
    throw error;
  }

  const laborCost = Number(data.laborCost || data.amount || 0);
  const serviceCharges = Number(data.serviceCharges || 0);
  const tax = Number(data.tax || 0);
  const discount = Number(data.discount || 0);
  const grandTotal = partsTotal + laborCost + serviceCharges + tax - discount;

  const invoice = await createDocument(collections.invoices, {
    userId: asId(data.customerId),
    serviceJobId: data.serviceJobId ? asId(data.serviceJobId) : null,
    servicePackageId: service.id,
    partsTotal,
    laborCost,
    serviceCharges,
    tax,
    discount,
    amount: grandTotal,
    paymentStatus: data.payment,
    invoiceDate: data.date,
    customerSignature: String(data.customerSignature || '').trim(),
    mechanicSignature: String(data.mechanicSignature || '').trim()
  });

  return invoiceView(invoice, new Map([[service.id, service]]));
}

async function notificationRecipient(userId) {
  const recipient = await getById(collections.users, userId);
  if (!recipient || !['customer', 'technician'].includes(recipient.role) || String(recipient.status || '').toLowerCase() !== 'active') {
    const error = new Error('Select a valid customer or technician recipient.');
    error.status = 400;
    throw error;
  }
  return recipient;
}

async function createNotification(data, senderUserId = null) {
  const userId = asId(data.userId);
  const recipient = await notificationRecipient(userId);
  let draft = null;
  if (data.draftId) {
    draft = await getById(collections.notificationDrafts, data.draftId);
    if (!draft || Number(draft.createdByUserId) !== Number(senderUserId)) {
      const error = new Error('Notification draft not found.');
      error.status = 404;
      throw error;
    }
  }

  const notification = await createDocument(collections.notifications, {
    userId: recipient.id,
    recipientRole: recipient.role,
    senderUserId: senderUserId ? asId(senderUserId) : null,
    type: String(data.type).trim().slice(0, 80),
    message: String(data.message).trim().slice(0, 2000),
    unread: true
  });
  if (draft) await deleteDocument(collections.notificationDrafts, draft.id);
  return sentNotificationView(notification, new Map([[Number(recipient.id), recipient]]));
}

async function createNotificationDraft(userId, data) {
  const recipient = await notificationRecipient(asId(data.userId));
  const payload = {
    createdByUserId: asId(userId),
    userId: recipient.id,
    recipientRole: recipient.role,
    type: String(data.type).trim().slice(0, 80),
    message: String(data.message).trim().slice(0, 2000)
  };
  const draftId = data.draftId ? asId(data.draftId) : null;
  if (draftId) {
    const current = await getById(collections.notificationDrafts, draftId);
    if (!current || Number(current.createdByUserId) !== Number(userId)) {
      const error = new Error('Notification draft not found.');
      error.status = 404;
      throw error;
    }
    const updated = await updateDocument(collections.notificationDrafts, draftId, payload);
    return notificationDraftView(updated, new Map([[Number(recipient.id), recipient]]));
  }
  const draft = await createDocument(collections.notificationDrafts, payload);
  return notificationDraftView(draft, new Map([[Number(recipient.id), recipient]]));
}

async function deleteNotificationDraft(userId, draftId) {
  const draft = await getById(collections.notificationDrafts, draftId);
  if (!draft || Number(draft.createdByUserId) !== Number(userId)) return false;
  await deleteDocument(collections.notificationDrafts, draftId);
  return true;
}

async function getInvoicePdf(id, requester) {
  const invoice = await getById(collections.invoices, id);
  if (!invoice || (requester.role !== 'admin' && invoice.userId !== requester.id)) return null;

  const [user, servicePackage, pricingPlan, job, parts, vehicles, technicians, users] = await Promise.all([
    getById(collections.users, invoice.userId),
    invoice.servicePackageId ? getById(collections.servicePackages, invoice.servicePackageId) : null,
    invoice.pricingPlanId ? getById(collections.pricingPlans, invoice.pricingPlanId) : null,
    invoice.serviceJobId ? getById(collections.serviceJobs, invoice.serviceJobId) : null,
    all(collections.serviceJobParts),
    all(collections.vehicles),
    all(collections.technicians),
    all(collections.users)
  ]);
  const vehicle = job ? vehicles.find((item) => Number(item.id) === Number(job.vehicleId)) : null;
  const technician = job ? technicians.find((item) => Number(item.id) === Number(job.assignedTechnicianId)) : null;
  const technicianUser = technician ? users.find((item) => Number(item.id) === Number(technician.userId)) : null;
  const invoiceParts = parts.filter((part) => Number(part.serviceJobId) === Number(invoice.serviceJobId));

  return createInvoicePdfBuffer({
    invoice,
    user,
    service: servicePackage || pricingPlan || { name: invoice.serviceName || 'Service Package' },
    job,
    vehicle,
    technicianName: technicianUser?.name || technician?.name || 'Unassigned',
    parts: invoiceParts
  });
}

async function markInvoiceEmailed(id, adminUserId) {
  const invoice = await getById(collections.invoices, id);
  if (!invoice) {
    const error = new Error('Invoice not found.');
    error.status = 404;
    throw error;
  }
  await createDocument(collections.uploadAuditLogs, {
    fileKind: 'invoice',
    fileId: Number(id),
    action: 'Email Requested',
    userId: Number(adminUserId),
    role: 'admin'
  });
  await createUserNotification(invoice.userId, 'Invoice Generated', `Invoice #INV-${id} is ready.`);
  return true;
}

async function checkConnection() {
  assertFirebaseConfigured();
  await db.collection(collections.users).limit(1).get();
  return { ok: true, database: 'firebase-firestore' };
}

module.exports = {
  acceptTechnicianJob,
  addTechnicianNote,
  addUsedPart,
  advanceBooking,
  assignBookingTechnician,
  assignTechnician,
  cancelBooking,
  checkConnection,
  closeEmergency,
  collections,
  createBooking,
  createCustomer: async (data, passwordHash) => createUser({ role: 'customer', ...data, passwordHash }),
  createEmergency,
  createFeedback,
  createInvoice,
  createPricingPlan,
  createInventoryItem,
  createInventorySupplier,
  createNotification,
  createNotificationDraft,
  createNewsletterSubscription,
  createService,
  createServiceJob,
  createTechnician,
  createUser,
  createVehicle,
  deleteInventoryItem,
  deleteInventorySupplier,
  deletePricingPlan,
  deleteService,
  deleteNotificationDraft,
  deleteCustomer,
  deleteTechnician,
  deleteVehicle,
  findUserByEmailRole,
  getAdminDashboard,
  getAdminMessageCenter,
  getAdminServiceJobDetails,
  getById,
  getCustomerDashboard,
  getEmergencyRequests,
  getEntityMedia,
  getReferencedMediaUrls,
  getBookingSlots,
  getInventoryReports,
  getIndividualReportPdf,
  getOverallSalesReportPdf,
  getOverallSystemReportPdf,
  getFileForDownload,
  getFirestoreReadCacheStats,
  getInvoicePdf,
  getPartUsagePhotoForDownload,
  getPublicLandingContent,
  getPublicServiceRatings,
  getPublicStats,
  getPublicPricingPlans,
  getTechnicianDashboard,
  getTechnicianPerformance,
  getTechnicianWorkload,
  getUserNotifications,
  publicUser,
  recordReplacedPart,
  recordStoredDocument,
  recordStoredPhoto,
  requestAdditionalParts,
  requestCustomerPackage,
  reviewCustomerPackageRequest,
  returnUnusedPart,
  selectCustomerPackage,
  deleteStoredFile,
  markInvoiceEmailed,
  markInvoicePaid,
  markAllCustomerNotificationsRead,
  markAllUserNotificationsRead,
  markCustomerNotificationRead,
  markUserNotificationRead,
  completeTechnicianJob,
  confirmCustomerPackageCashierPayment,
  updateBooking,
  updateCustomer,
  updateCompanySettings,
  updateDocument,
  updateInventoryItem,
  updateInventorySupplier,
  updateLandingContentItem,
  updateLandingStat,
  updateProfile,
  updatePricingPlan,
  updateService,
  updateTechnician,
  updateTechnicianProgress,
  uploadServiceImage,
  updateVehicle
};
