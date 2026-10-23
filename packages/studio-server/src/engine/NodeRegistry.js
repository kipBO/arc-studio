import { nodeDefinitions } from './nodes/index.js';
//
export const NODE_SCHEMA_VERSION = 1;

export const NodeCategories = Object.freeze({
  EVENTS: 'Events',
  ACTIONS: 'Discord Actions',
  LOGIC: 'Logic & Flow',
  VARIABLES: 'Variables',
  VALUES: 'Values & Data',
  FUNCTIONS: 'Functions',
  CRYPTO: 'Cryptography & Security',
  MATH: 'Math',
  NETWORK: 'Web & Network'
});

export const PinTypes = Object.freeze({
  EXEC: 'exec',
  VARIABLE: 'variable',
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  ARG: 'arg',
  EMBED: 'embed',
  ANY: 'any'
});

export const NodeDefinitions = Object.fromEntries(nodeDefinitions.map((definition) => [definition.type, definition]));

const adapterNodeTypes = new Set();

export function registerAdapterNodeDefinitions(definitions = []) {
  for (const type of adapterNodeTypes) delete NodeDefinitions[type];
  adapterNodeTypes.clear();
  for (const definition of definitions) {
    if (!definition || typeof definition.type !== 'string') continue;
    const normalized = {
      ...definition,
      pluginAdapter: true,
      inputs: Array.isArray(definition.inputs) ? definition.inputs : [],
      outputs: Array.isArray(definition.outputs) ? definition.outputs : []
    };
    NodeDefinitions[normalized.type] = normalized;
    adapterNodeTypes.add(normalized.type);
  }
}
