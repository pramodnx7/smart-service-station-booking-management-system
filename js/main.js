document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const pendingBookingKey = 'autocare-pending-booking';
  const bookingTarget = 'customer-dashboard.html#bookings';
  const tabs = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
  const panels = Array.from(document.querySelectorAll('.about__text[role="tabpanel"]'));
  const bookingShell = document.querySelector('.booking-shell');
  const bookingForm = document.getElementById('booking-form');
  const bookingSubmit = document.getElementById('booking-submit');
  const bookingLoginOption = document.getElementById('booking-login-option');
  const newsletterForm = document.getElementById('newsletter-form');

  const getSession = () => {
    try {
      return JSON.parse(localStorage.getItem(sessionKey));
    } catch (error) {
      return null;
    }
  };

  const goToCustomerLogin = () => {
    window.location.href = `login.html?role=customer&next=${encodeURIComponent(bookingTarget)}`;
  };

  const session = getSession();
  const canBook = Boolean(session?.token && session.role === 'customer');

  if (bookingShell) {
    bookingShell.classList.toggle('hidden', !canBook);
  }

  const getBookingData = () => {
    const elements = Array.from(bookingForm.querySelectorAll('select, input'));

    return {
      service: elements[0]?.value || '',
      vehicleType: elements[1]?.value || '',
      date: elements[2]?.value || '',
      time: elements[3]?.value || ''
    };
  };

  const savePendingBooking = (booking) => {
    localStorage.setItem(pendingBookingKey, JSON.stringify(booking));
  };

  const activateTab = (tabName) => {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('tab-btn--active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    panels.forEach((panel) => {
      const isVisible = panel.id === `tab-panel-${tabName}`;
      panel.classList.toggle('hidden', !isVisible);
      panel.setAttribute('aria-hidden', String(!isVisible));
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab || 'company'));
  });

  if (tabs.length) {
    activateTab(tabs[0].dataset.tab || 'company');
  }

  const showMessage = (form, message, tone = 'success') => {
    let status = form.querySelector('[data-form-status]');

    if (!status) {
      status = document.createElement('p');
      status.dataset.formStatus = 'true';
      status.style.marginTop = '0.75rem';
      status.style.fontWeight = '700';
      form.appendChild(status);
    }

    status.textContent = message;
    status.style.color = tone === 'success' ? 'var(--accent)' : 'var(--muted)';
  };

  if (bookingForm) {
    bookingForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const booking = getBookingData();
      savePendingBooking(booking);

      if (bookingLoginOption) {
        bookingLoginOption.classList.add('hidden');
      }

      if (canBook) {
        showMessage(bookingForm, 'Booking details saved. Opening your customer dashboard...', 'success');
        window.setTimeout(() => {
          window.location.href = bookingTarget;
        }, 350);
        return;
      }

      if (bookingSubmit) {
        bookingSubmit.classList.add('hidden');
      }
      if (bookingLoginOption) {
        bookingLoginOption.classList.remove('hidden');
        bookingLoginOption.focus();
        bookingLoginOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      showMessage(newsletterForm, 'Thanks for subscribing. We have added your email to the list.');
      newsletterForm.reset();
    });
  }
});