import studioPackage from '../../package.json';
import { compareArcVersions } from './appUpdates.js';
//
class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(listener);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    if (this.events.has(event)) {
      this.events.get(event).delete(listener);
    }
  }

  emit(event, data) {
    if (this.events.has(event)) {
      for (const listener of this.events.get(event)) {
        try {
          listener(data);
        } catch (err) {
          console.error(`[ArcEvent Error in "${event}"]:`, err);
        }
      }
    }
  }
}

export const arcEvents = new EventEmitter();

export class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.customNodes = new Map();
    this.customTools = new Map();
  }

  /**
   * Register a user plugin into ARC Studio
   * @param {object} plugin
   * @param {string} plugin.id
   * @param {string} plugin.name
   * @param {string} plugin.version
   * @param {string} [plugin.author]
   * @param {Function} [plugin.install]
   */
  register(plugin) {
    if (!plugin || !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(plugin.id || '')) throw new Error('Plugin IDs must be 2–63 lowercase letters, numbers, dots, or hyphens.');
    if (!String(plugin.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(plugin.version || '')) {
      throw new Error('Plugins need a name and a SemVer version.');
    }
    if (typeof plugin.install !== 'function') throw new Error('Plugin must provide an install(api) function.');
    if (typeof plugin.minArcStudioVersion !== 'string' || !plugin.minArcStudioVersion.trim()) throw new Error(`Plugin ${plugin.id} must declare minArcStudioVersion.`);
    const minArcStudioVersion = plugin.minArcStudioVersion.trim();
    const compatibility = compareArcVersions(studioPackage.version, minArcStudioVersion);
    if (compatibility === null) throw new Error(`Plugin ${plugin.id} declares an invalid minArcStudioVersion.`);
    if (compatibility < 0) throw new Error(`Plugin ${plugin.name} requires ARC Studio ${minArcStudioVersion} or newer. This build is ${studioPackage.version}.`);
    if (this.plugins.has(plugin.id)) throw new Error(`Plugin ${plugin.id} is already registered.`);

    const registration = { plugin: { ...plugin, minArcStudioVersion }, cleanup: [], nodes: new Set(), tools: new Set(), status: 'loading' };
    this.plugins.set(plugin.id, registration);
    const ensureActive = () => {
      if (registration.status === 'removed') throw new Error(`Plugin ${plugin.id} has been unloaded.`);
    };
    const subscribe = (event, listener) => {
      ensureActive();
      if (typeof event !== 'string' || typeof listener !== 'function') throw new TypeError('Event subscriptions need an event name and listener function.');
      const dispose = arcEvents.on(event, listener);
      let subscribed = true;
      const cleanup = () => {
        if (!subscribed) return;
        subscribed = false;
        dispose();
        const index = registration.cleanup.indexOf(cleanup);
        if (index >= 0) registration.cleanup.splice(index, 1);
      };
      registration.cleanup.push(cleanup);
      return cleanup;
    };
    const namespace = (localId) => {
      ensureActive();
      const value = String(localId || '');
      if (!/^[a-z][a-z0-9_-]{0,47}$/i.test(value)) throw new Error('Extension IDs must start with a letter and use only letters, numbers, underscores, or hyphens.');
      return `${plugin.id}:${value}`;
    };
    const api = Object.freeze({
      version: '1.0.0',
      events: Object.freeze({ on: subscribe, emit: (event, payload) => { ensureActive(); arcEvents.emit(event, payload); } }),
      on: subscribe,
      registerNode: (nodeDef) => { ensureActive(); return this.registerCustomNode(plugin.id, nodeDef, registration, namespace); },
      registerTool: (toolDef) => { ensureActive(); return this.registerCustomTool(plugin.id, toolDef, registration, namespace); },
      notify: (toast) => { ensureActive(); arcEvents.emit('toast:notify', toast); }
    });

    try {
      const dispose = plugin.install(api);
      if (typeof dispose === 'function') registration.cleanup.push(dispose);
      registration.status = 'active';
      arcEvents.emit('plugin:registered', this.describe(plugin.id));
      console.log(`[Arc Studio Plugin] Registered: ${plugin.name} (v${plugin.version})`);
      return this.describe(plugin.id);
    } catch (error) {
      this.unregister(plugin.id);
      throw new Error(`Could not initialize plugin ${plugin.id}: ${error.message}`);
    }
  }

  registerCustomNode(pluginId, nodeDef, registration, namespace) {
    if (!nodeDef || !String(nodeDef.label || '').trim() || !Array.isArray(nodeDef.inputs) || !Array.isArray(nodeDef.outputs)) {
      throw new Error('Nodes need a label and input/output pin arrays.');
    }
    const type = namespace(nodeDef.type);
    if (this.customNodes.has(type)) throw new Error(`Node ${type} is already registered.`);
    const allowedTypes = new Set(['exec', 'string', 'number', 'boolean', 'object', 'embed']);
    for (const pins of [nodeDef.inputs, nodeDef.outputs]) {
      const ids = new Set();
      for (const pin of pins) {
        if (typeof pin?.id !== 'string' || !/^[a-z][a-z0-9_-]{0,47}$/i.test(pin.id) || ids.has(pin.id) || !allowedTypes.has(pin.type)) throw new Error(`Node ${type} has an invalid or duplicate pin.`);
        ids.add(pin.id);
      }
    }
    this.customNodes.set(type, { ...nodeDef, type, pluginId });
    registration.nodes.add(type);
    arcEvents.emit('nodes:updated');
    return type;
  }

  registerCustomTool(pluginId, toolDef, registration, namespace) {
    if (!toolDef || !String(toolDef.label || '').trim()) throw new Error('Tools need a label.');
    const id = namespace(toolDef.id);
    if (this.customTools.has(id)) throw new Error(`Tool ${id} is already registered.`);
    this.customTools.set(id, { ...toolDef, id, pluginId });
    registration.tools.add(id);
    arcEvents.emit('tools:updated');
    return id;
  }

  unregister(pluginId) {
    const registration = this.plugins.get(pluginId);
    if (!registration) return false;
    registration.status = 'removed';
    const cleanups = [...registration.cleanup].reverse();
    registration.cleanup.length = 0;
    for (const dispose of cleanups) {
      try { dispose(); } catch (error) { console.error(`[Arc Studio Plugin] Cleanup failed for ${pluginId}:`, error); }
    }
    for (const type of registration.nodes) this.customNodes.delete(type);
    for (const id of registration.tools) this.customTools.delete(id);
    this.plugins.delete(pluginId);
    arcEvents.emit('nodes:updated');
    arcEvents.emit('tools:updated');
    arcEvents.emit('plugin:removed', { id: pluginId });
    return true;
  }

  describe(pluginId) {
    const plugin = this.plugins.get(pluginId)?.plugin;
    if (!plugin) return null;
    return { id: plugin.id, name: plugin.name, author: String(plugin.author || '').trim().slice(0, 100), version: plugin.version, minArcStudioVersion: plugin.minArcStudioVersion || '0.0.0', description: plugin.description || '', status: this.plugins.get(pluginId).status };
  }

  getPlugins() {
    return Array.from(this.plugins.keys(), (id) => this.describe(id));
  }
}

export const pluginManager = new PluginManager();

if (typeof window !== 'undefined') {
  window.__arc = {
    events: arcEvents,
    plugins: pluginManager,
    version: studioPackage.version
  };
}
