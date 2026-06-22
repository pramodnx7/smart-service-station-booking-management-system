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
  const title = document.getElementById('login-title');
  const copy = document.getElementById('login-copy');
  const submit = document.getElementById('login-submit');
  const loginNote = document.getElementById('login-note');
  const signupNote = document.getElementById('signup-note');
  const openSignup = document.getElementById('open-signup');
  const openLogin = document.getElementById('open-login');
  const roleButtons = Array.from(document.querySelectorAll('[data-role]'));
  const nextTarget = new URLSearchParams(window.location.search).get('next');
  const demoAccounts = {
    admin: { email: 'admin@autocare.lk', password: 'admin123' },
    customer: { email: 'customer@autocare.lk', password: 'customer123' },
    technician: { email: 'tech@autocare.lk', password: 'tech123' }
  };
  const params = new URLSearchParams(window.location.search);
  let activeRole = ['admin', 'customer', 'technician'].includes(params.get('role')) ? params.get('role') : 'admin';

  function setStatus(message, isSuccess = false) {
    status.textContent = message;
    status.classList.toggle('is-success', isSuccess);
  }

  function setRole(role) {
    activeRole = ['admin', 'customer', 'technician'].includes(role) ? role : 'admin';
    roleButtons.forEach((button) => {
      const isActive = button.dataset.role === activeRole;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    const copyByRole = {
      admin: 'Sign in as an admin to manage service station operations.',
      customer: 'Sign in as a customer to manage vehicles, bookings and invoices.',
      technician: 'Sign in as a technician to manage assigned service jobs.'
    };
    title.textContent = `${activeRole[0].toUpperCase()}${activeRole.slice(1)} Login`;
    copy.textContent = copyByRole[activeRole];
    email.placeholder = demoAccounts[activeRole].email;
    submit.textContent = `Login as ${activeRole[0].toUpperCase()}${activeRole.slice(1)}`;
    setStatus('');
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
    setRole('customer');
    setStatus('Create a customer account, then return here to log in.', true);
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

  roleButtons.forEach((button) => {
    button.addEventListener('click', () => setRole(button.dataset.role));
  });

  document.querySelectorAll('[data-demo-role]').forEach((button) => {
    button.addEventListener('click', () => {
      const role = button.dataset.demoRole;
      setRole(role);
      email.value = demoAccounts[role].email;
      password.value = demoAccounts[role].password;
      setStatus(`${role === 'admin' ? 'Admin' : 'Customer'} demo filled. Click login.`, true);
    });
  });

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
        role: activeRole,
        email: email.value.trim(),
        password: password.value
      });

      localStorage.setItem(sessionKey, JSON.stringify({
        ...result.user,
        token: result.token,
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
    setStatus('Creating customer account...', true);

    try {
      const result = await window.AutoCareApi.register({
        role: 'customer',
        name: signupName.value.trim(),
        email: signupEmail.value.trim(),
        phone: signupPhone.value.trim(),
        password: signupPassword.value
      });

      email.value = signupEmail.value.trim();
      password.value = signupPassword.value;
      setPasswordVisibility(password, loginPasswordToggle, false);
      setPasswordVisibility(signupPassword, signupPasswordToggle, false);

      showLoginView();
      setRole('customer');
      setStatus('Account created. Your login details are ready. Click login.', true);
      signupForm.reset();
      password.focus();
    } catch (error) {
      setStatus(error.message || 'Could not create customer account.');
    }
  });

  document.getElementById('forgot-password').addEventListener('click', () => {
    if (!email.value.trim()) {
      setStatus('Enter your email address first, then request password reset.');
      email.focus();
      return;
    }

    setStatus('Password reset is not enabled for this demo project yet.', true);
  });

  setRole(activeRole);
  setPasswordVisibility(password, loginPasswordToggle, false);
  setPasswordVisibility(signupPassword, signupPasswordToggle, false);
  const session = window.AutoCareApi.getSession();
  if (session?.token && ['admin', 'customer', 'technician'].includes(session.role)) {
    setStatus(`You are already signed in as ${session.role}. Use the dashboard logout button to switch accounts.`, true);
  }
  showLoginView();
});
