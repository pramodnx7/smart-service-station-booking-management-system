document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const pendingBookingKey = 'autocare-pending-booking';
  const storageKey = 'autocare-customer-dashboard-state';
  const session = getSession();

  if (!session || session.role !== 'customer' || !session.token) {
    window.location.replace('index.html');
    return;
  }

  const initialView = (window.location.hash || new URLSearchParams(window.location.search).get('view') || '').replace(/^#/, '');
  let pendingBooking = loadPendingBooking();

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
    car: '<svg viewBox="0 0 24 24"><path d="m3 13 2-5a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 5"/><path d="M5 13h14v5H5z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/></svg>',
    tools: '<svg viewBox="0 0 24 24"><path d="m14.7 6.3 3-3a4 4 0 0 1-5 5l-7 7a2 2 0 1 0 3 3l7-7a4 4 0 0 1 5-5l-3 3"/></svg>',
    invoice: '<svg viewBox="0 0 24 24"><path d="M6 2h9l3 3v17l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
    support: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 16 0v5a3 3 0 0 1-3 3h-2"/><path d="M4 12v4h4v-4H4Zm12 0v4h4v-4h-4Z"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  const defaults = {
    profile: { name: session.name, email: session.email, phone: '+94 77 345 6789' },
    vehicles: [
      { id: 1, make: 'Toyota Corolla', model: 'Axio', plate: 'ABC-854', year: '2019', image: 'assets/images/newsletter-red-sports-car.png' },
      { id: 2, make: 'Honda Civic', model: 'EX', plate: 'XZ-5676', year: '2019', image: 'assets/images/hero-blue-workshop.png' },
      { id: 3, make: 'Suzuki Swift', model: 'RS', plate: 'DEF-0012', year: '2020', image: 'assets/images/service-wheel-closeup.png' }
    ],
    bookings: [
      { id: 1, vehicleId: 1, service: 'General Service', date: '2026-05-25', time: '10:00', status: 'Approved', queue: 3, progress: 35 },
      { id: 2, vehicleId: 2, service: 'Engine Diagnostics', date: '2026-05-23', time: '09:00', status: 'In Progress', queue: 1, progress: 70 },
      { id: 3, vehicleId: 3, service: 'Brake Service', date: '2026-05-20', time: '11:15', status: 'Completed', queue: 0, progress: 100 }
    ],
    invoices: [
      { id: 1001, service: 'General Service', date: '2026-05-25', amount: 8500, payment: 'Unpaid' },
      { id: 1002, service: 'Oil Change', date: '2026-05-18', amount: 6000, payment: 'Paid' },
      { id: 1003, service: 'Brake Service', date: '2026-05-10', amount: 7500, payment: 'Paid' }
    ],
    usedParts: [],
    serviceImages: [],
    documents: [],
    notifications: [
      { id: 1, type: 'Booking Approved', message: 'Your General Service booking has been approved.', unread: true },
      { id: 2, type: 'Service Progress', message: 'Engine Diagnostics is now in final testing.', unread: true },
      { id: 3, type: 'Offer', message: 'Get 15% off on your next full service package.', unread: false }
    ],
    packages: ['Oil Change', 'Brake Service', 'Full Service', 'Engine Diagnostics', 'General Service', 'Electrical Repair', 'Engine Repair', 'Suspension Repair', 'Hybrid/EV Service']
  };

  let state = loadState();

  const els = {
    sidebar: document.getElementById('customer-sidebar'),
    pageTitle: document.getElementById('page-title'),
    modal: document.getElementById('customer-modal'),
    modalForm: document.getElementById('modal-form'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    toast: document.getElementById('toast')
  };

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(sessionKey));
    } catch (error) {
      return null;
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      return saved ? { ...defaults, ...saved, profile: { ...defaults.profile, ...saved.profile } } : JSON.parse(JSON.stringify(defaults));
    } catch (error) {
      return JSON.parse(JSON.stringify(defaults));
    }
  }

  function loadPendingBooking() {
    try {
      return JSON.parse(localStorage.getItem(pendingBookingKey));
    } catch (error) {
      return null;
    }
  }

  function clearPendingBooking() {
    localStorage.removeItem(pendingBookingKey);
    pendingBooking = null;
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  async function hydrateFromApi() {
    try {
      const data = await window.AutoCareApi.request('/api/customer/dashboard');
      state = {
        ...state,
        ...data,
        profile: { ...state.profile, ...data.profile }
      };
      saveState();
      renderAll();
    } catch (error) {
      showToast(error.message || 'Could not load database data.');
    }
  }

  function injectIcons() {
    document.querySelectorAll('[data-icon]').forEach((node) => {
      node.innerHTML = icons[node.dataset.icon] || '';
    });
  }

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'CU';
  }

  function formatMoney(amount) {
    return `LKR ${Number(amount).toLocaleString('en-LK')}`;
  }

  function nextId(collection) {
    return Math.max(0, ...collection.map((item) => Number(item.id))) + 1;
  }

  function vehicleName(id) {
    const vehicle = state.vehicles.find((item) => item.id === Number(id));
    return vehicle ? displayVehicleName(vehicle) : 'Unknown vehicle';
  }

  function displayVehicleName(vehicle) {
    return vehicle.name || `${vehicle.make} ${vehicle.model}`.trim();
  }

  function splitVehicleName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return {
      make: parts[0] || 'Custom',
      model: parts.slice(1).join(' ') || 'Vehicle'
    };
  }

  function statusClass(status) {
    return status.toLowerCase().replace(/\s+/g, '-') === 'in-progress' ? 'progress' : status.toLowerCase();
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    window.setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
  }

  function renderProfile() {
    document.getElementById('profile-initials').textContent = initials(state.profile.name);
    document.getElementById('profile-name').textContent = state.profile.name;
    document.getElementById('profile-email').textContent = state.profile.email;
    document.getElementById('customer-sidebar-name').textContent = state.profile.name;
    document.getElementById('profile-full-name').value = state.profile.name;
    document.getElementById('profile-email-input').value = state.profile.email;
    document.getElementById('profile-phone').value = state.profile.phone;
  }

  function renderMetrics() {
    const completed = state.bookings.filter((booking) => booking.status === 'Completed').length;
    const totalSpend = state.invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const unread = state.notifications.filter((item) => item.unread).length;
    const metrics = [
      ['Completed Services', completed, 'View details', 'tools', 'tone-green'],
      ['Total Spending', formatMoney(totalSpend), 'Payment history', 'invoice', 'tone-orange'],
      ['Reward Points', 250, 'Available points', 'dashboard', 'tone-blue'],
      ['Notifications', unread, 'Unread updates', 'bell', 'tone-red']
    ];

    document.getElementById('metric-grid').innerHTML = metrics.map(([label, value, note, icon, tone]) => `
      <article class="metric-card">
        <span class="metric-card__icon ${tone}" data-icon="${icon}"></span>
        <div><h3>${label}</h3><strong>${value}</strong><small>${note}</small></div>
      </article>
    `).join('');
    document.getElementById('notification-count').textContent = unread;
    document.getElementById('sidebar-alert-count').textContent = unread;
    injectIcons();
  }

  function renderUpcoming() {
    const booking = state.bookings.find((item) => item.status !== 'Completed' && item.status !== 'Cancelled') || state.bookings[0];
    document.getElementById('upcoming-booking').innerHTML = booking ? `
      <h3>${booking.service}</h3>
      <p>${vehicleName(booking.vehicleId)}</p>
      <div class="booking-meta"><span>${booking.date}</span><span>${booking.time}</span><span>Queue #${booking.queue || '-'}</span></div>
      <span class="badge badge--${statusClass(booking.status)}">${booking.status}</span>
      <div class="row-actions"><button class="mini-btn" type="button" data-action="reschedule-booking" data-id="${booking.id}">Reschedule</button><button class="mini-btn mini-btn--red" type="button" data-action="cancel-booking" data-id="${booking.id}">Cancel</button></div>
    ` : '<p>No upcoming bookings.</p>';
  }

  function vehicleCards(limit) {
    return state.vehicles.slice(0, limit || state.vehicles.length).map((vehicle) => `
      <article class="vehicle-card">
        <img src="${vehicle.image}" alt="${vehicle.make} ${vehicle.model}" />
        <h3>${displayVehicleName(vehicle)}</h3>
        <p>${vehicle.plate}</p>
        <div class="card-meta"><span>${vehicle.year}</span><span>${vehicle.model}</span></div>
        <div class="row-actions"><button class="mini-btn" type="button" data-action="new-booking-for-vehicle" data-id="${vehicle.id}">Book Service</button><button class="mini-btn" type="button" data-action="edit-vehicle" data-id="${vehicle.id}">Edit</button><button class="mini-btn mini-btn--red" type="button" data-action="delete-vehicle" data-id="${vehicle.id}">Delete</button></div>
      </article>
    `).join('') + `
      <article class="vehicle-card">
        <img src="assets/images/hero_car.svg" alt="" />
        <h3>Add New Vehicle</h3>
        <p>Register another vehicle.</p>
        <div class="row-actions"><button class="mini-btn" type="button" data-action="new-vehicle">Add Vehicle</button></div>
      </article>
    `;
  }

  function bookingRows() {
    return state.bookings.map((booking) => `
      <tr>
        <td><span class="row-title">${booking.service}</span><span class="row-sub">#BK-${booking.id}</span></td>
        <td>${vehicleName(booking.vehicleId)}</td>
        <td>${booking.date}<span class="row-sub">${booking.time}</span></td>
        <td><span class="badge badge--${statusClass(booking.status)}">${booking.status}</span></td>
        <td>${booking.queue ? `#${booking.queue}` : '-'}</td>
        <td><div class="row-actions"><button class="mini-btn" type="button" data-action="reschedule-booking" data-id="${booking.id}">Reschedule</button><button class="mini-btn mini-btn--red" type="button" data-action="cancel-booking" data-id="${booking.id}">Cancel</button><button class="mini-btn mini-btn--danger" type="button" data-action="delete-booking" data-id="${booking.id}">Delete</button></div></td>
      </tr>
    `).join('');
  }

  function renderTables() {
    document.getElementById('overview-vehicles').innerHTML = vehicleCards(3);
    document.getElementById('vehicle-grid').innerHTML = vehicleCards();
    document.getElementById('booking-body').innerHTML = bookingRows();
    document.getElementById('recent-history').innerHTML = state.invoices.map((invoice) => `<tr><td>${invoice.service}</td><td>${invoice.date}</td><td>${formatMoney(invoice.amount)}</td><td><span class="badge badge--completed">Completed</span></td></tr>`).join('');
    document.getElementById('history-body').innerHTML = state.bookings.map((booking) => `<tr><td>${booking.service}</td><td>${vehicleName(booking.vehicleId)}</td><td>${booking.date}</td><td>${formatMoney(state.invoices.find((invoice) => invoice.service === booking.service)?.amount || 0)}</td><td><span class="badge badge--${statusClass(booking.status)}">${booking.status}</span></td></tr>`).join('');
    document.getElementById('invoice-body').innerHTML = state.invoices.map((invoice) => `
      <tr>
        <td><span class="row-title">#INV-${invoice.id}</span></td>
        <td>${invoice.service}</td>
        <td>${invoice.date}</td>
        <td>${formatMoney(invoice.amount)}</td>
        <td><span class="badge badge--${invoice.payment === 'Paid' ? 'completed' : 'pending'}">${invoice.payment}</span></td>
        <td><div class="row-actions"><button class="mini-btn" type="button" data-action="download-invoice" data-id="${invoice.id}">TXT</button><button class="mini-btn" type="button" data-action="download-invoice-pdf" data-id="${invoice.id}">PDF</button></div></td>
      </tr>
    `).join('');
    document.getElementById('parts-body').innerHTML = (state.usedParts || []).map((part) => `
      <tr>
        <td><span class="row-title">${part.partName}</span><span class="row-sub">${part.brand || '-'}</span></td>
        <td>${part.vehicleNumber || '-'}</td>
        <td>${part.condition}</td>
        <td>${part.quantity}</td>
        <td>${formatMoney(part.unitPrice)}</td>
        <td>${formatMoney(part.totalPrice)}</td>
        <td>${part.warrantyProvider || '-'}<span class="row-sub">${part.warrantyStartDate || '-'} to ${part.warrantyExpiryDate || '-'}</span></td>
      </tr>
    `).join('');
    document.getElementById('service-photo-list').innerHTML = (state.serviceImages || []).map((image) => `
      <article class="notification-item">
        <span data-icon="tools"></span>
        <div><strong>${image.photoType || 'Service Photo'} #SJ-${image.serviceJobId}</strong><p>${image.description || image.fileName || image.imageUrl}</p></div>
      </article>
    `).join('');
    const files = [...(state.serviceImages || []), ...(state.documents || [])];
    document.getElementById('documents-body').innerHTML = files.map((file) => `
      <tr>
        <td><span class="row-title">${file.fileName}</span><span class="row-sub">${file.description || ''}</span></td>
        <td>${file.photoType || file.documentType || file.kind}</td>
        <td>${file.serviceJobId ? `#SJ-${file.serviceJobId}` : '-'}</td>
        <td>${file.uploadedAt || '-'}</td>
        <td><button class="mini-btn" type="button" data-action="download-file" data-kind="${file.kind}" data-id="${file.id}">Download</button></td>
      </tr>
    `).join('');
    injectIcons();
  }

  function renderProgress() {
    document.getElementById('progress-list').innerHTML = state.bookings.filter((booking) => booking.status !== 'Cancelled').map((booking) => `
      <div class="progress-item">
        <header><strong>${booking.service}</strong><span>${booking.progress}%</span></header>
        <div class="progress-bar"><span style="width:${booking.progress}%"></span></div>
        <small>${vehicleName(booking.vehicleId)} - ${booking.status}</small>
      </div>
    `).join('');
  }

  function renderSpending() {
    const total = state.invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    document.getElementById('spending-total').textContent = total.toLocaleString('en-LK');
    document.getElementById('chart-legend').innerHTML = [
      ['General Service', 40, 'var(--blue)'],
      ['Oil Change', 25, 'var(--red)'],
      ['Brake Service', 20, 'var(--yellow)'],
      ['AC Service', 15, '#dfe4eb']
    ].map(([label, percent, color]) => `<div class="legend-row"><i style="background:${color}"></i><span>${label}</span><strong>${percent}%</strong></div>`).join('');
  }

  function renderNotifications() {
    document.getElementById('notification-list').innerHTML = state.notifications.map((item) => `
      <article class="notification-item">
        <span data-icon="bell"></span>
        <div><strong>${item.type}</strong><p>${item.message}</p></div>
      </article>
    `).join('');
    injectIcons();
  }

  function renderAll() {
    renderProfile();
    renderMetrics();
    renderUpcoming();
    renderTables();
    renderProgress();
    renderSpending();
    renderNotifications();
  }

  function field(name, label, type = 'text', value = '', options = [], required = true) {
    const requiredAttribute = required ? ' required' : '';
    if (type === 'select') {
      return `<label><span>${label}</span><select name="${name}"${requiredAttribute}>${options.map((option) => `<option value="${option.value}" ${String(option.value) === String(value) ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>`;
    }
    if (type === 'textarea') {
      return `<label class="full"><span>${label}</span><textarea name="${name}"${requiredAttribute}>${value}</textarea></label>`;
    }
    return `<label><span>${label}</span><input name="${name}" type="${type}" value="${value}"${requiredAttribute} /></label>`;
  }

  function newVehicleFields() {
    return `
      <div class="new-vehicle-fields full" data-new-vehicle-fields hidden>
        ${field('newVehicleName', 'New Vehicle Name', 'text', '', [], false)}
        ${field('newVehiclePlate', 'Number Plate', 'text', '', [], false)}
        ${field('newVehicleYear', 'Year', 'number', '2026', [], false)}
      </div>
    `;
  }

  function bookingSlotPanel() {
    return '<div class="full slot-panel" data-booking-slots></div>';
  }

  function slotLabel(slot) {
    return slot.status === 'Full' ? `${slot.time} (Full)` : slot.label;
  }

  async function refreshBookingSlots() {
    const panel = els.modalBody.querySelector('[data-booking-slots]');
    const serviceInput = els.modalBody.querySelector('[name="service"]');
    const dateInput = els.modalBody.querySelector('[name="date"]');
    const timeInput = els.modalBody.querySelector('[name="time"]');
    if (!panel || !serviceInput || !dateInput || !timeInput || !serviceInput.value || !dateInput.value) return;

    panel.innerHTML = '<p>Loading available slots...</p>';
    const id = els.modalForm.dataset.id;
    const params = new URLSearchParams({ service: serviceInput.value, date: dateInput.value });
    if (id) params.set('excludeBookingId', id);

    try {
      const slots = await window.AutoCareApi.request(`/api/customer/booking-slots?${params.toString()}`);
      panel.innerHTML = slots.map((slot) => `
        <button class="mini-btn ${slot.remainingCapacity <= 0 ? 'mini-btn--red' : ''}" type="button" data-slot-time="${slot.time}" ${slot.remainingCapacity <= 0 ? 'disabled' : ''}>
          ${slotLabel(slot)}
        </button>
      `).join('') || '<p>No slots available.</p>';
      if (timeInput.value && !slots.some((slot) => slot.time === timeInput.value && slot.remainingCapacity > 0)) {
        timeInput.setCustomValidity('Selected time is full. Choose an available slot.');
      } else {
        timeInput.setCustomValidity('');
      }
    } catch (error) {
      panel.innerHTML = `<p>${error.message || 'Could not load available slots.'}</p>`;
    }
  }

  function toggleNewVehicleFields() {
    const fields = els.modalBody.querySelector('[data-new-vehicle-fields]');
    const vehicleSelect = els.modalBody.querySelector('select[name="vehicleId"]');
    if (!fields || !vehicleSelect) return;

    const isNewVehicle = vehicleSelect.value === 'new';
    fields.hidden = !isNewVehicle;
    fields.querySelectorAll('input').forEach((input) => {
      input.required = isNewVehicle;
    });
  }

  function openModal(mode, record = {}) {
    const vehicleOptions = state.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${displayVehicleName(vehicle)} - ${vehicle.plate}` }));
    if (!record.id) {
      vehicleOptions.push({ value: 'new', label: '+ Add New Vehicle' });
    }
    const config = {
      vehicle: {
        title: record.id ? 'Edit Vehicle' : 'Add Vehicle',
        body: field('name', 'Vehicle Name', 'text', record.name || `${record.make || ''} ${record.model || ''}`.trim()) + field('make', 'Vehicle Make', 'text', record.make || '') + field('model', 'Model', 'text', record.model || '') + field('plate', 'Number Plate', 'text', record.plate || '') + field('year', 'Year', 'number', record.year || '2026')
      },
      booking: {
        title: record.id ? 'Reschedule Booking' : 'Book Service Appointment',
        body: field('vehicleId', 'Vehicle', 'select', record.vehicleId || vehicleOptions[0]?.value, vehicleOptions) + field('service', 'Service', 'select', record.service || state.packages[0], state.packages.map((item) => ({ value: item, label: item }))) + field('date', 'Date', 'date', record.date || '') + field('time', 'Time', 'time', record.time || '') + bookingSlotPanel() + newVehicleFields()
      },
      emergency: {
        title: 'Emergency Service Request',
        body: field('location', 'Share Location', 'text', record.location || '') + field('problem', 'Describe Vehicle Problem', 'textarea', record.problem || '')
      }
    };

    els.modalForm.dataset.mode = mode;
    els.modalForm.dataset.id = record.id || '';
    els.modalTitle.textContent = config[mode].title;
    els.modalBody.innerHTML = config[mode].body;
    toggleNewVehicleFields();
    if (mode === 'booking') refreshBookingSlots();
    els.modal.showModal();
  }

  function openPendingBooking() {
    if (!pendingBooking) return;
    openModal('booking', {
      vehicleId: state.vehicles[0]?.id,
      service: pendingBooking.service,
      date: pendingBooking.date,
      time: pendingBooking.time
    });
  }

  async function handleModalSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(els.modalForm).entries());
    const mode = els.modalForm.dataset.mode;
    const id = Number(els.modalForm.dataset.id);

    if (mode === 'vehicle') {
      const payload = { name: data.name, make: data.make, model: data.model, plate: data.plate, year: data.year };
      const savedVehicle = await window.AutoCareApi.request(id ? `/api/customer/vehicles/${id}` : '/api/customer/vehicles', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.vehicles.find((item) => item.id === id), savedVehicle) : state.vehicles.push(savedVehicle);
      showToast('Vehicle saved successfully.');
    }

    if (mode === 'booking') {
      let vehicleId = Number(data.vehicleId);
      if (data.vehicleId === 'new') {
        const vehicleParts = splitVehicleName(data.newVehicleName);
        const savedVehicle = await window.AutoCareApi.request('/api/customer/vehicles', {
          method: 'POST',
          body: JSON.stringify({
            name: data.newVehicleName,
            make: vehicleParts.make,
            model: vehicleParts.model,
            plate: data.newVehiclePlate,
            year: data.newVehicleYear
          })
        });
        state.vehicles.push(savedVehicle);
        vehicleId = savedVehicle.id;
      }

      const payload = { vehicleId, service: data.service, date: data.date, time: data.time };
      const savedBooking = await window.AutoCareApi.request(id ? `/api/customer/bookings/${id}` : '/api/customer/bookings', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.bookings.find((item) => item.id === id), savedBooking) : state.bookings.push(savedBooking);
      clearPendingBooking();
      state.notifications.unshift({ id: nextId(state.notifications), type: 'Booking Update', message: 'Your booking request has been saved.', unread: true });
      showToast('Booking saved successfully.');
    }

    if (mode === 'emergency') {
      await window.AutoCareApi.request('/api/customer/emergency', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      state.notifications.unshift({ id: nextId(state.notifications), type: 'Emergency Request', message: `Emergency request sent from ${data.location}.`, unread: true });
      showToast('Emergency request sent to support.');
    }

    els.modal.close();
    saveState();
    renderAll();
  }

  async function downloadInvoice(id) {
    const invoice = state.invoices.find((item) => item.id === Number(id));
    if (!invoice) return;
    const text = await window.AutoCareApi.request(`/api/invoices/${invoice.id}/download`);
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `invoice-${invoice.id}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadInvoicePdf(id) {
    const link = document.createElement('a');
    link.href = `/api/invoices/${id}/pdf`;
    link.download = `invoice-${id}.pdf`;
    link.click();
  }

  function downloadFile(kind, id) {
    const link = document.createElement('a');
    link.href = `/api/files/${kind}/${id}/download`;
    link.download = '';
    link.click();
  }

  function switchView(view, label) {
    document.querySelectorAll('.view').forEach((panel) => panel.classList.remove('is-active'));
    document.querySelector(`[data-view-panel="${view}"]`).classList.add('is-active');
    document.querySelectorAll('.side-nav__item[data-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
    els.pageTitle.textContent = label || document.querySelector(`.side-nav__item[data-view="${view}"]`)?.textContent.trim() || 'Dashboard';
    els.sidebar.classList.remove('is-open');
  }

  async function handleAction(action, id, element) {
    const numericId = Number(id);
    if (action === 'new-vehicle') openModal('vehicle');
    if (action === 'edit-vehicle') openModal('vehicle', state.vehicles.find((item) => item.id === numericId));
    if (action === 'delete-vehicle') {
      await window.AutoCareApi.request(`/api/customer/vehicles/${numericId}`, { method: 'DELETE' });
      state.vehicles = state.vehicles.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Vehicle removed.');
    }
    if (action === 'new-booking') {
      openModal('booking');
    }
    if (action === 'new-booking-for-vehicle') {
      const vehicle = state.vehicles.find((item) => item.id === numericId);
      if (!vehicle) return;
      openModal('booking', { vehicleId: vehicle.id });
    }
    if (action === 'reschedule-booking') openModal('booking', state.bookings.find((item) => item.id === numericId));
    if (action === 'cancel-booking') {
      await window.AutoCareApi.request(`/api/customer/bookings/${numericId}/cancel`, { method: 'PUT' });
      state.bookings.find((item) => item.id === numericId).status = 'Cancelled';
      saveState();
      renderAll();
      showToast('Booking cancelled.');
    }
    if (action === 'delete-booking') {
      await window.AutoCareApi.request(`/api/customer/bookings/${numericId}`, { method: 'DELETE' });
      state.bookings = state.bookings.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Booking deleted.');
    }
    if (action === 'new-emergency') openModal('emergency');
    if (action === 'download-invoice') await downloadInvoice(numericId);
    if (action === 'download-invoice-pdf') downloadInvoicePdf(numericId);
    if (action === 'download-file') downloadFile(element.dataset.kind, numericId);
    if (action === 'close-modal') els.modal.close();
    if (action === 'logout') {
      window.AutoCareApi.logout();
    }
  }

  function bindEvents() {
    document.querySelectorAll('.side-nav__item[data-view]').forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.view, button.textContent.trim()));
    });

    document.querySelectorAll('[data-view-shortcut]').forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.viewShortcut));
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      handleAction(button.dataset.action, button.dataset.id, button).catch((error) => showToast(error.message || 'Action failed.'));
    });

    document.getElementById('mobile-menu').addEventListener('click', () => els.sidebar.classList.toggle('is-open'));
    els.modalForm.addEventListener('submit', (event) => {
      handleModalSubmit(event).catch((error) => showToast(error.message || 'Save failed.'));
    });
    els.modalForm.addEventListener('change', (event) => {
      if (event.target.name === 'vehicleId') {
        toggleNewVehicleFields();
      }
      if (['service', 'date'].includes(event.target.name)) {
        refreshBookingSlots();
      }
      if (event.target.name === 'time') {
        event.target.setCustomValidity('');
      }
    });
    els.modalForm.addEventListener('click', (event) => {
      const slotButton = event.target.closest('[data-slot-time]');
      if (!slotButton) return;
      const timeInput = els.modalBody.querySelector('[name="time"]');
      if (timeInput) {
        timeInput.value = slotButton.dataset.slotTime;
        timeInput.setCustomValidity('');
      }
    });

    document.getElementById('profile-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        const result = await window.AutoCareApi.request('/api/customer/profile', {
          method: 'PUT',
          body: JSON.stringify({ name: data.name, email: data.email, phone: data.phone })
        });
        state.profile.name = result.user.name;
        state.profile.email = result.user.email;
        state.profile.phone = result.user.phone;
        saveState();
        renderProfile();
        showToast('Profile updated successfully.');
      } catch (error) {
        showToast(error.message || 'Profile update failed.');
      }
    });

    document.getElementById('feedback-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        await window.AutoCareApi.request('/api/customer/feedback', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        event.currentTarget.reset();
        showToast('Thank you for your feedback.');
      } catch (error) {
        showToast(error.message || 'Feedback was not submitted.');
      }
    });
  }

  injectIcons();
  renderAll();
  bindEvents();
  if (initialView && document.querySelector(`[data-view-panel="${initialView}"]`)) {
    switchView(initialView);
  }
  if (pendingBooking) {
    window.setTimeout(() => openPendingBooking(), 300);
  }
  hydrateFromApi();
});
