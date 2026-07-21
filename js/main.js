document.addEventListener('DOMContentLoaded', () => {
  const tabs = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
  const panels = Array.from(document.querySelectorAll('.about__text[role="tabpanel"]'));
  const newsletterForm = document.getElementById('newsletter-form');

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const renderPricingPlans = async () => {
    const grid = document.querySelector('.pricing__grid');
    if (!grid) return;
    try {
      const response = await fetch('/api/public/pricing-plans');
      if (!response.ok) throw new Error('Plans unavailable');
      const { plans = [] } = await response.json();
      if (!plans.length) {
        grid.innerHTML = '<p>No active pricing plans are currently available.</p>';
        return;
      }
      const icons = [
        '<path d="M12 3v18M3 12h18"/>',
        '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
        '<path d="M12 3 4 6v5c0 5 3.2 8.5 8 10 4.8-1.5 8-5 8-10V6l-8-3Z"/><path d="m8.5 12 2.3 2.3 4.7-5"/>'
      ];
      grid.innerHTML = plans.map((plan, index) => `<article class="pricing-card ${plan.featured ? 'pricing-card--featured' : ''}"><div class="pricing-card__visual"><img src="${escapeHtml(plan.image)}" alt="${escapeHtml(plan.name)}" /><span class="pricing-card__tag">${escapeHtml(plan.badge)}</span></div><div class="pricing-card__body"><div class="pricing-card__heading"><span><svg viewBox="0 0 24 24" aria-hidden="true">${icons[index % icons.length]}</svg></span><div><small>${escapeHtml(plan.billingPeriod)} package</small><h3>${escapeHtml(plan.name)}</h3></div></div><strong><small>LKR</small>${Number(plan.price).toLocaleString('en-LK')}<span>/ ${escapeHtml(plan.billingPeriod)}</span></strong><ul>${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul></div><a href="login.html?role=customer&next=customer-dashboard.html%23bookings"><span>${escapeHtml(plan.buttonText)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></a></article>`).join('');
    } catch (error) {
      grid.innerHTML = '<p>Pricing plans could not be loaded.</p>';
    }
  };

  const renderServiceRatings = async () => {
    const strip = document.querySelector('.service-strip');
    if (!strip) return;

    try {
      const response = await fetch('/api/public/service-ratings');
      if (!response.ok) throw new Error('Ratings are unavailable.');
      const { services = [] } = await response.json();
      strip.innerHTML = services.length ? services.map((service) => {
        const reviewLabel = service.reviewCount === 1 ? 'Review' : 'Reviews';
        const summary = service.reviewCount
          ? `<strong>${service.averageRating.toFixed(1)}</strong> (${service.reviewCount} ${reviewLabel})`
          : 'No reviews yet';
        return `<article data-service-card="${escapeHtml(service.name)}"><img src="${escapeHtml(service.image)}" alt="${escapeHtml(service.name)}" /><strong>${escapeHtml(service.name)}</strong><span>LKR ${Number(service.price).toLocaleString('en-LK')}</span><small>${escapeHtml(service.duration)}</small><p>${escapeHtml(service.description)}</p><div class="service-rating" data-service-rating aria-label="${service.reviewCount ? `${service.averageRating} out of 5 stars from ${service.reviewCount} reviews` : 'No customer reviews yet'}"><div class="stars" aria-hidden="true" style="--rating-fill:${Math.max(0, Math.min(100, service.averageRating * 20))}%"><span>★★★★★</span><span class="stars__fill">★★★★★</span></div><small>${summary}</small></div></article>`;
      }).join('') : '<p>No active services are currently available.</p>';

      const reviewSummary = document.getElementById('review-summary');
      if (reviewSummary) {
        const reviewCount = services.reduce((sum, service) => sum + service.reviewCount, 0);
        const weightedTotal = services.reduce((sum, service) => sum + (service.averageRating * service.reviewCount), 0);
        reviewSummary.textContent = reviewCount
          ? `${(weightedTotal / reviewCount).toFixed(1)} out of 5 from ${reviewCount} verified service reviews.`
          : 'No verified customer reviews have been submitted yet.';
      }
    } catch (error) {
      strip.innerHTML = '<p>Services could not be loaded.</p>';
    }
  };

  let activeWorkIndex = 0;

  const updateWorkCarousel = () => {
    const items = Array.from(document.querySelectorAll('#gallery-grid .gallery-item'));
    if (!items.length) return;
    activeWorkIndex = (activeWorkIndex + items.length) % items.length;
    items.forEach((item, index) => {
      item.classList.toggle('is-active', index === activeWorkIndex);
      item.classList.toggle('is-prev', items.length > 2 && index === (activeWorkIndex - 1 + items.length) % items.length);
      item.classList.toggle('is-next', items.length > 1 && index === (activeWorkIndex + 1) % items.length);
    });
  };

  const renderLandingContent = async () => {
    const gallery = document.getElementById('gallery-grid');
    const newsGrid = document.getElementById('news-grid');
    try {
      const response = await fetch('/api/public/landing-content');
      if (!response.ok) throw new Error('Landing content unavailable.');
      const { recentWork = [], news = [] } = await response.json();
      gallery.innerHTML = recentWork.length ? recentWork.map((item) => `<article class="gallery-item"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" /><span>${escapeHtml(item.title)}</span></article>`).join('') : '<p>No recent work is currently published.</p>';
      newsGrid.innerHTML = news.length ? news.map((item) => {
        const formattedDate = new Date(`${item.date}T00:00:00`).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' });
        return `<article class="article-card"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" /><div><span>${escapeHtml(formattedDate)} | ${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><a href="#articles">Read More</a></div></article>`;
      }).join('') : '<p>No news is currently published.</p>';
      activeWorkIndex = 0;
      updateWorkCarousel();
    } catch (error) {
      gallery.innerHTML = '<p>Recent work could not be loaded.</p>';
      newsGrid.innerHTML = '<p>News could not be loaded.</p>';
    }
  };

  renderServiceRatings();
  renderPricingPlans();
  renderLandingContent();

  document.getElementById('gallery-prev')?.addEventListener('click', () => {
    activeWorkIndex -= 1;
    updateWorkCarousel();
  });
  document.getElementById('gallery-next')?.addEventListener('click', () => {
    activeWorkIndex += 1;
    updateWorkCarousel();
  });

  fetch('/api/public/stats')
    .then((response) => {
      if (!response.ok) throw new Error('Statistics unavailable.');
      return response.json();
    })
    .then((stats) => {
      document.getElementById('happy-customer-count').textContent = Number(stats.happyCustomers).toLocaleString('en-LK');
      document.getElementById('expert-technician-count').textContent = Number(stats.expertTechnicians).toLocaleString('en-LK');
      document.getElementById('customer-count').textContent = Number(stats.registeredCustomers).toLocaleString('en-LK');
      document.getElementById('technician-count').textContent = Number(stats.activeTechnicians).toLocaleString('en-LK');
      document.getElementById('completed-service-count').textContent = Number(stats.completedServices).toLocaleString('en-LK');
    })
    .catch(() => {
      document.querySelectorAll('[data-live-stat]').forEach((element) => { element.textContent = 'Unavailable'; });
    });

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

  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const emailInput = newsletterForm.querySelector('input[type="email"]');
      try {
        const response = await fetch('/api/public/newsletter-subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailInput.value.trim() })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Subscription failed.');
        showMessage(newsletterForm, result.alreadySubscribed ? 'This email is already subscribed.' : 'Subscription saved successfully.');
        newsletterForm.reset();
      } catch (error) {
        showMessage(newsletterForm, error.message || 'Subscription could not be saved.', 'error');
      }
    });
  }
});
