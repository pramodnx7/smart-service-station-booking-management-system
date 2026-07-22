document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const session = window.AutoCareApi.getSession();
  if (!session || session.role !== 'admin' || !session.authenticated) {
    window.location.replace('login.html?role=admin&next=queue-management.html');
    return;
  }

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z"/></svg>',
    queue: '<svg viewBox="0 0 24 24"><path d="M4 6h12M4 12h8M4 18h5"/><circle cx="18" cy="16" r="3"/><path d="m20 18 2 2"/></svg>',
    display: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/><path d="m20 7-3-3"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
    users: '<svg viewBox="0 0 24 24"><path d="M17 21a5 5 0 0 0-10 0"/><circle cx="12" cy="8" r="4"/><path d="M3 21a4 4 0 0 1 4-4M21 21a4 4 0 0 0-4-4"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>',
    call: '<svg viewBox="0 0 24 24"><path d="M4 5h4l2 5-3 2a15 15 0 0 0 5 5l2-3 5 2v4c-8 1-16-7-15-15Z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  document.querySelectorAll('[data-icon]').forEach((element) => {
    element.innerHTML = icons[element.dataset.icon] || '';
  });

  const selectors = {
    sidebar: document.getElementById('sidebar'),
    modal: document.getElementById('queue-modal'),
    form: document.getElementById('queue-modal-form'),
    modalTitle: document.getElementById('queue-modal-title'),
    modalKicker: document.getElementById('queue-modal-kicker'),
    modalBody: document.getElementById('queue-modal-body'),
    modalSubmit: document.getElementById('queue-modal-submit'),
    toast: document.getElementById('toast')
  };
  let state = { metrics: {}, entries: [], nowServing: [], nextCustomers: [], serviceBays: [], technicians: [], customers: [], vehicles: [], services: [], reports: {} };
  let activeFilter = 'All';
  let refreshing = false;
  let appointmentTimer = 0;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const formatMinutes = (minutes) => `${Number(minutes || 0)} min`;
  const formatDateTime = (value) => value ? new Date(value).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' }) : '-';
  const option = (value, label, selected = false) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const field = (name, label, type = 'text', value = '', required = true) => `<label><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${required ? 'required' : ''} /></label>`;
  const selectField = (name, label, options, value = '', required = true) => `<label><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}" ${required ? 'required' : ''}>${options.map((item) => option(item.value, item.label, String(item.value) === String(value))).join('')}</select></label>`;

  function showToast(message, tone = 'success') {
    selectors.toast.className = `toast toast--${tone}`;
    selectors.toast.innerHTML = `<span class="toast__icon">${tone === 'error' ? '!' : '✓'}</span><span class="toast__message">${escapeHtml(message)}</span>`;
    selectors.toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => selectors.toast.classList.remove('is-visible'), 3600);
  }

  function metricCard(label, value, note, color) {
    return `<article class="queue-metric" style="--metric-color:${color}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
  }

  function renderMetrics() {
    const metrics = state.metrics || {};
    document.getElementById('queue-metrics').innerHTML = [
      ['Customers Waiting', metrics.waiting || 0, 'Dynamic priority queue', '#2768e0'],
      ['In Service', metrics.inService || 0, 'Currently in workshop', '#20a471'],
      ['Completed Today', metrics.completedToday || 0, 'Vehicles finished', '#7958d8'],
      ['Walk-ins Today', metrics.walkInsToday || 0, 'Unscheduled arrivals', '#e2a800'],
      ['Appointments', metrics.appointments || 0, 'Checked-in bookings', '#2768e0'],
      ['Emergencies', metrics.emergencies || 0, 'Manager approved', '#ef5258'],
      ['Average Wait', formatMinutes(metrics.averageWaitingMinutes), 'Completed customers', '#0d93a7'],
      ['Active Bays', metrics.activeServiceBays || 0, `${state.serviceBays.filter((bay) => bay.status === 'Available').length} available now`, '#20a471']
    ].map((item) => metricCard(...item)).join('');
  }

  function renderNowServing() {
    const container = document.getElementById('now-serving');
    container.innerHTML = state.nowServing.length ? state.nowServing.map((entry) => `
      <article class="serving-card"><div class="serving-card__top"><strong>${escapeHtml(entry.token)}</strong><span>${escapeHtml(entry.status)}</span></div><h3>${escapeHtml(entry.customerName)}</h3><p>${escapeHtml(entry.vehicle)} · ${escapeHtml(entry.service)}</p><div class="serving-meta"><span>${escapeHtml(entry.serviceBay)}</span><span>${escapeHtml(entry.mechanic)}</span><span>Elapsed ${formatMinutes(entry.elapsedServiceMinutes)}</span><span>${escapeHtml(entry.vehicleNumber)}</span></div></article>
    `).join('') : '<div class="queue-empty">No customers are being served right now.</div>';
  }

  function renderNextCustomers() {
    document.getElementById('next-customers').innerHTML = state.nextCustomers.length ? state.nextCustomers.map((entry) => `
      <article class="next-customer"><b>${entry.queuePosition}</b><strong>${escapeHtml(entry.token)}</strong><div><strong>${escapeHtml(entry.customerName)}</strong><small>${escapeHtml(entry.service)}</small></div><small>~${formatMinutes(entry.estimatedWaitingMinutes)}</small></article>
    `).join('') : '<div class="queue-empty">The waiting queue is clear.</div>';
  }

  function badgeClass(status) {
    return ({ Waiting: 'pending', Called: 'approved', 'In Service': 'progress', Completed: 'completed', Skipped: 'pending', Cancelled: 'cancelled', 'No Show': 'cancelled' })[status] || 'pending';
  }

  function rowActions(entry) {
    if (['Completed', 'Cancelled', 'No Show'].includes(entry.status)) return '<span class="row-sub">Closed</span>';
    const buttons = [];
    if (entry.status === 'Waiting') buttons.push(['call', 'Call', 'primary'], ['skip', 'Skip', 'warning']);
    if (entry.status === 'Called') buttons.push(['start', 'Start', 'primary'], ['skip', 'Skip', 'warning']);
    if (entry.status === 'Skipped') buttons.push(['recall', 'Recall', 'primary']);
    if (entry.status === 'In Service') buttons.push(['complete', 'Complete', 'primary']);
    if (['Waiting', 'Called'].includes(entry.status)) buttons.push(['assign', 'Assign', '']);
    if (!['In Service'].includes(entry.status)) buttons.push(['no-show', 'No Show', ''], ['cancel', 'Cancel', '']);
    return buttons.map(([action, label, tone]) => `<button class="mini-btn ${tone ? `mini-btn--${tone}` : ''}" type="button" data-action="${action}" data-id="${entry.id}">${label}</button>`).join('');
  }

  function filteredEntries() {
    const query = document.getElementById('queue-search').value.trim().toLowerCase();
    return state.entries.filter((entry) => {
      const matchesFilter = activeFilter === 'All' || entry.queueType === activeFilter || entry.status === activeFilter;
      const haystack = `${entry.token} ${entry.customerName} ${entry.customerPhone} ${entry.vehicle} ${entry.vehicleNumber} ${entry.service}`.toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });
  }

  function renderTable() {
    const entries = filteredEntries();
    document.getElementById('queue-body').innerHTML = entries.length ? entries.map((entry) => `
      <tr><td><span class="queue-token queue-token--${entry.queueType === 'Emergency' ? 'emergency' : entry.queueType === 'Walk-in' ? 'walk-in' : 'appointment'}">${escapeHtml(entry.token)}</span></td><td><span class="row-title">${escapeHtml(entry.customerName)}</span><span class="row-sub">${escapeHtml(entry.vehicle)} · ${escapeHtml(entry.vehicleNumber)}</span></td><td>${escapeHtml(entry.service)}</td><td><span class="queue-type">${escapeHtml(entry.queueType)}</span></td><td>${entry.queuePosition || '-'}</td><td><span class="priority-score"><i></i>${entry.priorityScore}</span></td><td><span class="row-title">${escapeHtml(entry.mechanic)}</span><span class="row-sub">${escapeHtml(entry.serviceBay)}</span></td><td>${entry.status === 'Waiting' ? `~${formatMinutes(entry.estimatedWaitingMinutes)}` : '-'}</td><td><span class="badge badge--${badgeClass(entry.status)}">${escapeHtml(entry.status)}</span></td><td><span class="row-title">${formatDateTime(entry.checkInTime)}</span><span class="row-sub">${formatMinutes(entry.waitingMinutes)} waiting</span></td><td><div class="queue-row-actions">${rowActions(entry)}</div></td></tr>
    `).join('') : '<tr><td colspan="11" class="table-empty">No queue records match this view.</td></tr>';
  }

  function renderServiceBays() {
    document.getElementById('service-bays').innerHTML = state.serviceBays.map((bay) => `
      <article class="service-bay service-bay--${bay.status.toLowerCase()}"><header><strong>${escapeHtml(bay.name)}</strong><span>${escapeHtml(bay.status)}</span></header><p>${bay.token ? `Serving ${escapeHtml(bay.token)}` : bay.status === 'Maintenance' ? 'Unavailable for assignment' : 'Ready for next customer'}</p>${bay.status === 'Busy' ? '' : `<button class="mini-btn" type="button" data-action="toggle-bay" data-id="${bay.id}" data-status="${bay.status === 'Maintenance' ? 'Available' : 'Maintenance'}">${bay.status === 'Maintenance' ? 'Mark Available' : 'Set Maintenance'}</button>`}</article>
    `).join('');
  }

  function renderReports() {
    const reports = state.reports || {};
    const items = [
      ['Average Waiting', formatMinutes(reports.averageWaitingMinutes)], ['Average Service', formatMinutes(reports.averageServiceMinutes)],
      ['Completion Rate', `${reports.completionRate || 0}%`], ['Peak Service Hour', reports.peakServiceHour || 'No data'],
      ['Walk-in Volume', reports.walkIns || 0], ['Appointment Volume', reports.appointments || 0],
      ['Emergency Volume', reports.emergencies || 0], ['Mechanics Reporting', (reports.mechanicUtilization || []).length]
    ];
    document.getElementById('queue-reports').innerHTML = items.map(([label, value]) => `<article class="queue-report"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
  }

  function renderAll() {
    renderMetrics(); renderNowServing(); renderNextCustomers(); renderTable(); renderServiceBays(); renderReports();
    document.getElementById('last-updated').textContent = `Updated ${new Date(state.generatedAt || Date.now()).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }

  async function refreshQueue(announce = false) {
    if (refreshing) return;
    refreshing = true;
    try {
      state = await window.AutoCareApi.request('/api/admin/queue');
      renderAll();
      if (announce) showToast('Queue refreshed.');
    } catch (error) {
      showToast(error.message || 'Queue could not be loaded.', 'error');
    } finally {
      refreshing = false;
    }
  }

  function openModal(mode, entry = {}) {
    selectors.form.dataset.mode = mode;
    selectors.form.dataset.id = entry.id || '';
    selectors.modalSubmit.hidden = false;
    selectors.modalKicker.textContent = 'Queue Action';
    if (mode === 'appointment') {
      selectors.modalTitle.textContent = 'Check-in Appointment';
      selectors.modalBody.innerHTML = `${field('appointmentSearch', 'Booking ID, phone number, or vehicle number', 'search', '', false)}<div class="appointment-results" id="appointment-results"><p class="queue-empty">Start typing to search appointments.</p></div>`;
      selectors.modalSubmit.hidden = true;
    } else if (mode === 'walk-in') {
      selectors.modalTitle.textContent = 'Register Walk-in Customer';
      selectors.modalBody.innerHTML = `
        ${selectField('customerId', 'Existing Customer', [{ value: '', label: 'Create new customer' }, ...state.customers.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` }))], '')}
        ${selectField('vehicleId', 'Existing Vehicle', [{ value: '', label: 'Register new vehicle' }, ...state.vehicles.map((item) => ({ value: item.id, label: `${item.name} · ${item.plate}` }))], '', false)}
        ${selectField('servicePackageId', 'Required Service', state.services.map((item) => ({ value: item.id, label: `${item.name} · ${item.duration}` })))}
        <section class="queue-form-section" data-new-customer><h3>New Customer</h3><p>Complete this only when the customer does not already exist.</p>${field('customerName', 'Full Name', 'text', '', false)}${field('customerPhone', 'Phone Number', 'tel', '', false)}${field('customerEmail', 'Email', 'email', '', false)}${field('temporaryPassword', 'Temporary Password', 'password', '', false)}</section>
        <section class="queue-form-section" data-new-vehicle><h3>New Vehicle</h3><p>Complete this only when the vehicle is not already registered.</p>${field('vehicleMake', 'Make', 'text', '', false)}${field('vehicleModel', 'Model', 'text', '', false)}${field('vehiclePlate', 'Vehicle Number', 'text', '', false)}${field('vehicleYear', 'Year', 'number', new Date().getFullYear(), false)}</section>`;
    } else if (mode === 'emergency') {
      selectors.modalTitle.textContent = 'Emergency Queue Override';
      selectors.modalKicker.textContent = 'Manager Approval Required';
      selectors.modalBody.innerHTML = `${selectField('customerId', 'Customer', state.customers.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` })))}${selectField('vehicleId', 'Vehicle', state.vehicles.map((item) => ({ value: item.id, label: `${item.name} · ${item.plate}` })))}${selectField('servicePackageId', 'Required Service', state.services.map((item) => ({ value: item.id, label: item.name })))}<label class="full"><span>Emergency Reason</span><textarea name="emergencyReason" required placeholder="Brake failure, engine failure, accident damage..."></textarea></label>`;
    } else if (mode === 'assign') {
      selectors.modalTitle.textContent = `Assign ${entry.token}`;
      selectors.modalBody.innerHTML = `${selectField('technicianId', 'Mechanic', [{ value: '', label: 'Keep current assignment' }, ...state.technicians.map((item) => ({ value: item.id, label: `${item.name} · ${item.specialization}` }))], entry.assignedTechnicianId || '', false)}${selectField('serviceBayId', 'Service Bay', [{ value: '', label: 'Keep current assignment' }, ...state.serviceBays.filter((bay) => bay.status === 'Available' || bay.id === entry.serviceBayId).map((bay) => ({ value: bay.id, label: `${bay.name} · ${bay.status}` }))], entry.serviceBayId || '', false)}`;
    }
    selectors.modal.showModal();
    selectors.modalBody.querySelector('input,select,textarea')?.focus();
  }

  function closeModal() {
    selectors.form.reset();
    selectors.modal.close();
  }

  async function searchAppointments(query) {
    const resultContainer = document.getElementById('appointment-results');
    if (!resultContainer) return;
    if (!query.trim()) { resultContainer.innerHTML = '<p class="queue-empty">Start typing to search appointments.</p>'; return; }
    resultContainer.innerHTML = '<p class="queue-empty">Searching...</p>';
    try {
      const result = await window.AutoCareApi.request(`/api/admin/queue/appointments?search=${encodeURIComponent(query.trim())}`);
      resultContainer.innerHTML = result.appointments.length ? result.appointments.map((item) => `<button class="appointment-result" type="button" data-action="select-appointment" data-id="${item.id}"><span><strong>#BK-${item.id} · ${escapeHtml(item.customerName)}</strong><small>${escapeHtml(item.phone)} · ${escapeHtml(item.vehicle)} · ${escapeHtml(item.vehicleNumber)}</small><small>${escapeHtml(item.service)} · ${escapeHtml(item.date)} ${escapeHtml(item.time)}</small></span><span class="badge badge--approved">Check In</span></button>`).join('') : '<p class="queue-empty">No active appointments found.</p>';
    } catch (error) {
      resultContainer.innerHTML = `<p class="queue-empty">${escapeHtml(error.message)}</p>`;
    }
  }

  async function runEntryAction(action, id, payload = {}) {
    await window.AutoCareApi.request(`/api/admin/queue/entries/${id}/${action}`, { method: 'PUT', body: JSON.stringify(payload) });
    await refreshQueue();
    showToast(`Queue action “${action}” completed.`);
  }

  async function handleAction(button) {
    const action = button.dataset.action;
    const id = Number(button.dataset.id);
    if (action === 'logout') { window.AutoCareApi.logout(); return; }
    if (action === 'refresh') { await refreshQueue(true); return; }
    if (action === 'check-in') { openModal('appointment'); return; }
    if (action === 'walk-in') { openModal('walk-in'); return; }
    if (action === 'emergency') { openModal('emergency'); return; }
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'call-next') {
      await window.AutoCareApi.request('/api/admin/queue/call-next', { method: 'POST', body: '{}' });
      await refreshQueue(); showToast('Next customer called and resources assigned.'); return;
    }
    if (action === 'select-appointment') {
      const result = await window.AutoCareApi.request('/api/admin/queue/appointments/check-in', { method: 'POST', body: JSON.stringify({ bookingId: id }) });
      closeModal(); await refreshQueue(); showToast(`Appointment checked in as ${result.token}.`); return;
    }
    if (action === 'assign') { openModal('assign', state.entries.find((entry) => entry.id === id)); return; }
    if (action === 'toggle-bay') {
      await window.AutoCareApi.request(`/api/admin/queue/service-bays/${id}`, { method: 'PUT', body: JSON.stringify({ status: button.dataset.status }) });
      await refreshQueue(); showToast(`Service bay marked ${button.dataset.status.toLowerCase()}.`); return;
    }
    if (['complete', 'cancel', 'no-show'].includes(action)) {
      const entry = state.entries.find((item) => item.id === id);
      const confirmations = {
        complete: { title: `Complete ${entry?.token || 'Queue Entry'}?`, message: 'Mark this service as completed and notify the customer?', confirmLabel: 'Complete Service', tone: 'success' },
        cancel: { title: `Cancel ${entry?.token || 'Queue Entry'}?`, message: 'Remove this customer from the active service queue?', confirmLabel: 'Cancel Entry', tone: 'danger' },
        'no-show': { title: `Mark ${entry?.token || 'Queue Entry'} as No Show?`, message: 'Close this queue entry because the customer did not arrive?', confirmLabel: 'Mark No Show', tone: 'warning' }
      };
      if (!await window.AutoCareApi.confirmAction({ ...confirmations[action], details: 'This updates the linked booking and customer notification.' })) return;
    }
    if (['call', 'skip', 'recall', 'start', 'complete', 'cancel', 'no-show'].includes(action)) await runEntryAction(action, id);
  }

  selectors.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = selectors.form.dataset.mode;
    const id = Number(selectors.form.dataset.id);
    const data = Object.fromEntries(new FormData(selectors.form).entries());
    selectors.modalSubmit.disabled = true;
    try {
      if (mode === 'walk-in') {
        const result = await window.AutoCareApi.request('/api/admin/queue/walk-ins', { method: 'POST', body: JSON.stringify(data) });
        closeModal(); await refreshQueue(); showToast(`Walk-in registered as ${result.token}.`);
      } else if (mode === 'emergency') {
        if (!await window.AutoCareApi.confirmAction({
          title: 'Approve Emergency Priority?',
          message: 'Place this customer at the highest queue priority?',
          details: 'Use emergency priority only after manager approval.', confirmLabel: 'Approve Emergency', tone: 'warning'
        })) return;
        const result = await window.AutoCareApi.request('/api/admin/queue/emergencies', { method: 'POST', body: JSON.stringify(data) });
        closeModal(); await refreshQueue(); showToast(`Emergency approved as ${result.token}.`);
      } else if (mode === 'assign') {
        await runEntryAction('assign', id, { technicianId: Number(data.technicianId) || undefined, serviceBayId: Number(data.serviceBayId) || undefined });
        closeModal();
      }
    } catch (error) {
      showToast(error.message || 'Queue action failed.', 'error');
    } finally {
      selectors.modalSubmit.disabled = false;
    }
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    handleAction(button).catch((error) => showToast(error.message || 'Queue action failed.', 'error'));
  });
  document.addEventListener('input', (event) => {
    if (event.target.id === 'queue-search') renderTable();
    if (event.target.name === 'appointmentSearch') {
      window.clearTimeout(appointmentTimer);
      appointmentTimer = window.setTimeout(() => searchAppointments(event.target.value), 280);
    }
  });
  document.getElementById('queue-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
    renderTable();
  });
  document.getElementById('mobile-menu').addEventListener('click', () => selectors.sidebar.classList.toggle('is-open'));
  selectors.modal.addEventListener('cancel', (event) => { event.preventDefault(); closeModal(); });

  refreshQueue();
  window.setInterval(() => { if (!document.hidden) refreshQueue(); }, 30000);
});
