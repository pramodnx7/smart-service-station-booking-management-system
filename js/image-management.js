(function () {
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxBytes = 5 * 1024 * 1024;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function uploader({ name, label, folder, value = '', multiple = false, optional = true, acceptPdf = false }) {
    const values = Array.isArray(value) ? value : [value].filter(Boolean);
    return `
      <div class="image-uploader full" data-image-uploader data-name="${escapeHtml(name)}" data-folder="${escapeHtml(folder)}" data-default='${escapeHtml(JSON.stringify(values))}' data-multiple="${multiple}" data-accept-pdf="${acceptPdf}">
        <span class="image-uploader__label">${escapeHtml(label)}${optional ? ' (optional)' : ''}</span>
        <label class="image-uploader__drop">
          <strong>Drop files here or choose files</strong><small>${acceptPdf ? 'JPG, PNG, WebP or PDF' : 'JPG, PNG or WebP'} · maximum 5 MB each</small>
          <input type="file" ${multiple ? 'multiple' : ''} accept="${acceptPdf ? 'image/jpeg,image/png,image/webp,application/pdf' : 'image/jpeg,image/png,image/webp'}" />
        </label>
        <div class="image-uploader__previews"></div>
        <div class="image-uploader__progress" hidden><span></span></div>
        <p class="image-uploader__error" role="alert" hidden></p>
      </div>`;
  }

  function validate(file, acceptPdf) {
    const allowed = acceptPdf ? [...imageTypes, 'application/pdf'] : imageTypes;
    if (!allowed.includes(file.type)) throw new Error('Unsupported file type. Choose JPG, PNG, WebP' + (acceptPdf ? ' or PDF.' : '.'));
    if (file.size > maxBytes) throw new Error(`${file.name} is larger than 5 MB.`);
  }

  function dataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function payload(file) {
    return dataUrl(file).then((url) => ({ fileName: file.name, mimeType: file.type, contentBase64: url.split(',')[1] }));
  }

  function requestUpload(path, body, onProgress) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', path);
      request.setRequestHeader('Content-Type', 'application/json');
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onload = () => {
        let response = {};
        try { response = JSON.parse(request.responseText || '{}'); } catch (error) { response = {}; }
        if (request.status >= 200 && request.status < 300) resolve(response);
        else reject(new Error(response.message || 'Upload failed. Please retry.'));
      };
      request.onerror = () => reject(new Error('Network error during upload. Please retry.'));
      request.send(JSON.stringify(body));
    });
  }

  async function upload(file, folder, onProgress = () => {}) {
    validate(file, false);
    return requestUpload('/api/images/upload', {
      folder,
      file: await payload(file)
    }, onProgress);
  }

  function setError(element, message = '') {
    const error = element.querySelector('.image-uploader__error');
    error.textContent = message;
    error.hidden = !message;
  }

  function renderPreviews(element) {
    const previews = element.querySelector('.image-uploader__previews');
    const selected = element._selectedFiles || [];
    const defaults = element._removedDefaults ? [] : (element._defaultUrls || []);
    previews.innerHTML = [
      ...defaults.map((url, index) => `<figure><img src="${escapeHtml(url)}" alt="Current image" data-image-viewer /><button type="button" data-remove-default="${index}">Remove</button></figure>`),
      ...selected.map((file, index) => `<figure data-file-preview="${index}"><span class="image-uploader__file">${escapeHtml(file.name)}</span><button type="button" data-remove-file="${index}">Remove</button></figure>`)
    ].join('');
    selected.forEach((file, index) => {
      if (!imageTypes.includes(file.type)) return;
      dataUrl(file).then((url) => {
        const figure = previews.querySelector(`[data-file-preview="${index}"]`);
        if (figure) figure.querySelector('.image-uploader__file').outerHTML = `<img src="${escapeHtml(url)}" alt="Selected image preview" data-image-viewer />`;
      });
    });
  }

  function enhanceOne(element) {
    if (element.dataset.enhanced) return;
    element.dataset.enhanced = 'true';
    try { element._defaultUrls = JSON.parse(element.dataset.default || '[]').filter(Boolean); } catch (error) { element._defaultUrls = []; }
    element._selectedFiles = [];
    const input = element.querySelector('input[type="file"]');
    const choose = (files) => {
      try {
        const selected = Array.from(files || []);
        selected.forEach((file) => validate(file, element.dataset.acceptPdf === 'true'));
        element._selectedFiles = element.dataset.multiple === 'true' ? selected : selected.slice(0, 1);
        element._removedDefaults = element._selectedFiles.length > 0;
        setError(element);
        renderPreviews(element);
      } catch (error) {
        input.value = '';
        setError(element, error.message);
      }
    };
    input.addEventListener('change', () => choose(input.files));
    const drop = element.querySelector('.image-uploader__drop');
    ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.remove('is-dragging'); }));
    drop.addEventListener('drop', (event) => choose(event.dataTransfer.files));
    element.addEventListener('click', (event) => {
      const fileButton = event.target.closest('[data-remove-file]');
      const defaultButton = event.target.closest('[data-remove-default]');
      if (fileButton) element._selectedFiles.splice(Number(fileButton.dataset.removeFile), 1);
      if (defaultButton) element._removedDefaults = true;
      if (fileButton || defaultButton) renderPreviews(element);
    });
    renderPreviews(element);
  }

  function enhance(root = document) {
    root.querySelectorAll('[data-image-uploader]').forEach(enhanceOne);
  }

  async function collect(form) {
    const values = {};
    const uploads = [];
    const replaced = [];
    for (const element of form.querySelectorAll('[data-image-uploader]')) {
      const name = element.dataset.name;
      const files = element._selectedFiles || [];
      const progress = element.querySelector('.image-uploader__progress');
      const progressBar = progress.querySelector('span');
      const uploadedUrls = [];
      setError(element);
      try {
        for (const file of files) {
          progress.hidden = false;
          progressBar.style.width = '0%';
          const uploaded = await requestUpload('/api/images/upload', {
            folder: element.dataset.folder,
            file: await payload(file)
          }, (percent) => { progressBar.style.width = `${percent}%`; });
          progressBar.style.width = '100%';
          uploads.push(uploaded);
          uploadedUrls.push(uploaded.url);
        }
        const defaults = element._defaultUrls || [];
        if (files.length || element._removedDefaults) replaced.push(...defaults);
        const finalUrls = files.length ? uploadedUrls : (element._removedDefaults ? [] : defaults);
        values[name] = element.dataset.multiple === 'true' ? finalUrls : (finalUrls[0] || '');
      } catch (error) {
        setError(element, error.message);
        await rollback({ uploads });
        throw error;
      } finally {
        progress.hidden = true;
      }
    }
    return { values, uploads, replaced };
  }

  async function removeStored(value) {
    if (!value || !/^https:\/\//i.test(value)) return;
    await window.AutoCareApi.request('/api/images', { method: 'DELETE', body: JSON.stringify({ path: value }) });
  }

  async function rollback(result) {
    await Promise.allSettled((result?.uploads || []).map((file) => removeStored(file.path || file.url)));
  }

  async function commit(result) {
    await Promise.allSettled((result?.replaced || []).map(removeStored));
  }

  function viewerDialog() {
    let dialog = document.getElementById('image-viewer-dialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'image-viewer-dialog';
    dialog.className = 'image-viewer';
    dialog.innerHTML = `<div class="image-viewer__toolbar"><button type="button" data-viewer-action="zoom-out">−</button><button type="button" data-viewer-action="zoom-in">+</button><button type="button" data-viewer-action="rotate">Rotate</button><a data-viewer-download download>Download</a><button type="button" data-viewer-action="close">Close</button></div><div class="image-viewer__stage"><img alt="Image preview" /></div>`;
    document.body.appendChild(dialog);
    let scale = 1;
    let rotation = 0;
    const image = dialog.querySelector('img');
    const transform = () => { image.style.transform = `scale(${scale}) rotate(${rotation}deg)`; };
    dialog.addEventListener('click', (event) => {
      const action = event.target.closest('[data-viewer-action]')?.dataset.viewerAction;
      if (action === 'zoom-in') scale = Math.min(4, scale + .25);
      if (action === 'zoom-out') scale = Math.max(.25, scale - .25);
      if (action === 'rotate') rotation += 90;
      if (action === 'close') dialog.close();
      transform();
    });
    dialog.openImage = (url, alt) => {
      scale = 1; rotation = 0; image.src = url; image.alt = alt || 'Image preview'; transform();
      const download = dialog.querySelector('[data-viewer-download]');
      download.href = url; download.download = (alt || 'service-image').replace(/[^a-z0-9.-]+/gi, '-');
      dialog.showModal();
    };
    return dialog;
  }

  document.addEventListener('click', (event) => {
    const image = event.target.closest('img[data-image-viewer]');
    if (image) viewerDialog().openImage(image.currentSrc || image.src, image.alt);
  });
  document.addEventListener('DOMContentLoaded', () => enhance());

  window.AutoCareImages = { collect, commit, enhance, rollback, upload, uploader };
})();
