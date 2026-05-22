document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('gallery-grid');
  const prevButton = document.getElementById('gallery-prev');
  const nextButton = document.getElementById('gallery-next');

  if (!slider || !prevButton || !nextButton) {
    return;
  }

  const slideAmount = () => Math.max(slider.clientWidth * 0.72, 280);

  prevButton.addEventListener('click', () => {
    slider.scrollBy({ left: -slideAmount(), behavior: 'smooth' });
  });

  nextButton.addEventListener('click', () => {
    slider.scrollBy({ left: slideAmount(), behavior: 'smooth' });
  });
});