export function xhrJson(url, { method = 'GET', headers = {}, body, onUploadProgress } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onUploadProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener('load', () => {
      let data = {};
      try { data = JSON.parse(request.responseText || '{}'); } catch {}
      resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, data });
    });
    request.addEventListener('error', () => reject(new Error('The server could not be reached. Check the connection and try again.')));
    request.addEventListener('abort', () => reject(new Error('The upload was cancelled.')));
    request.send(body ?? null);
  });
}
