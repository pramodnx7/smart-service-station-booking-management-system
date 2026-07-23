document.addEventListener('DOMContentLoaded', async () => {
  const article = document.getElementById('news-article');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
  const requestedSlot = Number(new URLSearchParams(window.location.search).get('article'));

  function showError(message) {
    article.innerHTML = `
      <div class="news-error">
        <h1>News unavailable</h1>
        <p>${escapeHtml(message)}</p>
        <a href="index.html#articles">Back to all news</a>
      </div>`;
  }

  try {
    const response = await fetch('/api/public/landing-content');
    if (!response.ok) throw new Error('The news article could not be loaded.');
    const { news = [] } = await response.json();
    const item = news.find((entry) => Number(entry.slot) === requestedSlot) || news[requestedSlot];
    if (!item) {
      showError('This article is no longer available.');
      return;
    }

    const date = new Date(`${item.date}T00:00:00`);
    const formattedDate = Number.isNaN(date.getTime())
      ? item.date
      : date.toLocaleDateString('en-LK', { day: '2-digit', month: 'long', year: 'numeric' });
    const photo = item.image
      ? `<img class="news-article__photo" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" />`
      : '<div class="news-article__placeholder" role="img" aria-label="No photo available">No photo available</div>';

    document.title = `${item.title} | AutoCare News`;
    article.innerHTML = `
      ${photo}
      <div class="news-article__content">
        <div class="news-article__meta">
          <time datetime="${escapeHtml(item.date)}">${escapeHtml(formattedDate)}</time>
          <span aria-hidden="true">•</span>
          <span>${escapeHtml(item.category)}</span>
        </div>
        <h1>${escapeHtml(item.title)}</h1>
        <p class="news-article__lead">The latest vehicle-care update from the AutoCare service team.</p>
        <div class="news-article__body">
          <h2>Why this matters</h2>
          <p>Regular inspections and timely servicing help identify developing problems early, improve road safety, and reduce avoidable repair costs.</p>
          <h2>AutoCare recommendation</h2>
          <p>If you notice unusual sounds, warning lights, reduced performance, or changes in handling, arrange a professional inspection instead of waiting for the problem to become more serious.</p>
        </div>
      </div>`;
  } catch (error) {
    showError(error.message || 'The news article could not be loaded.');
  }
});
