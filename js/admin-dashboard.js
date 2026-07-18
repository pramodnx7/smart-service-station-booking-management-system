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
      saveState();
      renderAll();
    } catch (error) {
      showToast(error.message || 'Could not load database data.');
    }
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

  function showToast(message) {
    selectors.toast.textContent = message;
    selectors.toast.classList.add('is-visible');
    window.setTimeout(() => selectors.toast.classList.remove('is-visible'), 2400);
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
          <div class="row-actions">
            <button class="mini-btn" type="button" data-action="advance-booking" data-id="${booking.id}">Update</button>
            <button class="mini-btn" type="button" data-action="reschedule-booking" data-id="${booking.id}">Reschedule</button>
            <button class="mini-btn mini-btn--red" type="button" data-action="cancel-booking" data-id="${booking.id}">Cancel</button>
            <button class="mini-btn mini-btn--danger" type="button" data-action="delete-booking" data-id="${booking.id}">Delete</button>
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
          <td><div class="row-actions"><button class="mini-btn" type="button" data-action="edit-customer" data-id="${customer.id}">Edit</button><button class="mini-btn" type="button" data-action="reset-password" data-id="${customer.id}">Reset</button></div></td>
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

  function renderBilling() {
    document.getElementById('billing-body').innerHTML = state.invoices.map((invoice) => `
      <tr>
        <td><span class="row-title">#INV-${invoice.id}</span><span class="row-sub">${invoice.date}</span></td>
        <td>${customerName(invoice.customerId)}</td>
        <td>${invoice.service}</td>
        <td>${formatMoney(invoice.amount)}</td>
        <td><span class="badge badge--${invoice.payment === 'Paid' ? 'completed' : 'pending'}">${invoice.payment}</span></td>
        <td><div class="row-actions"><button class="mini-btn" type="button" data-action="preview-invoice" data-id="${invoice.id}">View</button><button class="mini-btn" type="button" data-action="mark-paid" data-id="${invoice.id}">Mark Paid</button><button class="mini-btn" type="button" data-action="download-invoice" data-id="${invoice.id}">Download</button></div></td>
      </tr>
    `).join('');
  }

  function renderEmergency() {
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
    document.getElementById('notification-count').textContent = state.notifications.filter((item) => item.unread).length;
    document.getElementById('notification-list').innerHTML = state.notifications.map((item) => `
      <article class="notification-item">
        <span data-icon="bell"></span>
        <div><strong>${item.type}</strong><p>${item.message}</p></div>
      </article>
    `).join('');
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
    renderBilling();
    renderEmergency();
    renderNotifications();
    renderFeedback();
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
    preview.innerHTML = file
      ? `<span>${file.name}</span><small>${Math.round(file.size / 1024)} KB</small>`
      : '<span>No car image selected</span>';
  }

  function openModal(mode, record = {}) {
    const customerOptions = state.customers.map((customer) => ({ value: customer.id, label: customer.name }));
    const vehicleOptions = state.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.make} ${vehicle.model} - ${vehicle.plate}` }));
    const technicianOptions = state.technicians
      .filter((technician) => technician.status === 'Active' || Number(technician.id) === Number(record.assignedTechnicianId))
      .map((technician) => ({ value: technician.id, label: `${technician.name} - ${technician.specialization}` }));
    const bookingOptions = state.bookings.map((booking) => ({ value: booking.id, label: `#BK-${booking.id} - ${customerName(booking.customerId)} - ${booking.service}` }));
    const completedJobOptions = state.serviceJobs
      .filter((job) => job.status === 'Completed')
      .map((job) => ({ value: job.id, label: `#SJ-${job.id} - ${job.serviceType} - ${job.customerName || customerName(job.customerId)}` }));
    const categoryOptions = ['Engine Parts', 'Brake System', 'Electrical', 'Suspension', 'Cooling System', 'Filters', 'Fluids & Lubricants', 'Batteries', 'Tires & Wheels', 'Accessories'].map((category) => ({ value: category, label: category }));
    const supplierOptions = (state.inventorySuppliers || []).map((supplier) => ({ value: supplier.id, label: supplier.name }));
    const statusOptions = statusLabels.slice(1).map((status) => ({ value: status, label: status }));
    const paymentOptions = ['Unpaid', 'Paid'].map((payment) => ({ value: payment, label: payment }));
    const config = {
      customer: {
        title: record.id ? 'Edit Customer' : 'Register Customer',
        body: field('name', 'Full Name', 'text', record.name || '') + field('email', 'Email', 'email', record.email || '') + field('phone', 'Phone', 'tel', record.phone || '') + field('status', 'Status', 'select', record.status || 'Active', [{ value: 'Active', label: 'Active' }, { value: 'Pending', label: 'Pending' }])
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
        body: field('customerId', 'Customer', 'select', record.customerId || customerOptions[0]?.value, customerOptions) + field('vehicleId', 'Vehicle', 'select', record.vehicleId || vehicleOptions[0]?.value, vehicleOptions) + field('service', 'Service', 'select', record.service || state.packages[0]?.name, state.packages.map((item) => ({ value: item.name, label: item.name }))) + field('date', 'Date', 'date', record.date || '') + field('time', 'Time', 'time', record.time || '') + field('status', 'Status', 'select', record.status || 'Pending', statusOptions)
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
      invoice: {
        title: 'Create Invoice',
        body: field('serviceJobId', 'Completed Service Job', 'select', record.serviceJobId || completedJobOptions[0]?.value, completedJobOptions) + field('customerId', 'Customer', 'select', record.customerId || customerOptions[0]?.value, customerOptions) + field('service', 'Service', 'select', record.service || state.packages[0]?.name, state.packages.map((item) => ({ value: item.name, label: item.name }))) + field('laborCost', 'Labor Cost', 'number', record.laborCost || '') + field('serviceCharges', 'Service Charges', 'number', record.serviceCharges || '0') + field('tax', 'Tax', 'number', record.tax || '0') + field('discount', 'Discount', 'number', record.discount || '0') + field('payment', 'Payment Status', 'select', record.payment || 'Unpaid', paymentOptions) + field('date', 'Date', 'date', record.date || new Date().toISOString().slice(0, 10))
      },
      emergency: {
        title: 'Emergency Service Request',
        body: field('customerId', 'Customer', 'select', record.customerId || customerOptions[0]?.value, customerOptions) + field('location', 'Shared Location', 'text', record.location || '') + field('status', 'Status', 'select', record.status || 'Open', [{ value: 'Open', label: 'Open' }, { value: 'Assigned', label: 'Assigned' }, { value: 'Closed', label: 'Closed' }]) + field('problem', 'Vehicle Problem Details', 'textarea', record.problem || '')
      },
      notification: {
        title: 'Send Customer Notification',
        body: field('type', 'Notification Type', 'select', record.type || 'Booking', ['Booking', 'Service', 'Payment'].map((type) => ({ value: type, label: type }))) + field('message', 'Message', 'textarea', record.message || '')
      }
    };

    selectors.modalForm.dataset.mode = mode;
    selectors.modalForm.dataset.id = record.id || '';
    selectors.modalKicker.textContent = 'Admin Action';
    selectors.modalTitle.textContent = config[mode].title;
    selectors.modalBody.innerHTML = config[mode].body;
    selectors.modalActions.hidden = false;
    selectors.modalSubmit.textContent = 'Save';
    selectors.modal.showModal();
  }

  async function handleModalSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(selectors.modalForm).entries());
    const mode = selectors.modalForm.dataset.mode;
    const id = Number(selectors.modalForm.dataset.id);

    if (mode === 'customer') {
      const savedCustomer = await window.AutoCareApi.request(id ? `/api/admin/customers/${id}` : '/api/admin/customers', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(data)
      });
      id ? Object.assign(state.customers.find((item) => item.id === id), savedCustomer) : state.customers.push(savedCustomer);
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
      const payload = { ...data, customerId: Number(data.customerId), vehicleId: Number(data.vehicleId), queue: id ? state.bookings.find((item) => item.id === id).queue : state.bookings.length + 1, progress: data.status === 'Completed' ? 100 : 10 };
      const savedBooking = await window.AutoCareApi.request(id ? `/api/admin/bookings/${id}` : '/api/admin/bookings', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      id ? Object.assign(state.bookings.find((item) => item.id === id), savedBooking) : state.bookings.push(savedBooking);
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
      await window.AutoCareApi.request('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      state.notifications.unshift({ id: nextId(state.notifications), ...data, unread: true });
    }

    selectors.modal.close();
    saveState();
    renderAll();
    showToast('Dashboard data saved successfully.');
  }

  async function advanceBooking(id) {
    const flow = ['Pending', 'Approved', 'In Progress', 'Completed'];
    const booking = state.bookings.find((item) => item.id === Number(id));
    if (!booking || booking.status === 'Cancelled') return;
    await window.AutoCareApi.request(`/api/admin/bookings/${id}/status`, { method: 'PUT' });
    const next = flow[Math.min(flow.indexOf(booking.status) + 1, flow.length - 1)];
    booking.status = next;
    booking.progress = next === 'Approved' ? 35 : next === 'In Progress' ? 70 : next === 'Completed' ? 100 : booking.progress;
    state.notifications.unshift({ id: nextId(state.notifications), type: 'Booking', message: `${customerName(booking.customerId)} booking status changed to ${next}.`, unread: true });
    saveState();
    renderAll();
    showToast(`Booking moved to ${next}.`);
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
    if (action === 'reset-password') showToast(`Password reset link prepared for ${customerName(numericId)}.`);
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
      await window.AutoCareApi.request(`/api/admin/vehicles/${numericId}`, { method: 'DELETE' });
      state.vehicles = state.vehicles.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Vehicle removed from account.');
    }
    if (action === 'new-booking') openModal('booking');
    if (action === 'reschedule-booking') openModal('booking', state.bookings.find((item) => item.id === numericId));
    if (action === 'advance-booking') await advanceBooking(numericId);
    if (action === 'cancel-booking') {
      await window.AutoCareApi.request(`/api/admin/bookings/${numericId}/cancel`, { method: 'PUT' });
      const booking = state.bookings.find((item) => item.id === numericId);
      booking.status = 'Cancelled';
      booking.progress = 0;
      saveState();
      renderAll();
      showToast('Booking cancelled.');
    }
    if (action === 'delete-booking') {
      await window.AutoCareApi.request(`/api/admin/bookings/${numericId}`, { method: 'DELETE' });
      state.bookings = state.bookings.filter((item) => item.id !== numericId);
      saveState();
      renderAll();
      showToast('Booking deleted.');
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
    if (action === 'download-invoice') await downloadInvoice(numericId);
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
    if (action === 'close-emergency') {
      await window.AutoCareApi.request(`/api/admin/emergencies/${numericId}/close`, { method: 'PUT' });
      state.emergencies.find((item) => item.id === numericId).status = 'Closed';
      saveState();
      renderAll();
      showToast('Emergency request resolved.');
    }
    if (action === 'send-notification' || action === 'show-notifications') openModal('notification');
    if (action === 'close-modal') {
      selectors.modal.close();
      selectors.modalActions.hidden = false;
      selectors.modalSubmit.textContent = 'Save';
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
      handleModalSubmit(event).catch((error) => showToast(error.message || 'Save failed.'));
    });
    selectors.modalForm.addEventListener('change', (event) => {
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

    document.getElementById('settings-form').addEventListener('submit', (event) => {
      event.preventDefault();
      showToast('Settings saved for this browser session.');
    });
  }

  injectIcons();
  applySessionProfile();
  renderAll();
  bindEvents();
  hydrateFromApi();
});
