document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const form = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const signupPanel = document.getElementById('signup-panel');
  const status = document.getElementById('form-status');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const loginPasswordToggle = document.getElementById('toggle-login-password');
  const signupName = document.getElementById('signup-name');
  const signupEmail = document.getElementById('signup-email');
  const signupPhone = document.getElementById('signup-phone');
  const signupPassword = document.getElementById('signup-password');
  const signupPasswordToggle = document.getElementById('toggle-signup-password');
  const loginNote = document.getElementById('login-note');
  const signupNote = document.getElementById('signup-note');
  const openSignup = document.getElementById('open-signup');
  const openLogin = document.getElementById('open-login');
  const requestedNextTarget = new URLSearchParams(window.location.search).get('next');
  const nextTarget = requestedNextTarget
    && /^customer-dashboard\.html(?:#[a-z0-9_-]+)?$/i.test(requestedNextTarget)
    ? requestedNextTarget
    : null;
  function setStatus(message, isSuccess = false) {
    status.textContent = message;
    status.classList.toggle('is-success', isSuccess);
  }

  function showLoginView() {
    signupPanel.hidden = true;
    form.classList.remove('hidden');
    loginNote.classList.remove('hidden');
    signupNote.classList.add('hidden');
  }

  function showSignupView() {
    signupPanel.hidden = false;
    form.classList.add('hidden');
    loginNote.classList.add('hidden');
    signupNote.classList.remove('hidden');
    setStatus('Create a customer account to manage bookings and vehicles.', true);
  }

  function setPasswordVisibility(input, button, isVisible) {
    input.type = isVisible ? 'text' : 'password';
    button.textContent = isVisible ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(isVisible));
  }

  function togglePasswordVisibility(input, button) {
    setPasswordVisibility(input, button, input.type === 'password');
  }

  function redirectForRole(role) {
    if (nextTarget && role === 'customer') {
      window.location.href = nextTarget;
      return;
    }

    const dashboards = {
      admin: 'admin-dashboard.html',
      customer: 'customer-dashboard.html',
      technician: 'technician-dashboard.html'
    };
    window.location.href = dashboards[role] || 'index.html';
  }

  openSignup.addEventListener('click', () => {
    showSignupView();
    signupName.focus();
  });

  openLogin.addEventListener('click', () => {
    showLoginView();
    email.focus();
  });

  loginPasswordToggle.addEventListener('click', () => {
    togglePasswordVisibility(password, loginPasswordToggle);
    password.focus();
  });

  signupPasswordToggle.addEventListener('click', () => {
    togglePasswordVisibility(signupPassword, signupPasswordToggle);
    signupPassword.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Checking account...', true);

    try {
      const result = await window.AutoCareApi.login({
        email: email.value.trim(),
        password: password.value
      });

      localStorage.setItem(sessionKey, JSON.stringify({
        ...result.user,
        authenticated: true,
        loggedInAt: new Date().toISOString()
      }));

      setStatus('Login successful. Redirecting...', true);
      window.setTimeout(() => redirectForRole(result.user.role), 350);
    } catch (error) {
      setStatus(error.message || 'Login failed. Check the backend server and Firebase connection.');
    }
  });

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const signupEmailValue = signupEmail.value.trim();

    setStatus('Creating customer account...', true);

    try {
      const result = await window.AutoCareApi.register({
        role: 'customer',
        name: signupName.value.trim(),
        email: signupEmailValue,
        phone: signupPhone.value.trim(),
        password: signupPassword.value
      });

      email.value = signupEmailValue;
      password.value = signupPassword.value;
      setPasswordVisibility(password, loginPasswordToggle, false);
      setPasswordVisibility(signupPassword, signupPasswordToggle, false);

      showLoginView();
      setStatus('Customer account created. Click login.', true);
      signupForm.reset();
      password.focus();
    } catch (error) {
      setStatus(error.message || 'Could not create customer account.');
    }
  });

  setPasswordVisibility(password, loginPasswordToggle, false);
  setPasswordVisibility(signupPassword, signupPasswordToggle, false);
  const session = window.AutoCareApi.getSession();
  if (session?.token && ['admin', 'customer', 'technician'].includes(session.role)) {
    setStatus(`You are already signed in as ${session.role}. Use the dashboard logout button to switch accounts.`, true);
  }
  showLoginView();
});
