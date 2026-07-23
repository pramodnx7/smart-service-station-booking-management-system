document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const pendingBookingKey = 'autocare-pending-booking';
  const session = getSession();

  if (!session || session.role !== 'customer' || !session.authenticated) {
    window.location.replace('index.html');
    return;
  }

  const initialView = (window.location.hash || new URLSearchParams(window.location.search).get('view') || '').replace(/^#/, '');
  let pendingBooking = loadPendingBooking();

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
    package: '<svg viewBox="0 0 24 24"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>',
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

  const emptyState = {
    profile: { name: session.name, email: session.email, phone: session.phone || '', avatar: session.avatar || '' },
    vehicles: [],
    bookings: [],
    invoices: [],
    usedParts: [],
    serviceImages: [],
    documents: [],
    notifications: [],
    rewardPoints: 0,
    packages: [],
    pricingPlans: [],
    currentPackage: null,
    packageRequests: [],
    paymentBankDetails: {
      bankName: 'Commercial Bank of Ceylon',
      accountName: 'AutoCare Service Station',
      accountNumber: 'Contact AutoCare',
      branch: 'Colombo'
    },
    queueEntries: [],
    companySettings: {}
  };

  let state = structuredClone(emptyState);
  let activeNotificationFilter = 'all';
  let notificationRefreshTimer = null;
  let queueRefreshTimer = null;

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
    return structuredClone(emptyState);
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
    // Dashboard records stay in memory; Firestore remains the only persistent source.
  }

  async function hydrateFromApi({ silent = false } = {}) {
    try {
      const [data, queueData] = await Promise.all([
        window.AutoCareApi.request('/api/customer/dashboard'),
        window.AutoCareApi.request('/api/customer/queue').catch(() => ({ entries: [] }))
      ]);
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
        packages: Array.isArray(data.packages) ? data.packages : [],
        pricingPlans: Array.isArray(data.pricingPlans) ? data.pricingPlans : [],
        currentPackage: data.currentPackage || null,
        packageRequests: Array.isArray(data.packageRequests) ? data.packageRequests : [],
        rewardPoints: Number(data.rewardPoints || 0),
        queueEntries: Array.isArray(queueData.entries) ? queueData.entries : []
      };
      saveState();
      renderAll();
    } catch (error) {
      if (!silent) showToast(error.message || 'Could not load database data.');
    }
  }

  async function refreshNotifications() {
    if (document.hidden) return;
    const notifications = await window.AutoCareApi.request('/api/customer/notifications');
    state.notifications = Array.isArray(notifications) ? notifications : [];
    saveState();
    renderMetrics();
    renderNotifications();
  }

  async function refreshCustomerQueue() {
    if (document.hidden) return;
    const [queueData, progressData] = await Promise.all([
      window.AutoCareApi.request('/api/customer/queue'),
      window.AutoCareApi.request('/api/customer/bookings/progress')
    ]);
    state.queueEntries = Array.isArray(queueData.entries) ? queueData.entries : [];
    (progressData.bookings || []).forEach((update) => {
      const booking = state.bookings.find((item) => Number(item.id) === Number(update.id));
      if (booking) Object.assign(booking, update);
    });
    renderCustomerQueue();
    renderMetrics();
    renderUpcoming();
    renderTables();
    renderProgress();
  }

  function scheduleQueueRefresh() {
    window.clearTimeout(queueRefreshTimer);
    const hasActiveQueueEntry = state.queueEntries.some((entry) => (
      !['Completed', 'Cancelled', 'No Show'].includes(entry.status)
    ));
    const refreshDelay = hasActiveQueueEntry ? 60 * 1000 : 5 * 60 * 1000;
    queueRefreshTimer = window.setTimeout(async () => {
      try {
        await refreshCustomerQueue();
      } catch (error) {
        // Keep the last known queue state during temporary outages.
      } finally {
        scheduleQueueRefresh();
      }
    }, refreshDelay);
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
    const content = document.createElement('div');
    const title = document.createElement('strong');
    const text = document.createElement('span');
    const close = document.createElement('button');
    icon.className = 'toast__icon';
    icon.textContent = 'i';
    content.className = 'toast__content';
    title.className = 'toast__title';
    title.textContent = 'Notification';
    text.className = 'toast__message';
    text.textContent = message;
    content.append(title, text);
    close.className = 'toast__close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close notification');
    close.textContent = '×';
    close.addEventListener('click', () => els.toast.classList.remove('is-visible'));
    els.toast.replaceChildren(icon, content, close);
    els.toast.className = `toast toast--${type} is-visible`;
    els.toast.hideTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 3600);
  }

  function renderProfile() {
    const profileInitials = initials(state.profile.name);
    document.getElementById('profile-initials').textContent = profileInitials;
    document.getElementById('customer-avatar-initials').textContent = profileInitials;
    displayCustomerAvatar(state.profile.avatar || state.profile.profileImage || '');
    document.getElementById('profile-name').textContent = state.profile.name;
    document.getElementById('profile-email').textContent = state.profile.email;
    document.getElementById('customer-sidebar-name').textContent = state.profile.name;
    document.getElementById('profile-full-name').value = state.profile.name;
    document.getElementById('profile-email-input').value = state.profile.email;
    document.getElementById('profile-phone').value = state.profile.phone;
    const profileUploader = document.getElementById('customer-profile-uploader');
    if (profileUploader && !profileUploader.dataset.ready) {
      profileUploader.dataset.ready = 'true';
      profileUploader.innerHTML = window.AutoCareImages.uploader({
        name: 'profileImage', label: 'Your Profile Image', folder: 'customers', value: state.profile.profileImage || state.profile.avatar
      });
      window.AutoCareImages.enhance(profileUploader);
    }
  }

  function displayCustomerAvatar(avatar) {
    window.AutoCareApi.displayAvatar(avatar, document.getElementById('profile-image'), document.getElementById('profile-initials'));
    window.AutoCareApi.displayAvatar(avatar, document.getElementById('customer-avatar-preview'), document.getElementById('customer-avatar-initials'));
  }

  function previewCustomerAvatar(file) {
    if (!file) {
      displayCustomerAvatar(state.profile.avatar || state.profile.profileImage || '');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => displayCustomerAvatar(String(reader.result || '')));
    reader.addEventListener('error', () => showToast('The selected profile image could not be previewed.'));
    reader.readAsDataURL(file);
  }

  function renderMetrics() {
    const completed = state.bookings.filter((booking) => booking.status === 'Completed').length;
    const totalSpend = state.invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const unread = state.notifications.filter((item) => item.unread).length;
    const metrics = [
      ['Completed Services', completed, 'View details', 'tools', 'tone-green'],
      ['Total Spending', formatMoney(totalSpend), 'Payment history', 'invoice', 'tone-orange'],
      ['Current Package', state.currentPackage?.name || 'Not selected', 'Manage your benefits', 'package', 'tone-blue'],
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
    const actions = booking ? bookingActionButtons(booking, false) : '';
    document.getElementById('upcoming-booking').innerHTML = booking ? `
      <h3>${booking.service}</h3>
      <p>${vehicleName(booking.vehicleId)}</p>
      <div class="booking-meta"><span>${booking.date}</span><span>${booking.time}</span><span>Queue #${booking.queue || '-'}</span></div>
      <span class="badge badge--${statusClass(booking.status)}">${booking.status}</span>
      ${actions ? `<div class="row-actions">${actions}</div>` : ''}
    ` : '<p>No upcoming bookings.</p>';
  }

  function renderCustomerQueue() {
    const container = document.getElementById('customer-queue-status');
    if (!container) return;
    const entry = state.queueEntries.find((item) => !['Completed', 'Cancelled', 'No Show'].includes(item.status)) || state.queueEntries[0];
    container.innerHTML = entry ? `
      <article class="customer-queue-card">
        <div class="customer-queue-token"><small>Queue Token</small><strong>${escapeHtml(entry.token)}</strong><span class="badge badge--${statusClass(entry.status)}">${escapeHtml(entry.status)}</span></div>
        <div><small>Queue Position</small><strong>${entry.queuePosition || '-'}</strong></div>
        <div><small>Estimated Wait</small><strong>${entry.status === 'Waiting' ? `${entry.estimatedWaitingMinutes} min` : '-'}</strong></div>
        <div><small>Service Bay</small><strong>${escapeHtml(entry.serviceBay)}</strong></div>
        <div><small>Mechanic</small><strong>${escapeHtml(entry.mechanic)}</strong></div>
        <div><small>Service</small><strong>${escapeHtml(entry.service)}</strong></div>
      </article>` : '<p class="table-empty">You are not currently checked into the service queue.</p>';
  }

  function vehicleCards(limit) {
    return state.vehicles.slice(0, limit || state.vehicles.length).map((vehicle) => {
      const images = [vehicle.frontImage || vehicle.image, vehicle.rearImage, vehicle.leftImage, vehicle.rightImage, vehicle.interiorImage, vehicle.engineImage].filter(Boolean);
      return `
      <article class="vehicle-card">
        ${vehicle.image ? `<img src="${escapeHtml(vehicle.image)}" alt="${escapeHtml(`${vehicle.make} ${vehicle.model}`)}" data-image-viewer />` : '<div class="media-placeholder" role="img" aria-label="No photo available"><span>No photo available</span></div>'}
        <h3>${displayVehicleName(vehicle)}</h3>
        <p>${vehicle.plate}</p>
        <div class="vehicle-image-gallery">${images.map((image, index) => `<img src="${image}" alt="${vehicle.make} ${vehicle.model} view ${index + 1}" data-image-viewer />`).join('')}</div>
        <div class="card-meta"><span>${vehicle.year}</span><span>${vehicle.model}</span></div>
        <div class="row-actions"><button class="mini-btn" type="button" data-action="new-booking-for-vehicle" data-id="${vehicle.id}">Book Service</button><button class="mini-btn" type="button" data-action="edit-vehicle" data-id="${vehicle.id}">Edit</button><button class="mini-btn mini-btn--red" type="button" data-action="delete-vehicle" data-id="${vehicle.id}">Delete</button></div>
      </article>
    `; }).join('') + `
      <article class="vehicle-card">
        <div class="media-placeholder" role="img" aria-label="No photo available"><span>No photo available</span></div>
        <h3>Add New Vehicle</h3>
        <p>Register another vehicle.</p>
        <div class="row-actions"><button class="mini-btn" type="button" data-action="new-vehicle">Add Vehicle</button></div>
      </article>
    `;
  }

  function bookingActionButtons(booking, includeDelete = true) {
    const deleteButton = includeDelete
      ? `<button class="mini-btn mini-btn--danger" type="button" data-action="delete-booking" data-id="${booking.id}">Delete</button>`
      : '';
    if (booking.status === 'Completed') {
      return `<button class="mini-btn mini-btn--files" type="button" data-action="leave-feedback" data-id="${booking.id}">Leave Feedback</button>${deleteButton}`;
    }
    if (booking.status === 'Cancelled') return deleteButton;
    return `<button class="mini-btn" type="button" data-action="reschedule-booking" data-id="${booking.id}">Reschedule</button><button class="mini-btn mini-btn--red" type="button" data-action="cancel-booking" data-id="${booking.id}">Cancel</button>${deleteButton}`;
  }

  function bookingRows() {
    return state.bookings.map((booking) => `
      <tr>
        <td><span class="row-title">${booking.service}</span><span class="row-sub">#BK-${booking.id}</span></td>
        <td>${vehicleName(booking.vehicleId)}</td>
        <td>${booking.date}<span class="row-sub">${booking.time}</span></td>
        <td><span class="badge badge--${statusClass(booking.status)}">${booking.status}</span></td>
        <td>${booking.queue ? `#${booking.queue}` : '-'}</td>
        <td><div class="row-actions">${bookingActionButtons(booking)}</div></td>
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
        <img class="service-photo-thumb" src="${image.previewUrl || image.fileUrl}" alt="${image.photoType || 'Service photo'}" data-image-viewer />
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

  function packageBenefits(benefits) {
    const items = Array.isArray(benefits) ? benefits.filter(Boolean) : [];
    return items.length
      ? `<ul>${items.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join('')}</ul>`
      : '<p>No package benefits are currently listed.</p>';
  }

  function renderCustomerPackages() {
    const currentContainer = document.getElementById('current-package');
    const packageGrid = document.getElementById('customer-package-grid');
    if (!currentContainer || !packageGrid) return;

    const openRequests = state.packageRequests.filter((request) => !['Approved', 'Rejected', 'Cancelled'].includes(request.status));
    const requestMarkup = openRequests.length ? `
      <div class="package-request-list">
        <h3>Requests Waiting For Completion</h3>
        ${openRequests.map((request) => `
          <article>
            <div><strong>${escapeHtml(request.packageName)}</strong><small>${escapeHtml(request.status)} · ${escapeHtml(request.paymentMethod)}</small></div>
            <span class="badge badge--${request.paymentStatus === 'Paid' || request.paymentStatus === 'Not Required' ? 'completed' : 'pending'}">${escapeHtml(request.paymentStatus)}</span>
            <div class="row-actions">
              ${request.paymentProofUrl ? `<a class="mini-btn" href="${escapeHtml(request.paymentProofUrl)}" target="_blank" rel="noopener">View Receipt</a>` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    ` : '';

    if (state.currentPackage) {
      currentContainer.innerHTML = `
        <article class="current-package-card">
          <div class="current-package-card__heading">
            <div>
              <span class="package-status">Active Package</span>
              <h3>${escapeHtml(state.currentPackage.name)}</h3>
              <p>${escapeHtml(state.currentPackage.badge || 'Customer service package')}</p>
            </div>
            <strong>${formatMoney(state.currentPackage.price)}<small>/ ${escapeHtml(state.currentPackage.billingPeriod)}</small></strong>
          </div>
          <div class="current-package-card__benefits">
            <h4>Benefits Applied To Your Account</h4>
            ${packageBenefits(state.currentPackage.benefits)}
          </div>
          <footer>Activated ${escapeHtml(state.currentPackage.activatedAt || 'today')} · Status: ${escapeHtml(state.currentPackage.status)}</footer>
        </article>
        ${requestMarkup}
      `;
    } else {
      currentContainer.innerHTML = `
        <article class="package-empty">
          <span data-icon="package"></span>
          <div><strong>No package selected</strong><p>Choose an available package below to activate its benefits.</p></div>
        </article>
        ${requestMarkup}
      `;
    }

    packageGrid.innerHTML = state.pricingPlans.length ? state.pricingPlans.map((plan) => {
      const isCurrent = Number(state.currentPackage?.pricingPlanId) === Number(plan.id);
      return `
        <article class="customer-package-card ${isCurrent ? 'is-current' : ''}">
          <header>
            <span>${escapeHtml(plan.badge || 'Service Package')}</span>
            ${isCurrent ? '<b>Current</b>' : ''}
          </header>
          <h3>${escapeHtml(plan.name)}</h3>
          <strong>${formatMoney(plan.price)}<small>/ ${escapeHtml(plan.billingPeriod)}</small></strong>
          <div class="customer-package-card__benefits">
            <h4>Included Benefits</h4>
            ${packageBenefits(plan.features)}
          </div>
          ${isCurrent ? '<button class="btn btn--ghost" type="button" disabled>Current Package</button>' : Number(plan.price) <= 0 ? `
            <button class="btn btn--blue" type="button" data-action="request-free-package" data-id="${plan.id}">Request Free Package</button>
          ` : `
            <div class="package-payment-actions">
              <button class="btn btn--blue" type="button" data-action="request-package-online" data-id="${plan.id}">Pay Online</button>
              <button class="btn btn--ghost" type="button" data-action="request-package-cashier" data-id="${plan.id}">Pay At Cashier</button>
            </div>
          `}
        </article>
      `;
    }).join('') : '<article class="package-empty"><div><strong>No packages available</strong><p>Please check again later.</p></div></article>';
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
        branch: 'Colombo 03',
        invoiceLogo: state.companySettings?.invoiceLogo || ''
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
            ${company.invoiceLogo ? `<img class="invoice-preview__logo" src="${company.invoiceLogo}" alt="Company invoice logo" data-image-viewer />` : '<div class="invoice-preview__logo">AC</div>'}
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
                <td>${invoice.service || 'Service Package'} - Labor</td>
                <td>1</td>
                <td>${formatMoney(laborCost)}</td>
                <td>${formatMoney(laborCost)}</td>
              </tr>
              <tr>
                <td>${invoice.service || 'Service Package'} - Service Charge</td>
                <td>1</td>
                <td>${formatMoney(serviceCharges)}</td>
                <td>${formatMoney(serviceCharges)}</td>
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
            ${invoice.mechanicSignature ? `<img class="invoice-preview__signature" src="${invoice.mechanicSignature}" alt="Mechanic signature" data-image-viewer />` : '<div class="invoice-preview__signature"></div>'}
          </div>
          <div>
            <span>Authorized Signature</span>
            ${invoice.customerSignature ? `<img class="invoice-preview__signature" src="${invoice.customerSignature}" alt="Customer signature" data-image-viewer />` : '<div class="invoice-preview__signature"></div>'}
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
    renderCustomerQueue();
    renderTables();
    renderProgress();
    renderSpending();
    renderNotifications();
    renderCustomerPackages();
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

  function bookingSlotPanel() {
    return '<div class="full slot-panel" data-booking-slots><p>Select a service and date to view available time slots.</p></div>';
  }

  function bookingVehicleFields(selectedVehicle = null) {
    const vehicleTypes = ['Car', 'SUV', 'Van', 'Pickup Truck', 'Truck', 'Motorcycle', 'Three-Wheeler', 'Other'];
    const fuelTypes = ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'LPG', 'Other'];
    const savedVehicleButtons = state.vehicles.length ? `
      <div class="saved-vehicle-picker full">
        <div><strong>Use a saved vehicle</strong><small>Optional — selecting one fills the details below.</small></div>
        <div class="saved-vehicle-picker__list">
          ${state.vehicles.map((vehicle) => `
            <button class="${Number(selectedVehicle?.id) === Number(vehicle.id) ? 'is-selected' : ''}" type="button" data-saved-vehicle-id="${vehicle.id}">
              <strong>${escapeHtml(displayVehicleName(vehicle))}</strong>
              <small>${escapeHtml(vehicle.plate)}</small>
            </button>
          `).join('')}
          <button class="${selectedVehicle ? '' : 'is-selected'}" type="button" data-use-new-booking-vehicle>
            <strong>Different Vehicle</strong>
            <small>Enter new details</small>
          </button>
        </div>
      </div>
    ` : '';

    return `
      <input type="hidden" name="vehicleId" value="${selectedVehicle?.id || ''}" />
      ${savedVehicleButtons}
      ${field('vehicleType', 'Vehicle Type', 'select', selectedVehicle?.vehicleType || 'Car', vehicleTypes.map((item) => ({ value: item, label: item })))}
      ${field('vehicleMake', 'Vehicle Make', 'text', selectedVehicle?.make || '')}
      ${field('vehicleModel', 'Vehicle Name / Model', 'text', selectedVehicle?.model || selectedVehicle?.name || '')}
      ${field('vehiclePlate', 'Number Plate', 'text', selectedVehicle?.plate || '')}
      ${field('vehicleYear', 'Manufacture Year', 'number', selectedVehicle?.year || String(new Date().getFullYear()))}
      ${field('fuelType', 'Fuel Type', 'select', selectedVehicle?.fuelType || 'Petrol', fuelTypes.map((item) => ({ value: item, label: item })))}
      ${field('vehicleColor', 'Vehicle Color (optional)', 'text', selectedVehicle?.color || '', [], false)}
      <div class="booking-vehicle-image full">
        ${window.AutoCareImages.uploader({
          name: 'vehicleFrontImage',
          label: 'Vehicle Image (optional)',
          folder: 'vehicles',
          value: ''
        })}
      </div>
    `;
  }

  function bookingForm(record = {}) {
    const selectedVehicle = state.vehicles.find((vehicle) => (
      Number(vehicle.id) === Number(record.vehicleId)
    )) || (!record.id ? state.vehicles[0] : null);
    return `
      <section class="booking-form-section full">
        <header class="booking-form-section__header">
          <span>1</span>
          <div><h3>Service & Appointment</h3><p>Choose the service, date, and an available time slot.</p></div>
        </header>
        <div class="booking-form-section__grid">
          ${field('service', 'Service Required', 'select', record.service || state.packages[0], state.packages.map((item) => ({ value: item, label: item })))}
          ${field('date', 'Appointment Date', 'date', record.date || '')}
          <input type="hidden" name="time" value="${record.time || ''}" required />
          ${bookingSlotPanel()}
        </div>
      </section>
      <section class="booking-form-section full">
        <header class="booking-form-section__header">
          <span>2</span>
          <div><h3>Vehicle Details</h3><p>Add the vehicle information for this service appointment.</p></div>
        </header>
        <div class="booking-form-section__grid" data-booking-vehicle-details>
          ${bookingVehicleFields(selectedVehicle)}
        </div>
      </section>
    `;
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
    const selected = els.modalBody.querySelector('[data-selected-slot]');
    if (selected) selected.textContent = time ? `Selected: ${time}` : 'Select an available time';
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
          <span data-selected-slot>${timeInput.value ? `Selected: ${timeInput.value}` : dateInput.value}</span>
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

  function selectBookingVehicle(vehicleId = null) {
    const vehicle = state.vehicles.find((item) => Number(item.id) === Number(vehicleId));
    const values = {
      vehicleId: vehicle?.id || '',
      vehicleType: vehicle?.vehicleType || 'Car',
      vehicleMake: vehicle?.make || '',
      vehicleModel: vehicle?.model || vehicle?.name || '',
      vehiclePlate: vehicle?.plate || '',
      vehicleYear: vehicle?.year || String(new Date().getFullYear()),
      fuelType: vehicle?.fuelType || 'Petrol',
      vehicleColor: vehicle?.color || ''
    };
    Object.entries(values).forEach(([name, value]) => {
      const input = els.modalBody.querySelector(`[name="${name}"]`);
      if (input) input.value = value;
    });
    els.modalBody.querySelectorAll('[data-saved-vehicle-id]').forEach((button) => {
      button.classList.toggle('is-selected', Number(button.dataset.savedVehicleId) === Number(vehicle?.id));
    });
    els.modalBody.querySelector('[data-use-new-booking-vehicle]')?.classList.toggle('is-selected', !vehicle);
  }

  function packagePaymentForm(plan) {
    const bank = state.paymentBankDetails || {};
    return `
      <section class="package-payment-summary full">
        <span>Package payment</span>
        <h3>${escapeHtml(plan.name)}</h3>
        <strong>${formatMoney(plan.price)}</strong>
        <p>Transfer the exact amount to the account below, then upload your bank receipt. An administrator will verify it before activating your package.</p>
      </section>
      <section class="bank-details-card full" aria-label="Bank transfer details">
        <div><span>Bank</span><strong>${escapeHtml(bank.bankName)}</strong></div>
        <div><span>Account name</span><strong>${escapeHtml(bank.accountName)}</strong></div>
        <div><span>Account number</span><strong>${escapeHtml(bank.accountNumber)}</strong></div>
        <div><span>Branch</span><strong>${escapeHtml(bank.branch)}</strong></div>
      </section>
      ${window.AutoCareImages.uploader({
        name: 'paymentProofReceipt',
        label: 'Bank Payment Receipt',
        folder: 'documents',
        optional: false,
        acceptPdf: true
      })}
      <p class="package-payment-note full">Accepted: JPG, PNG, WebP, or PDF up to 5 MB. No invoice is generated for this package request.</p>
    `;
  }

  function openModal(mode, record = {}) {
    const config = {
      vehicle: {
        title: record.id ? 'Edit Vehicle' : 'Add Vehicle',
        body: field('name', 'Vehicle Name', 'text', record.name || `${record.make || ''} ${record.model || ''}`.trim()) + field('make', 'Vehicle Make', 'text', record.make || '') + field('model', 'Model', 'text', record.model || '') + field('plate', 'Number Plate', 'text', record.plate || '') + field('year', 'Year', 'number', record.year || '2026') + [
          window.AutoCareImages.uploader({ name: 'frontImage', label: 'Front Image', folder: 'vehicles', value: record.frontImage || record.image }),
          window.AutoCareImages.uploader({ name: 'rearImage', label: 'Rear Image', folder: 'vehicles', value: record.rearImage }),
          window.AutoCareImages.uploader({ name: 'leftImage', label: 'Left Image', folder: 'vehicles', value: record.leftImage }),
          window.AutoCareImages.uploader({ name: 'rightImage', label: 'Right Image', folder: 'vehicles', value: record.rightImage }),
          window.AutoCareImages.uploader({ name: 'interiorImage', label: 'Interior Image', folder: 'vehicles', value: record.interiorImage }),
          window.AutoCareImages.uploader({ name: 'engineImage', label: 'Engine Image', folder: 'vehicles', value: record.engineImage })
        ].join('')
      },
      booking: {
        title: record.id ? 'Reschedule Booking' : 'Book Service Appointment',
        body: bookingForm(record)
      },
      emergency: {
        title: 'Emergency Service Request',
        body: field('location', 'Share Location', 'text', record.location || '') + field('problem', 'Describe Vehicle Problem', 'textarea', record.problem || '')
      },
      packagePayment: {
        title: `Pay For ${record.name}`,
        body: packagePaymentForm(record)
      }
    };

    els.modalForm.dataset.mode = mode;
    els.modalForm.dataset.id = record.id || '';
    els.modalTitle.textContent = config[mode].title;
    els.modalBody.innerHTML = config[mode].body;
    window.AutoCareImages.enhance(els.modalBody);
    if (mode === 'booking') refreshBookingSlots();
    if (mode === 'packagePayment' && els.modalSubmit) els.modalSubmit.textContent = 'Submit Receipt';
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
    if (mode === 'booking' && !data.time) {
      showToast('Select an available time slot before saving.', 'warning');
      return;
    }
    const imageTransaction = await window.AutoCareImages.collect(els.modalForm);
    Object.assign(data, imageTransaction.values);
    try {

    if (mode === 'packagePayment') {
      if (!data.paymentProofReceipt) {
        throw new Error('Upload your bank payment receipt before submitting.');
      }
      const upload = imageTransaction.uploads[0] || {};
      await window.AutoCareApi.request('/api/customer/package', {
        method: 'PUT',
        body: JSON.stringify({
          pricingPlanId: id,
          paymentMethod: 'Online',
          paymentProofUrl: data.paymentProofReceipt,
          paymentProofName: upload.fileName || 'Bank payment receipt'
        })
      });
      await window.AutoCareImages.commit(imageTransaction);
      els.modal.close();
      resetModalActions();
      await hydrateFromApi({ silent: true });
      showToast('Receipt sent to the administrator for verification and package approval.');
      return;
    }

    if (mode === 'vehicle') {
      const payload = { ...data, name: data.name, make: data.make, model: data.model, plate: data.plate, year: data.year, image: data.frontImage };
      const savedVehicle = await window.AutoCareApi.request(id ? `/api/customer/vehicles/${id}` : '/api/customer/vehicles', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.vehicles.find((item) => item.id === id), savedVehicle) : state.vehicles.push(savedVehicle);
      window.AutoCareApi.showSuccess('Your vehicle was saved successfully.');
    }

    if (mode === 'booking') {
      const vehicleId = Number(data.vehicleId);
      const vehiclePayload = {
        name: `${data.vehicleMake} ${data.vehicleModel}`.trim(),
        vehicleType: data.vehicleType,
        make: data.vehicleMake,
        model: data.vehicleModel,
        plate: data.vehiclePlate,
        year: data.vehicleYear,
        fuelType: data.fuelType,
        color: data.vehicleColor
      };
      if (data.vehicleFrontImage) {
        vehiclePayload.frontImage = data.vehicleFrontImage;
        vehiclePayload.image = data.vehicleFrontImage;
      }
      const savedVehicle = await window.AutoCareApi.request(
        vehicleId ? `/api/customer/vehicles/${vehicleId}` : '/api/customer/vehicles',
        {
          method: vehicleId ? 'PUT' : 'POST',
          body: JSON.stringify(vehiclePayload)
        }
      );
      if (vehicleId) {
        Object.assign(state.vehicles.find((item) => Number(item.id) === vehicleId), savedVehicle);
      } else {
        state.vehicles.push(savedVehicle);
      }

      const payload = { vehicleId: savedVehicle.id, service: data.service, date: data.date, time: data.time };
      const savedBooking = await window.AutoCareApi.request(id ? `/api/customer/bookings/${id}` : '/api/customer/bookings', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.bookings.find((item) => item.id === id), savedBooking) : state.bookings.push(savedBooking);
      clearPendingBooking();
      window.AutoCareApi.showSuccess('Your booking was saved successfully.');
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
    await refreshNotifications().catch(() => {});
    await refreshCustomerQueue().catch(() => {});
    scheduleQueueRefresh();
    await window.AutoCareImages.commit(imageTransaction);
    } catch (error) {
      await window.AutoCareImages.rollback(imageTransaction);
      throw error;
    }
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
      if (!await window.AutoCareApi.confirmAction({
        title: 'Remove Vehicle?', message: `Remove ${vehicleLabel} from your account?`,
        details: 'The vehicle disappears immediately while existing service history remains available.', confirmLabel: 'Remove Vehicle'
      })) return;
      await window.AutoCareApi.request(`/api/customer/vehicles/${numericId}`, { method: 'DELETE' });
      state.vehicles = state.vehicles.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Vehicle removed.');
    }
    if (action === 'new-booking') {
      openModal('booking');
    }
    if (action === 'request-package-online') {
      const plan = state.pricingPlans.find((item) => Number(item.id) === numericId);
      if (plan) openModal('packagePayment', plan);
    }
    if (['request-free-package', 'request-package-cashier'].includes(action)) {
      const plan = state.pricingPlans.find((item) => Number(item.id) === numericId);
      if (!plan) return;
      const paymentMethod = action === 'request-package-cashier' ? 'Cashier' : 'Free';
      if (!await window.AutoCareApi.confirmAction({
        title: `Request ${plan.name}?`,
        message: Number(plan.price) <= 0
          ? 'This free package will be sent to an administrator for approval.'
          : `${formatMoney(plan.price)} will be paid at the cashier.`,
        details: 'The package becomes active only after an administrator approves it.',
        confirmLabel: 'Send Request'
      })) return;
      await window.AutoCareApi.request('/api/customer/package', {
        method: 'PUT',
        body: JSON.stringify({ pricingPlanId: numericId, paymentMethod })
      });
      await hydrateFromApi({ silent: true });
      showToast('Package request sent for admin approval.');
    }
    if (action === 'new-booking-for-vehicle') {
      const vehicle = state.vehicles.find((item) => item.id === numericId);
      if (!vehicle) return;
      openModal('booking', { vehicleId: vehicle.id });
    }
    if (action === 'leave-feedback') {
      const booking = state.bookings.find((item) => item.id === numericId);
      if (!booking || booking.status !== 'Completed') {
        showToast('Feedback is available after the service is completed.');
        return;
      }
      switchView('support', 'Support');
      renderFeedbackServices();
      const serviceSelect = document.getElementById('feedback-service');
      if ([...serviceSelect.options].some((option) => option.value === booking.service)) {
        serviceSelect.value = booking.service;
      }
      document.getElementById('feedback-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector('#feedback-form textarea[name="feedback"]')?.focus({ preventScroll: true });
    }
    if (action === 'reschedule-booking') {
      const booking = state.bookings.find((item) => item.id === numericId);
      if (!booking || ['Completed', 'Cancelled'].includes(booking.status)) {
        showToast('Only active bookings can be rescheduled.');
        return;
      }
      openModal('booking', booking);
    }
    if (action === 'cancel-booking') {
      const booking = state.bookings.find((item) => item.id === numericId);
      if (!booking || ['Completed', 'Cancelled'].includes(booking.status)) {
        showToast('Only active bookings can be cancelled.');
        return;
      }
      if (!await window.AutoCareApi.confirmAction({
        title: `Cancel Booking #BK-${numericId}?`,
        message: `${booking.service} on ${booking.date} at ${booking.time} will be cancelled.`,
        details: 'The appointment will be removed from the active booking schedule.', confirmLabel: 'Cancel Booking', tone: 'warning'
      })) return;
      await window.AutoCareApi.request(`/api/customer/bookings/${numericId}/cancel`, { method: 'PUT' });
      booking.status = 'Cancelled';
      booking.progress = 0;
      booking.queue = 0;
      saveState();
      renderAll();
      await Promise.all([
        refreshNotifications().catch(() => {}),
        refreshCustomerQueue().catch(() => {})
      ]);
      scheduleQueueRefresh();
      showToast('Booking cancelled. The queue has been updated.');
    }
    if (action === 'delete-booking') {
      const booking = state.bookings.find((item) => item.id === numericId);
      if (!booking || !await window.AutoCareApi.confirmAction({
        title: `Delete Booking #BK-${numericId}?`, message: 'Permanently remove this cancelled booking record?',
        details: 'Deleted booking history cannot be recovered.', confirmLabel: 'Delete Booking'
      })) return;
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
      if (!document.hidden) refreshNotifications().catch(() => {});
    }, 5 * 60 * 1000);
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
    const profileForm = document.getElementById('profile-form');
    profileForm.addEventListener('change', (event) => {
      if (event.target.matches('#customer-profile-uploader input[type="file"]')) {
        previewCustomerAvatar(event.target.files?.[0]);
      }
    });
    profileForm.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-file], [data-remove-default]');
      if (!removeButton) return;
      window.setTimeout(() => {
        const uploader = document.querySelector('#customer-profile-uploader [data-image-uploader]');
        const selectedFile = uploader?._selectedFiles?.[0];
        if (selectedFile) previewCustomerAvatar(selectedFile);
        else displayCustomerAvatar(uploader?._removedDefaults ? '' : (state.profile.avatar || state.profile.profileImage || ''));
      }, 0);
    });
    els.modalForm.addEventListener('submit', (event) => {
      handleModalSubmit(event).catch((error) => showToast(error.message || 'Save failed.'));
    });
    els.modalForm.addEventListener('change', (event) => {
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
      const savedVehicleButton = event.target.closest('[data-saved-vehicle-id]');
      if (savedVehicleButton) {
        selectBookingVehicle(savedVehicleButton.dataset.savedVehicleId);
        return;
      }
      if (event.target.closest('[data-use-new-booking-vehicle]')) {
        selectBookingVehicle();
        return;
      }
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
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form).entries());
      let imageTransaction;
      try {
        imageTransaction = await window.AutoCareImages.collect(form);
        const profileImage = imageTransaction.values.profileImage || '';
        const result = await window.AutoCareApi.request('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ name: data.name, email: data.email, phone: data.phone, avatar: profileImage, profileImage })
        });
        await window.AutoCareImages.commit(imageTransaction);
        state.profile = { ...state.profile, ...result.user };
        localStorage.setItem(sessionKey, JSON.stringify({ ...getSession(), ...result.user, authenticated: true }));
        saveState();
        const profileUploader = document.getElementById('customer-profile-uploader');
        profileUploader.dataset.ready = '';
        profileUploader.replaceChildren();
        renderProfile();
        window.AutoCareApi.showSuccess('Your profile was saved successfully.');
      } catch (error) {
        if (imageTransaction) await window.AutoCareImages.rollback(imageTransaction);
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
        await refreshNotifications().catch(() => {});
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
  hydrateFromApi().finally(scheduleQueueRefresh);
  startNotificationRefresh();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    Promise.all([
      refreshNotifications().catch(() => {}),
      refreshCustomerQueue().catch(() => {})
    ]).finally(scheduleQueueRefresh);
  });
});
