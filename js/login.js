document.addEventListener('DOMContentLoaded', () => {
  const sessionKey = 'autocare-session';
  const registeredUsersKey = 'autocare-demo-users';
  const form = document.getElementById('login-form');
  const status = document.getElementById('form-status');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const roleButtons = Array.from(document.querySelectorAll('[data-role]'));
  let activeRole = 'admin';

  function setStatus(message, isSuccess = false) {
    status.textContent = message;
    status.classList.toggle('is-success', isSuccess);
  }

  function updatePlaceholder() {
    email.placeholder = activeRole === 'admin' ? 'admin@autocare.lk' : 'customer@autocare.lk';
  }

  roleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeRole = button.dataset.role;
      roleButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      setStatus('');
      updatePlaceholder();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

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
      window.setTimeout(() => {
        window.location.href = result.user.role === 'admin' ? 'admin-dashboard.html' : 'customer-dashboard.html';
      }, 450);
    } catch (error) {
      setStatus(error.message || 'Login failed. Check that the backend server is running.');
    }
  });

  document.getElementById('forgot-password').addEventListener('click', () => {
    if (!email.value.trim()) {
      setStatus('Enter your email address first, then request password reset.');
      email.focus();
      return;
    }

    setStatus('Password reset request created for demo mode.', true);
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
      activeRole = 'customer';
      roleButtons.forEach((item) => item.classList.toggle('is-active', item.dataset.role === 'customer'));
      email.value = demoCustomer.email;
      password.value = demoCustomer.password;
      updatePlaceholder();
      setStatus('Demo customer account is ready. Click Login.', true);
    } catch (error) {
      if (error.message.includes('already exists')) {
        activeRole = 'customer';
        roleButtons.forEach((item) => item.classList.toggle('is-active', item.dataset.role === 'customer'));
        email.value = demoCustomer.email;
        password.value = demoCustomer.password;
        updatePlaceholder();
        setStatus('Demo customer already exists. Click Login.', true);
        return;
      }
      setStatus(error.message || 'Could not create demo customer.');
    }
  });

  const existingSession = localStorage.getItem(sessionKey);
  if (existingSession) {
    try {
      const session = JSON.parse(existingSession);
      if (!session.token) {
        localStorage.removeItem(sessionKey);
        return;
      }
      setStatus('You are already logged in. Redirecting...', true);
      window.setTimeout(() => {
        window.location.href = session.role === 'admin' ? 'admin-dashboard.html' : 'customer-dashboard.html';
      }, 650);
    } catch (error) {
      localStorage.removeItem(sessionKey);
    }
  }

  updatePlaceholder();
});
