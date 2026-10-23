export function waitForGatewayReady(client, timeoutMs = 0, signal) {
  if (signal?.aborted) {
    const error = new Error('Gateway wait cancelled.');
    error.name = 'AbortError';
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    let timeout;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      client.off('ready', onReady);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (connected) => {
      cleanup();
      resolve(connected);
    };
    const onReady = () => finish(true);
    const onAbort = () => {
      cleanup();
      const error = new Error('Gateway wait cancelled.');
      error.name = 'AbortError';
      reject(error);
    };

    client.on('ready', onReady);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs > 0) timeout = setTimeout(() => finish(false), timeoutMs);
  });
}
