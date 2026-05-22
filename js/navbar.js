document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = navMenu ? Array.from(navMenu.querySelectorAll('.nav-link')) : [];

  const setScrolledState = () => {
    if (!navbar) return;
    navbar.classList.toggle('is-scrolled', window.scrollY > 12);
  };

  const closeMenu = () => {
    if (!navMenu || !hamburger) return;
    navMenu.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
  };

  if (hamburger && navMenu) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });
  }

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      closeMenu();
    });
  });

  window.addEventListener('scroll', setScrolledState, { passive: true });
  setScrolledState();
});