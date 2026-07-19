(function () {
  const sessionKey = 'autocare-session';
  const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

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

    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...options,
        credentials: options.credentials || 'same-origin',
        headers
      });
    } catch (error) {
      throw new Error('Cannot connect to the AutoCare server. Open http://localhost:3000/login.html and make sure the server is running.');
    }

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : payload.message;
      throw new Error(message || 'Request failed.');
    }

    return payload;
  }

  async function requestBlob(path, options = {}) {
    const session = getSession();
    const headers = { ...(options.headers || {}) };

    if (session?.token) {
      headers.Authorization = `Bearer ${session.token}`;
    }

    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...options,
        credentials: options.credentials || 'same-origin',
        headers
      });
    } catch (error) {
      throw new Error('Cannot connect to the AutoCare server. Make sure the server is running.');
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
      const message = typeof payload === 'string' ? payload : payload.message;
      throw new Error(message || 'File download failed.');
    }

    return response.blob();
  }

  window.AutoCareApi = {
    getSession,
    request,
    requestBlob,
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
      fetch(`${apiBase}/api/auth/logout`, {
        method: 'POST',
        credentials: window.location.protocol === 'file:' ? 'include' : 'same-origin',
        keepalive: true
      }).finally(() => {
        localStorage.removeItem(sessionKey);
        window.location.href = 'index.html';
      });
    }
  };
})();
