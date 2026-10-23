import { downloadSafeHttpFile, performSafeHttpRequest } from '../../SafeHttpRequest.js';

const RETRYABLE_STATUSES = new Set([408, 425, 429]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
const NETWORK_NODE_TYPES = new Set(['action_http_download', 'action_web_fetch', 'action_web_retry']);
//
export function isNetworkNodeType(type) {
  return NETWORK_NODE_TYPES.has(type);
}

function waitForRetry(ms, signal) {
  if (signal?.aborted) {
    return Promise.reject(Object.assign(new Error('Graph execution cancelled.'), { name: 'AbortError' }));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);

    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(Object.assign(new Error('Graph execution cancelled.'), { name: 'AbortError' }));
    }

    signal?.addEventListener('abort', abort, { once: true });
  });
}

function writeOutputs(setOutput, values) {
  for (const [pinId, value] of Object.entries(values)) setOutput(pinId, value);
}

function getRequestFailureOutputs(error, attempts, retryEnabled) {
  return {
    status: 0,
    ok: false,
    body: '',
    headers: '{}',
    json: null,
    ...(retryEnabled ? { attempts: attempts || 1 } : {}),
    error: error.message || 'HTTP request failed.'
  };
}

function getRetryDelay(response, baseDelayMs, attempt) {
  let waitMs = Math.min(30000, baseDelayMs * (2 ** (attempt - 1)));
  const retryAfterHeader = String(response?.headers?.['retry-after'] || '').trim();
  const retryAfterSeconds = Number(retryAfterHeader);
  const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
    ? retryAfterSeconds * 1000
    : Number.isFinite(Date.parse(retryAfterHeader)) ? Date.parse(retryAfterHeader) - Date.now() : 0;
  if (retryAfterMs > 0) waitMs = Math.min(30000, Math.max(waitMs, retryAfterMs));
  return waitMs;
}

async function executeDownload(node, { resolveInput, setOutput, context, log }, downloadFile) {
  const clearOutputs = (error = '') => writeOutputs(setOutput, {
    file: null,
    filename: '',
    content_type: '',
    byte_size: 0,
    error
  });

  if (context.mock) {
    clearOutputs('HTTP downloads are disabled in the Offline Simulator.');
    log('[HTTP Download File] Skipped in Offline Simulator.');
    return true;
  }

  try {
    const downloaded = await downloadFile(resolveInput('url', ''), {
      userAgent: resolveInput('user_agent', ''),
      timeoutMs: resolveInput('timeout_ms', 20000),
      maxBytes: resolveInput('max_bytes', 20971520)
    });
    writeOutputs(setOutput, {
      file: {
        filename: downloaded.filename,
        contentType: downloaded.contentType,
        data: downloaded.bytes.toString('base64')
      },
      filename: downloaded.filename,
      content_type: downloaded.contentType,
      byte_size: downloaded.bytes.length,
      error: ''
    });
    log(`[HTTP Download File] Downloaded ${downloaded.filename} (${downloaded.bytes.length.toLocaleString()} bytes, ${downloaded.contentType}).`);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const message = error.message || 'File download failed.';
    clearOutputs(message);
    log(`[HTTP Download File] Failed: ${message}`);
  }
  return true;
}

async function executeRequest(node, { resolveInput, setOutput, context, log }, request, wait) {
  const retryEnabled = node.type === 'action_web_retry';
  const method = String(resolveInput('method', 'GET')).toUpperCase();
  if (context.mock) {
    writeOutputs(setOutput, {
      status: 0,
      ok: false,
      body: '',
      headers: '{}',
      json: null,
      ...(retryEnabled ? { attempts: 0 } : {}),
      error: 'HTTP requests are disabled in the Offline Simulator.'
    });
    log('[HTTP Request] Skipped in Offline Simulator.');
    return true;
  }

  let attempts = 0;
  try {
    const maxAttempts = retryEnabled ? Math.max(1, Math.min(5, Math.trunc(Number(resolveInput('max_attempts', 3)) || 3))) : 1;
    const retryUnsafeMethods = retryEnabled && Boolean(resolveInput('retry_non_idempotent', false));
    const mayRetry = IDEMPOTENT_METHODS.has(method) || retryUnsafeMethods;
    const baseDelayMs = retryEnabled ? Math.max(100, Math.min(10000, Number(resolveInput('retry_delay_ms', 500)) || 500)) : 0;
    let response = null;
    let requestError = null;
    while (attempts < maxAttempts) {
      attempts += 1;
      requestError = null;
      try {
        response = await request({
          url: resolveInput('url', ''),
          method,
          headers: resolveInput('headers', '{}'),
          userAgent: resolveInput('user_agent', ''),
          body: resolveInput('body', ''),
          timeoutMs: resolveInput('timeout_ms', 10000),
          maxBytes: resolveInput('max_bytes', 1048576)
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        requestError = error;
      }
      const retryableStatus = response && (RETRYABLE_STATUSES.has(response.status) || response.status >= 500);
      if (attempts >= maxAttempts || !mayRetry || !(requestError || retryableStatus)) break;
      const waitMs = getRetryDelay(response, baseDelayMs, attempts);
      log(`[HTTP Retry] Attempt ${attempts} failed${response ? ` with status ${response.status}` : ''}; retrying in ${waitMs}ms.`);
      await wait(waitMs, context.signal);
    }
    if (requestError) throw requestError;
    if (!response) throw new Error('HTTP request did not return a response.');

    const responseError = response.error || (!response.ok ? `HTTP ${response.status}` : '');
    writeOutputs(setOutput, {
      status: response.status,
      ok: response.ok,
      body: response.body,
      headers: JSON.stringify(response.headers),
      json: response.json,
      ...(retryEnabled ? { attempts } : {}),
      error: responseError
    });
    log(`[HTTP Request] ${method} completed with status ${response.status}${responseError ? ` (${responseError})` : ''}${retryEnabled ? ` after ${attempts} attempt${attempts === 1 ? '' : 's'}` : ''}`);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    writeOutputs(setOutput, getRequestFailureOutputs(error, attempts, retryEnabled));
    log(`[HTTP Request] ${method} failed: ${error.message || 'HTTP request failed.'}`);
  }
  return true;
}

export async function executeNetworkNode(node, runtime, dependencies = {}) {
  if (!isNetworkNodeType(node?.type)) return false;
  const request = dependencies.performSafeHttpRequest || performSafeHttpRequest;
  const downloadFile = dependencies.downloadSafeHttpFile || downloadSafeHttpFile;
  const wait = dependencies.waitForRetry || waitForRetry;
  if (node.type === 'action_http_download') {
    return executeDownload(node, runtime, downloadFile);
  }
  return executeRequest(node, runtime, request, wait);
}
