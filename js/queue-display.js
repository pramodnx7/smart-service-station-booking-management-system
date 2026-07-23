document.addEventListener('DOMContentLoaded', () => {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const timeElement = document.getElementById('display-time');
  const dateElement = document.getElementById('display-date');
  let refreshing = false;

  function updateClock() {
    const now = new Date();
    timeElement.textContent = now.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });
    dateElement.textContent = now.toLocaleDateString('en-LK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function refreshDisplay() {
    if (refreshing) return;
    refreshing = true;
    try {
      const response = await fetch('/api/public/queue-display', { cache: 'no-store' });
      if (!response.ok) throw new Error('Queue unavailable.');
      const data = await response.json();
      document.getElementById('display-serving').innerHTML = data.nowServing.length ? data.nowServing.map((entry) => `<article class="display-serving-card"><span>${escapeHtml(entry.status)}</span><h2>${escapeHtml(entry.token)}</h2><strong>${escapeHtml(entry.serviceBay)}</strong><p>${escapeHtml(entry.mechanic)}</p><div class="display-serving-meta"><span>Elapsed ${entry.elapsedServiceMinutes} min</span></div></article>`).join('') : '<div class="display-empty">No customer is being served right now. Please watch this screen for updates.</div>';
      document.getElementById('display-next').innerHTML = data.nextCustomers.length ? data.nextCustomers.map((entry) => `<article class="display-next-card"><b>${entry.queuePosition}</b><div><strong>${escapeHtml(entry.token)}</strong><small>Estimated wait ${entry.estimatedWaitingMinutes} min</small></div></article>`).join('') : '<div class="display-empty">No customers are waiting.</div>';
      document.getElementById('display-updated').textContent = `Updated ${new Date(data.generatedAt).toLocaleTimeString('en-LK')}`;
    } catch (error) {
      document.getElementById('display-updated').textContent = 'Reconnecting to queue...';
    } finally {
      refreshing = false;
    }
  }

  updateClock(); refreshDisplay();
  window.setInterval(updateClock, 1000);
  window.setInterval(() => { if (!document.hidden) refreshDisplay(); }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshDisplay();
  });
});
