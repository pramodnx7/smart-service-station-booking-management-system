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
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

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
    const headers = { ...(options.headers || {}) };

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

  function optimizeProfileImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        reject(new Error('Choose a JPG, PNG or WebP image.'));
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error('The selected image must be smaller than 8MB.'));
        return;
      }
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        const maximum = 512;
        const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/jpeg', .82));
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('The selected image could not be opened.'));
      };
      image.src = objectUrl;
    });
  }

  function displayAvatar(avatar, image, initials) {
    if (!image || !initials) return;
    image.hidden = !avatar;
    initials.hidden = Boolean(avatar);
    if (avatar) image.src = avatar;
    else image.removeAttribute('src');
  }

  window.AutoCareApi = {
    getSession,
    displayAvatar,
    optimizeProfileImage,
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
