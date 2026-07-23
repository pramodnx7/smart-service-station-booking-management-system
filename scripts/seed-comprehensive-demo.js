require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { admin, db, firebaseConfigurationError } = require('../src/firebase');

const seedBatch = 'comprehensive-demo-v1';
const checkOnly = process.argv.includes('--check');
const markerRef = () => db.collection('meta').doc(seedBatch);
const timestamp = () => admin.firestore.FieldValue.serverTimestamp();

const customerNames = [
  'Nimal Perera', 'Ayesha Fernando', 'Kasun Silva', 'Dinithi Jayasinghe', 'Ravindu Bandara',
  'Sachini Gunawardena', 'Isuru Wijesinghe', 'Piumi Rathnayake', 'Chamara Ekanayake', 'Hiruni Herath'
];
const technicianNames = [
  'Sahan de Alwis', 'Gayan Kumara', 'Pradeep Lakmal', 'Thilina Rajapaksha', 'Manoj Weerakoon',
  'Rukshan Peiris', 'Asanka Gamage', 'Lahiru Nissanka', 'Supun Pathirana', 'Janith Kodithuwakku'
];
const vehicles = [
  ['Toyota', 'Corolla', 'CAA-4101', '2018'],
  ['Honda', 'Vezel', 'CAB-5202', '2019'],
  ['Suzuki', 'Wagon R', 'CAC-6303', '2020'],
  ['Nissan', 'X-Trail', 'CAD-7404', '2017'],
  ['Toyota', 'Aqua', 'CAE-8505', '2021'],
  ['Mitsubishi', 'Lancer', 'CAF-9606', '2016'],
  ['Honda', 'Fit', 'CAG-1707', '2020'],
  ['Suzuki', 'Swift', 'CAH-2808', '2022'],
  ['Toyota', 'Prius', 'CAI-3909', '2019'],
  ['Nissan', 'Leaf', 'CAJ-4010', '2021']
];
const supplierNames = [
  'Lanka Auto Parts', 'Colombo Motor Traders', 'Central Bearings', 'Prime Brake Systems', 'Island Filters',
  'PowerCell Batteries', 'RoadGrip Tyres', 'CoolTech Radiators', 'ElectroDrive Lanka', 'Southern Lubricants'
];
const partCatalog = [
  ['ENG-001', 'Engine Oil 5W-30', 'Fluids & Lubricants', 'Mobil', 5500, 7200],
  ['FLT-002', 'Oil Filter', 'Filters', 'Denso', 1800, 2600],
  ['BRK-003', 'Front Brake Pad Set', 'Brake System', 'Brembo', 12500, 16800],
  ['ELC-004', '12V Battery', 'Batteries', 'Amaron', 32000, 38500],
  ['SUS-005', 'Shock Absorber', 'Suspension', 'KYB', 18000, 24000],
  ['COL-006', 'Radiator Coolant', 'Cooling System', 'Toyota', 4200, 5900],
  ['ELC-007', 'Spark Plug Set', 'Electrical', 'NGK', 6500, 8900],
  ['TYR-008', 'All-Season Tyre', 'Tires & Wheels', 'Bridgestone', 28000, 34500],
  ['ENG-009', 'Timing Belt Kit', 'Engine Parts', 'Gates', 22000, 29000],
  ['ACC-010', 'Wiper Blade Pair', 'Accessories', 'Bosch', 4500, 6200]
];
const extraServices = [
  ['Wheel Alignment', 9500, '1 hour', 'Four-wheel alignment and steering geometry inspection.'],
  ['Air Conditioning Service', 16500, '2 hours', 'Air-conditioning inspection, cleaning, and refrigerant service.']
];
const extraPlans = [
  ['Safety Check', 'Quick', 7500],
  ['City Driver Care', 'Free', 0],
  ['High Mileage Care', 'Mileage', 32000],
  ['Hybrid Care', 'Hybrid', 35000],
  ['Fleet Care', 'Business', 50000],
  ['Seasonal Care', 'Seasonal', 22000],
  ['Road Trip Care', 'Travel', 26000]
];
const bookingStates = [
  ['Pending', 10], ['Approved', 35], ['In Progress', 70], ['Completed', 100], ['Cancelled', 0],
  ['Checked In', 20], ['Approved', 35], ['In Progress', 70], ['Completed', 100], ['Cancelled', 0]
];
const jobStates = [
  ['Pending', 0], ['Assigned', 0], ['In Progress', 45], ['Completed', 100], ['Cancelled', 0],
  ['Assigned', 10], ['Waiting For Parts', 55], ['Quality Check', 90], ['Completed', 100], ['Cancelled', 0]
];
const queueStates = [
  'Waiting', 'Called', 'In Service', 'Completed', 'Skipped',
  'Cancelled', 'No Show', 'Waiting', 'In Service', 'Completed'
];
const queueTypes = [
  'Appointment', 'Walk-in', 'Emergency', 'Appointment', 'Walk-in',
  'Emergency', 'Appointment', 'Walk-in', 'Emergency', 'Appointment'
];
const feedbackComments = [
  'Friendly team and a clear explanation of the completed work.',
  'The booking process was simple and the vehicle was ready on time.',
  'Excellent diagnosis and professional customer service.',
  'The technician kept me informed throughout the repair.',
  'Good value, clean workshop, and helpful staff.',
  'The queue updates made the visit easy to plan.',
  'Brake service was completed carefully and the car feels much better.',
  'Fast response to my emergency request and good communication.',
  'The invoice was detailed and easy to understand.',
  'Reliable service. I would book with AutoCare again.'
];

function dateString(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function dateTime(date, time) {
  return `${date}T${time}:00`;
}

function firestoreTime(minutesAgo) {
  return admin.firestore.Timestamp.fromDate(new Date(Date.now() - (minutesAgo * 60 * 1000)));
}

function mapDocuments(snapshot) {
  return snapshot.docs.map((document) => ({ id: Number(document.id), ...document.data() }));
}

function maximumId(items) {
  return items.reduce((maximum, item) => Math.max(maximum, Number(item.id) || 0), 0);
}

async function loadCollections(names) {
  const snapshots = await Promise.all(names.map((name) => db.collection(name).get()));
  return Object.fromEntries(names.map((name, index) => [name, mapDocuments(snapshots[index])]));
}

function requireConfiguredTarget() {
  if (!db) throw new Error(firebaseConfigurationError || 'Firebase Admin is not configured.');
  if (String(process.env.FIREBASE_PROJECT_ID || '') !== 'smartmanagement-b07fa') {
    throw new Error('This seed is restricted to smartmanagement-b07fa.');
  }
  if (String(process.env.FIRESTORE_DATABASE_ID || '(default)') !== '(default)') {
    throw new Error('This seed is restricted to the (default) Firestore database.');
  }
}

async function seed() {
  requireConfiguredTarget();
  const marker = await markerRef().get();
  if (marker.exists && marker.data().completed) {
    console.log(JSON.stringify({ skipped: true, reason: `${seedBatch} already completed`, ...marker.data() }, null, 2));
    return;
  }

  const collectionNames = [
    'users', 'technicians', 'vehicles', 'servicePackages', 'pricingPlans', 'customerPackages', 'customerPackageRequests', 'inventoryCategories',
    'inventorySuppliers', 'inventoryParts', 'bookings', 'serviceJobs', 'invoices',
    'emergencyRequests', 'feedback', 'notifications', 'notificationDrafts', 'newsletterSubscriptions',
    'inventoryMovements', 'serviceJobParts', 'technicianNotes', 'technicianProgress',
    'replacedParts', 'queueEntries', 'servicePhotos', 'documents', 'uploadAuditLogs'
  ];
  const records = await loadCollections(collectionNames);
  const countersSnapshot = await db.collection('meta').doc('counters').get();
  const counters = { ...(countersSnapshot.data() || {}) };
  collectionNames.forEach((name) => {
    counters[name] = Math.max(Number(counters[name] || 0), maximumId(records[name]));
  });
  const nextId = (collection) => {
    counters[collection] = Number(counters[collection] || 0) + 1;
    return counters[collection];
  };

  const writes = [];
  const add = (collection, data, id = nextId(collection)) => {
    const document = { ...data, id, seedBatch, createdAt: timestamp() };
    writes.push({ collection, id, document });
    records[collection].push(document);
    return document;
  };

  const unavailablePassword = crypto.randomBytes(32).toString('base64url');
  const passwordHash = await bcrypt.hash(unavailablePassword, 12);
  const activeCustomers = records.users.filter((user) => user.role === 'customer' && String(user.status).toLowerCase() === 'active');
  for (let index = activeCustomers.length; index < 10; index += 1) {
    const sequence = index + 1;
    activeCustomers.push(add('users', {
      role: 'customer',
      name: customerNames[index],
      email: `demo.customer${String(sequence).padStart(2, '0')}@autocare.test`,
      emailLower: `demo.customer${String(sequence).padStart(2, '0')}@autocare.test`,
      phone: `07710${String(sequence).padStart(5, '0')}`,
      passwordHash,
      status: 'active',
      mustResetPassword: true,
      avatar: '',
      profileImage: ''
    }));
  }
  const customers = activeCustomers.slice(0, 10);

  const activeTechnicians = records.technicians.filter((technician) => String(technician.status).toLowerCase() === 'active');
  for (let index = activeTechnicians.length; index < 10; index += 1) {
    const sequence = index + 1;
    const user = add('users', {
      role: 'technician',
      name: technicianNames[index],
      email: `demo.technician${String(sequence).padStart(2, '0')}@autocare.test`,
      emailLower: `demo.technician${String(sequence).padStart(2, '0')}@autocare.test`,
      phone: `07620${String(sequence).padStart(5, '0')}`,
      passwordHash,
      status: 'active',
      mustResetPassword: true,
      avatar: '',
      profileImage: ''
    });
    activeTechnicians.push(add('technicians', {
      userId: user.id,
      employeeNo: `TECH-${String(sequence).padStart(3, '0')}`,
      specialization: sequence % 3 === 0 ? 'General Service, Electrical Repair' : 'General Service',
      phone: user.phone,
      experienceYears: 2 + sequence,
      status: 'active',
      profileImage: '',
      nicImage: '',
      certificateUrls: []
    }));
  }
  const technicians = activeTechnicians.slice(0, 10);

  const activeServices = records.servicePackages.filter((service) => service.active !== false);
  let serviceIndex = 0;
  while (activeServices.length < 10) {
    const [name, price, duration, description] = extraServices[serviceIndex % extraServices.length];
    activeServices.push(add('servicePackages', { name, price, duration, description, image: '', active: true }));
    serviceIndex += 1;
  }
  const services = activeServices.slice(0, 10);

  const activePlans = records.pricingPlans.filter((plan) => plan.active !== false);
  let planIndex = 0;
  while (activePlans.length < 10) {
    const [name, badge, price] = extraPlans[planIndex % extraPlans.length];
    activePlans.push(add('pricingPlans', {
      name,
      badge,
      price,
      billingPeriod: 'service',
      image: '',
      features: ['Vehicle inspection', 'Service report', 'Priority support'],
      buttonText: `Choose ${name}`,
      featured: false,
      active: true,
      displayOrder: activePlans.length + 1
    }));
    planIndex += 1;
  }
  const plans = activePlans.slice(0, 10);
  customers.forEach((customer, index) => {
    const existing = records.customerPackages.find((customerPackage) => (
      Number(customerPackage.userId) === Number(customer.id)
      && customerPackage.status === 'active'
    ));
    if (existing) return;
    const plan = plans[index % plans.length];
    add('customerPackages', {
      userId: customer.id,
      pricingPlanId: plan.id,
      packageName: plan.name,
      badge: plan.badge || '',
      price: Number(plan.price || 0),
      billingPeriod: plan.billingPeriod || 'service',
      benefits: Array.isArray(plan.features) ? plan.features.filter(Boolean) : [],
      status: 'active',
      activatedAt: timestamp()
    }, customer.id);
  });

  const suppliers = supplierNames.map((name, index) => add('inventorySuppliers', {
    name,
    phone: `0112${String(400000 + index)}`,
    email: `supplier${index + 1}@autocare.test`,
    address: `${20 + index}, Industrial Road, Colombo`,
    status: index === 9 ? 'Inactive' : 'Active'
  }));

  const stockLevels = [0, 2, 4, 8, 12, 18, 25, 7, 3, 15];
  const parts = partCatalog.map(([itemCode, partName, category, brand, purchasePrice, sellingPrice], index) => add('inventoryParts', {
    itemCode,
    sku: itemCode,
    partName,
    name: partName,
    category,
    brand,
    manufacturer: brand,
    supplierId: suppliers[index].id,
    supplier: suppliers[index].name,
    description: `${partName} for workshop service and replacement jobs.`,
    purchasePrice,
    sellingPrice,
    unitPrice: sellingPrice,
    stock: stockLevels[index],
    stockQuantity: stockLevels[index],
    minimumStockLevel: 5,
    location: `Rack ${String.fromCharCode(65 + index)}-${index + 1}`,
    warrantyPeriod: index % 2 ? '6 months' : '12 months',
    warrantyProvider: suppliers[index].name,
    image: '',
    status: stockLevels[index] === 0 ? 'Out of Stock' : (stockLevels[index] <= 5 ? 'Low Stock' : 'Active')
  }));

  const demoVehicles = vehicles.map(([make, model, plateNumber, year], index) => add('vehicles', {
    userId: customers[index].id,
    name: `${make} ${model}`,
    make,
    model,
    plateNumber,
    year,
    imageUrl: '',
    frontImage: '',
    rearImage: '',
    leftImage: '',
    rightImage: '',
    interiorImage: '',
    engineImage: ''
  }));

  const bookingTimes = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '14:00', '15:00'];
  const bookings = bookingStates.map(([status, progress], index) => {
    const service = services[index];
    const cancelled = status === 'Cancelled';
    return add('bookings', {
      userId: customers[index].id,
      vehicleId: demoVehicles[index].id,
      servicePackageId: service.id,
      serviceName: service.name,
      bookingDate: dateString(0),
      bookingTime: bookingTimes[index],
      status,
      progress,
      queuePosition: cancelled || status === 'Completed' ? 0 : index + 1,
      assignedTechnicianId: technicians[index].id,
      serviceBayId: (index % 8) + 1,
      serviceBayName: `Bay ${String((index % 8) + 1).padStart(2, '0')}`,
      durationMinutes: 60,
      startAt: dateTime(dateString(0), bookingTimes[index]),
      endAt: dateTime(dateString(0), String(Number(bookingTimes[index].slice(0, 2)) + 1).padStart(2, '0') + bookingTimes[index].slice(2)),
      cancelReason: cancelled ? (index === 4 ? 'Customer schedule changed.' : 'Vehicle was unavailable for the appointment.') : '',
      cancelledByUserId: cancelled ? customers[index].id : null,
      cancelledAt: cancelled ? firestoreTime(120 - index) : null
    });
  });

  const priorities = ['Low', 'Normal', 'High', 'Urgent', 'Normal', 'High', 'Normal', 'Urgent', 'Normal', 'Low'];
  const jobs = jobStates.map(([status, progress], index) => add('serviceJobs', {
    bookingId: bookings[index].id,
    vehicleId: demoVehicles[index].id,
    customerId: customers[index].id,
    assignedTechnicianId: technicians[index].id,
    serviceType: services[index].name,
    priority: priorities[index],
    status,
    progress,
    startDate: dateString(index < 5 ? -index : 0),
    expectedCompletionDate: dateString(index < 5 ? 1 - index : 1),
    completionDate: status === 'Completed' ? dateString(0) : '',
    assignedDate: status === 'Pending' ? '' : dateString(index < 5 ? -index : 0),
    beforeImages: [],
    afterImages: [],
    damageImages: [],
    completedImages: []
  }));

  const queuePrefixCount = { A: 0, W: 0, E: 0 };
  const queueEntries = queueStates.map((status, index) => {
    const queueType = queueTypes[index];
    const prefix = queueType === 'Appointment' ? 'A' : queueType === 'Walk-in' ? 'W' : 'E';
    queuePrefixCount[prefix] += 1;
    const active = ['Called', 'In Service'].includes(status);
    return add('queueEntries', {
      token: `${prefix}-${String(queuePrefixCount[prefix]).padStart(3, '0')}`,
      queueType,
      queueDate: dateString(0),
      status,
      storedPosition: status === 'Waiting' ? (index === 0 ? 1 : 2) : 0,
      bookingId: bookings[index].id,
      customerId: customers[index].id,
      vehicleId: demoVehicles[index].id,
      servicePackageId: services[index].id,
      serviceJobId: jobs[index].id,
      appointmentDate: queueType === 'Appointment' ? dateString(0) : '',
      appointmentTime: queueType === 'Appointment' ? bookingTimes[index] : '',
      emergencyReason: queueType === 'Emergency' ? ['Engine overheating', 'Brake warning light', 'Vehicle will not start'][index % 3] : '',
      emergencyApproved: queueType === 'Emergency',
      assignedTechnicianId: active || status === 'Completed' ? technicians[index].id : null,
      serviceBayId: active || status === 'Completed' ? (index % 8) + 1 : null,
      checkedInAt: firestoreTime(150 - (index * 10)),
      calledAt: ['Called', 'In Service', 'Completed'].includes(status) ? firestoreTime(90 - (index * 5)) : null,
      serviceStartedAt: ['In Service', 'Completed'].includes(status) ? firestoreTime(60 - (index * 3)) : null,
      completedAt: status === 'Completed' ? firestoreTime(10 + index) : null,
      createdByUserId: 1
    });
  });

  const completedJobs = jobs.filter((job) => job.status === 'Completed');
  const paymentStates = ['Paid', 'Unpaid', 'Paid', 'Unpaid', 'Paid', 'Paid', 'Unpaid', 'Paid', 'Unpaid', 'Paid'];
  paymentStates.forEach((paymentStatus, index) => {
    const job = completedJobs[index % completedJobs.length];
    const service = services[index];
    const laborCost = 8000 + (index * 1000);
    const serviceCharges = 2500 + (index * 250);
    const tax = 1200 + (index * 100);
    const discount = index % 3 === 0 ? 1000 : 0;
    add('invoices', {
      userId: customers[index].id,
      serviceJobId: index < completedJobs.length ? job.id : null,
      servicePackageId: service.id,
      partsTotal: index < completedJobs.length ? 5000 + (index * 500) : 0,
      laborCost,
      serviceCharges,
      tax,
      discount,
      amount: laborCost + serviceCharges + tax - discount + (index < completedJobs.length ? 5000 + (index * 500) : 0),
      paymentStatus,
      paymentMethod: paymentStatus === 'Paid' ? ['Cash', 'Card', 'Bank Transfer'][index % 3] : '',
      invoiceDate: dateString(-index),
      customerSignature: '',
      mechanicSignature: ''
    });
  });

  const completedBookings = bookings.filter((booking) => booking.status === 'Completed');
  feedbackComments.forEach((comment, index) => {
    const booking = completedBookings[index % completedBookings.length];
    const service = services.find((item) => item.id === booking.servicePackageId);
    add('feedback', {
      userId: booking.userId,
      servicePackageId: service.id,
      serviceName: service.name,
      rating: [5, 4, 5, 4, 5, 5, 4, 5, 4, 5][index],
      comment
    });
  });

  const emergencyProblems = [
    'Engine overheating', 'Flat tyre', 'Battery failure', 'Brake warning light', 'Vehicle will not start',
    'Coolant leak', 'Electrical failure', 'Unusual engine noise', 'Transmission warning', 'Minor roadside collision'
  ];
  emergencyProblems.forEach((problem, index) => add('emergencyRequests', {
    userId: customers[index].id,
    location: `${10 + index}, Galle Road, Colombo ${index + 1}`,
    problem,
    status: index % 2 === 0 ? 'Open' : 'Closed',
    closedAt: index % 2 ? firestoreTime(index * 20) : null
  }));

  const notificationTypes = [
    'Booking Created', 'Booking Approved', 'Service Started', 'Service Completed', 'Invoice Generated',
    'Queue Position Updated', 'Emergency Update', 'Parts Used', 'Payment Received', 'Service Reminder'
  ];
  notificationTypes.forEach((type, index) => add('notifications', {
    userId: customers[index].id,
    recipientRole: 'customer',
    senderUserId: 1,
    type,
    message: `${type} for ${demoVehicles[index].plateNumber}. This is a demonstration workflow notification.`,
    unread: index % 3 !== 0
  }));

  notificationTypes.forEach((type, index) => add('notificationDrafts', {
    createdByUserId: 1,
    userId: customers[index].id,
    recipientRole: 'customer',
    type: `${type} Draft`,
    message: `Prepared message for ${customers[index].name} regarding ${demoVehicles[index].plateNumber}.`
  }));

  customers.forEach((customer, index) => add('newsletterSubscriptions', {
    email: customer.email,
    emailLower: customer.email.toLowerCase(),
    status: index === 9 ? 'Unsubscribed' : 'Active'
  }));

  const conditions = ['Brand New', 'Used', 'Refurbished', 'Reconditioned', 'Customer Supplied'];
  parts.forEach((part, index) => {
    const job = jobs[index];
    const quantity = (index % 3) + 1;
    add('inventoryMovements', {
      partId: part.id,
      partName: part.partName,
      itemCode: part.itemCode,
      serviceJobId: job.id,
      technicianId: technicians[index].id,
      vehicleId: demoVehicles[index].id,
      customerId: customers[index].id,
      type: index % 2 ? 'Part Used' : 'Opening Stock',
      quantity,
      condition: conditions[index % conditions.length],
      unitPrice: part.sellingPrice,
      totalPrice: quantity * part.sellingPrice,
      note: index % 2 ? 'Part issued to the linked service job.' : 'Opening demonstration stock.'
    });
    add('serviceJobParts', {
      serviceJobId: job.id,
      partId: part.id,
      itemCode: part.itemCode,
      partName: part.partName,
      brand: part.brand,
      condition: conditions[index % conditions.length],
      quantity,
      unitPrice: part.sellingPrice,
      totalPrice: quantity * part.sellingPrice,
      usedByTechnician: technicians[index].id,
      warrantyProvider: part.warrantyProvider,
      warrantyPeriod: part.warrantyPeriod,
      warrantyStartDate: dateString(-index),
      warrantyExpiryDate: dateString(180 - index),
      note: 'Demonstration part usage linked to the service workflow.',
      photoUrl: '',
      photoPath: '',
      photoFileName: '',
      photoMimeType: '',
      photoSizeBytes: 0
    });
    add('technicianNotes', {
      serviceJobId: job.id,
      technicianId: technicians[index].id,
      note: [
        'Initial inspection completed.', 'Customer concern confirmed.', 'Diagnostic scan recorded.',
        'Required parts checked.', 'Repair work started.', 'Road test scheduled.',
        'Waiting for customer approval.', 'Final torque checks completed.',
        'Quality inspection passed.', 'Vehicle prepared for collection.'
      ][index]
    });
    add('technicianProgress', {
      serviceJobId: job.id,
      technicianId: technicians[index].id,
      progressPercentage: job.progress,
      status: job.status,
      remarks: `Workflow progress recorded at ${job.progress}%.`
    });
    add('replacedParts', {
      serviceJobId: job.id,
      technicianId: technicians[index].id,
      vehicleId: demoVehicles[index].id,
      customerId: customers[index].id,
      removedPartName: part.partName,
      condition: ['Worn', 'Damaged', 'Expired', 'Leaking'][index % 4],
      replacementReason: 'Replacement recommended during service inspection.',
      photoEvidence: '',
      note: 'No image added, as requested.'
    });
  });

  const batch = db.batch();
  writes.forEach(({ collection, id, document }) => {
    batch.set(db.collection(collection).doc(String(id)), document);
  });
  batch.set(db.collection('meta').doc('counters'), {
    ...Object.fromEntries(Object.entries(counters).filter(([, value]) => Number.isFinite(Number(value)))),
    updatedAt: timestamp()
  }, { merge: true });
  batch.set(db.collection('meta').doc(`booking-queue-${dateString(0)}`), {
    bookingDate: dateString(0),
    lastPosition: bookings.filter((booking) => !['Completed', 'Cancelled'].includes(booking.status)).length,
    updatedAt: timestamp()
  }, { merge: true });
  Object.entries(queuePrefixCount).forEach(([prefix, lastSequence]) => {
    batch.set(db.collection('meta').doc(`queue-token-${dateString(0)}-${prefix}`), {
      queueDate: dateString(0),
      prefix,
      lastSequence,
      updatedAt: timestamp()
    }, { merge: true });
  });
  const createdByCollection = writes.reduce((summary, write) => {
    summary[write.collection] = (summary[write.collection] || 0) + 1;
    return summary;
  }, {});
  batch.set(markerRef(), {
    completed: true,
    createdByCollection,
    mediaWrites: 0,
    completedAt: timestamp()
  });
  await batch.commit();

  console.log(JSON.stringify({
    skipped: false,
    seedBatch,
    createdByCollection,
    totalDocumentsCreated: writes.length,
    mediaWrites: 0,
    primaryCustomer: customers[0].email,
    primaryTechnicianUserId: technicians[0].userId
  }, null, 2));
}

async function check() {
  requireConfiguredTarget();
  const collectionNames = [
    'users', 'technicians', 'vehicles', 'servicePackages', 'pricingPlans', 'customerPackages', 'customerPackageRequests', 'inventoryCategories',
    'inventorySuppliers', 'inventoryParts', 'bookings', 'serviceJobs', 'invoices',
    'emergencyRequests', 'feedback', 'notifications', 'notificationDrafts', 'newsletterSubscriptions',
    'inventoryMovements', 'serviceJobParts', 'technicianNotes', 'technicianProgress',
    'replacedParts', 'queueEntries', 'servicePhotos', 'documents', 'uploadAuditLogs'
  ];
  const records = await loadCollections(collectionNames);
  const byId = Object.fromEntries(collectionNames.map((name) => [
    name,
    new Map(records[name].map((item) => [Number(item.id), item]))
  ]));
  const errors = [];
  const requireLink = (source, sourceId, field, target, value, predicate = () => true) => {
    const linked = byId[target].get(Number(value));
    if (!linked || !predicate(linked)) errors.push(`${source}/${sourceId}.${field} -> missing ${target}/${value}`);
  };

  records.technicians.forEach((item) => requireLink('technicians', item.id, 'userId', 'users', item.userId, (user) => user.role === 'technician'));
  records.customerPackages.forEach((item) => {
    requireLink('customerPackages', item.id, 'userId', 'users', item.userId, (user) => user.role === 'customer');
    requireLink('customerPackages', item.id, 'pricingPlanId', 'pricingPlans', item.pricingPlanId);
    if (!Array.isArray(item.benefits) || !item.benefits.length) errors.push(`customerPackages/${item.id} has no applied benefits`);
  });
  records.customerPackageRequests.forEach((item) => {
    requireLink('customerPackageRequests', item.id, 'userId', 'users', item.userId, (user) => user.role === 'customer');
    requireLink('customerPackageRequests', item.id, 'pricingPlanId', 'pricingPlans', item.pricingPlanId);
    if (item.invoiceId) requireLink('customerPackageRequests', item.id, 'invoiceId', 'invoices', item.invoiceId);
  });
  records.vehicles.forEach((item) => requireLink('vehicles', item.id, 'userId', 'users', item.userId, (user) => user.role === 'customer'));
  records.bookings.forEach((item) => {
    requireLink('bookings', item.id, 'userId', 'users', item.userId, (user) => user.role === 'customer');
    requireLink('bookings', item.id, 'vehicleId', 'vehicles', item.vehicleId);
    requireLink('bookings', item.id, 'servicePackageId', 'servicePackages', item.servicePackageId);
    if (item.assignedTechnicianId) requireLink('bookings', item.id, 'assignedTechnicianId', 'technicians', item.assignedTechnicianId);
  });
  records.serviceJobs.forEach((item) => {
    requireLink('serviceJobs', item.id, 'bookingId', 'bookings', item.bookingId);
    requireLink('serviceJobs', item.id, 'customerId', 'users', item.customerId, (user) => user.role === 'customer');
    requireLink('serviceJobs', item.id, 'vehicleId', 'vehicles', item.vehicleId);
    if (item.assignedTechnicianId) requireLink('serviceJobs', item.id, 'assignedTechnicianId', 'technicians', item.assignedTechnicianId);
  });
  records.invoices.forEach((item) => {
    requireLink('invoices', item.id, 'userId', 'users', item.userId, (user) => user.role === 'customer');
    if (item.invoiceType === 'Package') {
      requireLink('invoices', item.id, 'pricingPlanId', 'pricingPlans', item.pricingPlanId);
      if (item.packageRequestId) requireLink('invoices', item.id, 'packageRequestId', 'customerPackageRequests', item.packageRequestId);
    } else {
      requireLink('invoices', item.id, 'servicePackageId', 'servicePackages', item.servicePackageId);
    }
    if (item.serviceJobId) requireLink('invoices', item.id, 'serviceJobId', 'serviceJobs', item.serviceJobId);
  });
  records.feedback.forEach((item) => {
    requireLink('feedback', item.id, 'userId', 'users', item.userId, (user) => user.role === 'customer');
    requireLink('feedback', item.id, 'servicePackageId', 'servicePackages', item.servicePackageId);
  });
  records.emergencyRequests.forEach((item) => requireLink('emergencyRequests', item.id, 'userId', 'users', item.userId));
  records.notifications.forEach((item) => {
    requireLink('notifications', item.id, 'userId', 'users', item.userId);
    if (item.senderUserId) requireLink('notifications', item.id, 'senderUserId', 'users', item.senderUserId);
  });
  records.notificationDrafts.forEach((item) => {
    requireLink('notificationDrafts', item.id, 'userId', 'users', item.userId);
    requireLink('notificationDrafts', item.id, 'createdByUserId', 'users', item.createdByUserId, (user) => user.role === 'admin');
  });
  records.inventoryParts.forEach((item) => {
    if (item.supplierId) requireLink('inventoryParts', item.id, 'supplierId', 'inventorySuppliers', item.supplierId);
  });
  ['inventoryMovements', 'serviceJobParts'].forEach((collection) => records[collection].forEach((item) => {
    requireLink(collection, item.id, 'partId', 'inventoryParts', item.partId);
    if (item.serviceJobId) requireLink(collection, item.id, 'serviceJobId', 'serviceJobs', item.serviceJobId);
    if (item.technicianId || item.usedByTechnician) requireLink(collection, item.id, 'technicianId', 'technicians', item.technicianId || item.usedByTechnician);
  }));
  ['technicianNotes', 'technicianProgress', 'replacedParts'].forEach((collection) => records[collection].forEach((item) => {
    requireLink(collection, item.id, 'serviceJobId', 'serviceJobs', item.serviceJobId);
    requireLink(collection, item.id, 'technicianId', 'technicians', item.technicianId);
  }));
  records.queueEntries.forEach((item) => {
    requireLink('queueEntries', item.id, 'bookingId', 'bookings', item.bookingId);
    requireLink('queueEntries', item.id, 'customerId', 'users', item.customerId);
    requireLink('queueEntries', item.id, 'vehicleId', 'vehicles', item.vehicleId);
    requireLink('queueEntries', item.id, 'servicePackageId', 'servicePackages', item.servicePackageId);
    if (item.serviceJobId) requireLink('queueEntries', item.id, 'serviceJobId', 'serviceJobs', item.serviceJobId);
  });

  const seeded = Object.fromEntries(collectionNames.map((name) => [
    name,
    records[name].filter((item) => item.seedBatch === seedBatch)
  ]));
  const mediaFields = [
    'avatar', 'profileImage', 'nicImage', 'certificateUrls', 'image', 'imageUrl', 'frontImage',
    'rearImage', 'leftImage', 'rightImage', 'interiorImage', 'engineImage', 'beforeImages',
    'afterImages', 'damageImages', 'completedImages', 'photoUrl', 'photoPath', 'photoEvidence',
    'customerSignature', 'mechanicSignature'
  ];
  const mediaValues = Object.entries(seeded).flatMap(([collection, items]) => items.filter((item) => !item.updatedAt).flatMap((item) => (
    mediaFields
      .filter((field) => Array.isArray(item[field]) ? item[field].length : Boolean(item[field]))
      .map((field) => `${collection}/${item.id}.${field}`)
  )));
  if (mediaValues.length) errors.push(`Seeded media values found: ${mediaValues.join(', ')}`);

  const summary = {
    ok: errors.length === 0,
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
    counts: Object.fromEntries(collectionNames.map((name) => [name, records[name].length])),
    seededCounts: Object.fromEntries(collectionNames.map((name) => [name, seeded[name].length])),
    customerCount: records.users.filter((user) => user.role === 'customer' && String(user.status).toLowerCase() === 'active').length,
    technicianCount: records.technicians.filter((item) => String(item.status).toLowerCase() === 'active').length,
    bookingStatuses: [...new Set(records.bookings.map((item) => item.status))],
    jobStatuses: [...new Set(records.serviceJobs.map((item) => item.status))],
    queueStatuses: [...new Set(records.queueEntries.map((item) => item.status))],
    paymentStatuses: [...new Set(records.invoices.map((item) => item.paymentStatus))],
    seededMediaValues: mediaValues.length,
    errors
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

(checkOnly ? check() : seed().then(check)).catch((error) => {
  console.error(`Comprehensive demo ${checkOnly ? 'check' : 'seed'} failed: ${error.message}`);
  process.exitCode = 1;
});
