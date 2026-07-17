document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('gallery-grid');
  const prevButton = document.getElementById('gallery-prev');
  const nextButton = document.getElementById('gallery-next');

  if (!slider || !prevButton || !nextButton) {
    return;
  }

  const slides = Array.from(slider.children);
  if (slides.length < 3) {
    return;
  }

  let activeIndex = 0;

  const updateCarousel = (index) => {
    activeIndex = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      slide.classList.remove('is-active', 'is-prev', 'is-next');

      if (slideIndex === activeIndex) {
        slide.classList.add('is-active');
      } else if (slideIndex === (activeIndex + 1) % slides.length) {
        slide.classList.add('is-next');
      } else {
        slide.classList.add('is-prev');
      }
    });
  };

  prevButton.addEventListener('click', () => updateCarousel(activeIndex - 1));
  nextButton.addEventListener('click', () => updateCarousel(activeIndex + 1));

  updateCarousel(0);
});