export function registerAsyncEventHandler(emitter, eventName, handler, onError) {
  emitter.on(eventName, (...args) => {
    Promise.resolve()
      .then(() => handler(...args))
      .catch((error) => {
        try {
          onError(error, eventName);
        } catch (reportError) {
          console.error(`Failed to report ${eventName} event error:`, error, reportError);
        }
      });
  });
}
