(function () {
  const sessionKey = 'autocare-session';

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(sessionKey));
    } catch (error) {
      return null;
    }
  }

  async function request(path, options = {}) {
    const session = getSession();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (session?.token) {
      headers.Authorization = `Bearer ${session.token}`;
    }

    const response = await fetch(path, {
      ...options,
      credentials: options.credentials || 'same-origin',
      headers
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : payload.message;
      throw new Error(message || 'Request failed.');
    }

    return payload;
  }

  window.AutoCareApi = {
    getSession,
    request,
    login(credentials) {
      return request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      });
    },
    register(data) {
      return request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    logout() {
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true
      }).finally(() => {
        localStorage.removeItem(sessionKey);
        window.location.href = 'index.html';
      });
    }
  };
})();
