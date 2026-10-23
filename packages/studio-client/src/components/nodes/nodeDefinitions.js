import { getTemplateReferences, renderTextTemplate } from '../../../../studio-server/src/engine/TemplateExpressions.js';
import { NodeCategories, NodeDefinitions } from '../../../../studio-server/src/engine/NodeRegistry.js';
//
export { NodeCategories, renderTextTemplate };

export const PinColors = {
  exec: 'var(--wire-exec)',
  variable: '#22c55e',
  arg: '#9299a6',
  string: '#c084fc',
  number: '#38bdf8',
  boolean: '#f87171',
  object: '#fbbf24',
  array: '#fb923c',
  embed: '#f472b6'
};

export const MAX_NODE_ARGUMENTS = 50;

export function getNodeArgumentPins(node, baseInputs = [], connections = []) {
  const excluded = ['function_input', 'function_return', 'function_call', 'variable_get'];
  if (!node || node.type.startsWith('event_') || excluded.includes(node.type) || node.type === 'data_permission_overwrites') return [];
  if (BuiltInNodeDefinitions.some((definition) => definition.type === node.type && definition.pluginAdapter)) return [];
  if (!['build_embed', 'build_modal', 'format_text', 'data_regex'].includes(node.type) && !baseInputs.some((pin) => pin.type === 'string')) return [];
  const highestConnectedArgument = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const match = /^arg_(\d+)$/.exec(connection.targetPinId);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const count = Math.min(MAX_NODE_ARGUMENTS, Math.max(1, highestConnectedArgument + 1));
  return Array.from({ length: count }, (_, index) => ({ id: `arg_${index + 1}`, label: `arg${index + 1}`, type: 'arg', defaultValue: '' }));
}

export function getArrayCreatePins(node, connections = []) {
  if (node?.type !== 'data_array_create') return [];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const match = /^item_(\d+)$/.exec(connection.targetPinId);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const stored = Object.keys(node.data || {}).reduce((highest, key) => Math.max(highest, Number(/^item_(\d+)$/.exec(key)?.[1]) || 0), 0);
  const count = Math.min(50, Math.max(1, highestConnected + 1, stored));
  return Array.from({ length: count }, (_, index) => ({ id: `item_${index + 1}`, label: `Item ${index + 1}`, type: 'arg', defaultValue: null }));
}

export function getArrayCombinePins(node, connections = []) {
  if (node?.type !== 'data_array_concat') return [];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    return Math.max(highest, Number(/^array_(\d+)$/.exec(connection.targetPinId)?.[1]) || 0);
  }, 0);
  const count = Math.min(50, Math.max(2, highestConnected + 1));
  const pins = Array.from({ length: count }, (_, index) => ({ id: `array_${index + 1}`, label: `Array ${index + 1}`, type: 'object', defaultValue: [] }));
  if (connections.some((connection) => connection.targetNodeId === node.id && ['array_a', 'array_b'].includes(connection.targetPinId))) {
    pins.push({ id: 'array_a', label: 'Array A', type: 'object', defaultValue: [] }, { id: 'array_b', label: 'Array B', type: 'object', defaultValue: [] });
  }
  return pins;
}

export function getArrayAppendPins(node, connections = []) {
  if (node?.type !== 'data_array_append') return [];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    return Math.max(highest, Number(/^item_(\d+)$/.exec(connection.targetPinId)?.[1]) || 0);
  }, 0);
  const stored = Object.keys(node.data || {}).reduce((highest, key) => Math.max(highest, Number(/^item_(\d+)$/.exec(key)?.[1]) || 0), 0);
  const pins = Array.from({ length: Math.min(MAX_NODE_ARGUMENTS, Math.max(1, highestConnected + 1, stored)) }, (_, index) => ({ id: `item_${index + 1}`, label: `Item ${index + 1}`, type: 'arg', defaultValue: undefined }));
  if (connections.some((connection) => connection.targetNodeId === node.id && connection.targetPinId === 'value')) {
    pins.push({ id: 'value', label: 'Item', type: 'arg', defaultValue: undefined });
  }
  return pins;
}

export function getMathListPins(node, connections = []) {
  if (!['math_sum', 'math_average'].includes(node?.type)) return [];
  const pinIds = ['a', 'b', 'c', 'd'];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const index = pinIds.indexOf(connection.targetPinId);
    const extra = /^value_(\d+)$/.exec(connection.targetPinId);
    return Math.max(highest, index >= 0 ? index + 1 : extra ? Number(extra[1]) : 0);
  }, 0);
  const count = Math.min(50, Math.max(2, highestConnected + 1));
  return Array.from({ length: count }, (_, index) => ({ id: pinIds[index] || `value_${index + 1}`, label: index < 4 ? String.fromCharCode(65 + index) : `Value ${index + 1}`, type: 'number', defaultValue: 0 }));
}

export function getSwitchCasePins(node, connections = [], direction = 'inputs') {
  if (node?.type !== 'branch_switch') return [];
  const storedCount = Number(node.data?.caseCount) || 0;
  const storedCases = Object.keys(node.data || {}).reduce((highest, key) => Math.max(highest, Number(/^case_(\d+)$/.exec(key)?.[1]) || 0), 0);
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId === node.id) return Math.max(highest, Number(/^case_(\d+)$/.exec(connection.targetPinId)?.[1]) || 0);
    if (connection.sourceNodeId === node.id) return Math.max(highest, Number(/^case_(\d+)_exec$/.exec(connection.sourcePinId)?.[1]) || 0);
    return highest;
  }, 0);
  const count = Math.min(50, Math.max(2, storedCount, storedCases, highestConnected + 1));
  return Array.from({ length: count }, (_, index) => direction === 'outputs'
    ? { id: `case_${index + 1}_exec`, label: `Case ${index + 1}`, type: 'exec' }
    : { id: `case_${index + 1}`, label: `Case ${index + 1}`, type: 'string', defaultValue: '' });
}

export function getPermissionOverwritePins(node, connections = []) {
  if (node?.type !== 'data_permission_overwrites') return [];
  const highestConnectedTarget = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const match = /^target_id_(\d+)$/.exec(connection.targetPinId);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const existingTargetCount = Object.keys(node.data || {}).reduce((highest, key) => Math.max(highest, Number(/^target_id_(\d+)$/.exec(key)?.[1]) || 0), 0);
  const count = Math.min(100, Math.max(1, Number(node.data?.overwriteCount) || 0, existingTargetCount, highestConnectedTarget + 1));
  return Array.from({ length: count }, (_, index) => ({ id: `target_id_${index + 1}`, label: `Target ID ${index + 1}`, type: 'string', defaultValue: '' }));
}

export function getTextTemplateSlots(template) {
  const slots = new Set();
  const pattern = /(\\)?(\{\{\s*([^{}]+?)\s*\}\})/g;
  for (const match of String(template ?? '').matchAll(pattern)) {
    if (match[1]) continue;
    for (const reference of getTemplateReferences(match[3])) if (!reference.toLowerCase().startsWith('e_')) slots.add(reference);
  }
  return [...slots];
}

export function getNodeTemplateInputPins(node, inputs = [], variables = [], connections = []) {
  if (!node || !Array.isArray(inputs)) return [];
  const knownVariables = new Set(variables.map((variable) => variable.name?.toLowerCase()).filter(Boolean));
  const connectedInputs = new Set(connections.filter((wire) => wire.targetNodeId === node.id).map((wire) => wire.targetPinId));
  const slots = new Set();
  for (const pin of inputs) {
    if (!['string', 'number', 'arg'].includes(pin.type) || pin.id.startsWith('arg_') || pin.id.startsWith('slot_') || connectedInputs.has(pin.id)) continue;
    const value = node.data?.[pin.id];
    if (typeof value !== 'string') continue;
    for (const name of getTextTemplateSlots(value)) {
      if (knownVariables.has(name.toLowerCase()) || /^arg\d+$/i.test(name)) continue;
      slots.add(name);
    }
  }
  return [...slots].map((name) => ({ id: `slot_${name}`, label: name, type: 'arg', defaultValue: '' }));
}

export function createDefaultNodeData(type) {
  const definition = BuiltInNodeDefinitions.find((candidate) => candidate.type === type);
  const editorDefaults = Object.fromEntries((definition?.editorControls || [])
    .filter((control) => control.key && Object.hasOwn(control, 'defaultValue'))
    .map((control) => [control.key, control.defaultValue]));
  const nodeDefaults = definition?.defaultData || {};
  if (type === 'function_input') {
    return { ...nodeDefaults, paramId: `param_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` };
  }
  const pluginDefinition = definition?.pluginAdapter ? definition : null;
  if (pluginDefinition) return {
    ...Object.fromEntries(pluginDefinition.inputs.filter((pin) => pin.type !== 'exec' && pin.defaultValue !== undefined).map((pin) => [pin.id, pin.defaultValue])),
    ...nodeDefaults,
    ...editorDefaults
  };
  return { ...nodeDefaults, ...editorDefaults };
}

const bundledNodeDefinitions = Object.values(NodeDefinitions);
export const BundledNodeTypes = new Set(bundledNodeDefinitions.map((definition) => definition.type));
export const BuiltInNodeDefinitions = [...bundledNodeDefinitions];

export function setWorkspaceNodeDefinitions(definitions) {
  if (definitions === null) {
    adapterNodeTypes.clear();
    BuiltInNodeDefinitions.splice(0, BuiltInNodeDefinitions.length, ...bundledNodeDefinitions);
    return;
  }
  if (!Array.isArray(definitions)) throw new TypeError('Workspace node definitions must be an array.');
  const bundledByType = new Map(bundledNodeDefinitions.map((definition) => [definition.type, definition]));
  const normalized = definitions.map((definition) => {
    if (!definition || typeof definition.type !== 'string' || !definition.type.trim()
      || !Array.isArray(definition.inputs) || !Array.isArray(definition.outputs)) {
      throw new TypeError('Workspace returned an invalid node definition.');
    }
    const localDefinition = bundledByType.get(definition.type);
    const requiresGenericEditor = !localDefinition
      || JSON.stringify(localDefinition.inputs) !== JSON.stringify(definition.inputs);
    return {
      ...localDefinition,
      ...definition,
      description: definition.description || localDefinition?.description || 'Description unavailable',
      requiresGenericEditor,
      editorOnlyInputs: requiresGenericEditor ? definition.inputs : []
    };
  });
  adapterNodeTypes.clear();
  BuiltInNodeDefinitions.splice(0, BuiltInNodeDefinitions.length, ...normalized);
}

export function getNodeRegistryDefinitions(registry) {
  if (registry?.schemaVersion !== undefined && registry.schemaVersion !== 1) return null;
  const definitions = Array.isArray(registry?.definitions)
    ? registry.definitions
    : registry?.definitions && typeof registry.definitions === 'object'
      ? Object.values(registry.definitions)
      : null;
  if (!definitions?.length) return null;
  if (definitions.some((definition) => !definition || typeof definition.type !== 'string'
    || !Array.isArray(definition.inputs) || !Array.isArray(definition.outputs)
    || [...definition.inputs, ...definition.outputs].some((pin) => !pin || typeof pin.id !== 'string' || typeof pin.label !== 'string' || typeof pin.type !== 'string'))) {
    throw new TypeError('Workspace returned an invalid node registry.');
  }
  return definitions;
}

export function getAvailableNodeDefinitions(definitions = BuiltInNodeDefinitions, supportedTypes = null) {
  if (!supportedTypes) return [...definitions];
  return definitions.filter((definition) => definition.pluginAdapter || supportedTypes.has(definition.type));
}

export function isNodeTypeSupported(type, supportedTypes = null) {
  if (!supportedTypes || supportedTypes.has(type)) return true;
  return BuiltInNodeDefinitions.some((definition) => definition.type === type && definition.pluginAdapter);
}
//
const NODE_NEW_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const NODE_NEW_SEEN_DURATION = 10 * 60 * 1000;
function nodeNewSeenKey(userKey = 'anonymous') { return `arc_new_nodes_seen_v1:${encodeURIComponent(String(userKey || 'anonymous'))}`; }
function readNodeNewSeen(userKey) {
  try { const value = JSON.parse(localStorage.getItem(nodeNewSeenKey(userKey)) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function nodeDefinitionCreatedAt(definition) { return Date.parse(definition?.createdAt || definition?.introducedAt || ''); }
function nodeSeenId(definition) { return `${definition?.type || ''}@${definition?.createdAt || definition?.introducedAt || ''}`; }
export function getVisibleNewNodeDefinitions(definitions = [], userKey = 'anonymous', now = Date.now()) {
  const seen = readNodeNewSeen(userKey);
  return definitions.filter((definition) => {
    const createdAt = nodeDefinitionCreatedAt(definition); const age = now - createdAt;
    if (!Number.isFinite(createdAt) || age < 0 || age >= NODE_NEW_MAX_AGE) return false;
    const firstSeenAt = Number(seen[nodeSeenId(definition)]);
    return !Number.isFinite(firstSeenAt) || now - firstSeenAt < NODE_NEW_SEEN_DURATION;
  }).sort((a, b) => nodeDefinitionCreatedAt(b) - nodeDefinitionCreatedAt(a) || a.label.localeCompare(b.label)).slice(0, 5);
}
export function markNewNodeDefinitionsSeen(definitions = [], userKey = 'anonymous', now = Date.now()) {
  const seen = readNodeNewSeen(userKey); let changed = false;
  for (const definition of definitions) {
    const createdAt = nodeDefinitionCreatedAt(definition); const age = now - createdAt;
    const key = nodeSeenId(definition);
    if (Number.isFinite(createdAt) && age >= 0 && age < NODE_NEW_MAX_AGE && !Number.isFinite(Number(seen[key]))) { seen[key] = now; changed = true; }
  }
  if (changed) { try { localStorage.setItem(nodeNewSeenKey(userKey), JSON.stringify(seen)); } catch {} }
}
export function isNodeDefinitionNew(definition, now = Date.now(), userKey = 'anonymous') {
  const createdAt = nodeDefinitionCreatedAt(definition);
  const age = now - createdAt;
  if (!Number.isFinite(createdAt) || age < 0 || age >= NODE_NEW_MAX_AGE) return false;
  const firstSeenAt = Number(readNodeNewSeen(userKey)[nodeSeenId(definition)]);
  return !Number.isFinite(firstSeenAt) || now - firstSeenAt < NODE_NEW_SEEN_DURATION;
}

const adapterNodeTypes = new Set();
export function registerPluginNodeDefinitions(plugins = []) {
  for (let index = BuiltInNodeDefinitions.length - 1; index >= 0; index -= 1) {
    if (adapterNodeTypes.has(BuiltInNodeDefinitions[index].type)) BuiltInNodeDefinitions.splice(index, 1);
  }
  adapterNodeTypes.clear();
  for (const plugin of plugins) {
    if (!['wasm-adapter', 'host-adapter'].includes(plugin?.kind) || !Array.isArray(plugin.nodes)) continue;
    for (const node of plugin.nodes) {
      if (!node || typeof node.type !== 'string' || !node.type.startsWith(`${plugin.id}.`)) continue;
      const existing = BuiltInNodeDefinitions.find((definition) => definition.type === node.type);
      if (existing) {
        if (existing.description === 'Description unavailable' && node.description) existing.description = node.description;
        existing.pluginAdapter = true;
        existing.pluginId = plugin.id;
        existing.pluginName = plugin.name || plugin.id;
        existing.category = String(node.category || existing.category || plugin.name || plugin.id).trim().slice(0, 48);
        adapterNodeTypes.add(node.type);
        continue;
      }
      BuiltInNodeDefinitions.push({
        ...node,
        description: node.description || 'Description unavailable',
        category: String(node.category || plugin.name || plugin.id).trim().slice(0, 48),
        pluginAdapter: true,
        pluginId: plugin.id,
        pluginName: plugin.name || plugin.id
      });
      adapterNodeTypes.add(node.type);
    }
  }
}
