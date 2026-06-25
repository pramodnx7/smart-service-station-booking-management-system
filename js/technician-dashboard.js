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
    servicePhotos: [],
    documents: [],
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
      <div class="technician-actions" aria-label="Job actions for #SJ-${job.id}">
        <div class="technician-actions__group">
          <span>Work</span>
          <button class="mini-btn mini-btn--work" type="button" data-action="update-progress" data-id="${job.id}">Update Progress</button>
          <button class="mini-btn mini-btn--work" type="button" data-action="add-note" data-id="${job.id}">Add Note</button>
        </div>
        <div class="technician-actions__group">
          <span>Parts</span>
          <button class="mini-btn mini-btn--parts" type="button" data-action="add-part" data-id="${job.id}">Use Part</button>
          <button class="mini-btn mini-btn--parts" type="button" data-action="return-part" data-id="${job.id}">Return Part</button>
          <button class="mini-btn mini-btn--parts" type="button" data-action="replace-part" data-id="${job.id}">Replace Part</button>
          <button class="mini-btn mini-btn--parts" type="button" data-action="request-parts" data-id="${job.id}">Request Part</button>
        </div>
        <div class="technician-actions__group">
          <span>Files</span>
          <button class="mini-btn mini-btn--files" type="button" data-action="add-image" data-id="${job.id}">Image Link</button>
          <button class="mini-btn mini-btn--files" type="button" data-action="upload-photos" data-id="${job.id}">Upload Photos</button>
          <button class="mini-btn mini-btn--files" type="button" data-action="upload-documents" data-id="${job.id}">Upload Docs</button>
        </div>
        <div class="technician-actions__group technician-actions__group--finish">
          <span>Finish</span>
          <button class="mini-btn mini-btn--complete" type="button" data-action="complete-job" data-id="${job.id}">Complete Job</button>
        </div>
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

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!size) return '';
    if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderUploadedFiles() {
    const jobsById = new Map(state.jobs.map((job) => [Number(job.id), job]));
    const uploads = [
      ...(state.servicePhotos || []).map((file) => ({ ...file, label: file.photoType || 'Service Photo' })),
      ...(state.documents || []).map((file) => ({ ...file, label: file.documentType || 'Service Document' }))
    ].sort((a, b) => Number(b.id) - Number(a.id));

    document.getElementById('file-jobs-body').innerHTML = uploads.length ? uploads.map((file) => {
      const job = jobsById.get(Number(file.serviceJobId)) || {};
      const fileSize = formatFileSize(file.sizeBytes);
      return `
        <tr>
          <td><span class="row-title">${file.fileName}</span><span class="row-sub">${file.description || fileSize || 'Uploaded file'}</span></td>
          <td><span class="badge badge--${file.kind === 'photo' ? 'approved' : 'progress'}">${file.label}</span></td>
          <td><span class="row-title">#SJ-${file.serviceJobId || '-'}</span><span class="row-sub">${job.customerName || ''}</span></td>
          <td>${job.vehicleNumber || '-'}<span class="row-sub">${job.vehicleName || ''}</span></td>
          <td>${file.uploadedAt || '-'}</td>
          <td><a class="mini-btn mini-btn--files" href="${file.fileUrl}" target="_blank" rel="noopener">Open</a></td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <strong>No uploaded photos or documents yet.</strong>
            <p>Files uploaded from assigned jobs will appear here automatically.</p>
          </div>
        </td>
      </tr>
    `;
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
    renderUploadedFiles();
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

  function jobSummary(job) {
    return `
      <div class="job-action-summary full">
        <span>#SJ-${job.id}</span>
        <strong>${job.vehicleNumber || 'Vehicle'} - ${job.serviceType || 'Service Job'}</strong>
        <small>${job.customerName || 'Customer'} / ${job.status || 'Pending'}</small>
      </div>
    `;
  }

  function openModal(mode, job = {}) {
    if (!job?.id) {
      showToast('Job details are still loading. Try again in a moment.');
      return;
    }
    const statusOptions = ['Assigned', 'In Progress', 'Waiting For Parts', 'Quality Check', 'Completed'].map((status) => ({ value: status, label: status }));
    const partOptions = state.inventoryParts.map((part) => ({ value: part.id, label: `${part.name} (${part.stock} available)` }));
    const config = {
      progress: {
        title: `Update #SJ-${job.id}`,
        submitLabel: 'Update Progress',
        body: field('progressPercentage', 'Progress Percentage', 'number', job.progress || 0) + field('status', 'Status', 'select', job.status || 'In Progress', statusOptions) + field('remarks', 'Work Details / Remarks', 'textarea', '')
      },
      note: {
        title: `Add Note #SJ-${job.id}`,
        submitLabel: 'Save Note',
        body: field('note', 'Service / Repair Note', 'textarea', '')
      },
      part: {
        title: `Record Parts #SJ-${job.id}`,
        submitLabel: 'Save Used Part',
        body: field('partId', 'Spare Part', 'select', partOptions[0]?.value, partOptions) + field('quantity', 'Quantity Used', 'number', '1') + field('condition', 'Part Condition', 'select', 'Brand New', ['Brand New', 'Used', 'Refurbished', 'Reconditioned', 'Customer Supplied'].map((condition) => ({ value: condition, label: condition }))) + field('warrantyStartDate', 'Warranty Start', 'date', new Date().toISOString().slice(0, 10)) + field('warrantyExpiryDate', 'Warranty Expiry', 'date', new Date().toISOString().slice(0, 10)) + '<label class="full"><span>Part Photo</span><input name="partPhoto" type="file" accept=".jpg,.jpeg,.png" /></label><div class="full notification-list" id="file-preview"></div>' + field('note', 'Part Usage Note', 'textarea', '')
      },
      returnPart: {
        title: `Return Parts #SJ-${job.id}`,
        submitLabel: 'Save Return',
        body: field('partId', 'Spare Part', 'select', partOptions[0]?.value, partOptions) + field('quantity', 'Quantity Returned', 'number', '1') + field('condition', 'Return Condition', 'select', 'Brand New', ['Brand New', 'Used', 'Refurbished', 'Reconditioned'].map((condition) => ({ value: condition, label: condition }))) + field('note', 'Return Note', 'textarea', '')
      },
      replacePart: {
        title: `Record Replaced Part #SJ-${job.id}`,
        submitLabel: 'Save Replacement',
        body: field('removedPartName', 'Removed Part Name', 'text', '') + field('condition', 'Removed Part Condition', 'text', '') + field('replacementReason', 'Replacement Reason', 'textarea', '') + field('photoEvidence', 'Photo Evidence URL', 'url', '')
      },
      requestParts: {
        title: `Request Parts #SJ-${job.id}`,
        submitLabel: 'Send Request',
        body: field('request', 'Required Parts Details', 'textarea', '')
      },
      image: {
        title: `Upload Image #SJ-${job.id}`,
        submitLabel: 'Save Image Link',
        body: field('imageUrl', 'Image URL', 'url', '') + field('caption', 'Image Caption', 'text', '')
      },
      uploadPhotos: {
        title: `Upload Photos #SJ-${job.id}`,
        submitLabel: 'Upload Photos',
        body: field('photoType', 'Photo Type', 'select', 'Before Service', ['Before Service', 'During Service', 'After Service', 'Replaced Part', 'Vehicle Inspection'].map((type) => ({ value: type, label: type }))) + '<label class="full"><span>Select Photo Files</span><input name="files" type="file" accept=".jpg,.jpeg,.png" multiple required /></label><div class="full notification-list" id="file-preview"></div>' + field('description', 'Photo Description', 'textarea', '')
      },
      uploadDocuments: {
        title: `Upload Documents #SJ-${job.id}`,
        submitLabel: 'Upload Documents',
        body: field('documentType', 'Document Type', 'select', 'Service Report', ['Service Report', 'Inspection Report', 'Warranty Document', 'Customer Attachment', 'Vehicle Registration Document', 'Insurance Document', 'Service Checklist', 'Invoice PDF'].map((type) => ({ value: type, label: type }))) + '<label class="full"><span>Select Document Files</span><input name="files" type="file" accept=".jpg,.jpeg,.png,.pdf,.docx" multiple required /></label><div class="full notification-list" id="file-preview"></div>' + field('description', 'Document Description', 'textarea', '')
      },
      complete: {
        title: `Complete #SJ-${job.id}`,
        submitLabel: 'Complete Job',
        body: field('remarks', 'Final Work Summary', 'textarea', '')
      }
    };

    const selected = config[mode];
    els.modalForm.dataset.mode = mode;
    els.modalForm.dataset.id = job.id;
    els.modalTitle.textContent = selected.title;
    els.modalBody.innerHTML = jobSummary(job) + selected.body;
    els.modalForm.querySelector('button[type="submit"]').textContent = selected.submitLabel || 'Save';
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
      const photoInput = els.modalForm.querySelector('input[name="partPhoto"]');
      const partPhoto = photoInput?.files?.[0] ? (await filesToPayload(photoInput.files))[0] : null;
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/parts`, {
        method: 'POST',
        body: JSON.stringify({ ...data, partId: Number(data.partId), quantity: Number(data.quantity), partPhoto })
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
    if (mode === 'uploadPhotos' || mode === 'uploadDocuments') {
      const files = await filesToPayload(els.modalForm.querySelector('input[type="file"]').files);
      const path = mode === 'uploadPhotos' ? 'photos' : 'documents';
      const typeKey = mode === 'uploadPhotos' ? 'photoType' : 'documentType';
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/${path}/upload`, {
        method: 'POST',
        body: JSON.stringify({ [typeKey]: data[typeKey], description: data.description, files })
      });
    }
    if (mode === 'complete') {
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/progress`, {
        method: 'POST',
        body: JSON.stringify({ progressPercentage: 100, status: 'Quality Check', remarks: data.remarks })
      });
      await window.AutoCareApi.request(`/api/technician/jobs/${id}/complete`, { method: 'PUT' });
    }

    els.modal.close();
    await hydrateFromApi();
    showToast(mode === 'complete' ? 'Job completed successfully.' : 'Job update saved.');
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
    if (action === 'upload-photos') openModal('uploadPhotos', job);
    if (action === 'upload-documents') openModal('uploadDocuments', job);
    if (action === 'complete-job') openModal('complete', job);
    if (action === 'close-modal') {
      els.modal.close();
      els.modalForm.querySelector('button[type="submit"]').textContent = 'Save';
    }
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
    els.modalForm.addEventListener('change', (event) => {
      if (event.target.type === 'file') {
        renderFilePreview(event.target.files);
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

  async function filesToPayload(fileList) {
    const files = Array.from(fileList || []);
    return Promise.all(files.map(async (file) => ({
      fileName: file.name,
      mimeType: file.type,
      contentBase64: await readFileAsBase64(file)
    })));
  }

  function renderFilePreview(fileList) {
    const preview = document.getElementById('file-preview');
    if (!preview) return;
    preview.innerHTML = Array.from(fileList || []).map((file) => `<article class="notification-item"><span data-icon="invoice"></span><div><strong>${file.name}</strong><p>${Math.round(file.size / 1024)} KB</p></div></article>`).join('');
    injectIcons();
  }

  injectIcons();
  bindEvents();
  hydrateFromApi();
});
