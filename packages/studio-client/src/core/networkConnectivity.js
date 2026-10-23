const CONNECTIVITY_CHECK_URL = 'https://www.gstatic.com/generate_204';
//
export async function probeInternetConnectivity(fetchImpl = globalThis.fetch, timeoutMs = 5000) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required to check connectivity.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(CONNECTIVITY_CHECK_URL, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
