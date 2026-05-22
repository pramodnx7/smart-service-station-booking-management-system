document.addEventListener('DOMContentLoaded', () => {
  const tabs = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
  const panels = Array.from(document.querySelectorAll('.about__text[role="tabpanel"]'));
  const bookingForm = document.getElementById('booking-form');
  const newsletterForm = document.getElementById('newsletter-form');

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
      showMessage(bookingForm, 'Booking request captured. We will confirm the appointment shortly.');
      bookingForm.reset();
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