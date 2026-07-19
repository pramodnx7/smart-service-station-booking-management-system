document.addEventListener('DOMContentLoaded', () => {
  const storageKey = 'autocare-admin-dashboard-state';
  const sessionKey = 'autocare-session';
  const statusLabels = ['All', 'Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled'];
  const session = getSession();

  if (!session || session.role !== 'admin' || !session.token) {
    window.location.replace('index.html');
    return;
  }

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z"/></svg>',
    users: '<svg viewBox="0 0 24 24"><path d="M17 21a5 5 0 0 0-10 0"/><circle cx="12" cy="8" r="4"/><path d="M3 21a4 4 0 0 1 4-4M21 21a4 4 0 0 0-4-4"/></svg>',
    technician: '<svg viewBox="0 0 24 24"><path d="M12 14a5 5 0 0 0-5 5v2h10v-2a5 5 0 0 0-5-5Z"/><circle cx="12" cy="7" r="4"/><path d="m18 3 3 3-4 4-3-3 4-4Z"/></svg>',
    car: '<svg viewBox="0 0 24 24"><path d="m3 13 2-5a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 5"/><path d="M5 13h14v5H5z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
    tools: '<svg viewBox="0 0 24 24"><path d="m14.7 6.3 3-3a4 4 0 0 1-5 5l-7 7a2 2 0 1 0 3 3l7-7a4 4 0 0 1 5-5l-3 3"/></svg>',
    invoice: '<svg viewBox="0 0 24 24"><path d="M6 2h9l3 3v17l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 2 3 6 6 .9-4.5 4.4 1.1 6.2L12 16.5 6.4 19.5l1.1-6.2L3 8.9 9 8l3-6Z"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    update: '<svg viewBox="0 0 24 24"><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/><path d="m20 7-3-3"/></svg>',
    reschedule: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m14 16 4-4 2 2-4 4-3 1 1-3Z"/></svg>',
    cancel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8M16 8l-8 8"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>'
  };

  const defaults = {
    customers: [
      { id: 1, name: 'Seril Suten', email: 'seril@example.com', phone: '+94 77 111 2233', status: 'Active' },
      { id: 2, name: 'Nimal Perera', email: 'nimal@example.com', phone: '+94 76 555 7788', status: 'Active' },
      { id: 3, name: 'Anjali Silva', email: 'anjali@example.com', phone: '+94 71 234 9000', status: 'Pending' }
    ],
    vehicles: [
      { id: 1, customerId: 1, make: 'Toyota Corolla', model: 'Axio', plate: 'ABC-854', year: '2019', image: 'assets/images/newsletter-red-sports-car.png' },
      { id: 2, customerId: 1, make: 'Honda Civic', model: 'EX', plate: 'XZ-5676', year: '2019', image: 'assets/images/hero-blue-workshop.png' },
      { id: 3, customerId: 2, make: 'Suzuki Swift', model: 'RS', plate: 'DEF-0012', year: '2020', image: 'assets/images/service-wheel-closeup.png' }
    ],
    technicians: [
      { id: 1, userId: 3, name: 'Kasun Technician', email: 'tech@autocare.lk', employeeNo: 'TECH-001', specialization: 'General Service', phone: '+94 77 222 3344', experienceYears: 4, status: 'Active' }
    ],
    bookings: [
      { id: 1, customerId: 1, vehicleId: 1, service: 'General Service', date: '2026-05-25', time: '10:00', status: 'Pending', queue: 3, progress: 20 },
      { id: 2, customerId: 2, vehicleId: 3, service: 'Oil Change', date: '2026-05-26', time: '14:30', status: 'Approved', queue: 5, progress: 35 },
      { id: 3, customerId: 1, vehicleId: 2, service: 'Engine Diagnostics', date: '2026-05-23', time: '09:00', status: 'In Progress', queue: 1, progress: 70 },
      { id: 4, customerId: 3, vehicleId: 3, service: 'Brake Service', date: '2026-05-20', time: '11:15', status: 'Completed', queue: 0, progress: 100 }
    ],
    packages: [
      { id: 1, name: 'Oil Change', price: 6000, duration: '45 min', description: 'Engine oil, filter replacement and quick inspection.' },
      { id: 2, name: 'Brake Service', price: 7500, duration: '1 hr', description: 'Brake pads, fluid check and safety testing.' },
      { id: 3, name: 'Full Service', price: 18500, duration: '3 hr', description: 'Complete inspection, fluids, diagnostics and tune-up.' },
      { id: 4, name: 'Engine Diagnostics', price: 12000, duration: '1.5 hr', description: 'Computer scan, issue report and repair estimate.' },
      { id: 5, name: 'General Service', price: 8500, duration: '1 hr', description: 'Standard maintenance service and inspection.' },
      { id: 6, name: 'Electrical Repair', price: 14000, duration: '2 hr', description: 'Electrical fault diagnosis and repair.' },
      { id: 7, name: 'Engine Repair', price: 22000, duration: '3 hr', description: 'Engine repair, tuning and mechanical correction.' },
      { id: 8, name: 'Suspension Repair', price: 16000, duration: '2 hr', description: 'Suspension inspection, repair and alignment checks.' },
      { id: 9, name: 'Hybrid/EV Service', price: 26000, duration: '2 hr', description: 'Hybrid and electric vehicle safety inspection and service.' }
    ],
    pricingPlans: [],
    invoices: [
      { id: 1001, customerId: 1, service: 'General Service', amount: 8500, payment: 'Unpaid', date: '2026-05-25' },
      { id: 1002, customerId: 2, service: 'Oil Change', amount: 6000, payment: 'Paid', date: '2026-05-18' },
      { id: 1003, customerId: 3, service: 'Brake Service', amount: 7500, payment: 'Paid', date: '2026-05-10' }
    ],
    emergencies: [
      { id: 1, customerId: 2, location: 'Colombo 05', problem: 'Vehicle will not start after battery warning light.', status: 'Open' },
      { id: 2, customerId: 1, location: 'Nugegoda', problem: 'Flat tyre and customer shared roadside location.', status: 'Assigned' }
    ],
    notifications: [
      { id: 1, type: 'Booking', message: 'Booking approved for Seril Suten on 25 May 2026.', unread: true },
      { id: 2, type: 'Payment', message: 'Invoice #1002 payment received.', unread: false },
      { id: 3, type: 'Service', message: 'Honda Civic diagnostics moved to final testing.', unread: true }
    ],
    sentNotifications: [],
    notificationDrafts: [],
    feedback: [
      { id: 1, customerId: 1, rating: 5, comment: 'Friendly team and clear service updates.' },
      { id: 2, customerId: 2, rating: 4, comment: 'Quick oil change and fair pricing.' },
      { id: 3, customerId: 3, rating: 5, comment: 'Emergency support reached me fast.' }
    ],
    serviceJobs: [
      { id: 1, bookingId: 1, customerId: 1, vehicleId: 1, assignedTechnicianId: 1, serviceType: 'General Service', priority: 'Normal', status: 'Assigned', progress: 35, assignedDate: '2026-05-24', technicianName: 'Kasun Technician', customerName: 'Seril Suten', vehicleNumber: 'ABC-854', vehicleName: 'Toyota Corolla Axio' }
    ],
    inventoryParts: [
      { id: 1, name: 'Engine Oil 5W-30', stock: 24, unitPrice: 6000 },
      { id: 2, name: 'Brake Pad Set', stock: 12, unitPrice: 7500 }
    ],
    inventorySuppliers: [],
    inventoryReports: { lowStock: [], outOfStock: [], stockMovements: [], technicianUsage: [], inventoryValue: {} },
    stockMovements: [],
    partUsageHistory: [],
    servicePhotos: [],
    documents: [],
    technicianWorkload: [],
    technicianPerformance: []
  };

  let state = loadState();
  let activeBookingStatus = 'All';
  let activeMessageTab = 'received';
  let pendingBookingDraft = null;
  let notificationDraftSaveInProgress = false;
  const technicianSpecializations = ['General Service', 'Oil Change', 'Brake Service', 'Electrical Repair', 'Engine Repair', 'Suspension Repair', 'Hybrid/EV Service'];

  const selectors = {
    sidebar: document.getElementById('sidebar'),
    pageTitle: document.getElementById('page-title'),
    toast: document.getElementById('toast'),
    modal: document.getElementById('dashboard-modal'),
    modalForm: document.getElementById('modal-form'),
    modalActions: document.querySelector('#dashboard-modal .modal__actions'),
    modalSubmit: document.getElementById('modal-submit'),
    modalTitle: document.getElementById('modal-title'),
    modalKicker: document.getElementById('modal-kicker'),
    modalBody: document.getElementById('modal-body')
  };

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(sessionKey));
    } catch (error) {
      return null;
    }
  }

  function applySessionProfile() {
    const initials = session.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || 'AD';

    document.getElementById('profile-initials').textContent = initials;
    window.AutoCareApi.displayAvatar(session.avatar, document.getElementById('profile-image'), document.getElementById('profile-initials'));
    document.getElementById('profile-name').textContent = session.name;
    document.getElementById('profile-role').textContent = session.role === 'admin' ? 'Manager' : 'Customer';
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      return saved ? { ...defaults, ...saved } : structuredClone(defaults);
    } catch (error) {
      return JSON.parse(JSON.stringify(defaults));
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  async function hydrateFromApi() {
    try {
      state = { ...state, ...(await window.AutoCareApi.request('/api/admin/dashboard')) };
      applyAdminProfile(state.profile || session);
      saveState();
      renderAll();
    } catch (error) {
      showToast(error.message || 'Could not load database data.');
    }
  }

  function applyAdminProfile(profile) {
    const name = profile.name || session.name;
    const avatarInitials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'AD';
    document.getElementById('profile-initials').textContent = avatarInitials;
    document.getElementById('settings-avatar-initials').textContent = avatarInitials;
    document.getElementById('profile-name').textContent = name;
    document.getElementById('admin-profile-name').value = name;
    document.getElementById('admin-profile-email').value = profile.email || session.email;
    document.getElementById('admin-profile-phone').value = profile.phone || '';
    window.AutoCareApi.displayAvatar(profile.avatar, document.getElementById('profile-image'), document.getElementById('profile-initials'));
    window.AutoCareApi.displayAvatar(profile.avatar, document.getElementById('settings-avatar-preview'), document.getElementById('settings-avatar-initials'));
  }

  function customerName(id) {
    return state.customers.find((customer) => customer.id === Number(id))?.name || 'Unknown customer';
  }

  function vehicleName(id) {
    const vehicle = state.vehicles.find((item) => item.id === Number(id));
    return vehicle ? `${vehicle.make} ${vehicle.model}` : 'Unknown vehicle';
  }

  function technicianName(id) {
    return state.technicians.find((item) => item.id === Number(id))?.name || 'Unassigned';
  }

  function formatMoney(amount) {
    return `LKR ${Number(amount).toLocaleString('en-LK')}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function buildInvoicePreviewModel(invoice) {
    const customer = state.customers.find((item) => item.id === Number(invoice.customerId)) || {};
    const serviceJob = state.serviceJobs.find((item) => item.id === Number(invoice.serviceJobId)) || null;
    const booking = serviceJob ? state.bookings.find((item) => item.id === Number(serviceJob.bookingId)) : null;
    const vehicle = serviceJob ? state.vehicles.find((item) => item.id === Number(serviceJob.vehicleId)) : (booking ? state.vehicles.find((item) => item.id === Number(booking.vehicleId)) : null);
    const technician = serviceJob ? state.technicians.find((item) => item.id === Number(serviceJob.assignedTechnicianId)) : null;
    const parts = (state.partUsageHistory || []).filter((item) => Number(item.serviceJobId) === Number(invoice.serviceJobId));
    const partsTotal = Number(invoice.partsTotal || 0);
    const laborCost = Number(invoice.laborCost || 0);
    const serviceCharges = Number(invoice.serviceCharges || 0);
    const tax = Number(invoice.tax || 0);
    const discount = Number(invoice.discount || 0);
    const subtotal = partsTotal + laborCost + serviceCharges;
    const grandTotal = Number(invoice.amount || subtotal + tax - discount);
    const paymentStatus = String(invoice.payment || 'Unpaid').trim();
    return {
      invoice,
      customer,
      serviceJob,
      booking,
      vehicle,
      technician,
      parts,
      partsTotal,
      laborCost,
      serviceCharges,
      tax,
      discount,
      subtotal,
      grandTotal,
      paymentStatus,
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
    const { invoice, customer, serviceJob, booking, vehicle, technician, parts, partsTotal, laborCost, serviceCharges, tax, discount, subtotal, grandTotal, paymentStatus, company } = model;
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
    const serviceName = invoice.service || serviceJob?.serviceType || 'Service Package';
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
            <div><span>Booking</span><strong>#BK-${booking?.id || serviceJob?.bookingId || 'N/A'}</strong></div>
          </div>
        </div>
        <div class="invoice-preview__grid">
          <section class="invoice-preview__card">
            <div class="invoice-preview__section-title">Bill To</div>
            <p><strong>${customer.name || 'Customer Name'}</strong></p>
            <p>${customer.address || 'Customer address not provided.'}</p>
            <p>${customer.phone || 'Phone not provided'}</p>
            <p>${customer.email || 'Email not provided'}</p>
          </section>
          <section class="invoice-preview__card">
            <div class="invoice-preview__section-title">Vehicle & Service</div>
            <p><strong>${vehicle ? `${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'Vehicle details unavailable'}</strong></p>
            <p>Plate: ${vehicle?.plate || vehicle?.plateNumber || 'N/A'}</p>
            <p>Service: ${serviceName}</p>
            <p>Mechanic: ${technician?.name || 'AutoCare Team'}</p>
          </section>
        </div>
        <section class="invoice-preview__card invoice-preview__card--full">
          <div class="invoice-preview__section-title">Service Summary</div>
          <div class="invoice-preview__summary-list">
            <div><span>Service Type</span><strong>${serviceName}</strong></div>
            <div><span>Service Date</span><strong>${booking?.date || invoice.date || 'Pending'}</strong></div>
            <div><span>Appointment Time</span><strong>${booking?.time || 'Pending'}</strong></div>
            <div><span>Payment Status</span><strong>${paymentStatus}</strong></div>
          </div>
        </section>
        <section class="invoice-preview__card invoice-preview__card--full">
          <div class="invoice-preview__section-title">Itemized Charges</div>
          <table class="invoice-preview__table">
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>${serviceName}</td>
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

  function openInvoicePreview(id) {
    const invoice = state.invoices.find((item) => item.id === Number(id));
    if (!invoice) return;
    const model = buildInvoicePreviewModel(invoice);
    selectors.modalKicker.textContent = 'Invoice Preview';
    selectors.modalTitle.textContent = `Invoice #INV-${invoice.id}`;
    selectors.modalBody.innerHTML = renderInvoicePreviewMarkup(model);
    selectors.modalActions.hidden = false;
    selectors.modalActions.innerHTML = `
      <div class="invoice-preview__actions">
        <button class="btn btn--ghost" type="button" data-action="close-modal">Close</button>
        <button class="btn btn--blue" type="button" data-action="print-invoice" data-id="${invoice.id}">Print</button>
        <button class="btn btn--yellow" type="button" data-action="download-invoice-pdf" data-id="${invoice.id}">Download PDF</button>
      </div>
    `;
    selectors.modal.showModal();
  }

  function printInvoice(id) {
    const invoice = state.invoices.find((item) => item.id === Number(id));
    if (!invoice) return;
    const model = buildInvoicePreviewModel(invoice);
    const previewWindow = window.open('', '_blank', 'width=980,height=1200');
    if (!previewWindow) return;
    previewWindow.document.write(`<!DOCTYPE html><html><head><title>Invoice #INV-${invoice.id}</title><style>${document.querySelector('link[rel="stylesheet"]').outerHTML}</style></head><body>${renderInvoicePreviewMarkup(model)}</body></html>`);
    previewWindow.document.close();
    previewWindow.focus();
    previewWindow.print();
  }

  function statusClass(status) {
    const value = status.toLowerCase().replace(/\s+/g, '-');
    if (value === 'in-progress') return 'progress';
    if (value === 'waiting-for-parts') return 'parts';
    if (value === 'quality-check') return 'approved';
    return value;
  }

  function injectIcons() {
    document.querySelectorAll('[data-icon]').forEach((node) => {
      node.innerHTML = icons[node.dataset.icon] || '';
    });
  }

  function toastType(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('failed') || text.includes('error') || text.includes('not found') || text.includes('cannot') || text.includes('denied')) return 'error';
    if (text.includes('warning') || text.includes('inactive') || text.includes('pending')) return 'warning';
    return 'success';
  }

  async function refreshNotifications() {
    if (document.hidden) return;
    const [messageCenter, emergencies] = await Promise.all([
      window.AutoCareApi.request('/api/admin/message-center'),
      window.AutoCareApi.request('/api/admin/emergencies')
    ]);
    state.notifications = messageCenter.received || [];
    state.sentNotifications = messageCenter.sent || [];
    state.notificationDrafts = messageCenter.drafts || [];
    state.emergencies = emergencies || [];
    saveState();
    renderEmergency();
    renderNotifications();
  }

  function showToast(message, type = toastType(message)) {
    window.clearTimeout(selectors.toast.hideTimer);
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
    close.addEventListener('click', () => selectors.toast.classList.remove('is-visible'));
    selectors.toast.replaceChildren(icon, text, close);
    selectors.toast.className = `toast toast--${type} is-visible`;
    selectors.toast.hideTimer = window.setTimeout(() => selectors.toast.classList.remove('is-visible'), 3600);
  }

  function nextId(collection) {
    return Math.max(0, ...collection.map((item) => Number(item.id))) + 1;
  }

  function renderMetrics() {
    const completed = state.bookings.filter((booking) => booking.status === 'Completed').length;
    const pending = state.bookings.filter((booking) => booking.status === 'Pending').length;
    const revenue = state.invoices.reduce((total, invoice) => total + Number(invoice.amount), 0);
    const emergencies = state.emergencies.filter((item) => item.status !== 'Closed').length;
    const metrics = [
      ['Completed Services', completed, 'Finished jobs', 'dashboard', 'tone-green'],
      ['Pending Bookings', pending, 'Awaiting approval', 'calendar', 'tone-blue'],
      ['Total Revenue', formatMoney(revenue), 'Invoices generated', 'invoice', 'tone-orange'],
      ['Emergency Requests', emergencies, 'Open assistance', 'alert', 'tone-red']
    ];

    document.getElementById('metric-grid').innerHTML = metrics.map(([label, value, note, icon, tone]) => `
      <article class="metric-card">
        <span class="metric-card__icon ${tone}" data-icon="${icon}"></span>
        <div><h3>${label}</h3><strong>${value}</strong><small>${note}</small></div>
      </article>
    `).join('');
    injectIcons();
  }

  function bookingRows(bookings) {
    return bookings.map((booking) => `
      <tr>
        <td><span class="row-title">#BK-${booking.id}</span><span class="row-sub">${booking.service}</span></td>
        <td>${customerName(booking.customerId)}</td>
        <td>${vehicleName(booking.vehicleId)}</td>
        <td>${booking.date}<span class="row-sub">${booking.time}</span></td>
        <td><span class="badge badge--${statusClass(booking.status)}">${booking.status}</span></td>
        <td>${booking.queue ? `#${booking.queue}` : '-'}</td>
        <td>
          <div class="row-actions booking-actions">
            <button class="mini-btn booking-icon-btn" type="button" data-action="advance-booking" data-id="${booking.id}" aria-label="Update booking status" title="Update status"><span data-icon="update"></span></button>
            <button class="mini-btn booking-icon-btn" type="button" data-action="reschedule-booking" data-id="${booking.id}" aria-label="Reschedule booking" title="Reschedule"><span data-icon="reschedule"></span></button>
            <button class="mini-btn mini-btn--red booking-icon-btn" type="button" data-action="cancel-booking" data-id="${booking.id}" aria-label="Cancel booking" title="Cancel"><span data-icon="cancel"></span></button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderOverview() {
    document.getElementById('overview-bookings').innerHTML = bookingRows(state.bookings.slice(0, 5));

    document.getElementById('progress-list').innerHTML = state.bookings
      .filter((booking) => booking.status !== 'Cancelled')
      .slice(0, 4)
      .map((booking) => `
        <div class="progress-item">
          <header><strong>${booking.service}</strong><span>${booking.progress}%</span></header>
          <div class="progress-bar"><span style="width:${booking.progress}%"></span></div>
          <small>${customerName(booking.customerId)} - ${vehicleName(booking.vehicleId)}</small>
        </div>
      `).join('');

    const total = state.invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    document.getElementById('revenue-total').textContent = total.toLocaleString('en-LK');
    document.getElementById('chart-legend').innerHTML = [
      ['General Service', 40, 'var(--blue)'],
      ['Oil Change', 25, 'var(--red)'],
      ['Brake Service', 20, 'var(--yellow)'],
      ['Diagnostics', 15, '#dfe4eb']
    ].map(([label, percent, color]) => `<div class="legend-row"><i style="background:${color}"></i><span>${label}</span><strong>${percent}%</strong></div>`).join('');
  }

  function renderCustomers() {
    document.getElementById('customers-body').innerHTML = state.customers.map((customer) => {
      const vehicleCount = state.vehicles.filter((vehicle) => vehicle.customerId === customer.id).length;
      return `
        <tr>
          <td><span class="row-title">${customer.name}</span><span class="row-sub">${customer.email}</span></td>
          <td>${customer.email}</td>
          <td>${customer.phone}</td>
          <td>${vehicleCount}</td>
          <td><span class="badge badge--${customer.status === 'Active' ? 'completed' : 'pending'}">${customer.status}</span></td>
          <td><div class="row-actions"><button class="mini-btn" type="button" data-action="edit-customer" data-id="${customer.id}">Edit</button><button class="mini-btn mini-btn--red" type="button" data-action="delete-customer" data-id="${customer.id}">Remove</button></div></td>
        </tr>
      `;
    }).join('');
  }

  function renderVehicles() {
    document.getElementById('vehicle-grid').innerHTML = state.vehicles.map((vehicle) => `
      <article class="vehicle-card">
        <img src="${vehicle.image}" alt="${vehicle.make} ${vehicle.model}" />
        <h3>${vehicle.make} ${vehicle.model}</h3>
        <p>${customerName(vehicle.customerId)}</p>
        <div class="card-meta"><span>${vehicle.plate}</span><span>${vehicle.year}</span></div>
        <div class="row-actions"><button class="mini-btn" type="button" data-action="new-booking-for-vehicle" data-id="${vehicle.id}">Book Service</button><button class="mini-btn" type="button" data-action="edit-vehicle" data-id="${vehicle.id}">Edit</button><button class="mini-btn mini-btn--red" type="button" data-action="delete-vehicle" data-id="${vehicle.id}">Delete</button></div>
      </article>
    `).join('');
  }

  function renderBookings() {
    const tabs = statusLabels.map((status) => `<button class="${status === activeBookingStatus ? 'is-active' : ''}" type="button" data-action="filter-bookings" data-status="${status}">${status}</button>`).join('');
    document.getElementById('booking-tabs').innerHTML = tabs;
    const bookings = activeBookingStatus === 'All' ? state.bookings : state.bookings.filter((booking) => booking.status === activeBookingStatus);
    document.getElementById('bookings-body').innerHTML = bookingRows(bookings);
  }

  function renderTechnicians() {
    document.getElementById('technicians-body').innerHTML = state.technicians.map((technician) => `
      <tr>
        <td><span class="row-title">${technician.name}</span><span class="row-sub">${technician.email}</span></td>
        <td>${technician.employeeNo}</td>
        <td>${technician.specialization}</td>
        <td>${technician.experienceYears} yrs</td>
        <td><span class="badge badge--${technician.status === 'Active' ? 'completed' : 'cancelled'}">${technician.status}</span></td>
        <td><div class="row-actions"><button class="mini-btn" type="button" data-action="edit-technician" data-id="${technician.id}">Edit</button><button class="mini-btn mini-btn--red" type="button" data-action="delete-technician" data-id="${technician.id}">Delete</button></div></td>
      </tr>
    `).join('');
  }

  function renderServiceJobs() {
    document.getElementById('service-jobs-body').innerHTML = state.serviceJobs.map((job) => `
      <tr>
        <td><span class="row-title">#SJ-${job.id}</span><span class="row-sub">${job.serviceType} - ${job.priority}</span></td>
        <td>${job.customerName || customerName(job.customerId)}</td>
        <td>${job.vehicleNumber || vehicleName(job.vehicleId)}</td>
        <td>${job.technicianName || technicianName(job.assignedTechnicianId)}</td>
        <td><span class="badge badge--${statusClass(job.status)}">${job.status}</span></td>
        <td><div class="row-actions">${serviceJobActions(job)}</div></td>
      </tr>
    `).join('');
  }

  function serviceJobActions(job) {
    const assignButton = `<button class="mini-btn" type="button" data-action="assign-technician" data-id="${job.id}">Assign</button>`;
    const completedButton = `<button class="mini-btn mini-btn--green" type="button" data-action="view-completed-job" data-id="${job.id}">Completed Details</button>`;
    return job.status === 'Completed' ? `${completedButton}${assignButton}` : assignButton;
  }

  function renderTechnicianReports() {
    const workload = state.technicianWorkload.length ? state.technicianWorkload : state.technicians.map((technician) => {
      const jobs = state.serviceJobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id));
      return {
        technicianId: technician.id,
        name: technician.name,
        specialization: technician.specialization,
        activeJobs: jobs.filter((job) => !['Completed', 'Cancelled'].includes(job.status)).length,
        pendingJobs: jobs.filter((job) => ['Pending', 'Assigned'].includes(job.status)).length,
        inProgressJobs: jobs.filter((job) => job.status === 'In Progress').length,
        waitingForParts: jobs.filter((job) => job.status === 'Waiting For Parts').length,
        completedJobs: jobs.filter((job) => job.status === 'Completed').length
      };
    });

    document.getElementById('workload-body').innerHTML = workload.map((item) => `
      <tr><td><span class="row-title">${item.name}</span></td><td>${item.specialization}</td><td>${item.activeJobs}</td><td>${item.pendingJobs}</td><td>${item.inProgressJobs}</td><td>${item.waitingForParts}</td><td>${item.completedJobs}</td></tr>
    `).join('');

    const performance = state.technicianPerformance.length ? state.technicianPerformance : state.technicians.map((technician) => ({
      name: technician.name,
      jobsCompleted: state.serviceJobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id) && job.status === 'Completed').length,
      activeJobs: state.serviceJobs.filter((job) => Number(job.assignedTechnicianId) === Number(technician.id) && !['Completed', 'Cancelled'].includes(job.status)).length,
      averageCompletionDays: 0,
      customerRating: 0,
      totalServicesCompleted: 0
    }));

    document.getElementById('performance-body').innerHTML = performance.map((item) => `
      <tr><td><span class="row-title">${item.name}</span></td><td>${item.jobsCompleted}</td><td>${item.activeJobs}</td><td>${item.averageCompletionDays} days</td><td>${item.customerRating || '-'}</td><td>${item.totalServicesCompleted}</td></tr>
    `).join('');
  }

  function renderInventory(filter = '') {
    const query = filter.toLowerCase();
    const items = state.inventoryParts.filter((part) => {
      const text = `${part.itemCode || part.sku || ''} ${part.partName || part.name || ''} ${part.category || ''} ${part.brand || ''}`.toLowerCase();
      return !query || text.includes(query);
    });

    document.getElementById('inventory-body').innerHTML = items.map((part) => `
      <tr>
        <td><span class="row-title">${part.partName || part.name}</span><span class="row-sub">${part.itemCode || part.sku || ''}</span></td>
        <td>${part.category || '-'}</td>
        <td>${part.brand || '-'}</td>
        <td><span class="badge badge--${part.status === 'Out of Stock' ? 'cancelled' : part.status === 'Low Stock' ? 'parts' : 'completed'}">${part.stock ?? part.stockQuantity}</span><span class="row-sub">Min ${part.minimumStockLevel || 0}</span></td>
        <td><span class="row-title">${formatMoney(part.sellingPrice || part.unitPrice || 0)}</span><span class="row-sub">Cost ${formatMoney(part.purchasePrice || 0)}</span></td>
        <td>${part.warrantyPeriod || '-'}</td>
        <td><div class="row-actions"><button class="mini-btn" type="button" data-action="edit-inventory-item" data-id="${part.id}">Edit</button><button class="mini-btn mini-btn--red" type="button" data-action="delete-inventory-item" data-id="${part.id}">Delete</button></div></td>
      </tr>
    `).join('');

    const lowStock = state.inventoryReports?.lowStock || state.inventoryParts.filter((part) => Number(part.stock || 0) > 0 && Number(part.stock || 0) <= 5);
    document.getElementById('low-stock-body').innerHTML = lowStock.map((part) => `
      <tr><td><span class="row-title">${part.partName || part.name}</span><span class="row-sub">${part.itemCode || ''}</span></td><td>${part.stock}</td><td>${part.minimumStockLevel}</td><td><span class="badge badge--parts">${part.status}</span></td></tr>
    `).join('');

    const value = state.inventoryReports?.inventoryValue || {};
    document.getElementById('inventory-value').innerHTML = [
      ['Purchase Value', formatMoney(value.totalPurchaseValue || 0)],
      ['Retail Value', formatMoney(value.totalRetailValue || 0)],
      ['Items', value.itemCount || state.inventoryParts.length],
      ['Units In Stock', value.stockUnits || 0]
    ].map(([label, amount]) => `<div class="progress-item"><header><strong>${label}</strong><span>${amount}</span></header></div>`).join('');

    document.getElementById('stock-movements-body').innerHTML = (state.stockMovements || []).slice(0, 20).map((item) => `
      <tr><td>${item.partName}</td><td>${item.type}</td><td>${item.quantity}</td><td>${item.technicianName || '-'}</td><td>${item.serviceJobId ? `#SJ-${item.serviceJobId}` : '-'}</td><td>${formatMoney(item.totalPrice || 0)}</td></tr>
    `).join('');

    document.getElementById('parts-usage-body').innerHTML = (state.partUsageHistory || []).slice(0, 20).map((item) => `
      <tr><td>${item.partName}<span class="row-sub">${item.brand || '-'}</span></td><td>${item.vehicleNumber || '-'}</td><td>${item.technicianName || '-'}</td><td>${item.condition}</td><td>${item.quantity}</td><td>${formatMoney(item.totalPrice || 0)}</td></tr>
    `).join('');
  }

  function renderDocuments(filter = '') {
    const files = [...(state.servicePhotos || []), ...(state.documents || [])];
    const query = filter.toLowerCase();
    document.getElementById('documents-body').innerHTML = files
      .filter((file) => !query || `${file.fileName} ${file.photoType} ${file.documentType} ${file.serviceJobId} ${file.uploadedBy}`.toLowerCase().includes(query))
      .map((file) => documentRow(file)).join('');
  }

  function documentRow(file) {
    const job = state.serviceJobs.find((item) => Number(item.id) === Number(file.serviceJobId));
    const vehicle = vehicleName(job?.vehicleId);
    const fileType = file.photoType || file.documentType || file.kind || 'File';
    const extension = String(file.fileName || '').split('.').pop().toUpperCase();
    const uploadedBy = file.uploadedBy || 'System';

    return `
      <tr class="document-row">
        <td>
          <div class="file-cell">
            <span class="file-cell__icon">${extension && extension.length <= 5 ? extension : 'FILE'}</span>
            <div>
              <span class="row-title file-cell__name" title="${file.fileName || 'Untitled file'}">${file.fileName || 'Untitled file'}</span>
              <span class="row-sub">${file.description || `Uploaded ${file.uploadedAt || 'recently'}`}</span>
            </div>
          </div>
        </td>
        <td><span class="file-chip">${fileType}</span></td>
        <td><span class="row-title">${file.serviceJobId ? `#SJ-${file.serviceJobId}` : '-'}</span></td>
        <td><span class="row-title">${vehicle}</span><span class="row-sub">${job?.serviceType || ''}</span></td>
        <td><span class="uploader-pill">${uploadedBy}</span></td>
        <td>
          <div class="document-actions">
            <button class="mini-btn" type="button" data-action="download-file" data-kind="${file.kind}" data-id="${file.id}">Download</button>
            <button class="mini-btn mini-btn--red" type="button" data-action="delete-file" data-kind="${file.kind}" data-id="${file.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }

  function compactList(items, emptyText, renderItem) {
    return items.length ? items.map(renderItem).join('') : `<p class="completed-empty">${emptyText}</p>`;
  }

  function isImageFile(file) {
    const type = String(file.mimeType || '').toLowerCase();
    const name = String(file.fileName || '').toLowerCase();
    return type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/.test(name);
  }

  function completedFileItem(file) {
    if (isImageFile(file)) {
      return `
        <button class="completed-file completed-file--image" type="button" data-action="preview-completed-image" data-url="${file.previewUrl || file.fileUrl}" data-name="${file.fileName || 'Uploaded image'}">
          <img src="${file.previewUrl || file.fileUrl}" alt="${file.fileName || 'Uploaded image'}" />
          <span><strong>${file.fileName || 'Uploaded image'}</strong><small>${file.photoType || file.documentType || file.kind}</small></span>
        </button>
      `;
    }

    return `
      <div class="completed-file">
        <span class="file-cell__icon">${String(file.fileName || 'FILE').split('.').pop().slice(0, 5).toUpperCase()}</span>
        <span><strong>${file.fileName || 'Uploaded file'}</strong><small>${file.photoType || file.documentType || file.kind}</small></span>
        <button class="mini-btn" type="button" data-action="download-file" data-kind="${file.kind}" data-id="${file.id}">Download</button>
      </div>
    `;
  }

  function openImagePreview(url, name) {
    selectors.modalKicker.textContent = 'Image Preview';
    selectors.modalTitle.textContent = name || 'Uploaded image';
    selectors.modalBody.innerHTML = `
      <div class="image-preview full">
        <img src="${url}" alt="${name || 'Uploaded image'}" />
        <a class="mini-btn" href="${url}" target="_blank" rel="noopener">Open Full Image</a>
      </div>
    `;
    selectors.modalActions.hidden = true;
    selectors.modal.showModal();
  }

  function completedDetailsHtml(details) {
    const job = details.job;
    return `
      <div class="completed-details full">
        <section class="completed-hero">
          <div>
            <span class="badge badge--completed">${job.status}</span>
            <h3>#SJ-${job.id} ${job.serviceType}</h3>
            <p>${job.customerName} / ${job.vehicleNumber} / ${job.vehicleName}</p>
          </div>
          <div>
            <strong>${job.progress}%</strong>
            <span>Progress</span>
          </div>
        </section>

        <section class="completed-grid">
          <article>
            <span>Technician</span>
            <strong>${job.technicianName || '-'}</strong>
          </article>
          <article>
            <span>Priority</span>
            <strong>${job.priority || '-'}</strong>
          </article>
          <article>
            <span>Assigned</span>
            <strong>${job.assignedDate || '-'}</strong>
          </article>
          <article>
            <span>Completed</span>
            <strong>${job.completionDate || '-'}</strong>
          </article>
        </section>

        <section class="completed-section">
          <h4>Technician Progress Submitted</h4>
          ${compactList(details.progress, 'No progress submissions found.', (item) => `
            <div class="completed-item">
              <strong>${item.progressPercentage}% - ${item.status}</strong>
              <p>${item.remarks || 'No remarks added.'}</p>
            </div>
          `)}
        </section>

        <section class="completed-section">
          <h4>Technician Notes</h4>
          ${compactList(details.notes, 'No technician notes found.', (item) => `
            <div class="completed-item"><p>${item.note}</p></div>
          `)}
        </section>

        <section class="completed-section">
          <h4>Parts Submitted</h4>
          ${compactList(details.usedParts, 'No used parts submitted.', (part) => `
            <div class="completed-item completed-item--split">
              <div><strong>${part.partName}</strong><p>${part.condition} / Qty ${part.quantity}</p></div>
              <span>${formatMoney(part.totalPrice || 0)}</span>
            </div>
          `)}
        </section>

        <section class="completed-section">
          <h4>Replaced Parts</h4>
          ${compactList(details.replacedParts, 'No replaced parts submitted.', (part) => `
            <div class="completed-item">
              <strong>${part.removedPartName} - ${part.condition}</strong>
              <p>${part.replacementReason}</p>
            </div>
          `)}
        </section>

        <section class="completed-section">
          <h4>Photos & Documents</h4>
          ${compactList([...(details.photos || []), ...(details.documents || [])], 'No photos or documents uploaded.', (file) => `
            ${completedFileItem(file)}
          `)}
        </section>
      </div>
    `;
  }

  async function openCompletedDetails(id) {
    selectors.modalKicker.textContent = 'Technician Submit Details';
    selectors.modalTitle.textContent = `Completed Job #SJ-${id}`;
    selectors.modalBody.innerHTML = '<div class="completed-details full"><p class="completed-empty">Loading completed job details...</p></div>';
    selectors.modalActions.hidden = true;
    selectors.modal.showModal();

    const details = await window.AutoCareApi.request(`/api/admin/service-jobs/${id}/details`);
    selectors.modalBody.innerHTML = completedDetailsHtml(details);
  }

  function renderPackages() {
    document.getElementById('package-grid').innerHTML = state.packages.map((item) => `
      <article class="package-card">
        <h3>${item.name}</h3>
        <p>${item.description}</p>
        <strong>${formatMoney(item.price)}</strong>
        <div class="card-meta"><span>${item.duration}</span><button class="mini-btn" type="button" data-action="edit-service" data-id="${item.id}">Edit</button></div>
      </article>
    `).join('');
  }

  function renderPricingPlans() {
    const grid = document.getElementById('admin-pricing-plan-grid');
    grid.innerHTML = state.pricingPlans?.length ? state.pricingPlans.map((plan) => `
      <article class="admin-plan-card ${plan.featured ? 'is-featured' : ''}">
        <div class="admin-plan-card__image"><img src="${escapeHtml(plan.image)}" alt="" /><span>${escapeHtml(plan.badge)}</span></div>
        <div class="admin-plan-card__body"><div><small>Order ${plan.displayOrder} · ${plan.active ? 'Visible' : 'Hidden'}</small><h3>${escapeHtml(plan.name)}</h3></div><strong>${formatMoney(plan.price)}</strong><p>${plan.features.map(escapeHtml).join(' · ')}</p></div>
        <div class="row-actions"><button class="mini-btn" type="button" data-action="edit-pricing-plan" data-id="${plan.id}">Edit</button><button class="mini-btn mini-btn--red" type="button" data-action="delete-pricing-plan" data-id="${plan.id}">Delete</button></div>
      </article>
    `).join('') : '<p class="table-empty">No landing plans yet. Add your first plan.</p>';
  }

  function renderBilling() {
    document.getElementById('billing-body').innerHTML = state.invoices.map((invoice) => `
      <tr>
        <td><span class="row-title">#INV-${invoice.id}</span><span class="row-sub">${invoice.date}</span></td>
        <td>${customerName(invoice.customerId)}</td>
        <td>${invoice.service}</td>
        <td>${formatMoney(invoice.amount)}</td>
        <td><span class="badge badge--${invoice.payment === 'Paid' ? 'completed' : 'pending'}">${invoice.payment}</span></td>
        <td><div class="row-actions"><button class="mini-btn" type="button" data-action="preview-invoice" data-id="${invoice.id}">View</button><button class="mini-btn" type="button" data-action="mark-paid" data-id="${invoice.id}">Mark Paid</button><button class="mini-btn" type="button" data-action="download-invoice-pdf" data-id="${invoice.id}">Download PDF</button></div></td>
      </tr>
    `).join('');
  }

  function renderEmergency() {
    const activeEmergencies = state.emergencies.filter((item) => item.status !== 'Closed');
    const emergencyAlert = document.getElementById('emergency-alert');
    emergencyAlert.hidden = activeEmergencies.length === 0;
    emergencyAlert.classList.toggle('is-active', activeEmergencies.length > 0);
    emergencyAlert.setAttribute('aria-label', `${activeEmergencies.length} active emergency request${activeEmergencies.length === 1 ? '' : 's'}. Open emergency requests.`);
    document.getElementById('emergency-alert-count').textContent = activeEmergencies.length;
    document.getElementById('emergency-grid').innerHTML = state.emergencies.map((item) => `
      <article class="emergency-card">
        <span class="badge badge--${item.status === 'Open' ? 'cancelled' : 'approved'}">${item.status}</span>
        <h3>${customerName(item.customerId)}</h3>
        <p>${item.problem}</p>
        <div class="card-meta"><span>${item.location}</span><button class="mini-btn" type="button" data-action="close-emergency" data-id="${item.id}">Resolve</button></div>
      </article>
    `).join('');
  }

  function renderNotifications() {
    const received = state.notifications || [];
    const sent = state.sentNotifications || [];
    const drafts = state.notificationDrafts || [];
    const unread = received.filter((item) => item.unread).length;
    document.getElementById('notification-count').textContent = unread;
    document.getElementById('received-message-count').textContent = received.length;
    document.getElementById('sent-message-count').textContent = sent.length;
    document.getElementById('draft-message-count').textContent = drafts.length;
    document.getElementById('mark-all-admin-read').hidden = activeMessageTab !== 'received' || unread === 0;
    document.querySelectorAll('#admin-message-tabs button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.messageTab === activeMessageTab);
    });

    let messages = received;
    if (activeMessageTab === 'sent') messages = sent;
    if (activeMessageTab === 'drafts') messages = drafts;
    document.getElementById('notification-list').innerHTML = messages.length ? messages.map((item) => {
      if (activeMessageTab === 'sent') return `
        <article class="notification-item notification-item--read">
          <span data-icon="bell"></span>
          <div><strong>${escapeHtml(item.type)}</strong><p>${escapeHtml(item.message)}</p><small>Sent to ${escapeHtml(item.recipientName)} (${escapeHtml(item.recipientRole)})</small></div>
          <span class="badge badge--completed">Delivered</span>
        </article>`;
      if (activeMessageTab === 'drafts') return `
        <article class="notification-item notification-item--read">
          <span data-icon="invoice"></span>
          <div><strong>${escapeHtml(item.type)}</strong><p>${escapeHtml(item.message)}</p><small>Draft for ${escapeHtml(item.recipientName)} (${escapeHtml(item.recipientRole)})</small></div>
          <div class="row-actions"><button class="mini-btn" type="button" data-action="edit-notification-draft" data-id="${item.id}">Edit</button><button class="mini-btn" type="button" data-action="send-notification-draft" data-id="${item.id}">Send</button><button class="mini-btn" type="button" data-action="delete-notification-draft" data-id="${item.id}">Delete</button></div>
        </article>`;
      return `
        <article class="notification-item notification-item--${item.unread ? 'unread' : 'read'}">
          <span data-icon="bell"></span>
          <div><strong>${escapeHtml(item.type)}</strong><p>${escapeHtml(item.message)}</p></div>
          ${item.unread ? `<button class="mini-btn" type="button" data-action="mark-admin-notification-read" data-id="${item.id}">Mark Read</button>` : ''}
        </article>`;
    }).join('') : `<article class="notification-empty"><strong>No ${activeMessageTab} messages.</strong><p>${activeMessageTab === 'received' ? 'Bookings, emergencies, completed jobs, and stock alerts appear here.' : 'Messages will appear here when they are created.'}</p></article>`;
    injectIcons();
  }

  function renderFeedback() {
    document.getElementById('feedback-grid').innerHTML = state.feedback.map((item) => `
      <article class="feedback-card">
        <div class="stars">${'*'.repeat(item.rating)}</div>
        <h3>${customerName(item.customerId)}</h3>
        <p>${item.comment}</p>
      </article>
    `).join('');
  }

  function renderAll() {
    renderMetrics();
    renderOverview();
    renderCustomers();
    renderVehicles();
    renderBookings();
    renderTechnicians();
    renderServiceJobs();
    renderTechnicianReports();
    renderInventory();
    renderDocuments();
    renderPackages();
    renderPricingPlans();
    renderBilling();
    renderEmergency();
    renderNotifications();
    renderFeedback();
  }

  function field(name, label, type = 'text', value = '', options = []) {
    if (type === 'select') {
      return `<label><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}" required>${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
    }
    if (type === 'textarea') {
      return `<label class="full"><span>${escapeHtml(label)}</span><textarea name="${escapeHtml(name)}" required>${escapeHtml(value)}</textarea></label>`;
    }
    return `<label><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" required /></label>`;
  }

  function vehicleImageUpload(record = {}) {
    return `
      <label class="full"><span>Car Image</span><input name="vehicleImage" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" /></label>
      <div class="full vehicle-image-preview" data-file-preview="vehicleImage">
        ${record.image ? `<img src="${record.image}" alt="" /><span>Current car image</span>` : '<span>No car image selected</span>'}
      </div>
    `;
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
    const file = selectors.modalForm.querySelector(`input[name="${name}"]`)?.files?.[0];
    if (!file) return null;
    return {
      fileName: file.name,
      mimeType: file.type,
      contentBase64: await readFileAsBase64(file)
    };
  }

  function renderVehicleFilePreview(inputName, file) {
    const preview = selectors.modalForm.querySelector(`[data-file-preview="${inputName}"]`);
    if (!preview) return;
    preview.replaceChildren();
    if (!file) {
      preview.textContent = 'No car image selected';
      return;
    }

    const image = document.createElement('img');
    image.alt = 'Selected car preview';
    const details = document.createElement('div');
    const fileName = document.createElement('span');
    const fileSize = document.createElement('small');
    fileName.textContent = file.name;
    fileSize.textContent = `${Math.round(file.size / 1024)} KB`;
    details.append(fileName, fileSize);
    preview.append(image, details);

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      image.src = String(reader.result);
    });
    reader.readAsDataURL(file);
  }

  function openModal(mode, record = {}) {
    const customerOptions = state.customers.map((customer) => ({ value: customer.id, label: customer.name }));
    const bookingCustomerOptions = [
      { value: '__new_customer__', label: '+ Add New Customer' },
      ...customerOptions
    ];
    const vehicleOptions = state.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.make} ${vehicle.model} - ${vehicle.plate}` }));
    const bookingVehicleOptions = [
      { value: '__new_vehicle__', label: '+ Add New Vehicle' },
      ...vehicleOptions
    ];
    const technicianOptions = state.technicians
      .filter((technician) => technician.status === 'Active' || Number(technician.id) === Number(record.assignedTechnicianId))
      .map((technician) => ({ value: technician.id, label: `${technician.name} - ${technician.specialization}` }));
    const notificationRecipientOptions = [
      ...state.customers.map((customer) => ({ value: customer.id, label: `Customer: ${customer.name}` })),
      ...state.technicians.map((technician) => ({ value: technician.userId, label: `Technician: ${technician.name}` }))
    ];
    const bookingOptions = state.bookings.map((booking) => ({ value: booking.id, label: `#BK-${booking.id} - ${customerName(booking.customerId)} - ${booking.service}` }));
    const completedJobOptions = state.serviceJobs
      .filter((job) => job.status === 'Completed')
      .map((job) => ({ value: job.id, label: `#SJ-${job.id} - ${job.serviceType} - ${job.customerName || customerName(job.customerId)}` }));
    const categoryOptions = ['Engine Parts', 'Brake System', 'Electrical', 'Suspension', 'Cooling System', 'Filters', 'Fluids & Lubricants', 'Batteries', 'Tires & Wheels', 'Accessories'].map((category) => ({ value: category, label: category }));
    const supplierOptions = (state.inventorySuppliers || []).map((supplier) => ({ value: supplier.id, label: supplier.name }));
    const paymentOptions = ['Unpaid', 'Paid'].map((payment) => ({ value: payment, label: payment }));
    const config = {
      customer: {
        title: record.id ? 'Edit Customer' : 'Register Customer',
        body: field('name', 'Full Name', 'text', record.name || '') + field('email', 'Email', 'email', record.email || '') + field('phone', 'Phone', 'tel', record.phone || '') + field('status', 'Status', 'select', record.status || 'Active', [{ value: 'Active', label: 'Active' }, { value: 'Pending', label: 'Pending' }, { value: 'Inactive', label: 'Inactive' }])
      },
      vehicle: {
        title: record.id ? 'Edit Vehicle' : 'Add Vehicle',
        body: field('customerId', 'Customer', 'select', record.customerId || customerOptions[0]?.value, customerOptions) + field('make', 'Vehicle Make', 'text', record.make || '') + field('model', 'Model', 'text', record.model || '') + field('plate', 'Number Plate', 'text', record.plate || '') + field('year', 'Year', 'number', record.year || '2026') + vehicleImageUpload(record)
      },
      technician: {
        title: record.id ? 'Edit Technician' : 'Create Technician',
        body: field('name', 'Full Name', 'text', record.name || '') + field('email', 'Email', 'email', record.email || '') + field('phone', 'Phone', 'tel', record.phone || '') + field('employeeNo', 'Employee No', 'text', record.employeeNo || '') + field('specialization', 'Specialization', 'select', record.specialization || technicianSpecializations[0], technicianSpecializations.map((item) => ({ value: item, label: item }))) + field('experienceYears', 'Experience Years', 'number', record.experienceYears || '0') + field('status', 'Status', 'select', record.status || 'Active', [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }])
      },
      booking: {
        title: record.id ? 'Reschedule Booking' : 'Book Service Appointment',
        body: field('customerId', 'Customer', 'select', record.customerId || customerOptions[0]?.value, bookingCustomerOptions) + field('vehicleId', 'Vehicle', 'select', record.vehicleId || vehicleOptions[0]?.value, bookingVehicleOptions) + field('service', 'Service', 'select', record.service || state.packages[0]?.name, state.packages.map((item) => ({ value: item.name, label: item.name }))) + field('date', 'Date', 'date', record.date || '') + `<label class="time-field"><span>Time</span><input name="time" type="time" value="${record.time || ''}" required /><button class="time-field__current" type="button" data-action="use-current-time">Use Current Time</button></label>`
      },
      serviceJob: {
        title: 'Create Service Job',
        body: field('bookingId', 'Booking', 'select', record.bookingId || bookingOptions[0]?.value, bookingOptions) + field('serviceType', 'Service Type', 'select', record.serviceType || state.packages[0]?.name, state.packages.map((item) => ({ value: item.name, label: item.name }))) + field('assignedTechnicianId', 'Technician', 'select', record.assignedTechnicianId || technicianOptions[0]?.value, technicianOptions) + field('priority', 'Priority', 'select', record.priority || 'Normal', ['Low', 'Normal', 'High', 'Urgent'].map((priority) => ({ value: priority, label: priority }))) + field('startDate', 'Start Date', 'date', record.startDate || new Date().toISOString().slice(0, 10)) + field('expectedCompletionDate', 'Expected Completion', 'date', record.expectedCompletionDate || new Date().toISOString().slice(0, 10))
      },
      assignTechnician: {
        title: 'Assign Technician',
        body: field('technicianId', 'Technician', 'select', record.assignedTechnicianId || technicianOptions[0]?.value, technicianOptions)
      },
      inventoryItem: {
        title: record.id ? 'Edit Inventory Item' : 'Add Inventory Item',
        body: field('itemCode', 'Item Code', 'text', record.itemCode || record.sku || '') + field('partName', 'Part Name', 'text', record.partName || record.name || '') + field('category', 'Category', 'select', record.category || categoryOptions[0]?.value, categoryOptions) + field('brand', 'Brand', 'text', record.brand || '') + field('manufacturer', 'Manufacturer', 'text', record.manufacturer || '') + field('supplierId', 'Supplier', 'select', record.supplierId || supplierOptions[0]?.value, supplierOptions) + field('purchasePrice', 'Purchase Price', 'number', record.purchasePrice || '0') + field('sellingPrice', 'Selling Price', 'number', record.sellingPrice || record.unitPrice || '0') + field('stockQuantity', 'Stock Quantity', 'number', record.stock ?? record.stockQuantity ?? '0') + field('minimumStockLevel', 'Minimum Stock Level', 'number', record.minimumStockLevel || '0') + field('location', 'Location', 'text', record.location || '') + field('warrantyPeriod', 'Warranty Period', 'text', record.warrantyPeriod || '') + field('description', 'Description', 'textarea', record.description || '')
      },
      service: {
        title: record.id ? 'Edit Service Package' : 'Add Service Package',
        body: field('name', 'Package Name', 'text', record.name || '') + field('price', 'Price', 'number', record.price || '') + field('duration', 'Duration', 'text', record.duration || '') + field('description', 'Description', 'textarea', record.description || '')
      },
      pricingPlan: {
        title: record.id ? 'Edit Landing Plan' : 'Add Landing Plan',
        body: field('name', 'Plan Name', 'text', record.name || '') + field('badge', 'Image Badge', 'text', record.badge || '') + field('price', 'Price (LKR)', 'number', record.price || '') + field('billingPeriod', 'Billing Period', 'text', record.billingPeriod || 'month') + field('buttonText', 'Button Text', 'text', record.buttonText || '') + field('displayOrder', 'Display Order', 'number', record.displayOrder || (state.pricingPlans.length + 1)) + field('featured', 'Highlight Plan', 'select', String(Boolean(record.featured)), [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes - Most Popular' }]) + field('active', 'Visibility', 'select', String(record.active !== false), [{ value: 'true', label: 'Visible' }, { value: 'false', label: 'Hidden' }]) + field('image', 'Current Image Path', 'text', record.image || 'assets/images/workshop-lift-mechanic.png') + '<label class="full"><span>Upload New Image (optional)</span><input name="planImage" type="file" accept="image/jpeg,image/png,image/webp" /></label>' + field('features', 'Features (one per line)', 'textarea', (record.features || []).join('\n'))
      },
      invoice: {
        title: 'Create Invoice',
        body: field('serviceJobId', 'Completed Service Job', 'select', record.serviceJobId || completedJobOptions[0]?.value, completedJobOptions) + field('customerId', 'Customer', 'select', record.customerId || customerOptions[0]?.value, customerOptions) + field('service', 'Service', 'select', record.service || state.packages[0]?.name, state.packages.map((item) => ({ value: item.name, label: item.name }))) + field('laborCost', 'Labor Cost', 'number', record.laborCost || '') + field('serviceCharges', 'Service Charges', 'number', record.serviceCharges || '0') + field('tax', 'Tax', 'number', record.tax || '0') + field('discount', 'Discount', 'number', record.discount || '0') + field('payment', 'Payment Status', 'select', record.payment || 'Unpaid', paymentOptions) + field('date', 'Date', 'date', record.date || new Date().toISOString().slice(0, 10))
      },
      emergency: {
        title: 'Emergency Service Request',
        body: field('customerId', 'Customer', 'select', record.customerId || customerOptions[0]?.value, customerOptions) + field('location', 'Shared Location', 'text', record.location || '') + field('status', 'Status', 'select', record.status || 'Open', [{ value: 'Open', label: 'Open' }, { value: 'Assigned', label: 'Assigned' }, { value: 'Closed', label: 'Closed' }]) + field('problem', 'Vehicle Problem Details', 'textarea', record.problem || '')
      },
      notification: {
        title: record.id ? 'Edit Notification Draft' : 'New Notification',
        body: field('userId', 'Recipient', 'select', record.userId || notificationRecipientOptions[0]?.value, notificationRecipientOptions) + field('type', 'Notification Type', 'select', record.type || 'General', ['General', 'Booking', 'Service', 'Payment', 'Inventory', 'Emergency'].map((type) => ({ value: type, label: type }))) + field('message', 'Message', 'textarea', record.message || '')
      }
    };

    selectors.modalForm.dataset.mode = mode;
    selectors.modalForm.dataset.id = record.id || '';
    selectors.modalKicker.textContent = 'Admin Action';
    selectors.modalTitle.textContent = config[mode].title;
    selectors.modalBody.innerHTML = config[mode].body;
    selectors.modalActions.innerHTML = `
      <button class="btn btn--ghost" type="button" data-action="close-modal">${mode === 'notification' ? 'Close & Save Draft' : 'Cancel'}</button>
      <button class="btn btn--blue" type="submit" id="modal-submit">${mode === 'notification' ? 'Send' : 'Save'}</button>
    `;
    selectors.modalSubmit = document.getElementById('modal-submit');
    selectors.modalActions.hidden = false;
    selectors.modal.showModal();
  }

  async function closeModalAndSaveDraft() {
    if (notificationDraftSaveInProgress) return;
    if (selectors.modalForm.dataset.mode !== 'notification') {
      selectors.modal.close();
      return;
    }

    const data = Object.fromEntries(new FormData(selectors.modalForm).entries());
    const message = String(data.message || '').trim();
    if (!message) {
      selectors.modal.close();
      return;
    }

    notificationDraftSaveInProgress = true;
    try {
      const draftId = Number(selectors.modalForm.dataset.id) || undefined;
      await window.AutoCareApi.request('/api/admin/notification-drafts', {
        method: 'POST',
        body: JSON.stringify({ userId: Number(data.userId), type: data.type, message, draftId })
      });
      activeMessageTab = 'drafts';
      await refreshNotifications();
      selectors.modal.close();
      renderNotifications();
      showToast(draftId ? 'Draft updated.' : 'Message saved to drafts.');
    } finally {
      notificationDraftSaveInProgress = false;
    }
  }

  async function handleModalSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(selectors.modalForm).entries());
    const mode = selectors.modalForm.dataset.mode;
    const id = Number(selectors.modalForm.dataset.id);
    let successMessage = 'Dashboard data saved successfully.';

    if (mode === 'customer') {
      const savedCustomer = await window.AutoCareApi.request(id ? `/api/admin/customers/${id}` : '/api/admin/customers', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(data)
      });
      id ? Object.assign(state.customers.find((item) => item.id === id), savedCustomer) : state.customers.push(savedCustomer);
      if (pendingBookingDraft && !id) {
        pendingBookingDraft.customerId = savedCustomer.id;
        saveState();
        renderAll();
        openModal('booking', pendingBookingDraft);
        pendingBookingDraft = null;
        showToast('New customer added and selected for this appointment.');
        return;
      }
    }

    if (mode === 'vehicle') {
      const vehicleImage = await fileInputToPayload('vehicleImage');
      const existingVehicle = state.vehicles.find((item) => item.id === id);
      const payload = {
        ...data,
        customerId: Number(data.customerId),
        image: existingVehicle?.image || 'assets/images/hero-blue-workshop.png'
      };
      if (vehicleImage) payload.vehicleImage = vehicleImage;
      const savedVehicle = await window.AutoCareApi.request(id ? `/api/admin/vehicles/${id}` : '/api/admin/vehicles', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.vehicles.find((item) => item.id === id), savedVehicle) : state.vehicles.push(savedVehicle);
      if (pendingBookingDraft && !id) {
        pendingBookingDraft.customerId = savedVehicle.customerId;
        pendingBookingDraft.vehicleId = savedVehicle.id;
        saveState();
        renderAll();
        openModal('booking', pendingBookingDraft);
        pendingBookingDraft = null;
        showToast('New vehicle added and selected for this appointment.');
        return;
      }
    }

    if (mode === 'technician') {
      const payload = { ...data, experienceYears: Number(data.experienceYears) };
      const savedTechnician = await window.AutoCareApi.request(id ? `/api/admin/technicians/${id}` : '/api/admin/technicians', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.technicians.find((item) => item.id === id), savedTechnician) : state.technicians.push(savedTechnician);
    }

    if (mode === 'booking') {
      const existingBooking = id ? state.bookings.find((item) => item.id === id) : null;
      const status = existingBooking?.status || 'Pending';
      const payload = { ...data, status, customerId: Number(data.customerId), vehicleId: Number(data.vehicleId) };
      const savedBooking = await window.AutoCareApi.request(id ? `/api/admin/bookings/${id}` : '/api/admin/bookings', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.bookings.find((item) => item.id === id), savedBooking) : state.bookings.push(savedBooking);
      successMessage = id
        ? `Booking #BK-${savedBooking.id} updated successfully.`
        : `Booking #BK-${savedBooking.id} created and customer notified.`;
    }

    if (mode === 'serviceJob') {
      const booking = state.bookings.find((item) => item.id === Number(data.bookingId));
      const savedJob = await window.AutoCareApi.request('/api/admin/service-jobs', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          bookingId: Number(data.bookingId),
          customerId: booking?.customerId,
          vehicleId: booking?.vehicleId,
          assignedTechnicianId: Number(data.assignedTechnicianId)
        })
      });
      state.serviceJobs.push(savedJob);
    }

    if (mode === 'assignTechnician') {
      const savedJob = await window.AutoCareApi.request(`/api/admin/service-jobs/${id}/assign`, {
        method: 'PUT',
        body: JSON.stringify({ technicianId: Number(data.technicianId) })
      });
      Object.assign(state.serviceJobs.find((item) => item.id === id), savedJob);
    }

    if (mode === 'inventoryItem') {
      const supplier = (state.inventorySuppliers || []).find((item) => Number(item.id) === Number(data.supplierId));
      const payload = {
        ...data,
        supplierId: Number(data.supplierId),
        supplier: supplier?.name || '',
        purchasePrice: Number(data.purchasePrice),
        sellingPrice: Number(data.sellingPrice),
        stockQuantity: Number(data.stockQuantity),
        minimumStockLevel: Number(data.minimumStockLevel)
      };
      const savedItem = await window.AutoCareApi.request(id ? `/api/admin/inventory/items/${id}` : '/api/admin/inventory/items', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.inventoryParts.find((item) => item.id === id), savedItem) : state.inventoryParts.push(savedItem);
    }

    if (mode === 'service') {
      const payload = { ...data, price: Number(data.price) };
      const savedService = await window.AutoCareApi.request(id ? `/api/admin/services/${id}` : '/api/admin/services', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.packages.find((item) => item.id === id), savedService) : state.packages.push(savedService);
    }

    if (mode === 'pricingPlan') {
      const imageFile = selectors.modalForm.elements.planImage.files[0];
      const image = imageFile ? await window.AutoCareApi.optimizeProfileImage(imageFile) : data.image;
      const payload = { ...data, image, price: Number(data.price), displayOrder: Number(data.displayOrder), featured: data.featured === 'true', active: data.active === 'true', features: data.features.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) };
      delete payload.planImage;
      const savedPlan = await window.AutoCareApi.request(id ? `/api/admin/pricing-plans/${id}` : '/api/admin/pricing-plans', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      id ? Object.assign(state.pricingPlans.find((item) => item.id === id), savedPlan) : state.pricingPlans.push(savedPlan);
      successMessage = id ? 'Landing plan updated.' : 'Landing plan created.';
    }

    if (mode === 'invoice') {
      const savedInvoice = await window.AutoCareApi.request('/api/admin/invoices', {
        method: 'POST',
        body: JSON.stringify({ ...data, serviceJobId: Number(data.serviceJobId), customerId: Number(data.customerId), amount: Number(data.laborCost || 0), laborCost: Number(data.laborCost || 0), serviceCharges: Number(data.serviceCharges || 0), tax: Number(data.tax || 0), discount: Number(data.discount || 0) })
      });
      state.invoices.push(savedInvoice);
    }

    if (mode === 'emergency') {
      showToast('Emergency requests are created from the customer dashboard.');
    }

    if (mode === 'notification') {
      const payload = { ...data, userId: Number(data.userId), draftId: id || undefined };
      await window.AutoCareApi.request('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      activeMessageTab = 'sent';
      successMessage = 'Notification delivered successfully.';
      await refreshNotifications();
    }

    selectors.modal.close();
    saveState();
    renderAll();
    showToast(successMessage);
  }

  async function advanceBooking(id) {
    const flow = ['Pending', 'Approved', 'In Progress', 'Completed'];
    const booking = state.bookings.find((item) => item.id === Number(id));
    if (!booking || booking.status === 'Cancelled') return;
    await window.AutoCareApi.request(`/api/admin/bookings/${id}/status`, { method: 'PUT' });
    const next = flow[Math.min(flow.indexOf(booking.status) + 1, flow.length - 1)];
    booking.status = next;
    booking.progress = next === 'Approved' ? 35 : next === 'In Progress' ? 70 : next === 'Completed' ? 100 : booking.progress;
    saveState();
    renderAll();
    showToast(`Booking moved to ${next}.`);
  }

  async function downloadInvoicePdf(id) {
    const invoice = state.invoices.find((item) => item.id === Number(id));
    if (!invoice) {
      throw new Error('Invoice not found.');
    }

    await openPdfFile(
      `/api/invoices/${invoice.id}/pdf`,
      `AutoCare-Invoice-${invoice.id}.pdf`,
      `Invoice #INV-${invoice.id} opened.`,
      'The server did not return a valid PDF invoice.'
    );
  }

  async function openPdfFile(endpoint, fileName, successMessage, invalidMessage = 'The server did not return a valid PDF report.') {
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.title = 'Preparing AutoCare PDF';
      previewWindow.document.body.innerHTML = '<p style="font:16px Arial;padding:24px">Preparing PDF...</p>';
    }

    try {
      const blob = await window.AutoCareApi.requestBlob(endpoint);
      if (blob.type !== 'application/pdf') throw new Error(invalidMessage);
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.replace(objectUrl);
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
      showToast(successMessage);
    } catch (error) {
      previewWindow?.close();
      throw error;
    }
  }

  async function downloadPdfFile(endpoint, fileName, successMessage) {
    const blob = await window.AutoCareApi.requestBlob(endpoint);
    if (blob.type !== 'application/pdf') throw new Error('The server did not return a valid PDF report.');
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    showToast(successMessage);
  }

  function downloadFile(kind, id) {
    const link = document.createElement('a');
    link.href = `/api/files/${kind}/${id}/download`;
    link.download = '';
    link.click();
  }

  async function handleAction(action, id, element) {
    const numericId = Number(id);
    if (action === 'new-customer') openModal('customer');
    if (action === 'edit-customer') openModal('customer', state.customers.find((item) => item.id === numericId));
    if (action === 'delete-customer') {
      const customer = state.customers.find((item) => item.id === numericId);
      if (!customer) return;
      if (!window.confirm(`Remove ${customer.name}'s customer account? This cannot be undone.`)) return;
      await window.AutoCareApi.request(`/api/admin/customers/${numericId}`, { method: 'DELETE' });
      state.customers = state.customers.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Customer account removed.');
    }
    if (action === 'new-vehicle') openModal('vehicle');
    if (action === 'edit-vehicle') openModal('vehicle', state.vehicles.find((item) => item.id === numericId));
    if (action === 'new-technician') openModal('technician');
    if (action === 'edit-technician') openModal('technician', state.technicians.find((item) => item.id === numericId));
    if (action === 'delete-technician') {
      await window.AutoCareApi.request(`/api/admin/technicians/${numericId}`, { method: 'DELETE' });
      state.technicians = state.technicians.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Technician deleted.');
    }
    if (action === 'new-booking-for-vehicle') {
      const vehicle = state.vehicles.find((item) => item.id === numericId);
      if (!vehicle) return;
      openModal('booking', { customerId: vehicle.customerId, vehicleId: vehicle.id });
    }
    if (action === 'delete-vehicle') {
      const vehicle = state.vehicles.find((item) => item.id === numericId);
      if (!vehicle) return;
      const vehicleLabel = `${vehicle.make || ''} ${vehicle.model || ''} (${vehicle.plate || 'No plate'})`.trim();
      if (!window.confirm(`Remove ${vehicleLabel}? This action cannot be undone.`)) return;
      await window.AutoCareApi.request(`/api/admin/vehicles/${numericId}`, { method: 'DELETE' });
      state.vehicles = state.vehicles.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Vehicle removed from account.');
    }
    if (action === 'new-booking') {
      openModal('booking');
    }
    if (action === 'use-current-time') {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const timeInput = selectors.modalForm.querySelector('input[name="time"]');
      if (timeInput) {
        timeInput.value = currentTime;
        timeInput.focus();
      }
    }
    if (action === 'reschedule-booking') openModal('booking', state.bookings.find((item) => item.id === numericId));
    if (action === 'advance-booking') await advanceBooking(numericId);
    if (action === 'cancel-booking') {
      const booking = state.bookings.find((item) => item.id === numericId);
      if (!booking || ['Completed', 'Cancelled'].includes(booking.status)) {
        showToast('Only active bookings can be cancelled.');
        return;
      }
      if (!window.confirm(`Cancel booking #BK-${numericId}? This will remove it from the active queue.`)) return;
      await window.AutoCareApi.request(`/api/admin/bookings/${numericId}/cancel`, { method: 'PUT' });
      booking.status = 'Cancelled';
      booking.progress = 0;
      booking.queue = 0;
      saveState();
      renderAll();
      await hydrateFromApi();
      showToast('Booking cancelled. The queue has been updated.');
    }
    if (action === 'filter-bookings') {
      activeBookingStatus = element.dataset.status;
      renderBookings();
    }
    if (action === 'new-service-job') openModal('serviceJob');
    if (action === 'assign-technician') openModal('assignTechnician', state.serviceJobs.find((item) => item.id === numericId));
    if (action === 'view-completed-job') await openCompletedDetails(numericId);
    if (action === 'new-inventory-item') openModal('inventoryItem');
    if (action === 'edit-inventory-item') openModal('inventoryItem', state.inventoryParts.find((item) => item.id === numericId));
    if (action === 'delete-inventory-item') {
      await window.AutoCareApi.request(`/api/admin/inventory/items/${numericId}`, { method: 'DELETE' });
      state.inventoryParts = state.inventoryParts.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Inventory item deleted.');
    }
    if (action === 'new-service') openModal('service');
    if (action === 'edit-service') openModal('service', state.packages.find((item) => item.id === numericId));
    if (action === 'new-pricing-plan') openModal('pricingPlan');
    if (action === 'edit-pricing-plan') openModal('pricingPlan', state.pricingPlans.find((item) => item.id === numericId));
    if (action === 'delete-pricing-plan') {
      if (!window.confirm('Delete this landing page plan?')) return;
      await window.AutoCareApi.request(`/api/admin/pricing-plans/${numericId}`, { method: 'DELETE' });
      state.pricingPlans = state.pricingPlans.filter((item) => item.id !== numericId);
      saveState(); renderAll(); showToast('Landing plan deleted.'); return;
    }
    if (action === 'new-invoice') {
      if (!state.serviceJobs.some((job) => job.status === 'Completed')) {
        showToast('Complete a service job before generating billing.');
        return;
      }
      openModal('invoice');
    }
    if (action === 'preview-invoice') {
      await openInvoicePreview(numericId);
      return;
    }
    if (action === 'print-invoice') {
      printInvoice(numericId);
      return;
    }
    if (action === 'mark-paid') {
      await window.AutoCareApi.request(`/api/admin/invoices/${numericId}/pay`, { method: 'PUT' });
      state.invoices.find((item) => item.id === numericId).payment = 'Paid';
      saveState();
      renderAll();
      showToast('Payment marked as paid.');
    }
    if (action === 'download-invoice-pdf') await downloadInvoicePdf(numericId);
    if (action === 'download-sales-report') {
      await downloadPdfFile(
        '/api/admin/reports/sales/pdf',
        'AutoCare-Overall-Sales-Report.pdf',
        'Overall sales report downloaded.'
      );
    }
    if (action === 'download-overall-report') {
      await downloadPdfFile(
        '/api/admin/reports/overall/pdf',
        'AutoCare-Overall-System-Report.pdf',
        'Overall system report downloaded.'
      );
    }
    if (action === 'download-individual-report') {
      const report = element.dataset.report;
      await downloadPdfFile(
        `/api/admin/reports/individual/${encodeURIComponent(report)}/pdf`,
        element.dataset.fileName || `AutoCare-${report}-Report.pdf`,
        `${element.closest('.panel')?.querySelector('h2')?.textContent || 'Report'} downloaded.`
      );
    }
    if (action === 'download-file') downloadFile(element.dataset.kind, numericId);
    if (action === 'preview-completed-image') openImagePreview(element.dataset.url, element.dataset.name);
    if (action === 'delete-file') {
      await window.AutoCareApi.request(`/api/admin/files/${element.dataset.kind}/${numericId}`, { method: 'DELETE' });
      state.servicePhotos = (state.servicePhotos || []).filter((item) => !(item.kind === element.dataset.kind && item.id === numericId));
      state.documents = (state.documents || []).filter((item) => !(item.kind === element.dataset.kind && item.id === numericId));
      saveState();
      renderAll();
      showToast('File deleted.');
    }
    if (action === 'new-emergency' || action === 'open-emergency') openModal('emergency');
    if (action === 'show-emergency-requests') {
      document.querySelector('.side-nav__item[data-view="emergency"]')?.click();
    }
    if (action === 'close-emergency') {
      await window.AutoCareApi.request(`/api/admin/emergencies/${numericId}/close`, { method: 'PUT' });
      state.emergencies.find((item) => item.id === numericId).status = 'Closed';
      saveState();
      renderAll();
      showToast('Emergency request resolved.');
    }
    if (action === 'send-notification') openModal('notification');
    if (action === 'show-notifications') {
      document.querySelector('.side-nav__item[data-view="notifications"]')?.click();
    }
    if (action === 'filter-admin-messages') {
      activeMessageTab = element.dataset.messageTab;
      renderNotifications();
    }
    if (action === 'edit-notification-draft') {
      const draft = state.notificationDrafts.find((item) => item.id === numericId);
      if (draft) openModal('notification', draft);
    }
    if (action === 'send-notification-draft') {
      const draft = state.notificationDrafts.find((item) => item.id === numericId);
      if (!draft) return;
      await window.AutoCareApi.request('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({ userId: draft.userId, type: draft.type, message: draft.message, draftId: draft.id })
      });
      await refreshNotifications();
      activeMessageTab = 'sent';
      renderNotifications();
      showToast('Draft delivered successfully.');
    }
    if (action === 'delete-notification-draft') {
      await window.AutoCareApi.request(`/api/admin/notification-drafts/${numericId}`, { method: 'DELETE' });
      await refreshNotifications();
      showToast('Draft deleted.');
    }
    if (action === 'mark-admin-notification-read') {
      await window.AutoCareApi.request(`/api/admin/notifications/${numericId}/read`, { method: 'PUT' });
      const notification = state.notifications.find((item) => item.id === numericId);
      if (notification) notification.unread = false;
      saveState();
      renderNotifications();
    }
    if (action === 'mark-all-admin-notifications-read') {
      await window.AutoCareApi.request('/api/admin/notifications/read-all', { method: 'PUT' });
      state.notifications.forEach((item) => { item.unread = false; });
      saveState();
      renderNotifications();
      showToast('All admin notifications marked as read.');
    }
    if (action === 'close-modal') {
      pendingBookingDraft = null;
      await closeModalAndSaveDraft();
    }
    if (action === 'logout') {
      window.AutoCareApi.logout();
    }
  }

  function bindEvents() {
    document.querySelectorAll('.side-nav__item').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.side-nav__item').forEach((item) => item.classList.remove('is-active'));
      if (!button.dataset.view) return;
      document.querySelectorAll('.view').forEach((panel) => panel.classList.remove('is-active'));
        button.classList.add('is-active');
        document.querySelector(`[data-view-panel="${button.dataset.view}"]`).classList.add('is-active');
        selectors.pageTitle.textContent = button.textContent.trim();
        selectors.sidebar.classList.remove('is-open');
      });
    });

    document.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-action]');
      if (!actionButton) return;
      handleAction(actionButton.dataset.action, actionButton.dataset.id, actionButton).catch((error) => showToast(error.message || 'Action failed.'));
    });

    document.getElementById('mobile-menu').addEventListener('click', () => selectors.sidebar.classList.toggle('is-open'));
    selectors.modalForm.addEventListener('submit', (event) => {
      handleModalSubmit(event).catch((error) => showToast(error.message || 'Action failed.'));
    });
    selectors.modal.addEventListener('cancel', (event) => {
      if (selectors.modalForm.dataset.mode !== 'notification') return;
      event.preventDefault();
      closeModalAndSaveDraft().catch((error) => showToast(error.message || 'Draft could not be saved.'));
    });
    selectors.modalForm.addEventListener('change', (event) => {
      if (selectors.modalForm.dataset.mode === 'booking'
        && event.target.name === 'customerId'
        && event.target.value === '__new_customer__') {
        pendingBookingDraft = Object.fromEntries(new FormData(selectors.modalForm).entries());
        pendingBookingDraft.id = Number(selectors.modalForm.dataset.id) || undefined;
        pendingBookingDraft.customerId = '';
        openModal('customer');
        return;
      }
      if (selectors.modalForm.dataset.mode === 'booking'
        && event.target.name === 'vehicleId'
        && event.target.value === '__new_vehicle__') {
        pendingBookingDraft = Object.fromEntries(new FormData(selectors.modalForm).entries());
        pendingBookingDraft.id = Number(selectors.modalForm.dataset.id) || undefined;
        pendingBookingDraft.vehicleId = '';
        openModal('vehicle', { customerId: Number(pendingBookingDraft.customerId) });
        return;
      }
      if (event.target.name === 'vehicleImage') {
        renderVehicleFilePreview(event.target.name, event.target.files?.[0]);
      }
    });

    document.querySelectorAll('[data-table-search]').forEach((input) => {
      input.addEventListener('input', () => {
        const table = document.getElementById(input.dataset.tableSearch);
        table.querySelectorAll('tbody tr').forEach((row) => {
          row.style.display = row.textContent.toLowerCase().includes(input.value.toLowerCase()) ? '' : 'none';
        });
      });
    });

    document.getElementById('global-search').addEventListener('input', (event) => {
      const value = event.target.value.toLowerCase();
      document.querySelectorAll('tbody tr, .vehicle-card, .package-card, .emergency-card, .feedback-card').forEach((item) => {
        item.style.display = item.textContent.toLowerCase().includes(value) || !value ? '' : 'none';
      });
    });

    document.getElementById('inventory-search')?.addEventListener('input', (event) => {
      renderInventory(event.target.value);
    });
    document.getElementById('document-search')?.addEventListener('input', (event) => {
      renderDocuments(event.target.value);
    });

    document.getElementById('settings-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const avatarFile = form.elements.profilePicture.files[0];
        const avatar = avatarFile ? await window.AutoCareApi.optimizeProfileImage(avatarFile) : (state.profile?.avatar || '');
        const result = await window.AutoCareApi.request('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value, phone: form.elements.phone.value, avatar })
        });
        state.profile = result.user;
        localStorage.setItem(sessionKey, JSON.stringify({ ...getSession(), ...result.user, token: result.token }));
        form.elements.profilePicture.value = '';
        applyAdminProfile(state.profile);
        showToast('Admin profile updated successfully.');
      } catch (error) {
        showToast(error.message || 'Profile update failed.');
      }
    });
    document.querySelector('#settings-form [name="profilePicture"]').addEventListener('change', async (event) => {
      try {
        const avatar = event.target.files[0] ? await window.AutoCareApi.optimizeProfileImage(event.target.files[0]) : state.profile?.avatar;
        window.AutoCareApi.displayAvatar(avatar, document.getElementById('settings-avatar-preview'), document.getElementById('settings-avatar-initials'));
      } catch (error) {
        event.target.value = '';
        showToast(error.message);
      }
    });
  }

  injectIcons();
  applySessionProfile();
  applyAdminProfile(session);
  renderAll();
  bindEvents();
  hydrateFromApi();
  window.setInterval(() => {
    refreshNotifications().catch(() => {});
  }, 15000);
});
