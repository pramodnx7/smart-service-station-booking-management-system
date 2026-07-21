document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = navMenu ? Array.from(navMenu.querySelectorAll('.nav-link')) : [];
  const sectionLinks = navLinks
    .filter((link) => link.hash && link.getAttribute('href')?.startsWith('#'))
    .map((link) => ({ link, section: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
    .filter((item) => item.section);
  let scrollFrame = 0;

  const setActiveLink = (activeLink) => {
    sectionLinks.forEach(({ link }) => {
      const isActive = link === activeLink;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const updateActiveSection = () => {
    scrollFrame = 0;
    if (!sectionLinks.length) return;
    const headerOffset = (navbar?.offsetHeight || 0) + Math.min(window.innerHeight * 0.2, 150);
    const marker = window.scrollY + headerOffset;
    let activeLink = sectionLinks[0].link;

    sectionLinks.forEach(({ link, section }) => {
      if (section.offsetTop <= marker) activeLink = link;
    });

    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      activeLink = sectionLinks[sectionLinks.length - 1].link;
    }
    setActiveLink(activeLink);
  };

  const scheduleActiveSectionUpdate = () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateActiveSection);
  };

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
      const sectionLink = sectionLinks.find((item) => item.link === link);
      if (sectionLink) setActiveLink(link);
      closeMenu();
    });
  });

  window.addEventListener('scroll', () => {
    setScrolledState();
    scheduleActiveSectionUpdate();
  }, { passive: true });
  window.addEventListener('resize', scheduleActiveSectionUpdate, { passive: true });
  window.addEventListener('load', scheduleActiveSectionUpdate, { once: true });
  setScrolledState();
  updateActiveSection();
});
