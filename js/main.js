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

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const renderPricingPlans = async () => {
    const grid = document.querySelector('.pricing__grid');
    if (!grid) return;
    try {
      const response = await fetch('/api/public/pricing-plans');
      if (!response.ok) throw new Error('Plans unavailable');
      const { plans = [] } = await response.json();
      if (!plans.length) return;
      const icons = [
        '<path d="M12 3v18M3 12h18"/>',
        '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
        '<path d="M12 3 4 6v5c0 5 3.2 8.5 8 10 4.8-1.5 8-5 8-10V6l-8-3Z"/><path d="m8.5 12 2.3 2.3 4.7-5"/>'
      ];
      grid.innerHTML = plans.map((plan, index) => `<article class="pricing-card ${plan.featured ? 'pricing-card--featured' : ''}"><div class="pricing-card__visual"><img src="${escapeHtml(plan.image)}" alt="${escapeHtml(plan.name)}" /><span class="pricing-card__tag">${escapeHtml(plan.badge)}</span></div><div class="pricing-card__body"><div class="pricing-card__heading"><span><svg viewBox="0 0 24 24" aria-hidden="true">${icons[index % icons.length]}</svg></span><div><small>${escapeHtml(plan.billingPeriod)} package</small><h3>${escapeHtml(plan.name)}</h3></div></div><strong><small>LKR</small>${Number(plan.price).toLocaleString('en-LK')}<span>/ ${escapeHtml(plan.billingPeriod)}</span></strong><ul>${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul></div><a href="login.html?role=customer&next=customer-dashboard.html%23bookings"><span>${escapeHtml(plan.buttonText)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></a></article>`).join('');
    } catch (error) { /* Keep the static fallback cards. */ }
  };

  const renderServiceRatings = async () => {
    const cards = Array.from(document.querySelectorAll('[data-service-card]'));
    if (!cards.length) return;

    try {
      const response = await fetch('/api/public/service-ratings');
      if (!response.ok) throw new Error('Ratings are unavailable.');
      const { services = [] } = await response.json();
      const ratingsByName = new Map(services.map((service) => [service.name.toLowerCase(), service]));

      cards.forEach((card) => {
        const rating = ratingsByName.get(card.dataset.serviceCard.toLowerCase());
        const ratingElement = card.querySelector('[data-service-rating]');
        if (!rating || !ratingElement) return;

        const stars = ratingElement.querySelector('.stars');
        const summary = ratingElement.querySelector('small');
        const reviewLabel = rating.reviewCount === 1 ? 'Review' : 'Reviews';
        stars.style.setProperty('--rating-fill', `${Math.max(0, Math.min(100, rating.averageRating * 20))}%`);
        ratingElement.setAttribute('aria-label', rating.reviewCount
          ? `${rating.averageRating} out of 5 stars from ${rating.reviewCount} reviews`
          : 'No customer reviews yet');
        summary.innerHTML = rating.reviewCount
          ? `<strong>${rating.averageRating.toFixed(1)}</strong> (${rating.reviewCount} ${reviewLabel})`
          : 'No reviews yet';
      });
    } catch (error) {
      // Keep the neutral "No reviews yet" state when the API is offline.
    }
  };

  renderServiceRatings();
  renderPricingPlans();

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
