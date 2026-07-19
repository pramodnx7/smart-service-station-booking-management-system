document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const pendingBookingKey = 'autocare-pending-booking';
  const legacyStorageKey = 'autocare-customer-dashboard-state';
  const session = getSession();

  if (!session || session.role !== 'customer' || !session.token) {
    window.location.replace('index.html');
    return;
  }

  const storageKey = `${legacyStorageKey}-${session.id}`;
  localStorage.removeItem(legacyStorageKey);

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
    profile: { name: session.name, email: session.email, phone: session.phone || '' },
    vehicles: [],
    bookings: [],
    invoices: [],
    usedParts: [],
    serviceImages: [],
    documents: [],
    notifications: [],
    rewardPoints: 0,
    packages: ['Oil Change', 'Brake Service', 'Full Service', 'Engine Diagnostics', 'General Service', 'Electrical Repair', 'Engine Repair', 'Suspension Repair', 'Hybrid/EV Service']
  };

  let state = loadState();
  let activeNotificationFilter = 'all';
  let notificationRefreshTimer = null;

  const els = {
    sidebar: document.getElementById('customer-sidebar'),
    pageTitle: document.getElementById('page-title'),
    modal: document.getElementById('customer-modal'),
    modalForm: document.getElementById('modal-form'),
    modalActions: document.querySelector('#customer-modal .modal__actions'),
    modalSubmit: document.getElementById('modal-submit'),
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

  function freshState() {
    return JSON.parse(JSON.stringify(defaults));
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      return saved ? { ...freshState(), ...saved, profile: { ...defaults.profile, ...(saved.profile || {}) } } : freshState();
    } catch (error) {
      return freshState();
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

  async function hydrateFromApi({ silent = false } = {}) {
    try {
      const data = await window.AutoCareApi.request('/api/customer/dashboard');
      const base = freshState();
      state = {
        ...base,
        ...data,
        profile: { ...base.profile, ...(data.profile || {}) },
        vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
        bookings: Array.isArray(data.bookings) ? data.bookings : [],
        invoices: Array.isArray(data.invoices) ? data.invoices : [],
        usedParts: Array.isArray(data.usedParts) ? data.usedParts : [],
        serviceImages: Array.isArray(data.serviceImages) ? data.serviceImages : [],
        documents: Array.isArray(data.documents) ? data.documents : [],
        notifications: Array.isArray(data.notifications) ? data.notifications : [],
        packages: Array.isArray(data.packages) && data.packages.length ? data.packages : base.packages,
        rewardPoints: Number(data.rewardPoints || 0)
      };
      saveState();
      renderAll();
    } catch (error) {
      if (!silent) showToast(error.message || 'Could not load database data.');
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

  function toastType(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('failed') || text.includes('error') || text.includes('not found') || text.includes('cannot') || text.includes('denied')) return 'error';
    if (text.includes('warning') || text.includes('inactive') || text.includes('pending')) return 'warning';
    return 'success';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function showToast(message, type = toastType(message)) {
    window.clearTimeout(els.toast.hideTimer);
    const icon = document.createElement('span');
    const text = document.createElement('span');
    const close = document.createElement('button');
    icon.className = 'toast__icon';
    icon.textContent = type === 'error' ? '!' : type === 'warning' ? '!' : '✓';
    text.className = 'toast__message';
    text.textContent = message;
    close.className = 'toast__close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close notification');
    close.textContent = '×';
    close.addEventListener('click', () => els.toast.classList.remove('is-visible'));
    els.toast.replaceChildren(icon, text, close);
    els.toast.className = `toast toast--${type} is-visible`;
    els.toast.hideTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 3600);
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
      ['Reward Points', state.rewardPoints || 0, 'Available points', 'dashboard', 'tone-blue'],
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
        <img src="${vehicle.image || 'assets/images/hero-blue-workshop.png'}" alt="${vehicle.make} ${vehicle.model}" />
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
    const emptyRow = (colspan, message) => `<tr><td colspan="${colspan}" class="table-empty">${message}</td></tr>`;
    document.getElementById('overview-vehicles').innerHTML = vehicleCards(3);
    document.getElementById('vehicle-grid').innerHTML = vehicleCards();
    document.getElementById('booking-body').innerHTML = state.bookings.length ? bookingRows() : emptyRow(6, 'No bookings yet.');
    document.getElementById('recent-history').innerHTML = state.invoices.length
      ? state.invoices.map((invoice) => `<tr><td>${invoice.service}</td><td>${invoice.date}</td><td>${formatMoney(invoice.amount)}</td><td><span class="badge badge--completed">Completed</span></td></tr>`).join('')
      : emptyRow(4, 'No service history yet.');
    document.getElementById('history-body').innerHTML = state.bookings.length
      ? state.bookings.map((booking) => `<tr><td>${booking.service}</td><td>${vehicleName(booking.vehicleId)}</td><td>${booking.date}</td><td>${formatMoney(state.invoices.find((invoice) => invoice.service === booking.service)?.amount || 0)}</td><td><span class="badge badge--${statusClass(booking.status)}">${booking.status}</span></td></tr>`).join('')
      : emptyRow(5, 'No service progress yet.');
    document.getElementById('invoice-body').innerHTML = state.invoices.length ? state.invoices.map((invoice) => `
      <tr>
        <td><span class="row-title">#INV-${invoice.id}</span></td>
        <td>${invoice.service}</td>
        <td>${invoice.date}</td>
        <td>${formatMoney(invoice.amount)}</td>
        <td><span class="badge badge--${invoice.payment === 'Paid' ? 'completed' : 'pending'}">${invoice.payment}</span></td>
        <td><div class="row-actions"><button class="mini-btn" type="button" data-action="preview-invoice" data-id="${invoice.id}">View</button><button class="mini-btn" type="button" data-action="download-invoice-pdf" data-id="${invoice.id}">Download PDF</button></div></td>
      </tr>
    `).join('') : emptyRow(6, 'No invoices yet.');
    document.getElementById('parts-body').innerHTML = (state.usedParts || []).length ? (state.usedParts || []).map((part) => `
      <tr>
        <td><span class="row-title">${part.partName}</span><span class="row-sub">${part.brand || '-'}</span></td>
        <td>${part.vehicleNumber || '-'}</td>
        <td>${part.condition}</td>
        <td>${part.quantity}</td>
        <td>${formatMoney(part.unitPrice)}</td>
        <td>${formatMoney(part.totalPrice)}</td>
        <td>${part.warrantyProvider || '-'}<span class="row-sub">${part.warrantyStartDate || '-'} to ${part.warrantyExpiryDate || '-'}</span></td>
      </tr>
    `).join('') : emptyRow(7, 'No parts recorded yet.');
    document.getElementById('service-photo-list').innerHTML = (state.serviceImages || []).length ? (state.serviceImages || []).map((image) => `
      <article class="notification-item">
        <span data-icon="tools"></span>
        <div><strong>${image.photoType || 'Service Photo'} #SJ-${image.serviceJobId}</strong><p>${image.description || image.fileName || image.imageUrl}</p></div>
      </article>
    `).join('') : '<article class="notification-empty"><strong>No service photos yet.</strong><p>Photos will appear after a service job is updated.</p></article>';
    const files = [...(state.serviceImages || []), ...(state.documents || [])];
    document.getElementById('documents-body').innerHTML = files.length ? files.map((file) => `
      <tr>
        <td><span class="row-title">${file.fileName}</span><span class="row-sub">${file.description || ''}</span></td>
        <td>${file.photoType || file.documentType || file.kind}</td>
        <td>${file.serviceJobId ? `#SJ-${file.serviceJobId}` : '-'}</td>
        <td>${file.uploadedAt || '-'}</td>
        <td><button class="mini-btn" type="button" data-action="download-file" data-kind="${file.kind}" data-id="${file.id}">Download</button></td>
      </tr>
    `).join('') : emptyRow(5, 'No documents yet.');
    injectIcons();
  }

  function renderProgress() {
    const activeProgress = state.bookings.filter((booking) => booking.status !== 'Cancelled');
    document.getElementById('progress-list').innerHTML = activeProgress.length ? activeProgress.map((booking) => `
      <div class="progress-item">
        <header><strong>${booking.service}</strong><span>${booking.progress}%</span></header>
        <div class="progress-bar"><span style="width:${booking.progress}%"></span></div>
        <small>${vehicleName(booking.vehicleId)} - ${booking.status}</small>
      </div>
    `).join('') : '<p>No service progress yet.</p>';
  }

  function renderSpending() {
    const total = state.invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    document.getElementById('spending-total').textContent = total.toLocaleString('en-LK');
    if (!state.invoices.length || total <= 0) {
      document.getElementById('chart-legend').innerHTML = '<div class="legend-row"><span>No spending recorded yet.</span><strong>0%</strong></div>';
      return;
    }
    document.getElementById('chart-legend').innerHTML = [
      ['General Service', 40, 'var(--blue)'],
      ['Oil Change', 25, 'var(--red)'],
      ['Brake Service', 20, 'var(--yellow)'],
      ['AC Service', 15, '#dfe4eb']
    ].map(([label, percent, color]) => `<div class="legend-row"><i style="background:${color}"></i><span>${label}</span><strong>${percent}%</strong></div>`).join('');
  }

  function renderNotifications() {
    const unread = state.notifications.filter((item) => item.unread).length;
    const visible = state.notifications.filter((item) => (
      activeNotificationFilter === 'all'
      || (activeNotificationFilter === 'unread' && item.unread)
      || (activeNotificationFilter === 'read' && !item.unread)
    ));
    document.getElementById('notification-summary').textContent = `${unread} unread updates. Latest booking, service, billing and offer messages appear here automatically.`;
    document.getElementById('notification-live-status').textContent = `Live updates on / ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    document.querySelectorAll('#notification-tabs button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.filter === activeNotificationFilter);
    });
    document.getElementById('notification-list').innerHTML = visible.length ? visible.map((item) => `
      <article class="notification-item notification-item--${item.unread ? 'unread' : 'read'}">
        <span data-icon="bell"></span>
        <div>
          <strong>${escapeHtml(item.type)}</strong>
          <p>${escapeHtml(item.message)}</p>
          <small>${item.unread ? 'New update' : 'Read'}</small>
        </div>
        ${item.unread ? `<button class="mini-btn" type="button" data-action="mark-notification-read" data-id="${item.id}">Mark Read</button>` : ''}
      </article>
    `).join('') : '<article class="notification-empty"><strong>No notifications here.</strong><p>New updates will appear automatically.</p></article>';
    injectIcons();
  }

  function buildInvoicePreviewModel(invoice) {
    const booking = state.bookings.find((item) => Number(item.id) === Number(invoice.bookingId) || item.service === invoice.service) || null;
    const vehicle = booking ? state.vehicles.find((item) => Number(item.id) === Number(booking.vehicleId)) : null;
    const parts = (state.usedParts || []).filter((item) => item.serviceJobId === invoice.serviceJobId || item.serviceName === invoice.service);
    const partsTotal = Number(invoice.partsTotal || 0);
    const laborCost = Number(invoice.laborCost || 0);
    const serviceCharges = Number(invoice.serviceCharges || 0);
    const tax = Number(invoice.tax || 0);
    const discount = Number(invoice.discount || 0);
    const subtotal = partsTotal + laborCost + serviceCharges;
    const grandTotal = Number(invoice.amount || subtotal + tax - discount);
    return {
      invoice,
      booking,
      vehicle,
      parts,
      partsTotal,
      laborCost,
      serviceCharges,
      tax,
      discount,
      subtotal,
      grandTotal,
      paymentStatus: String(invoice.payment || 'Unpaid').trim(),
      company: {
        name: 'AutoCare Service Station',
        address: '123 AutoCare Drive, Motor City',
        phone: '+94 77 023 4567',
        email: 'support@autocare.lk',
        bankName: 'Sampath Bank',
        accountName: 'AutoCare Service Station',
        accountNumber: '100-200-300-4',
        branch: 'Colombo 03'
      }
    };
  }

  function renderInvoicePreviewMarkup(model) {
    const { invoice, booking, vehicle, parts, partsTotal, laborCost, serviceCharges, tax, discount, subtotal, grandTotal, paymentStatus, company } = model;
    const rows = parts.length
      ? parts.map((part) => `
          <tr>
            <td>${part.partName || part.name || 'Spare part'}</td>
            <td>${part.quantity || 1}</td>
            <td>${formatMoney(part.unitPrice || 0)}</td>
            <td>${formatMoney(part.totalPrice || (Number(part.unitPrice || 0) * Number(part.quantity || 1)))}</td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="4" class="invoice-preview__empty">No spare parts were recorded for this service.</td>
          </tr>
        `;
    return `
      <div class="invoice-preview-shell">
        <div class="invoice-preview__header">
          <div>
            <p class="eyebrow">AutoCare Service Station</p>
            <h2>Tax Invoice</h2>
          </div>
          <div class="invoice-preview__status">${paymentStatus}</div>
        </div>
        <div class="invoice-preview__brand-row">
          <div class="invoice-preview__brand">
            <div class="invoice-preview__logo">AC</div>
            <div>
              <strong>${company.name}</strong>
              <p>${company.address}</p>
              <p>${company.phone} · ${company.email}</p>
            </div>
          </div>
          <div class="invoice-preview__meta">
            <div><span>Invoice No</span><strong>#INV-${invoice.id}</strong></div>
            <div><span>Invoice Date</span><strong>${invoice.date || 'Pending'}</strong></div>
            <div><span>Booking</span><strong>#BK-${booking?.id || 'N/A'}</strong></div>
          </div>
        </div>
        <div class="invoice-preview__grid">
          <section class="invoice-preview__card">
            <div class="invoice-preview__section-title">Bill To</div>
            <p><strong>${state.profile?.name || 'Customer Name'}</strong></p>
            <p>${state.profile?.email || 'Email not provided'}</p>
            <p>${state.profile?.phone || 'Phone not provided'}</p>
          </section>
          <section class="invoice-preview__card">
            <div class="invoice-preview__section-title">Vehicle & Service</div>
            <p><strong>${vehicle ? `${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'Vehicle details unavailable'}</strong></p>
            <p>Plate: ${vehicle?.plate || 'N/A'}</p>
            <p>Service: ${invoice.service || 'Service Package'}</p>
          </section>
        </div>
        <section class="invoice-preview__card invoice-preview__card--full">
          <div class="invoice-preview__section-title">Itemized Charges</div>
          <table class="invoice-preview__table">
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>${invoice.service || 'Service Package'}</td>
                <td>1</td>
                <td>${formatMoney(laborCost)}</td>
                <td>${formatMoney(laborCost)}</td>
              </tr>
              ${rows}
            </tbody>
          </table>
        </section>
        <div class="invoice-preview__footer-grid">
          <section class="invoice-preview__card">
            <div class="invoice-preview__section-title">Billing Summary</div>
            <div class="invoice-preview__totals">
              <div><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
              <div><span>Discount</span><strong>-${formatMoney(discount)}</strong></div>
              <div><span>Tax</span><strong>${formatMoney(tax)}</strong></div>
              <div class="invoice-preview__total"><span>Grand Total</span><strong>${formatMoney(grandTotal)}</strong></div>
            </div>
          </section>
          <section class="invoice-preview__card">
            <div class="invoice-preview__section-title">Notes & Payment</div>
            <p>Thank you for choosing AutoCare Service Station. Please settle any remaining balance before collecting your vehicle.</p>
            <div class="invoice-preview__bank">
              <p><strong>Bank Details</strong></p>
              <p>${company.bankName}</p>
              <p>${company.accountName}</p>
              <p>${company.accountNumber}</p>
              <p>${company.branch}</p>
            </div>
          </section>
        </div>
        <div class="invoice-preview__signatures">
          <div>
            <span>Prepared By</span>
            <div class="invoice-preview__signature"></div>
          </div>
          <div>
            <span>Authorized Signature</span>
            <div class="invoice-preview__signature"></div>
          </div>
          <div class="invoice-preview__qr">
            <div class="invoice-preview__qr-box">QR</div>
            <small>Verify invoice</small>
          </div>
        </div>
        <div class="invoice-preview__footer">
          <p>Contact: ${company.phone} · ${company.email}</p>
          <p>Thank you for trusting AutoCare Service Station.</p>
        </div>
      </div>
    `;
  }

  function resetModalActions() {
    if (!els.modalActions) return;
    els.modalActions.hidden = false;
    els.modalActions.innerHTML = `
      <button class="btn btn--ghost" type="button" data-action="close-modal">Cancel</button>
      <button class="btn btn--blue" type="submit" id="modal-submit">Save</button>
    `;
    els.modalSubmit = document.getElementById('modal-submit');
  }

  function openInvoicePreview(id) {
    const invoice = state.invoices.find((item) => item.id === Number(id));
    if (!invoice) return;
    const model = buildInvoicePreviewModel(invoice);
    els.modalTitle.textContent = `Invoice #INV-${invoice.id}`;
    els.modalBody.innerHTML = renderInvoicePreviewMarkup(model);
    if (els.modalActions) {
      els.modalActions.hidden = false;
      els.modalActions.innerHTML = `
        <div class="invoice-preview__actions">
          <button class="btn btn--ghost" type="button" data-action="close-modal">Close</button>
          <button class="btn btn--blue" type="button" data-action="print-invoice" data-id="${invoice.id}">Print</button>
          <button class="btn btn--yellow" type="button" data-action="download-invoice-pdf" data-id="${invoice.id}">Download PDF</button>
        </div>
      `;
    }
    els.modal.showModal();
  }

  function printInvoice(id) {
    const invoice = state.invoices.find((item) => item.id === Number(id));
    if (!invoice) return;
    const model = buildInvoicePreviewModel(invoice);
    const previewWindow = window.open('', '_blank', 'width=980,height=1200');
    if (!previewWindow) return;
    previewWindow.document.write(`<!DOCTYPE html><html><head><title>Invoice #INV-${invoice.id}</title><style>body{font-family:Inter,Arial,sans-serif;margin:0;padding:24px;background:#fff} .invoice-preview-shell{display:grid;gap:16px;border:1px solid #e9edf5;border-radius:16px;padding:24px} .invoice-preview__header,.invoice-preview__brand-row,.invoice-preview__grid,.invoice-preview__footer-grid,.invoice-preview__signatures{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.invoice-preview__card{flex:1 1 280px;padding:16px;border:1px solid #e9edf5;border-radius:12px;background:#fff}.invoice-preview__card--full{flex-basis:100%}.invoice-preview__table{width:100%;border-collapse:collapse}.invoice-preview__table th,.invoice-preview__table td{padding:10px 8px;border-bottom:1px solid #e9edf5;text-align:left}.invoice-preview__totals>div,.invoice-preview__meta>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px dashed #e9edf5}.invoice-preview__total{border-top:2px solid #e9edf5;padding-top:8px;margin-top:8px}.invoice-preview__signature{min-height:48px;border-bottom:2px solid #18233a}.invoice-preview__qr-box{display:grid;place-items:center;width:60px;height:60px;border:1px solid #e9edf5;border-radius:10px;background:#f2f4f8;font-weight:900}.invoice-preview__status{padding:8px 12px;border-radius:999px;background:rgba(47,85,212,0.12);color:#2f55d4;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em}.invoice-preview__logo{display:grid;place-items:center;width:54px;height:54px;border-radius:14px;background:linear-gradient(135deg,#2f55d4,#061a34);color:#fff;font-size:18px;font-weight:900}.invoice-preview__brand{display:flex;gap:12px;align-items:center} .invoice-preview__header h2{margin:0;font-size:24px;color:#061a34}</style></head><body>${renderInvoicePreviewMarkup(model)}</body></html>`);
    previewWindow.document.close();
    previewWindow.focus();
    previewWindow.print();
  }

  function renderAll() {
    renderProfile();
    renderMetrics();
    renderUpcoming();
    renderTables();
    renderProgress();
    renderSpending();
    renderNotifications();
    renderFeedbackServices();
  }

  function renderFeedbackServices() {
    const select = document.getElementById('feedback-service');
    if (!select) return;

    const currentValue = select.value;
    const completedServices = [...new Set(
      state.bookings
        .filter((booking) => booking.status === 'Completed')
        .map((booking) => booking.service)
        .filter(Boolean)
    )];

    select.innerHTML = '<option value="">Select a completed service</option>' + completedServices
      .map((service) => `<option value="${escapeHtml(service)}">${escapeHtml(service)}</option>`)
      .join('');
    if (completedServices.includes(currentValue)) select.value = currentValue;
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
        <label class="full"><span>Customer Car Image</span><input name="newVehicleImage" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" /></label>
        <div class="full vehicle-image-preview" data-file-preview="newVehicleImage"></div>
      </div>
    `;
  }

  function bookingSlotPanel() {
    return '<div class="full slot-panel" data-booking-slots><p>Select a service and date to view available time slots.</p></div>';
  }

  function slotStatusText(slot) {
    if (slot.status === 'Unavailable') return 'Unavailable';
    if (slot.remainingCapacity <= 0) return 'No slots available';
    return `${slot.remainingCapacity}/${slot.maxCapacity} Slots Available`;
  }

  function slotStateClass(slot, selectedTime) {
    const classes = ['booking-slot'];
    if (slot.remainingCapacity <= 0) {
      classes.push('booking-slot--unavailable');
    } else {
      classes.push('booking-slot--available');
    }
    if (slot.time === selectedTime) classes.push('is-selected');
    return classes.join(' ');
  }

  function setSelectedSlotUI(time) {
    els.modalBody.querySelectorAll('[data-slot-time]').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.slotTime === time);
    });
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
      panel.innerHTML = `
        <div class="slot-panel__header">
          <strong>Available time slots</strong>
          <span>${dateInput.value}</span>
        </div>
        <div class="slot-grid">
          ${slots.map((slot) => `
            <button class="${slotStateClass(slot, timeInput.value)}" type="button" data-slot-time="${slot.time}" ${slot.remainingCapacity <= 0 ? 'disabled' : ''}>
              <span class="booking-slot__time">${slot.time}</span>
              <span class="booking-slot__status">${slotStatusText(slot)}</span>
            </button>
          `).join('') || '<p>No slots available.</p>'}
        </div>
      `;
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
        body: field('name', 'Vehicle Name', 'text', record.name || `${record.make || ''} ${record.model || ''}`.trim()) + field('make', 'Vehicle Make', 'text', record.make || '') + field('model', 'Model', 'text', record.model || '') + field('plate', 'Number Plate', 'text', record.plate || '') + field('year', 'Year', 'number', record.year || '2026') + '<label class="full"><span>Customer Car Image</span><input name="vehicleImage" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" /></label>' + vehicleImagePreview(record.image, 'vehicleImage')
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
    const formData = new FormData(els.modalForm);
    const data = Object.fromEntries(formData.entries());
    const mode = els.modalForm.dataset.mode;
    const id = Number(els.modalForm.dataset.id);

    if (mode === 'vehicle') {
      const payload = { name: data.name, make: data.make, model: data.model, plate: data.plate, year: data.year };
      const vehicleImage = await fileInputToPayload('vehicleImage');
      if (vehicleImage) payload.vehicleImage = vehicleImage;
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
            year: data.newVehicleYear,
            vehicleImage: await fileInputToPayload('newVehicleImage')
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
      showToast('Booking saved successfully.');
    }

    if (mode === 'emergency') {
      await window.AutoCareApi.request('/api/customer/emergency', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('Emergency request sent to support.');
    }

    els.modal.close();
    saveState();
    renderAll();
    await hydrateFromApi({ silent: true });
  }

  async function downloadInvoicePdf(id) {
    const invoice = state.invoices.find((item) => item.id === Number(id));
    if (!invoice) {
      throw new Error('Invoice not found.');
    }

    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.title = 'Preparing AutoCare Invoice';
      previewWindow.document.body.innerHTML = '<p style="font:16px Arial;padding:24px">Preparing invoice PDF...</p>';
    }

    try {
      const blob = await window.AutoCareApi.requestBlob(`/api/invoices/${invoice.id}/pdf`);
      if (blob.type !== 'application/pdf') throw new Error('The server did not return a valid PDF invoice.');
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.replace(objectUrl);
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `AutoCare-Invoice-${invoice.id}.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
      showToast(`Invoice #INV-${invoice.id} opened.`);
    } catch (error) {
      previewWindow?.close();
      throw error;
    }
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
      const vehicle = state.vehicles.find((item) => item.id === numericId);
      if (!vehicle) return;
      const vehicleLabel = `${vehicle.make || ''} ${vehicle.model || ''} (${vehicle.plate || 'No plate'})`.trim();
      if (!window.confirm(`Remove ${vehicleLabel}? This action cannot be undone.`)) return;
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
      const booking = state.bookings.find((item) => item.id === numericId);
      if (!booking || ['Completed', 'Cancelled'].includes(booking.status)) {
        showToast('Only active bookings can be cancelled.');
        return;
      }
      if (!window.confirm(`Cancel booking #BK-${numericId}? This will remove it from the active queue.`)) return;
      await window.AutoCareApi.request(`/api/customer/bookings/${numericId}/cancel`, { method: 'PUT' });
      booking.status = 'Cancelled';
      booking.progress = 0;
      booking.queue = 0;
      saveState();
      renderAll();
      await hydrateFromApi({ silent: true });
      showToast('Booking cancelled. The queue has been updated.');
    }
    if (action === 'delete-booking') {
      await window.AutoCareApi.request(`/api/customer/bookings/${numericId}`, { method: 'DELETE' });
      state.bookings = state.bookings.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Booking deleted.');
    }
    if (action === 'new-emergency') openModal('emergency');
    if (action === 'preview-invoice') {
      openInvoicePreview(numericId);
      return;
    }
    if (action === 'print-invoice') {
      printInvoice(numericId);
      return;
    }
    if (action === 'download-invoice-pdf') await downloadInvoicePdf(numericId);
    if (action === 'download-file') downloadFile(element.dataset.kind, numericId);
    if (action === 'filter-notifications') {
      activeNotificationFilter = element.dataset.filter;
      renderNotifications();
    }
    if (action === 'mark-notification-read') {
      await window.AutoCareApi.request(`/api/customer/notifications/${numericId}/read`, { method: 'PUT' });
      const notification = state.notifications.find((item) => item.id === numericId);
      if (notification) notification.unread = false;
      saveState();
      renderMetrics();
      renderNotifications();
    }
    if (action === 'mark-all-notifications-read') {
      await window.AutoCareApi.request('/api/customer/notifications/read-all', { method: 'PUT' });
      state.notifications.forEach((item) => { item.unread = false; });
      saveState();
      renderMetrics();
      renderNotifications();
      showToast('All notifications marked as read.');
    }
    if (action === 'close-modal') {
      els.modal.close();
      resetModalActions();
    }
    if (action === 'logout') {
      window.AutoCareApi.logout();
    }
  }

  function startNotificationRefresh() {
    window.clearInterval(notificationRefreshTimer);
    notificationRefreshTimer = window.setInterval(() => {
      hydrateFromApi({ silent: true });
    }, 15000);
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
      if (event.target.type === 'file') {
        renderFilePreview(event.target.name, event.target.files?.[0]);
      }
      if (['service', 'date'].includes(event.target.name)) {
        refreshBookingSlots();
      }
      if (event.target.name === 'time') {
        event.target.setCustomValidity('');
        setSelectedSlotUI(event.target.value);
      }
    });
    els.modalForm.addEventListener('click', (event) => {
      const slotButton = event.target.closest('[data-slot-time]');
      if (!slotButton) return;
      const timeInput = els.modalBody.querySelector('[name="time"]');
      if (timeInput) {
        timeInput.value = slotButton.dataset.slotTime;
        timeInput.setCustomValidity('');
        setSelectedSlotUI(slotButton.dataset.slotTime);
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
        await hydrateFromApi({ silent: true });
        showToast('Thank you for your feedback.');
      } catch (error) {
        showToast(error.message || 'Feedback was not submitted.');
      }
    });
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function fileInputToPayload(name) {
    const file = els.modalForm.querySelector(`input[name="${name}"]`)?.files?.[0];
    if (!file) return null;
    return {
      fileName: file.name,
      mimeType: file.type,
      contentBase64: await readFileAsBase64(file)
    };
  }

  function vehicleImagePreview(image, inputName) {
    return `
      <div class="full vehicle-image-preview" data-file-preview="${inputName}">
        ${image ? `<img src="${image}" alt="" /><span>Current image</span>` : '<span>No image selected</span>'}
      </div>
    `;
  }

  function renderFilePreview(inputName, file) {
    const preview = els.modalForm.querySelector(`[data-file-preview="${inputName}"]`);
    if (!preview) return;
    preview.innerHTML = file
      ? `<span>${file.name}</span><small>${Math.round(file.size / 1024)} KB</small>`
      : '<span>No image selected</span>';
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
  startNotificationRefresh();
});
