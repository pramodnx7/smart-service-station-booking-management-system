document.addEventListener('DOMContentLoaded', () => {
  const counters = Array.from(document.querySelectorAll('.stat-number[data-target]'));

  if (!counters.length) {
    return;
  }

  const formatCounter = (value, element) => {
    if (element.dataset.format === 'compact') {
      return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 0 }).format(value);
    }

    return new Intl.NumberFormat('en').format(value);
  };

  const animateCounter = (element) => {
    const target = Number(element.dataset.target || 0);
    const duration = 1400;
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(target * eased);
      element.textContent = formatCounter(currentValue, element);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        animateCounter(entry.target);
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.35 }
  );

  counters.forEach((counter) => observer.observe(counter));
});