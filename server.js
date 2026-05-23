require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query } = require('./src/db');

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-change-me';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

function signUser(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, jwtSecret, { expiresIn: '8h' });
}

function publicUser(user) {
  return { id: user.id, role: user.role, name: user.name, email: user.email, phone: user.phone || '' };
}

function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    try {
      req.user = jwt.verify(token, jwtSecret);
      if (role && req.user.role !== role) {
        return res.status(403).json({ message: 'Access denied.' });
      }
      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired session.' });
    }
  };
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => !String(body[field] || '').trim());
  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 5);
}

function toCamelVehicle(row) {
  return {
    id: row.id,
    customerId: row.user_id,
    make: row.make,
    model: row.model,
    plate: row.plate_number,
    year: row.year,
    image: row.image_url || 'assets/images/hero-blue-workshop.png'
  };
}

function toCamelBooking(row) {
  return {
    id: row.id,
    customerId: row.user_id,
    vehicleId: row.vehicle_id,
    service: row.service_name,
    date: formatDate(row.booking_date),
    time: formatTime(row.booking_time),
    status: row.status,
    queue: row.queue_position || 0,
    progress: row.progress || 0
  };
}

function toCamelInvoice(row) {
  return {
    id: row.id,
    customerId: row.user_id,
    service: row.service_name,
    amount: Number(row.amount),
    payment: row.payment_status,
    date: formatDate(row.invoice_date)
  };
}

app.get('/api/health', async (req, res, next) => {
  try {
    await query('select 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { role = 'customer', name, email, password, phone = '' } = req.body;
    requireFields(req.body, ['name', 'email', 'password']);

    if (!['admin', 'customer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid user role.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `insert into users (role, name, email, phone, password_hash)
       values ($1, $2, lower($3), $4, $5)
       returning id, role, name, email, phone`,
      [role, name.trim(), email.trim(), phone.trim(), passwordHash]
    );

    const user = rows[0];
    res.status(201).json({ user: publicUser(user), token: signUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      error.status = 409;
      error.message = 'An account with this email already exists.';
    }
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { role, email, password } = req.body;
    requireFields(req.body, ['role', 'email', 'password']);

    const { rows } = await query(
      'select id, role, name, email, phone, password_hash from users where lower(email) = lower($1) and role = $2',
      [email, role]
    );

    const user = rows[0];
    const isValid = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email, password or selected role.' });
    }

    res.json({ user: publicUser(user), token: signUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/customer/dashboard', requireAuth('customer'), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [vehicles, bookings, invoices, notifications, packages] = await Promise.all([
      query('select * from vehicles where user_id = $1 order by id', [userId]),
      query(`select b.*, sp.name as service_name from bookings b join service_packages sp on sp.id = b.service_package_id where b.user_id = $1 order by b.booking_date desc, b.booking_time desc`, [userId]),
      query(`select i.*, sp.name as service_name from invoices i join service_packages sp on sp.id = i.service_package_id where i.user_id = $1 order by i.invoice_date desc`, [userId]),
      query('select id, type, message, unread from notifications where user_id = $1 order by created_at desc', [userId]),
      query('select name from service_packages where active = true order by name')
    ]);

    res.json({
      profile: { name: req.user.name, email: req.user.email, phone: '' },
      vehicles: vehicles.rows.map(toCamelVehicle),
      bookings: bookings.rows.map(toCamelBooking),
      invoices: invoices.rows.map(toCamelInvoice),
      notifications: notifications.rows,
      packages: packages.rows.map((item) => item.name)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/dashboard', requireAuth('admin'), async (req, res, next) => {
  try {
    const [customers, vehicles, bookings, packages, invoices, emergencies, notifications, feedback] = await Promise.all([
      query(`select u.id, u.name, u.email, u.phone, initcap(u.status) as status from users u where u.role = 'customer' order by u.id`),
      query('select * from vehicles order by id'),
      query(`select b.*, sp.name as service_name from bookings b join service_packages sp on sp.id = b.service_package_id order by b.booking_date desc, b.booking_time desc`),
      query('select id, name, price, duration, description from service_packages order by id'),
      query(`select i.*, sp.name as service_name from invoices i join service_packages sp on sp.id = i.service_package_id order by i.invoice_date desc`),
      query('select id, user_id as "customerId", location, problem, status from emergency_requests order by created_at desc'),
      query('select id, type, message, unread from notifications order by created_at desc limit 20'),
      query('select id, user_id as "customerId", rating, comment from feedback order by created_at desc')
    ]);

    res.json({
      customers: customers.rows,
      vehicles: vehicles.rows.map(toCamelVehicle),
      bookings: bookings.rows.map(toCamelBooking),
      packages: packages.rows,
      invoices: invoices.rows.map(toCamelInvoice),
      emergencies: emergencies.rows,
      notifications: notifications.rows,
      feedback: feedback.rows
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/vehicles', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['make', 'model', 'plate', 'year']);
    const { make, model, plate, year } = req.body;
    const { rows } = await query(
      `insert into vehicles (user_id, make, model, plate_number, year, image_url)
       values ($1, $2, $3, upper($4), $5, $6) returning *`,
      [req.user.id, make, model, plate, year, 'assets/images/hero-blue-workshop.png']
    );
    res.status(201).json(toCamelVehicle(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/vehicles/:id', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['make', 'model', 'plate', 'year']);
    const { make, model, plate, year } = req.body;
    const { rows } = await query(
      `update vehicles set make = $1, model = $2, plate_number = upper($3), year = $4
       where id = $5 and user_id = $6 returning *`,
      [make, model, plate, year, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json(toCamelVehicle(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/customer/vehicles/:id', requireAuth('customer'), async (req, res, next) => {
  try {
    await query('delete from vehicles where id = $1 and user_id = $2', [req.params.id, req.user.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/bookings', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['vehicleId', 'service', 'date', 'time']);
    const service = await query('select id from service_packages where name = $1 and active = true', [req.body.service]);
    if (!service.rows[0]) return res.status(400).json({ message: 'Selected service package was not found.' });

    const queue = await query('select count(*)::int + 1 as position from bookings where booking_date = $1 and status not in ($2, $3)', [req.body.date, 'Completed', 'Cancelled']);
    const { rows } = await query(
      `insert into bookings (user_id, vehicle_id, service_package_id, booking_date, booking_time, status, queue_position, progress)
       values ($1, $2, $3, $4, $5, 'Pending', $6, 10) returning *`,
      [req.user.id, req.body.vehicleId, service.rows[0].id, req.body.date, req.body.time, queue.rows[0].position]
    );
    rows[0].service_name = req.body.service;
    res.status(201).json(toCamelBooking(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/bookings/:id', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['vehicleId', 'service', 'date', 'time']);
    const service = await query('select id from service_packages where name = $1 and active = true', [req.body.service]);
    if (!service.rows[0]) return res.status(400).json({ message: 'Selected service package was not found.' });
    const { rows } = await query(
      `update bookings set vehicle_id = $1, service_package_id = $2, booking_date = $3, booking_time = $4
       where id = $5 and user_id = $6 returning *`,
      [req.body.vehicleId, service.rows[0].id, req.body.date, req.body.time, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found.' });
    rows[0].service_name = req.body.service;
    res.json(toCamelBooking(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/bookings/:id/cancel', requireAuth('customer'), async (req, res, next) => {
  try {
    const { rows } = await query(`update bookings set status = 'Cancelled', progress = 0 where id = $1 and user_id = $2 returning *`, [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/emergency', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['location', 'problem']);
    const { rows } = await query(
      `insert into emergency_requests (user_id, location, problem, status) values ($1, $2, $3, 'Open') returning id, user_id as "customerId", location, problem, status`,
      [req.user.id, req.body.location, req.body.problem]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/feedback', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['rating', 'feedback']);
    await query('insert into feedback (user_id, rating, comment) values ($1, $2, $3)', [req.user.id, req.body.rating, req.body.feedback]);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/customer/profile', requireAuth('customer'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone']);
    const { rows } = await query('update users set name = $1, email = lower($2), phone = $3 where id = $4 returning id, role, name, email, phone', [req.body.name, req.body.email, req.body.phone, req.user.id]);
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/invoices/:id/download', requireAuth(), async (req, res, next) => {
  try {
    const { rows } = await query(
      `select i.id, i.amount, i.payment_status, i.invoice_date, u.name, sp.name as service_name
       from invoices i join users u on u.id = i.user_id join service_packages sp on sp.id = i.service_package_id
       where i.id = $1 and ($2 = 'admin' or i.user_id = $3)`,
      [req.params.id, req.user.role, req.user.id]
    );
    if (!rows[0]) return res.status(404).send('Invoice not found.');
    const invoice = rows[0];
    res.type('text/plain').send([
      'AutoCare Service Station Invoice',
      `Invoice: #INV-${invoice.id}`,
      `Customer: ${invoice.name}`,
      `Service: ${invoice.service_name}`,
      `Amount: LKR ${Number(invoice.amount).toLocaleString('en-LK')}`,
      `Payment: ${invoice.payment_status}`,
      `Date: ${formatDate(invoice.invoice_date)}`
    ].join('\n'));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/bookings/:id/status', requireAuth('admin'), async (req, res, next) => {
  try {
    const flow = { Pending: ['Approved', 35], Approved: ['In Progress', 70], 'In Progress': ['Completed', 100], Completed: ['Completed', 100] };
    const current = await query('select status from bookings where id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ message: 'Booking not found.' });
    const [status, progress] = flow[current.rows[0].status] || ['Approved', 35];
    const { rows } = await query('update bookings set status = $1, progress = $2 where id = $3 returning *', [status, progress, req.params.id]);
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/bookings/:id/cancel', requireAuth('admin'), async (req, res, next) => {
  try {
    await query(`update bookings set status = 'Cancelled', progress = 0 where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/notifications', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['type', 'message']);
    const customer = await query(`select id from users where role = 'customer' order by id limit 1`);
    if (!customer.rows[0]) return res.status(400).json({ message: 'No customer account available.' });
    await query('insert into notifications (user_id, type, message, unread) values ($1, $2, $3, true)', [customer.rows[0].id, req.body.type, req.body.message]);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/customers', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone']);
    const passwordHash = await bcrypt.hash(req.body.password || 'customer123', 12);
    const { rows } = await query(
      `insert into users (role, name, email, phone, password_hash, status)
       values ('customer', $1, lower($2), $3, $4, lower($5))
       returning id, name, email, phone, initcap(status) as status`,
      [req.body.name, req.body.email, req.body.phone, passwordHash, req.body.status || 'active']
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/customers/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'phone']);
    const { rows } = await query(
      `update users set name = $1, email = lower($2), phone = $3, status = lower($4)
       where id = $5 and role = 'customer'
       returning id, name, email, phone, initcap(status) as status`,
      [req.body.name, req.body.email, req.body.phone, req.body.status || 'active', req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Customer not found.' });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/vehicles', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'make', 'model', 'plate', 'year']);
    const { rows } = await query(
      `insert into vehicles (user_id, make, model, plate_number, year, image_url)
       values ($1, $2, $3, upper($4), $5, $6) returning *`,
      [req.body.customerId, req.body.make, req.body.model, req.body.plate, req.body.year, 'assets/images/hero-blue-workshop.png']
    );
    res.status(201).json(toCamelVehicle(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/vehicles/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'make', 'model', 'plate', 'year']);
    const { rows } = await query(
      `update vehicles set user_id = $1, make = $2, model = $3, plate_number = upper($4), year = $5
       where id = $6 returning *`,
      [req.body.customerId, req.body.make, req.body.model, req.body.plate, req.body.year, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Vehicle not found.' });
    res.json(toCamelVehicle(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/vehicles/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    await query('delete from vehicles where id = $1', [req.params.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/services', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'price', 'duration', 'description']);
    const { rows } = await query(
      `insert into service_packages (name, price, duration, description)
       values ($1, $2, $3, $4) returning id, name, price, duration, description`,
      [req.body.name, req.body.price, req.body.duration, req.body.description]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/services/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'price', 'duration', 'description']);
    const { rows } = await query(
      `update service_packages set name = $1, price = $2, duration = $3, description = $4
       where id = $5 returning id, name, price, duration, description`,
      [req.body.name, req.body.price, req.body.duration, req.body.description, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Service package not found.' });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/bookings', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'vehicleId', 'service', 'date', 'time', 'status']);
    const service = await query('select id from service_packages where name = $1', [req.body.service]);
    if (!service.rows[0]) return res.status(400).json({ message: 'Selected service package was not found.' });
    const { rows } = await query(
      `insert into bookings (user_id, vehicle_id, service_package_id, booking_date, booking_time, status, queue_position, progress)
       values ($1, $2, $3, $4, $5, $6, 1, 10) returning *`,
      [req.body.customerId, req.body.vehicleId, service.rows[0].id, req.body.date, req.body.time, req.body.status]
    );
    rows[0].service_name = req.body.service;
    res.status(201).json(toCamelBooking(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/bookings/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'vehicleId', 'service', 'date', 'time', 'status']);
    const service = await query('select id from service_packages where name = $1', [req.body.service]);
    if (!service.rows[0]) return res.status(400).json({ message: 'Selected service package was not found.' });
    const { rows } = await query(
      `update bookings set user_id = $1, vehicle_id = $2, service_package_id = $3, booking_date = $4, booking_time = $5, status = $6
       where id = $7 returning *`,
      [req.body.customerId, req.body.vehicleId, service.rows[0].id, req.body.date, req.body.time, req.body.status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Booking not found.' });
    rows[0].service_name = req.body.service;
    res.json(toCamelBooking(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/invoices', requireAuth('admin'), async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'service', 'amount', 'payment', 'date']);
    const service = await query('select id from service_packages where name = $1', [req.body.service]);
    if (!service.rows[0]) return res.status(400).json({ message: 'Selected service package was not found.' });
    const { rows } = await query(
      `insert into invoices (user_id, service_package_id, amount, payment_status, invoice_date)
       values ($1, $2, $3, $4, $5) returning *`,
      [req.body.customerId, service.rows[0].id, req.body.amount, req.body.payment, req.body.date]
    );
    rows[0].service_name = req.body.service;
    res.status(201).json(toCamelInvoice(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/invoices/:id/pay', requireAuth('admin'), async (req, res, next) => {
  try {
    await query(`update invoices set payment_status = 'Paid' where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/emergencies/:id/close', requireAuth('admin'), async (req, res, next) => {
  try {
    await query(`update emergency_requests set status = 'Closed' where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ message: error.message || 'Server error.' });
});

app.listen(port, () => {
  console.log(`AutoCare server running at http://localhost:${port}`);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
