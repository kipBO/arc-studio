import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_HEADER_BYTES = 16 * 1024;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const BLOCKED_HEADERS = new Set(['connection', 'content-length', 'host', 'proxy-authorization', 'transfer-encoding', 'upgrade']);
//
function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split('.').map(Number);
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:') || normalized === '::' || normalized === '::1') return false;
    if (!(normalized.startsWith('2') || normalized.startsWith('3'))) return false;
    if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0:') || normalized.startsWith('2002:')) return false;
    return true;
  }
  return false;
}

function parseHeaders(input) {
  let value = input;
  if (typeof value === 'string') {
    try { value = value.trim() ? JSON.parse(value) : {}; }
    catch { throw new Error('Headers must be a JSON object of name/value pairs.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Headers must be a JSON object of name/value pairs.');
  const headers = {};
  let bytes = 0;
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = String(rawName).trim();
    const headerValue = String(rawValue);
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error(`Invalid header name: ${name.slice(0, 40)}`);
    if (BLOCKED_HEADERS.has(name.toLowerCase())) throw new Error(`The ${name} header is managed by ARC and cannot be set.`);
    if (/[\r\n]/.test(headerValue)) throw new Error(`Header ${name} contains an invalid line break.`);
    bytes += Buffer.byteLength(name) + Buffer.byteLength(headerValue);
    if (bytes > MAX_HEADER_BYTES) throw new Error('Combined request headers exceed 16 KiB.');
    headers[name] = headerValue;
  }
  return headers;
}

async function resolvePinnedAddress(hostname, timeout) {
  const family = isIP(hostname);
  let addresses;
  if (family) addresses = [{ address: hostname, family }];
  else {
    let timer;
    try {
      addresses = await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`DNS lookup timed out after ${timeout} ms.`)), timeout); })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Requests to local, private, reserved, or non-public network addresses are blocked.');
  }
  return addresses[0];
}

export async function performSafeHttpRequest({ url: rawUrl, method: rawMethod = 'GET', headers: rawHeaders = '{}', body = '', timeoutMs = 10000, maxBytes = MAX_RESPONSE_BYTES }) {
  const textUrl = String(rawUrl ?? '').trim();
  if (!textUrl || textUrl.length > 4096) throw new Error('Enter an HTTP or HTTPS URL under 4,096 characters.');
  let url;
  try { url = new URL(textUrl); }
  catch { throw new Error('Enter a valid HTTP or HTTPS URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only HTTP and HTTPS URLs without embedded credentials are allowed.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Requests to local hostnames are blocked.');
  }
  const method = String(rawMethod).toUpperCase();
  if (!ALLOWED_METHODS.has(method)) throw new Error('Choose GET, HEAD, POST, PUT, PATCH, DELETE, or OPTIONS.');
  const requestBody = String(body ?? '');
  if (Buffer.byteLength(requestBody) > MAX_REQUEST_BYTES) throw new Error('Request body exceeds 1 MiB.');
  if (['GET', 'HEAD'].includes(method) && requestBody) throw new Error(`${method} requests cannot include a body.`);
  const timeout = Math.min(30000, Math.max(1000, Number(timeoutMs) || 10000));
  const pinned = await resolvePinnedAddress(hostname, timeout);
  const headers = parseHeaders(rawHeaders);
  const responseLimit = Math.min(MAX_RESPONSE_BYTES, Math.max(1024, Number(maxBytes) || MAX_RESPONSE_BYTES));
  const transport = url.protocol === 'https:' ? https : http;
  const requestOptions = {
    method,
    headers,
    timeout,
    lookup: (_host, options, callback) => {
      if (options?.all) callback(null, [pinned]);
      else callback(null, pinned.address, pinned.family);
    }
  };

  return new Promise((resolve, reject) => {
    const request = transport.request(url, requestOptions, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > responseLimit) {
          request.destroy(new Error(`Response body exceeds the ${responseLimit.toLocaleString()} byte limit.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        const responseHeaders = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value ?? '']));
        let json = null;
        let parseError = '';
        if (/\bjson\b/i.test(String(response.headers['content-type'] || ''))) {
          try { json = JSON.parse(responseBody); }
          catch { parseError = 'Response advertised JSON but could not be parsed.'; }
        }
        resolve({
          status: response.statusCode || 0,
          ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300,
          body: responseBody,
          headers: responseHeaders,
          json,
          error: response.statusCode >= 300 && response.statusCode < 400
            ? 'Redirect received. Redirects are disabled, validate the destination before making another request.'
            : parseError
        });
      });
    });
    request.setTimeout(timeout, () => request.destroy(new Error(`Request timed out after ${timeout} ms.`)));
    request.on('error', reject);
    if (requestBody) request.write(requestBody);
    request.end();
  });
}
//
export async function downloadSafeHttpFile(rawUrl, { timeoutMs = 20000, maxBytes = MAX_DOWNLOAD_BYTES } = {}) {
  const textUrl = String(rawUrl ?? '').trim();
  if (!textUrl || textUrl.length > 4096) throw new Error('Enter an HTTP or HTTPS attachment URL under 4,096 characters.');
  let url;
  try { url = new URL(textUrl); }
  catch { throw new Error('Enter a valid HTTP or HTTPS attachment URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only HTTP and HTTPS attachment URLs without embedded credentials are allowed.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Attachments from local hostnames are blocked.');
  }
  const timeout = Math.min(30000, Math.max(1000, Number(timeoutMs) || 20000));
  const limit = Math.min(MAX_DOWNLOAD_BYTES, Math.max(1, Number(maxBytes) || MAX_DOWNLOAD_BYTES));
  const pinned = await resolvePinnedAddress(hostname, timeout);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.get(url, {
      timeout,
      lookup: (_host, options, callback) => {
        if (options?.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      }
    }, (response) => {
      const status = response.statusCode || 0;
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(status >= 300 && status < 400
          ? 'Attachment URL redirected. Use a direct public file URL instead.'
          : `Attachment download failed with HTTP ${status}.`));
        return;
      }
      const declaredLength = Number(response.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > limit) {
        response.destroy();
        reject(new Error(`Attachment exceeds the ${Math.floor(limit / 1024 / 1024)} MiB download limit.`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) {
          response.destroy(new Error(`Attachment exceeds the ${Math.floor(limit / 1024 / 1024)} MiB download limit.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('Attachment download ended before the file was complete.')));
      response.on('end', () => {
        if (!size) return reject(new Error('The attachment URL returned an empty file.'));
        resolve({ bytes: Buffer.concat(chunks), contentType: String(response.headers['content-type'] || 'application/octet-stream').split(';', 1)[0].slice(0, 127) });
      });
    });
    request.setTimeout(timeout, () => request.destroy(new Error(`Attachment download timed out after ${timeout} ms.`)));
    request.on('error', reject);
  });
}
