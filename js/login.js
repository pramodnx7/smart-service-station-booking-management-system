document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const form = document.getElementById('login-form');
  const status = document.getElementById('form-status');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const title = document.getElementById('login-title');
  const copy = document.getElementById('login-copy');
  const submit = document.getElementById('login-submit');
  const roleButtons = Array.from(document.querySelectorAll('[data-role]'));
  const demoAccounts = {
    admin: { email: 'admin@autocare.lk', password: 'admin123' },
    customer: { email: 'customer@autocare.lk', password: 'customer123' }
  };
  const params = new URLSearchParams(window.location.search);
  let activeRole = params.get('role') === 'customer' ? 'customer' : 'admin';

  function setStatus(message, isSuccess = false) {
    status.textContent = message;
    status.classList.toggle('is-success', isSuccess);
  }

  function setRole(role) {
    activeRole = role === 'customer' ? 'customer' : 'admin';
    roleButtons.forEach((button) => {
      const isActive = button.dataset.role === activeRole;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    const isAdmin = activeRole === 'admin';
    title.textContent = isAdmin ? 'Admin Login' : 'Customer Login';
    copy.textContent = isAdmin
      ? 'Sign in as an admin to manage service station operations.'
      : 'Sign in as a customer to manage vehicles, bookings and invoices.';
    email.placeholder = isAdmin ? demoAccounts.admin.email : demoAccounts.customer.email;
    submit.textContent = isAdmin ? 'Login as Admin' : 'Login as Customer';
    setStatus('');
  }

  function redirectForRole(role) {
    window.location.href = role === 'admin' ? 'admin-dashboard.html' : 'customer-dashboard.html';
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

  document.getElementById('forgot-password').addEventListener('click', () => {
    if (!email.value.trim()) {
      setStatus('Enter your email address first, then request password reset.');
      email.focus();
      return;
    }

    setStatus('Password reset is not enabled for this demo project yet.', true);
  });

  document.getElementById('register-demo').addEventListener('click', async () => {
    const demoCustomer = {
      role: 'customer',
      name: 'New Customer',
      email: 'newcustomer@autocare.lk',
      password: 'customer123',
      phone: '+94 77 000 1111'
    };

    try {
      await window.AutoCareApi.register(demoCustomer);
      setRole('customer');
      email.value = demoCustomer.email;
      password.value = demoCustomer.password;
      setStatus('Demo customer account is ready. Click login.', true);
    } catch (error) {
      if (String(error.message || '').includes('already exists')) {
        setRole('customer');
        email.value = demoCustomer.email;
        password.value = demoCustomer.password;
        setStatus('Demo customer already exists. Click login.', true);
        return;
      }
      setStatus(error.message || 'Could not create demo customer.');
    }
  });

  const session = window.AutoCareApi.getSession();
  if (session?.token && ['admin', 'customer'].includes(session.role)) {
    setStatus('You are already logged in. Redirecting...', true);
    window.setTimeout(() => redirectForRole(session.role), 500);
    return;
  }

  setRole(activeRole);
});
