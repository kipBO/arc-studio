import { AsyncLocalStorage } from 'node:async_hooks';
//
export const botManagerContext = new AsyncLocalStorage();

export function createBotManagerProxy(fallback) {
  return new Proxy({}, {
    get(_target, property) {
      const manager = botManagerContext.getStore() || fallback;
      const value = manager[property];
      return typeof value === 'function' ? value.bind(manager) : value;
    },
    set(_target, property, value) {
      const manager = botManagerContext.getStore() || fallback;
      manager[property] = value;
      return true;
    }
  });
}
