document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const session = getSession();

  if (!session || session.role !== 'technician' || !session.token) {
    window.location.replace('index.html');
    return;
  }

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
    tools: '<svg viewBox="0 0 24 24"><path d="m14.7 6.3 3-3a4 4 0 0 1-5 5l-7 7a2 2 0 1 0 3 3l7-7a4 4 0 0 1 5-5l-3 3"/></svg>',
    invoice: '<svg viewBox="0 0 24 24"><path d="M6 2h9l3 3v17l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  let state = {
    profile: { name: session.name, email: session.email, specialization: '' },
    jobs: [],
    todayJobs: [],
    pendingJobs: 0,
    inProgressJobs: 0,
    completedJobs: 0,
    activeJobs: 0,
    performance: {},
    inventoryParts: [],
    notifications: []
  };

  const els = {
    sidebar: document.getElementById('technician-sidebar'),
    pageTitle: document.getElementById('page-title'),
    modal: document.getElementById('technician-modal'),
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

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'TC';
  }

  function statusClass(status) {
    const value = String(status || '').toLowerCase().replace(/\s+/g, '-');
    if (value === 'in-progress') return 'progress';
    if (value === 'waiting-for-parts') return 'parts';
    if (value === 'quality-check') return 'approved';
    return value || 'pending';
  }

  function injectIcons() {
    document.querySelectorAll('[data-icon]').forEach((node) => {
      node.innerHTML = icons[node.dataset.icon] || '';
    });
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    window.setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
  }

  async function hydrateFromApi() {
    try {
      state = { ...state, ...(await window.AutoCareApi.request('/api/technician/dashboard')) };
      renderAll();
    } catch (error) {
      showToast(error.message || 'Could not load assigned jobs.');
    }
  }

  function renderProfile() {
    document.getElementById('profile-initials').textContent = initials(state.profile.name);
    document.getElementById('profile-name').textContent = state.profile.name;
    document.getElementById('profile-email').textContent = state.profile.email;
    document.getElementById('sidebar-name').textContent = state.profile.name;
    document.getElementById('sidebar-specialization').textContent = state.profile.specialization || 'Workshop team';
    document.getElementById('notification-count').textContent = state.notifications.filter((item) => item.unread).length;
  }

  function renderMetrics() {
    const metrics = [
      ['Assigned Jobs', state.jobs.length, 'Total assignments', 'tools', 'tone-blue'],
      ['Pending Jobs', state.pendingJobs, 'Awaiting start', 'calendar', 'tone-orange'],
      ['In Progress Jobs', state.inProgressJobs, 'Active work', 'dashboard', 'tone-green'],
      ['Completed Jobs', state.completedJobs, 'Finished work', 'invoice', 'tone-red']
    ];

    document.getElementById('metric-grid').innerHTML = metrics.map(([label, value, note, icon, tone]) => `
      <article class="metric-card">
        <span class="metric-card__icon ${tone}" data-icon="${icon}"></span>
        <div><h3>${label}</h3><strong>${value}</strong><small>${note}</small></div>
      </article>
    `).join('');
    injectIcons();
  }

  function jobActions(job) {
    return `
      <div class="row-actions">
        <button class="mini-btn" type="button" data-action="update-progress" data-id="${job.id}">Progress</button>
        <button class="mini-btn" type="button" data-action="add-note" data-id="${job.id}">Note</button>
        <button class="mini-btn" type="button" data-action="add-part" data-id="${job.id}">Parts</button>
        <button class="mini-btn" type="button" data-action="return-part" data-id="${job.id}">Return</button>
        <button class="mini-btn" type="button" data-action="replace-part" data-id="${job.id}">Replace</button>
        <button class="mini-btn" type="button" data-action="request-parts" data-id="${job.id}">Request</button>
        <button class="mini-btn" type="button" data-action="add-image" data-id="${job.id}">Image</button>
        <button class="mini-btn" type="button" data-action="complete-job" data-id="${job.id}">Complete</button>
      </div>
    `;
  }

  function jobRows(jobs) {
    return jobs.map((job) => `
      <tr>
        <td><span class="row-title">#SJ-${job.id}</span></td>
        <td>${job.vehicleNumber}</td>
        <td>${job.customerName}<span class="row-sub">${job.customerPhone || ''}</span></td>
        <td>${job.serviceType}</td>
        <td><span class="badge badge--${statusClass(job.status)}">${job.status}</span></td>
        <td>${job.assignedDate || '-'}</td>
        <td>${job.status === 'Completed' ? '-' : jobActions(job)}</td>
      </tr>
    `).join('');
  }

  function renderJobs() {
    document.getElementById('today-jobs-body').innerHTML = jobRows(state.todayJobs);
    document.getElementById('assigned-jobs-body').innerHTML = jobRows(state.jobs.filter((job) => job.status !== 'Completed'));
    document.getElementById('completed-jobs-body').innerHTML = state.jobs.filter((job) => job.status === 'Completed').map((job) => `
      <tr><td><span class="row-title">#SJ-${job.id}</span></td><td>${job.vehicleNumber}</td><td>${job.customerName}</td><td>${job.serviceType}</td><td>${job.completionDate || '-'}</td></tr>
    `).join('');

    document.getElementById('recent-assignments').innerHTML = state.jobs.slice(0, 5).map((job) => `
      <div class="progress-item">
        <header><strong>#SJ-${job.id} ${job.serviceType}</strong><span>${job.progress}%</span></header>
        <div class="progress-bar"><span style="width:${job.progress}%"></span></div>
        <small>${job.vehicleNumber} - ${job.status}</small>
      </div>
    `).join('');
  }

  function renderInventory(filter = '') {
    const value = filter.toLowerCase();
    document.getElementById('inventory-body').innerHTML = state.inventoryParts
      .filter((part) => !value || `${part.itemCode} ${part.partName} ${part.category} ${part.brand}`.toLowerCase().includes(value))
      .map((part) => `
        <tr>
          <td><span class="row-title">${part.partName}</span><span class="row-sub">${part.itemCode}</span></td>
          <td>${part.category}</td>
          <td>${part.brand}</td>
          <td><span class="badge badge--${part.status === 'Out of Stock' ? 'cancelled' : part.status === 'Low Stock' ? 'parts' : 'completed'}">${part.stock}</span></td>
          <td>LKR ${Number(part.sellingPrice || 0).toLocaleString('en-LK')}</td>
          <td>${part.warrantyPeriod || '-'}</td>
        </tr>
      `).join('');
  }

  function renderPerformance() {
    const performance = state.performance || {};
    document.getElementById('performance-body').innerHTML = `
      <tr>
        <td>${performance.jobsCompleted || 0}</td>
        <td>${performance.averageCompletionDays || 0} days</td>
        <td>${performance.activeJobs || 0}</td>
        <td>${performance.customerRating || '-'}</td>
        <td>${performance.totalServicesCompleted || 0}</td>
      </tr>
    `;
  }

  function renderAll() {
    renderProfile();
    renderMetrics();
    renderJobs();
    renderInventory();
    renderPerformance();
  }

  function field(name, label, type = 'text', value = '', options = []) {
    if (type === 'select') {
      return `<label><span>${label}</span><select name="${name}" required>${options.map((option) => `<option value="${option.value}" ${String(option.value) === String(value) ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>`;
    }
    if (type === 'textarea') {
      return `<label class="full"><span>${label}</span><textarea name="${name}" required>${value}</textarea></label>`;
    }
    return `<label><span>${label}</span><input name="${name}" type="${type}" value="${value}" required /></label>`;
  }

  function openModal(mode, job = {}) {
    const statusOptions = ['Assigned', 'In Progress', 'Waiting For Parts', 'Quality Check', 'Completed'].map((status) => ({ value: status, label: status }));
    const partOptions = state.inventoryParts.map((part) => ({ value: part.id, label: `${part.name} (${part.stock} available)` }));
    const config = {
      progress: {
        title: `Update #SJ-${job.id}`,
        body: field('progressPercentage', 'Progress Percentage', 'number', job.progress || 0) + field('status', 'Status', 'select', job.status || 'In Progress', statusOptions) + field('remarks', 'Remarks', 'textarea', '')
      },
      note: {
        title: `Add Note #SJ-${job.id}`,
        body: field('note', 'Service / Repair Note', 'textarea', '')
      },
      part: {
        title: `Record Parts #SJ-${job.id}`,
        body: field('partId', 'Spare Part', 'select', partOptions[0]?.value, partOptions) + field('quantity', 'Quantity', 'number', '1') + field('condition', 'Condition', 'select', 'Brand New', ['Brand New', 'Used', 'Refurbished', 'Reconditioned', 'Customer Supplied'].map((condition) => ({ value: condition, label: condition }))) + field('warrantyStartDate', 'Warranty Start', 'date', new Date().toISOString().slice(0, 10)) + field('warrantyExpiryDate', 'Warranty Expiry', 'date', new Date().toISOString().slice(0, 10)) + field('photoUrl', 'Part Photo URL', 'url', '') + field('note', 'Note', 'textarea', '')
      },
      returnPart: {
        title: `Return Parts #SJ-${job.id}`,
        body: field('partId', 'Spare Part', 'select', partOptions[0]?.value, partOptions) + field('quantity', 'Quantity', 'number', '1') + field('condition', 'Condition', 'select', 'Brand New', ['Brand New', 'Used', 'Refurbished', 'Reconditioned'].map((condition) => ({ value: condition, label: condition }))) + field('note', 'Note', 'textarea', '')
      },
      replacePart: {
        title: `Record Replaced Part #SJ-${job.id}`,
        body: field('removedPartName', 'Removed Part Name', 'text', '') + field('condition', 'Condition', 'text', '') + field('replacementReason', 'Replacement Reason', 'textarea', '') + field('photoEvidence', 'Photo Evidence URL', 'url', '')
      },
      requestParts: {
        title: `Request Parts #SJ-${job.id}`,
        body: field('request', 'Required Parts', 'textarea', '')
      },
      image: {
        title: `Upload Image #SJ-${job.id}`,
        body: field('imageUrl', 'Image URL', 'url', '') + field('caption', 'Caption', 'text', '')
      }
    };

    els.modalForm.dataset.mode = mode;
    els.modalForm.dataset.id = job.id;
    els.modalTitle.textContent = config[mode].title;
    els.modalBody.innerHTML = config[mode].body;
    els.modal.showModal();
  }

  async function handleModalSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(els.modalForm).entries());
    const id = Number(els.modalForm.dataset.id);
    const mode = els.modalForm.dataset.mode;

    if (mode === 'progress') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/progress`, {
        method: 'POST',
        body: JSON.stringify({ ...data, progressPercentage: Number(data.progressPercentage) })
      });
    }
    if (mode === 'note') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
    if (mode === 'part') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/parts`, {
        method: 'POST',
        body: JSON.stringify({ ...data, partId: Number(data.partId), quantity: Number(data.quantity) })
      });
    }
    if (mode === 'returnPart') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/parts/return`, {
        method: 'POST',
        body: JSON.stringify({ ...data, partId: Number(data.partId), quantity: Number(data.quantity) })
      });
    }
    if (mode === 'replacePart') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/replaced-parts`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
    if (mode === 'requestParts') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/parts/request`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
    if (mode === 'image') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/images`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    els.modal.close();
    await hydrateFromApi();
    showToast('Job update saved.');
  }

  async function handleAction(action, id) {
    const job = state.jobs.find((item) => item.id === Number(id));
    if (action === 'update-progress') openModal('progress', job);
    if (action === 'add-note') openModal('note', job);
    if (action === 'add-part') openModal('part', job);
    if (action === 'return-part') openModal('returnPart', job);
    if (action === 'replace-part') openModal('replacePart', job);
    if (action === 'request-parts') openModal('requestParts', job);
    if (action === 'add-image') openModal('image', job);
    if (action === 'complete-job') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/complete`, { method: 'PUT' });
      await hydrateFromApi();
      showToast('Job marked completed.');
    }
    if (action === 'close-modal') els.modal.close();
    if (action === 'logout') window.AutoCareApi.logout();
  }

  function bindEvents() {
    document.querySelectorAll('.side-nav__item[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.side-nav__item').forEach((item) => item.classList.remove('is-active'));
        document.querySelectorAll('.view').forEach((panel) => panel.classList.remove('is-active'));
        button.classList.add('is-active');
        document.querySelector(`[data-view-panel="${button.dataset.view}"]`).classList.add('is-active');
        els.pageTitle.textContent = button.textContent.trim();
        els.sidebar.classList.remove('is-open');
      });
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      handleAction(button.dataset.action, button.dataset.id).catch((error) => showToast(error.message || 'Action failed.'));
    });

    document.getElementById('mobile-menu').addEventListener('click', () => els.sidebar.classList.toggle('is-open'));
    document.getElementById('inventory-search').addEventListener('input', (event) => renderInventory(event.target.value));
    els.modalForm.addEventListener('submit', (event) => {
      handleModalSubmit(event).catch((error) => showToast(error.message || 'Save failed.'));
    });
  }

  injectIcons();
  bindEvents();
  hydrateFromApi();
});
