import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dataDir } from '../storage.js';
import { NodeDefinitions, registerAdapterNodeDefinitions } from './NodeRegistry.js';
import { inspectAdapterBytes, runWasmAdapter } from './WasmAdapterRuntime.js';
import { CryptoEngine } from '../security/CryptoEngine.js';
import { serverConfig } from '../config.js';

const DEFAULT_REPOSITORY_URL = 'https://github.com/relentiousdragon/arc-plugins';
const MAX_REGISTRY_BYTES = 1024 * 1024;
const MAX_PACK_BYTES = 1024 * 1024;
const MAX_FUNCTIONS = 64;
const MAX_NODES = 128;
const MAX_CONNECTIONS = 512;
const LEGACY_MIN_ARC_VERSION = '2026.1.1.0';
const bundledAdapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../arc-plugins/adapters');
const bundledHostAdapters = loadBundledHostAdapters(bundledAdapterRoot);
const hostAdapterRuntimePromises = new Map();
const installedPath = path.join(dataDir, 'installed-plugins.json');
const settingsPath = path.join(dataDir, 'plugin-store-settings.json');
const adapterRoot = path.join(dataDir, 'plugin-adapters');
const PROJECT_PERMISSION_DEFINITIONS = new Map([...bundledHostAdapters.values()].flatMap((plugin) => plugin.permissions.map((permission) => [permission.id, permission])));
if (PROJECT_PERMISSION_DEFINITIONS.size !== [...bundledHostAdapters.values()].reduce((total, plugin) => total + plugin.permissions.length, 0)) throw new Error('Bundled host adapters declare duplicate project permission IDs.');
const BUILTIN_PLUGINS = new Map([...bundledHostAdapters].map(([id, plugin]) => [id, plugin]));
const allowedNode = (type) => type === 'function_input'
  || type === 'function_return'
  || type === 'function_call'
  || type === 'function_math'
  || type === 'format_text'
  || type === 'compare_text'
  || type.startsWith('math_')
  || type.startsWith('value_');
const registryCache = new Map();
const registryRequests = new Map();
//
function normalizeRepositoryUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); }
  catch { throw new Error('Enter an HTTPS GitHub or GitLab repository URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.port && parsed.port !== '443')) {
    throw new Error('Use a public HTTPS repository URL without credentials, query parameters, or a custom port.');
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'gitlab.com') throw new Error('Plugin repositories must be hosted on github.com or gitlab.com.');
  let parts;
  try { parts = parsed.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part)); }
  catch { throw new Error('The repository URL contains invalid path encoding.'); }
  if (parts.at(-1)?.toLowerCase().endsWith('.git')) parts[parts.length - 1] = parts.at(-1).slice(0, -4);
  const validPart = (part) => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== '.' && part !== '..';
  if (parts.length < 2 || parts.some((part) => !validPart(part)) || (host === 'github.com' && parts.length !== 2)) {
    throw new Error(host === 'github.com'
      ? 'Enter a GitHub repository URL in the form https://github.com/owner/repository.'
      : 'Enter a GitLab project URL in the form https://gitlab.com/group/project.');
  }
  const url = `https://${host}/${parts.join('/')}`;
  return { provider: host === 'github.com' ? 'github' : 'gitlab', path: parts.join('/'), url };
}

function readPluginSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return normalizeRepositoryUrl(value.repositoryUrl || DEFAULT_REPOSITORY_URL);
  } catch { return normalizeRepositoryUrl(DEFAULT_REPOSITORY_URL); }
}

function writePluginSettings(repository) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${settingsPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ repositoryUrl: repository.url }, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, settingsPath);
}

function registryUrl(repository) {
  return repository.provider === 'github'
    ? `https://raw.githubusercontent.com/${repository.path}/main/registry.json`
    : `https://gitlab.com/${repository.path}/-/raw/main/registry.json`;
}

function artifactUrl(repository, commit, filePath) {
  return repository.provider === 'github'
    ? `https://raw.githubusercontent.com/${repository.path}/${commit}/${filePath}`
    : `https://gitlab.com/${repository.path}/-/raw/${commit}/${filePath}`;
}

function sourceFileUrl(repository, commit, filePath) {
  return repository.provider === 'github'
    ? `https://github.com/${repository.path}/tree/${commit}/${filePath}`
    : `https://gitlab.com/${repository.path}/-/tree/${commit}/${filePath}`;
}

function readInstalled() {
  try {
    const saved = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    let changed = false;
    for (const plugin of Object.values(saved)) {
      if (!plugin || typeof plugin !== 'object') continue;
      if (plugin.autoUpdate === undefined) plugin.autoUpdate = true;
      if (plugin.minArcStudioVersion === undefined) { plugin.minArcStudioVersion = LEGACY_MIN_ARC_VERSION; changed = true; }
      if (plugin.sourceType === 'catalog' && !plugin.repositoryUrl) plugin.repositoryUrl = DEFAULT_REPOSITORY_URL;
      if (!plugin.installationId) { plugin.installationId = randomUUID(); changed = true; }
      if (BUILTIN_PLUGINS.has(plugin.id) && !Array.isArray(plugin.permissions)) { plugin.permissions = BUILTIN_PLUGINS.get(plugin.id).permissions; changed = true; }
      if (!plugin.sourceTrust) {
        plugin.sourceTrust = plugin.sourceType === 'builtin' ? 'bundled' : plugin.sourceType === 'local' ? 'local' : isDefaultRepository(plugin.repositoryUrl) ? 'default' : 'custom';
        changed = true;
      }
    }
    if (changed) writeInstalled(saved);
    return saved;
  } catch { return {}; }
}

function adapterDirectory(pluginId, version) {
  return path.join(adapterRoot, pluginId, version);
}

function projectSettingAad(projectDir, pluginId, fieldId) {
  return `plugin-settings:${path.basename(projectDir)}:${pluginId}:${fieldId}`;
}

function validateThirdPartyNotices(notices) {
  if (notices === undefined) return [];
  if (!Array.isArray(notices) || notices.length > 20) throw new Error('Plugin third-party notices must be a list of at most 20 entries.');
  return notices.map((item) => {
    if (!item || typeof item !== 'object' || !String(item.name || '').trim() || !String(item.license || '').trim()) throw new Error('A third-party notice needs a name and license.');
    let sourceUrl = '';
    try {
      const url = new URL(String(item.sourceUrl || ''));
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      sourceUrl = url.href;
    } catch { throw new Error('Third-party notice links must use HTTPS.'); }
    return {
      name: String(item.name).trim().slice(0, 100),
      version: String(item.version || '').slice(0, 40),
      license: String(item.license).trim().slice(0, 100),
      sourceUrl,
      notice: String(item.notice || '').slice(0, 8000)
    };
  });
}

function validatePluginSettingsSchema(schema) {
  if (schema === undefined) return [];
  if (!Array.isArray(schema) || schema.length > 40) throw new Error('Plugin settings schema must contain at most 40 fields.');
  const ids = new Set();
  return schema.map((field) => {
    if (!field || !/^[a-z][a-zA-Z0-9_]{0,47}$/.test(field.id || '') || ids.has(field.id) || !['string', 'number', 'boolean'].includes(field.type) || !String(field.label || '').trim()) throw new Error('Plugin settings contain an invalid or duplicate field.');
    ids.add(field.id);
    const normalized = {
      id: field.id,
      label: String(field.label).trim().slice(0, 80),
      type: field.type,
      secret: field.secret === true,
      required: field.required === true,
      ...(field.group ? { group: String(field.group).slice(0, 48) } : {}),
      ...(field.type === 'number' && Number.isFinite(Number(field.min)) ? { min: Number(field.min) } : {}),
      ...(field.type === 'number' && Number.isFinite(Number(field.max)) ? { max: Number(field.max) } : {})
    };
    if (field.defaultValue !== undefined && !normalized.secret) {
      if (field.type === 'number' && Number.isFinite(Number(field.defaultValue))) normalized.defaultValue = Number(field.defaultValue);
      else if (field.type === 'boolean' && typeof field.defaultValue === 'boolean') normalized.defaultValue = field.defaultValue;
      else if (field.type === 'string' && typeof field.defaultValue === 'string') normalized.defaultValue = field.defaultValue.slice(0, 512);
    }
    return normalized;
  });
}

function loadBundledHostAdapters(root) {
  const adapters = new Map();
  if (!fs.existsSync(root)) return adapters;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, entry.name);
    const manifestPath = path.join(directory, 'arc-plugin.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { throw new Error(`Bundled host adapter manifest is invalid: ${entry.name}.`); }
    if (manifest.kind !== 'host-adapter') continue;
    if (manifest.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(manifest.id || '') || manifest.id !== entry.name && manifest.id !== `arc.${entry.name}` || !String(manifest.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version || '') || !Array.isArray(manifest.nodes) || !manifest.nodes.length || !Array.isArray(manifest.permissions)) {
      throw new Error(`Bundled host adapter manifest is invalid: ${entry.name}.`);
    }
    const permissions = manifest.permissions.map((permission) => {
      if (!permission || !/^[a-z][a-z0-9.-]{1,63}$/.test(permission.id || '') || !String(permission.name || '').trim() || !String(permission.description || '').trim()) throw new Error(`Bundled host adapter ${manifest.id} declares an invalid permission.`);
      return { id: permission.id, name: String(permission.name).trim().slice(0, 100), description: String(permission.description).trim().slice(0, 400), ...(permission.required === true ? { required: true } : {}) };
    });
    if (new Set(permissions.map(({ id }) => id)).size !== permissions.length) throw new Error(`Bundled host adapter ${manifest.id} declares duplicate permissions.`);
    const nodeTypes = new Set();
    const nodes = manifest.nodes.map((node) => {
      if (!node || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/.test(node.type || '') || nodeTypes.has(node.type) || !String(node.label || '').trim() || !Array.isArray(node.inputs) || !Array.isArray(node.outputs)) throw new Error(`Bundled host adapter ${manifest.id} has an invalid node definition.`);
      if (node.requiredPermission && !permissions.some((permission) => permission.id === node.requiredPermission)) throw new Error(`Bundled host adapter ${manifest.id} references an undeclared permission.`);
      nodeTypes.add(node.type);
      return { ...node, pluginAdapter: true, pluginId: manifest.id, hostAdapter: manifest.id };
    });
    const runtime = manifest.runtime;
    if (!runtime || typeof runtime.module !== 'string' || path.basename(runtime.module) !== runtime.module || !runtime.module.endsWith('.js') || typeof runtime.execute !== 'string' || !/^[$A-Z_a-z][$\w]*$/.test(runtime.execute) || runtime.closeProject !== undefined && (typeof runtime.closeProject !== 'string' || !/^[$A-Z_a-z][$\w]*$/.test(runtime.closeProject))) {
      throw new Error(`Bundled host adapter ${manifest.id} has an invalid runtime declaration.`);
    }
    if (!fs.existsSync(path.join(directory, runtime.module)) || !fs.statSync(path.join(directory, runtime.module)).isFile()) throw new Error(`Bundled host adapter ${manifest.id} runtime file is missing.`);
    const settingsSchema = validatePluginSettingsSchema(manifest.settingsSchema);
    const plugin = {
      ...manifest,
      permissions,
      nodes,
      settingsSchema,
      tags: Array.isArray(manifest.tags) ? manifest.tags.map((tag) => String(tag).slice(0, 32)).slice(0, 12) : [],
      arcApiVersion: Number.isInteger(manifest.arcApiVersion) ? manifest.arcApiVersion : 1,
      repositoryUrl: manifest.repositoryUrl || DEFAULT_REPOSITORY_URL,
      sourceUrl: manifest.sourceUrl || `https://github.com/relentiousdragon/arc-plugins/tree/main/adapters/${entry.name}`,
      builtIn: true,
      directory
    };
    if (adapters.has(plugin.id)) throw new Error(`Duplicate bundled host adapter ID “${plugin.id}”.`);
    adapters.set(plugin.id, plugin);
  }
  return adapters;
}

function loadHostAdapterRuntime(plugin) {
  if (!hostAdapterRuntimePromises.has(plugin.id)) {
    const modulePath = path.join(plugin.directory, plugin.runtime.module);
    const promise = import(pathToFileURL(modulePath).href).catch((error) => {
      hostAdapterRuntimePromises.delete(plugin.id);
      throw new Error(`${plugin.name} runtime is unavailable: ${error.message || 'check the bundled adapter files.'}`);
    });
    hostAdapterRuntimePromises.set(plugin.id, promise);
  }
  return hostAdapterRuntimePromises.get(plugin.id);
}

function parseArcVersion(version) {
  const match = String(version || '').trim().replace(/^v/i, '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const prerelease = match[4] ? match[4].split('.') : null;
  if (prerelease?.some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))) return null;
  return { core: match.slice(1, 4).map((part) => BigInt(part)), prerelease };
}

function compareArcVersions(leftVersion, rightVersion) {
  const left = parseArcVersion(leftVersion);
  const right = parseArcVersion(rightVersion);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] > right.core[index] ? 1 : -1;
  }
  if (!left.prerelease && !right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const a = BigInt(leftPart); const b = BigInt(rightPart);
      if (a !== b) return a > b ? 1 : -1;
    } else if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    else if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function normalizedMinimumVersion(version, pluginId = 'Plugin') {
  const minimum = version ?? LEGACY_MIN_ARC_VERSION;
  if (!parseArcVersion(minimum)) throw new Error(`${pluginId} needs a valid minArcStudioVersion (SemVer).`);
  return String(minimum).replace(/^v/i, '');
}

function declaredMinimumVersion(version, pluginId = 'Plugin') {
  if (typeof version !== 'string' || !version.trim()) throw new Error(`${pluginId} must declare minArcStudioVersion.`);
  return normalizedMinimumVersion(version, pluginId);
}

function assertArcStudioCompatible(pluginId, minimumVersion) {
  const required = normalizedMinimumVersion(minimumVersion, pluginId);
  const comparison = compareArcVersions(serverConfig.version, required);
  if (comparison === null) throw new Error(`Cannot check ${pluginId} compatibility because the ARC Studio version is invalid.`);
  if (comparison < 0) throw new Error(`${pluginId} requires ARC Studio ${required} or newer. This workspace is running ${serverConfig.version}.`);
  return required;
}

function studioCompatibility(minimumVersion, pluginName = 'Plugin') {
  const required = normalizedMinimumVersion(minimumVersion, pluginName);
  const comparison = compareArcVersions(serverConfig.version, required);
  return { minArcStudioVersion: required, studioCompatible: comparison !== null && comparison >= 0, studioVersion: serverConfig.version };
}

function validateAdapterManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== 'wasm-adapter' || manifest.adapterApiVersion !== 1) {
    throw new Error('Choose a compiled ARC WebAssembly adapter manifest using adapter API version 1.');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.wasmSha256 || '')) throw new Error('The adapter manifest must include the SHA-256 digest for adapter.wasm.');
  if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(manifest.id || '') || !String(manifest.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version || '')) {
    throw new Error('The adapter needs a valid ID, name, and SemVer version.');
  }
  if (manifest.wasmArtifact !== 'adapter.wasm' || manifest.capabilities?.length || manifest.permissions?.length) throw new Error('WebAssembly adapters cannot request host permissions or capabilities.');
  if (!Array.isArray(manifest.nodes) || !manifest.nodes.length || manifest.nodes.length > 32) throw new Error('An adapter must define 1–32 nodes.');
  const nodeTypes = new Set();
  const validatePins = (pins, group) => {
    if (!Array.isArray(pins) || pins.length > 32) throw new Error(`Adapter ${group} must contain at most 32 pins.`);
    const ids = new Set();
    for (const pin of pins) {
      if (!pin || !/^[a-z][a-z0-9_]{0,47}$/.test(pin.id || '') || ids.has(pin.id) || !['string', 'number', 'boolean', 'exec'].includes(pin.type) || typeof pin.label !== 'string') throw new Error(`Adapter ${group} contains an invalid pin.`);
      if (pin.type === 'exec' && (pin.id !== 'exec' || (group === 'outputs' && pin.id !== 'exec'))) throw new Error('Execution pins must use the ID “exec”.');
      if (pin.type === 'exec' && pin.defaultValue !== undefined) throw new Error('Execution pins cannot have default values.');
      if (pin.defaultValue !== undefined && !['string', 'number', 'boolean'].includes(typeof pin.defaultValue)) throw new Error(`Adapter pin ${pin.id} has an invalid default value.`);
      ids.add(pin.id);
    }
    return pins.map((pin) => ({ id: pin.id, label: pin.label.slice(0, 80), type: pin.type, ...(pin.defaultValue !== undefined ? { defaultValue: pin.defaultValue } : {}), ...(['json', 'json-schema'].includes(pin.editor) && pin.type === 'string' ? { editor: pin.editor } : {}) }));
  };
  return {
    schemaVersion: 1,
    kind: 'wasm-adapter',
    id: manifest.id,
    name: String(manifest.name).trim().slice(0, 80),
    description: String(manifest.description || '').slice(0, 500),
    author: String(manifest.author || '').slice(0, 100),
    license: String(manifest.license || '').slice(0, 60),
    thirdPartyNotices: validateThirdPartyNotices(manifest.thirdPartyNotices),
    settingsSchema: validatePluginSettingsSchema(manifest.settingsSchema),
    version: manifest.version,
    minArcStudioVersion: declaredMinimumVersion(manifest.minArcStudioVersion, manifest.name || manifest.id),
    adapterApiVersion: 1,
    wasmArtifact: 'adapter.wasm',
    wasmSha256: manifest.wasmSha256.toLowerCase(),
    capabilities: [],
    limits: {
      inputBytes: Math.max(1, Math.min(1_048_576, Number(manifest.limits?.inputBytes) || 1_048_576)),
      outputBytes: Math.max(1024, Math.min(8_388_608, Number(manifest.limits?.outputBytes) || 5_242_880)),
      timeoutMs: Math.max(100, Math.min(10_000, Number(manifest.limits?.timeoutMs) || 5000))
    },
    nodes: manifest.nodes.map((node) => {
      if (!node || !/^[a-z0-9][a-z0-9.-]{1,95}$/.test(node.type || '')) throw new Error(`Adapter node type “${node?.type || '(missing)'}” must use lowercase letters, digits, dots, and hyphens.`);
      if (!node.type.startsWith(`${manifest.id}.`)) throw new Error(`Adapter node type “${node.type}” must start with “${manifest.id}.”.`);
      if (nodeTypes.has(node.type)) throw new Error(`Adapter node type “${node.type}” is duplicated.`);
      if (typeof node.label !== 'string' || !node.label.trim()) throw new Error(`Adapter node ${node.type} needs a label.`);
      nodeTypes.add(node.type);
      const inputs = validatePins(node.inputs, 'inputs');
      const outputs = validatePins(node.outputs, 'outputs');
      if (!inputs.some((pin) => pin.id === 'exec' && pin.type === 'exec') || !outputs.some((pin) => pin.id === 'exec' && pin.type === 'exec')) throw new Error(`Adapter node ${node.type} must have execution input and output pins.`);
      if (inputs.some((pin) => pin.type === 'exec' && pin.id !== 'exec') || outputs.some((pin) => pin.type === 'exec' && pin.id !== 'exec')) throw new Error('Adapter execution pins must be named “exec”.');
      return {
        type: node.type,
        label: node.label.trim().slice(0, 80),
        category: String(node.category || 'Plugins').slice(0, 48),
        description: String(node.description || '').slice(0, 300),
        color: /^#[0-9a-f]{6}$/i.test(node.color || '') ? node.color : '#36a981',
        inputs,
        outputs,
        pluginAdapter: true,
        pluginId: manifest.id
      };
    })
  };
}

function registerInstalledAdapters() {
  const definitions = [];
  for (const plugin of Object.values(readInstalled())) {
    if (plugin.kind === 'host-adapter' && BUILTIN_PLUGINS.has(plugin.id)) {
      const bundled = BUILTIN_PLUGINS.get(plugin.id);
      try {
        assertArcStudioCompatible(plugin.name || plugin.id, plugin.minArcStudioVersion || bundled.minArcStudioVersion);
        definitions.push(...bundled.nodes);
      } catch { /* */ }
      continue;
    }
    if (plugin.kind !== 'wasm-adapter') continue;
    const manifestPath = path.join(adapterDirectory(plugin.id, plugin.version), 'arc-plugin.json');
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const validated = validateAdapterManifest(manifest);
      assertArcStudioCompatible(validated.name, validated.minArcStudioVersion);
      definitions.push(...validated.nodes);
    } catch { /* */ }
  }
  registerAdapterNodeDefinitions(definitions);
}

registerInstalledAdapters();

function writeInstalled(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${installedPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, installedPath);
}

function normalizePermissionGrant(pluginId, requested = []) {
  if (!Array.isArray(requested) || requested.length > 16) throw new Error('Plugin permissions must be a list of at most 16 capabilities.');
  const declaredPermissions = BUILTIN_PLUGINS.get(pluginId)?.permissions || [];
  const declared = new Set(declaredPermissions.map((permission) => permission.id));
  const granted = new Set();
  for (const permission of requested) {
    if (typeof permission !== 'string' || !declared.has(permission) || granted.has(permission)) throw new Error(`Plugin “${pluginId}” requested an unsupported permission.`);
    granted.add(permission);
  }
  for (const permission of declaredPermissions) {
    if (permission.required && !granted.has(permission.id)) throw new Error(`Required plugin permission “${permission.name}” was not granted.`);
  }
  return [...granted];
}

function readProjectPermissionFile(projectDir) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(projectDir, 'plugin-permissions.json'), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function writeProjectPermissionFile(projectDir, value) {
  fs.mkdirSync(projectDir, { recursive: true, mode: 0o700 });
  const filePath = path.join(projectDir, 'plugin-permissions.json');
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function isDefaultRepository(repositoryUrl) {
  try { return normalizeRepositoryUrl(repositoryUrl).url === DEFAULT_REPOSITORY_URL; }
  catch { return false; }
}

async function readJson(url, maxBytes) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ARC-Studio-Plugin-Store' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status} while loading plugin data.`);
  const body = await readLimited(response, maxBytes);
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw new Error('GitHub returned invalid JSON for this plugin file.'); }
}

async function readLimited(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error(`Plugin data exceeds the ${maxBytes.toLocaleString()} byte limit.`);
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body[Symbol.asyncIterator]();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.next();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.return?.();
      throw new Error(`Plugin data exceeds the ${maxBytes.toLocaleString()} byte limit.`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function validateRegistry(registry, defaultRepository) {
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.plugins) || registry.plugins.length > 500) {
    throw new Error('The plugin registry must use schema version 1 and contain at most 500 entries.');
  }
  const ids = new Set();
  return registry.plugins.map((entry) => {
    if (!entry || !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(entry.id || '') || ids.has(entry.id)) throw new Error('The plugin registry contains an invalid or duplicate plugin ID.');
    if ((entry.permissions !== undefined && (!Array.isArray(entry.permissions) || entry.permissions.length)) || (entry.capabilities !== undefined && (!Array.isArray(entry.capabilities) || entry.capabilities.length)) || entry.kind) throw new Error(`Plugin ${entry.id} requests a host integration that this data-only catalogue does not support.`);
    ids.add(entry.id);
    if (!String(entry.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.version || '')) throw new Error(`Plugin ${entry.id} needs a name and valid SemVer version.`);
    if (!/^[a-f0-9]{40}$/i.test(entry.commit || '') || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) throw new Error(`Plugin ${entry.id} needs a full commit SHA and SHA-256 digest.`);
    const repository = normalizeRepositoryUrl(entry.repositoryUrl || entry.repository || defaultRepository.url);
    if (typeof entry.path !== 'string' || !entry.path.startsWith(`packs/${entry.id}/`) || !/^packs\/[a-z0-9.-]+\/[A-Za-z0-9._/-]+$/.test(entry.path) || entry.path.split('/').some((part) => part === '.' || part === '..')) {
      throw new Error(`Plugin ${entry.id} has an invalid pack path.`);
    }
    return {
      id: entry.id,
      name: String(entry.name).trim().slice(0, 80),
      version: entry.version,
      description: String(entry.description || '').slice(0, 500),
      author: String(entry.author || '').slice(0, 100),
      license: String(entry.license || '').slice(0, 60),
      thirdPartyNotices: validateThirdPartyNotices(entry.thirdPartyNotices),
      settingsSchema: validatePluginSettingsSchema(entry.settingsSchema),
      minArcStudioVersion: declaredMinimumVersion(entry.minArcStudioVersion, entry.name || entry.id),
      tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === 'string').slice(0, 12).map((tag) => tag.slice(0, 32)) : [],
      arcApiVersion: entry.arcApiVersion,
      commit: entry.commit.toLowerCase(),
      path: entry.path,
      sha256: entry.sha256.toLowerCase(),
      repositoryUrl: repository.url,
      sourceUrl: sourceFileUrl(repository, entry.commit, entry.path)
    };
  });
}

async function getRegistry(force = false) {
  const repository = readPluginSettings();
  const cached = registryCache.get(repository.url);
  if (!force && cached && Date.now() - cached.timestamp < 5 * 60 * 1000) return cached.entries;
  if (registryRequests.has(repository.url)) return registryRequests.get(repository.url);
  const request = (async () => {
    const registry = await readJson(registryUrl(repository), MAX_REGISTRY_BYTES);
    const entries = validateRegistry(registry, repository);
    registryCache.set(repository.url, { entries, timestamp: Date.now() });
    return entries;
  })();
  registryRequests.set(repository.url, request);
  try { return await request; }
  finally { registryRequests.delete(repository.url); }
}

function stableGraphId(pluginId, functionId) {
  const digest = createHash('sha256').update(`${pluginId}:${functionId}`).digest('hex').slice(0, 24);
  return `plugin_fn_${digest}`;
}

function validatePack(pack, entry) {
  if ((Array.isArray(pack.permissions) && pack.permissions.length) || (Array.isArray(pack.capabilities) && pack.capabilities.length)) throw new Error('Function graph packs cannot request host permissions or capabilities.');
  if (pack?.schemaVersion !== 1 || pack.id !== entry.id || pack.version !== entry.version || pack.arcApiVersion !== 1) {
    throw new Error('The pack metadata does not match the registry or this ARC plugin API version.');
  }
  const packMinimum = declaredMinimumVersion(pack.minArcStudioVersion, pack.name || pack.id);
  if (packMinimum !== entry.minArcStudioVersion) throw new Error('The pack minimum ARC Studio version does not match the registry entry.');
  assertArcStudioCompatible(pack.name || pack.id, packMinimum);
  if (!Array.isArray(pack.functions) || !pack.functions.length || pack.functions.length > MAX_FUNCTIONS) throw new Error(`A pack must contain 1–${MAX_FUNCTIONS} functions.`);
  const functions = new Map();
  for (const item of pack.functions) {
    if (!item || !/^[a-z][a-z0-9-]{0,47}$/.test(item.id || '') || functions.has(item.id)) throw new Error('The pack contains an invalid or duplicate function ID.');
    if (!item.graph || item.graph.graphType !== 'function' || !Array.isArray(item.graph.nodes) || !Array.isArray(item.graph.connections)) throw new Error(`Function ${item.id} is not a valid Function graph.`);
    if (item.graph.nodes.length > MAX_NODES || item.graph.connections.length > MAX_CONNECTIONS) throw new Error(`Function ${item.id} exceeds the node or connection limit.`);
    functions.set(item.id, item);
  }
  const graphIds = new Map([...functions.keys()].map((id) => [id, stableGraphId(entry.id, id)]));
  const callGraph = new Map();
  for (const [functionId, item] of functions) {
    const graph = item.graph;
    const nodeIds = new Set();
    const nodesById = new Map();
    const parameterIds = new Set();
    let returnCount = 0;
    for (const node of graph.nodes) {
      if (!node || typeof node.id !== 'string' || node.id.length > 128 || nodeIds.has(node.id) || !allowedNode(node.type) || !NodeDefinitions[node.type]
        || !Number.isFinite(node.x) || !Number.isFinite(node.y) || Math.abs(node.x) > 100000 || Math.abs(node.y) > 100000
        || (node.label != null && typeof node.label !== 'string') || (node.data != null && (typeof node.data !== 'object' || Array.isArray(node.data)))) {
        throw new Error(`Function ${functionId} contains an unsupported node.`);
      }
      nodeIds.add(node.id);
      nodesById.set(node.id, node);
      if (node.type === 'function_input') {
        const parameterId = node.data?.paramId;
        if (typeof parameterId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(parameterId) || parameterIds.has(parameterId)) {
          throw new Error(`Function ${functionId} contains an invalid or duplicate input ID.`);
        }
        parameterIds.add(parameterId);
      }
      if (node.type === 'function_return') returnCount += 1;
      if ((node.type === 'function_input' || node.type === 'function_return') && !['string', 'number', 'boolean'].includes(node.data?.valueType || 'number')) {
        throw new Error(`Function ${functionId} contains an unsupported function value type.`);
      }
      if (node.type === 'function_call') {
        const calledId = node.data?.functionId || node.data?.graphId;
        if (!functions.has(calledId)) throw new Error(`Function ${functionId} calls a function outside this pack.`);
        node.data = { ...node.data, graphId: graphIds.get(calledId) };
        callGraph.set(functionId, [...(callGraph.get(functionId) || []), calledId]);
      }
    }
    if (returnCount !== 1) throw new Error(`Function ${functionId} must have exactly one Return Value node.`);
    for (const connection of graph.connections) {
      if (!nodeIds.has(connection?.sourceNodeId) || !nodeIds.has(connection?.targetNodeId)) throw new Error(`Function ${functionId} contains a connection to a missing node.`);
      if (typeof connection.sourcePinId !== 'string' || typeof connection.targetPinId !== 'string' || connection.sourcePinId === 'exec' || connection.targetPinId === 'exec') throw new Error(`Function ${functionId} contains an execution wire or invalid pin; graph packs only allow pure value connections.`);
      const source = nodesById.get(connection.sourceNodeId);
      const target = nodesById.get(connection.targetNodeId);
      const calledFunction = (node) => {
        if (node.type !== 'function_call') return null;
        return [...functions.entries()].find(([id]) => graphIds.get(id) === node.data?.graphId)?.[1] || null;
      };
      const pinFor = (node, direction) => {
        const called = calledFunction(node);
        if (node.type === 'function_input' && direction === 'outputs' && connection.sourcePinId === 'value') return { id: 'value', type: node.data?.valueType || 'number' };
        if (node.type === 'function_return' && direction === 'inputs' && connection.targetPinId === 'value') return { id: 'value', type: node.data?.valueType || 'number' };
        if (node.type === 'function_call' && called) {
          if (direction === 'outputs' && connection.sourcePinId === 'result') {
            const result = called.graph.nodes.find((candidate) => candidate.type === 'function_return');
            return result ? { id: 'result', type: result.data?.valueType || 'number' } : null;
          }
          if (direction === 'inputs') {
            const argument = called.graph.nodes.find((candidate) => `arg_${candidate.data?.paramId || candidate.id}` === connection.targetPinId);
            if (argument?.type === 'function_input') return { id: connection.targetPinId, type: argument.data?.valueType || 'number' };
          }
        }
        const definition = NodeDefinitions[node.type];
        let pins = definition[direction] || [];
        if (node.type === 'format_text' && direction === 'inputs') {
          const names = new Set([...String(node.data?.template || '').matchAll(/(?<!\\)\{\{\s*([\w.-]+)\s*\}\}/g)].map((match) => match[1]));
          pins = [...names].map((name) => ({ id: `slot_${name}`, type: 'string' }));
        }
        return pins.find((pin) => pin.id === (direction === 'outputs' ? connection.sourcePinId : connection.targetPinId)) || null;
      };
      const sourcePin = pinFor(source, 'outputs');
      const targetPin = pinFor(target, 'inputs');
      if (!sourcePin || !targetPin || sourcePin.type !== targetPin.type) throw new Error(`Function ${functionId} contains an invalid or mismatched value connection.`);
    }
  }
  const visit = (id, active = new Set(), visited = new Set()) => {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    for (const next of callGraph.get(id) || []) if (visit(next, active, visited)) return true;
    active.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of functions.keys()) if (visit(id)) throw new Error('Function packs cannot contain recursive calls.');
  return [...functions.entries()].map(([functionId, item]) => ({
    id: graphIds.get(functionId),
    name: String(item.name || functionId).trim().slice(0, 80),
    description: String(item.description || '').slice(0, 300),
    graph: {
      ...item.graph,
      id: graphIds.get(functionId),
      name: String(item.name || functionId).trim().slice(0, 80),
      graphType: 'function',
      nodes: item.graph.nodes,
      connections: item.graph.connections,
      variables: []
    }
  }));
}

function savePack(entry, pack, botManager, sourceType = 'catalog', { autoUpdate = true, installedBy = null } = {}) {
  const functions = validatePack(pack, entry);
  const installed = readInstalled();
  const previous = installed[entry.id];
  if (previous?.version === entry.version && (previous.sourceType || 'catalog') === sourceType && previous.repositoryUrl === (entry.repositoryUrl || null)) return { ...previous, alreadyInstalled: true };
  const previousGraphs = new Map((previous?.graphIds || []).map((id) => [id, botManager.graphs.get(id)]));
  const written = [];
  try {
    for (const item of functions) {
      botManager.saveGraph(item.id, { ...item.graph, pluginId: entry.id, pluginVersion: entry.version });
      written.push(item.id);
    }
    const record = {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      author: entry.author,
      license: entry.license,
      minArcStudioVersion: entry.minArcStudioVersion,
      thirdPartyNotices: entry.thirdPartyNotices || [],
      settingsSchema: validatePluginSettingsSchema(pack.settingsSchema || entry.settingsSchema),
      version: entry.version,
      sourceType,
      sourceTrust: sourceType === 'local' ? 'local' : isDefaultRepository(entry.repositoryUrl) ? 'default' : 'custom',
      sourceUrl: entry.sourceUrl || null,
      repositoryUrl: entry.repositoryUrl || null,
      autoUpdate: autoUpdate === true,
      installedAt: previous?.installedAt || new Date().toISOString(),
      installedBy: previous?.installedBy || installedBy || null,
      updatedAt: new Date().toISOString(),
      functions: functions.map(({ id, name, description }) => ({ id, name, description })),
      graphIds: [...new Set([...(previous?.graphIds || []), ...functions.map((item) => item.id)])]
    };
    installed[entry.id] = record;
    writeInstalled(installed);
    return record;
  } catch (error) {
    for (const graphId of written) {
      const previousGraph = previousGraphs.get(graphId);
      if (previousGraph) botManager.saveGraph(graphId, previousGraph);
      else botManager.deleteGraph(graphId);
    }
    throw error;
  }
}

async function installRegistryEntry(entry, botManager, { autoUpdate = true } = {}) {
  assertArcStudioCompatible(entry.name, entry.minArcStudioVersion);
  const repository = normalizeRepositoryUrl(entry.repositoryUrl);
  const response = await fetch(artifactUrl(repository, entry.commit, entry.path), {
    headers: { Accept: 'application/json', 'User-Agent': 'ARC-Studio-Plugin-Store' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`${repository.provider === 'github' ? 'GitHub' : 'GitLab'} returned ${response.status} while downloading ${entry.name}.`);
  const bytes = await readLimited(response, MAX_PACK_BYTES);
  const digest = createHash('sha256').update(bytes).digest();
  const expected = Buffer.from(entry.sha256, 'hex');
  if (digest.length !== expected.length || !timingSafeEqual(digest, expected)) throw new Error('Plugin digest does not match the registry. The pack was not installed.');
  let pack;
  try { pack = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Plugin pack is not valid JSON.'); }
  return savePack(entry, pack, botManager, 'catalog', { autoUpdate });
}

export class PluginStore {
  static repository() {
    return readPluginSettings();
  }

  static setRepository(value) {
    const repository = normalizeRepositoryUrl(value);
    writePluginSettings(repository);
    registryCache.delete(repository.url);
    return repository;
  }

  static async catalog() {
    const installed = readInstalled();
    let entries = [];
    try { entries = await getRegistry(); } catch { /* */ }
    return [...[...BUILTIN_PLUGINS.values()].map(({ directory: _directory, runtime: _runtime, ...plugin }) => ({ ...plugin, ...studioCompatibility(plugin.minArcStudioVersion, plugin.name), sourceTrust: 'bundled', sourceLabel: 'Bundled with ARC Studio', installedVersion: installed[plugin.id]?.version || null, updateAvailable: false })), ...entries.filter((entry) => !BUILTIN_PLUGINS.has(entry.id)).map(({ path: _path, ...plugin }) => ({
      ...plugin,
      ...studioCompatibility(plugin.minArcStudioVersion, plugin.name),
      sourceTrust: isDefaultRepository(plugin.repositoryUrl) ? 'default' : 'custom',
      sourceLabel: isDefaultRepository(plugin.repositoryUrl) ? 'Default ARC plugin source' : 'External plugin source',
      installedVersion: installed[plugin.id]?.version || null,
      updateAvailable: Boolean(installed[plugin.id] && (installed[plugin.id].version !== plugin.version || installed[plugin.id].repositoryUrl !== plugin.repositoryUrl))
    }))];
  }

  static projectPermissions(projectDir, pluginId) {
    const plugin = readInstalled()[pluginId];
    if (!projectDir || !plugin?.installationId) return [];
    const stored = readProjectPermissionFile(projectDir)[pluginId];
    if (stored?.installationId !== plugin.installationId || !Array.isArray(stored.granted)) return [];
    try { return normalizePermissionGrant(pluginId, stored.granted); }
    catch { return []; }
  }

  static setProjectPermissions(projectDir, pluginId, requested) {
    if (!projectDir) throw new Error('The active project is unavailable.');
    const installed = readInstalled()[pluginId];
    if (!installed) throw new Error('Install this plugin before granting project permissions.');
    const granted = normalizePermissionGrant(pluginId, requested);
    const permissions = readProjectPermissionFile(projectDir);
    permissions[pluginId] = { installationId: installed.installationId, granted, updatedAt: new Date().toISOString() };
    writeProjectPermissionFile(projectDir, permissions);
    return granted;
  }

  static installed() {
    registerInstalledAdapters();
    const installed = readInstalled();
    let changed = false;
    for (const plugin of Object.values(installed)) {
      if (plugin.kind !== 'wasm-adapter') continue;
      try {
        const manifest = validateAdapterManifest(JSON.parse(fs.readFileSync(path.join(adapterDirectory(plugin.id, plugin.version), 'arc-plugin.json'), 'utf8')));
        if (JSON.stringify(plugin.thirdPartyNotices || []) !== JSON.stringify(manifest.thirdPartyNotices || [])) {
          plugin.thirdPartyNotices = manifest.thirdPartyNotices || [];
          changed = true;
        }
      } catch { /* */ }
    }
    if (changed) writeInstalled(installed);
    return Object.values(installed).map((plugin) => ({ ...plugin, ...studioCompatibility(plugin.minArcStudioVersion, plugin.name || plugin.id) }));
  }

  static importLocalAdapter(manifestInput, wasmInput, { autoUpdate = true, installedBy = null } = {}) {
    const manifest = validateAdapterManifest(manifestInput);
    assertArcStudioCompatible(manifest.name, manifest.minArcStudioVersion);
    if (BUILTIN_PLUGINS.has(manifest.id)) throw new Error(`Plugin ID “${manifest.id}” is reserved for an ARC built-in integration.`);
    let bytes;
    try { bytes = Buffer.isBuffer(wasmInput) ? wasmInput : Buffer.from(String(wasmInput || ''), 'base64'); }
    catch { throw new Error('Adapter WebAssembly file is not valid base64.'); }
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Adapter module must be between 1 byte and 8 MiB.');
    const directory = adapterDirectory(manifest.id, manifest.version);
    inspectAdapterBytes(bytes);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== manifest.wasmSha256) throw new Error('The adapter.wasm digest does not match arc-plugin.json.');
    fs.mkdirSync(directory, { recursive: true });
    const modulePath = path.join(directory, 'adapter.wasm');
    const manifestPath = path.join(directory, 'arc-plugin.json');
    const moduleTemp = `${modulePath}.tmp`;
    const manifestTemp = `${manifestPath}.tmp`;
    fs.writeFileSync(moduleTemp, bytes, { mode: 0o600 });
    fs.writeFileSync(manifestTemp, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    fs.renameSync(moduleTemp, modulePath);
    fs.renameSync(manifestTemp, manifestPath);
    const installed = readInstalled();
    const previous = installed[manifest.id];
    installed[manifest.id] = {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      thirdPartyNotices: manifest.thirdPartyNotices,
      settingsSchema: manifest.settingsSchema,
      version: manifest.version,
      minArcStudioVersion: manifest.minArcStudioVersion,
      kind: 'wasm-adapter',
      sourceType: 'local',
      sourceTrust: 'local',
      repositoryUrl: manifest.repositoryUrl || null,
      autoUpdate: autoUpdate === true,
      sha256: digest,
      adapterApiVersion: manifest.adapterApiVersion,
      nodes: manifest.nodes,
      installedAt: previous?.installedAt || new Date().toISOString(),
      installedBy: previous?.installedBy || installedBy || null,
      updatedAt: new Date().toISOString()
    };
    try { writeInstalled(installed); }
    catch (error) {
      fs.rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    registerInstalledAdapters();
    return installed[manifest.id];
  }

  static async executeAdapter(nodeType, inputs, { projectDir = '' } = {}) {
    const plugin = Object.values(readInstalled()).find((item) => item.kind === 'wasm-adapter' && item.nodes?.some((node) => node.type === nodeType));
    const hostPlugin = Object.values(readInstalled()).find((item) => item.kind === 'host-adapter' && item.nodes?.some((node) => node.type === nodeType));
    if (hostPlugin) {
      const bundled = BUILTIN_PLUGINS.get(hostPlugin.id);
      if (!bundled) throw new Error(`Host adapter “${hostPlugin.id}” is not bundled with ARC Studio.`);
      assertArcStudioCompatible(hostPlugin.name, hostPlugin.minArcStudioVersion || bundled.minArcStudioVersion);
      if (!projectDir) throw new Error('Project plugin settings are unavailable for this run.');
      const node = bundled.nodes.find((item) => item.type === nodeType);
      const requiredPermission = node?.requiredPermission;
      if (requiredPermission && !this.projectPermissions(projectDir, bundled.id).includes(requiredPermission)) {
        const permission = PROJECT_PERMISSION_DEFINITIONS.get(requiredPermission);
        throw new Error(`${bundled.name} permission required: ${permission?.name || requiredPermission}. Ask the project owner to grant it in Plugin Store.`);
      }
      const settings = this.readProjectSettings(projectDir, bundled.id, bundled.settingsSchema, true);
      settings.__projectDir = projectDir;
      const runtime = await loadHostAdapterRuntime(bundled);
      const execute = runtime[bundled.runtime.execute];
      if (typeof execute !== 'function') throw new Error(`${bundled.name} runtime does not implement its declared execution function.`);
      return execute(nodeType, inputs, settings);
    }
    if (!plugin) throw new Error(`Adapter for node “${nodeType}” is not installed.`);
    const manifest = validateAdapterManifest(JSON.parse(fs.readFileSync(path.join(adapterDirectory(plugin.id, plugin.version), 'arc-plugin.json'), 'utf8')));
    assertArcStudioCompatible(manifest.name, manifest.minArcStudioVersion);
    const node = manifest.nodes.find((item) => item.type === nodeType);
    const safeInputs = {};
    for (const pin of node.inputs) {
      if (pin.type === 'exec') continue;
      let value = inputs?.[pin.id] ?? pin.defaultValue;
      if (pin.type === 'string') {
        value = String(value ?? '');
        if (Buffer.byteLength(value, 'utf8') > manifest.limits.inputBytes) throw new Error(`Input “${pin.label}” exceeds the adapter's ${manifest.limits.inputBytes.toLocaleString()} byte limit.`);
      } else if (pin.type === 'number') {
        value = Number(value);
        if (!Number.isFinite(value)) throw new Error(`Input “${pin.label}” must be a finite number.`);
      } else if (pin.type === 'boolean') value = Boolean(value);
      safeInputs[pin.id] = value;
    }
    if (Buffer.byteLength(JSON.stringify(safeInputs), 'utf8') > 1_048_576) throw new Error('Combined adapter inputs exceed the 1 MiB request limit.');
    const result = await runWasmAdapter(path.join(adapterDirectory(plugin.id, plugin.version), 'adapter.wasm'), safeInputs, manifest.limits);
    const outputs = {};
    for (const pin of node.outputs) {
      if (pin.type === 'exec') continue;
      const value = result[pin.id];
      if (value === undefined) continue;
      if (pin.type === 'string' && typeof value !== 'string') throw new Error(`Adapter returned a non-text value for output “${pin.label}”.`);
      if (pin.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`Adapter returned an invalid number for output “${pin.label}”.`);
      if (pin.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Adapter returned an invalid boolean for output “${pin.label}”.`);
      if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > manifest.limits.outputBytes) throw new Error(`Output “${pin.label}” exceeds the adapter's ${manifest.limits.outputBytes.toLocaleString()} byte limit.`);
      outputs[pin.id] = value;
    }
    return outputs;
  }

  static async install(pluginId, botManager, { autoUpdate = true, installedBy = null, projectDir = '', permissions = [], expectedVersion = '', expectedSha256 = '', expectedRepositoryUrl = '' } = {}) {
    if (BUILTIN_PLUGINS.has(pluginId)) {
      const definition = BUILTIN_PLUGINS.get(pluginId);
      assertArcStudioCompatible(definition.name, definition.minArcStudioVersion);
      if (expectedVersion && expectedVersion !== definition.version) throw new Error('The plugin changed since review. Refresh the catalogue and review its permissions again.');
      const granted = normalizePermissionGrant(pluginId, permissions);
      const installed = readInstalled();
      const previous = installed[pluginId];
      installed[pluginId] = {
        id: pluginId, name: definition.name, description: definition.description, author: definition.author,
        license: definition.license, version: definition.version, minArcStudioVersion: definition.minArcStudioVersion, kind: 'host-adapter', sourceType: 'builtin',
        thirdPartyNotices: definition.thirdPartyNotices || [], autoUpdate: false, settingsSchema: validatePluginSettingsSchema(definition.settingsSchema),
        nodes: definition.nodes.map(({ type, label, category, description, color, inputs, outputs, requiredPermission }) => ({ type, label, category, description, color, inputs, outputs, ...(requiredPermission ? { requiredPermission } : {}) })),
        permissions: definition.permissions,
        installationId: previous?.installationId || randomUUID(),
        installedAt: previous?.installedAt || new Date().toISOString(), installedBy: previous?.installedBy || installedBy || null,
        updatedAt: new Date().toISOString()
      };
      writeInstalled(installed);
      this.setProjectPermissions(projectDir, pluginId, granted);
      registerInstalledAdapters();
      return installed[pluginId];
    }
    const entry = (await getRegistry()).find((plugin) => plugin.id === pluginId);
    if (!entry) throw new Error('Plugin is not listed in the ARC plugin registry.');
    assertArcStudioCompatible(entry.name, entry.minArcStudioVersion);
    if (permissions.length) throw new Error('This plugin does not support privileged host permissions.');
    if (expectedVersion && expectedVersion !== entry.version || expectedSha256 && expectedSha256 !== entry.sha256 || expectedRepositoryUrl && expectedRepositoryUrl !== entry.repositoryUrl) {
      throw new Error('The plugin changed since review. Refresh the catalogue and review it again.');
    }
    const plugin = await installRegistryEntry(entry, botManager, { autoUpdate });
    if (!plugin.installedBy && installedBy) {
      const installed = readInstalled();
      installed[pluginId] = { ...installed[pluginId], installedBy };
      writeInstalled(installed);
      return installed[pluginId];
    }
    return plugin;
  }

  static async autoUpdate(botManager) {
    const [entries, installed] = await Promise.all([getRegistry(), Promise.resolve(readInstalled())]);
    const updates = [];
    const errors = [];
    for (const plugin of Object.values(installed)) {
      if (!plugin.autoUpdate || plugin.kind === 'wasm-adapter') continue;
      const entry = entries.find((item) => item.id === plugin.id);
      if (!entry || entry.version === plugin.version || entry.repositoryUrl !== plugin.repositoryUrl) continue;
      try { updates.push(await installRegistryEntry(entry, botManager, { autoUpdate: true })); }
      catch (error) { errors.push({ id: plugin.id, message: error.message || 'Could not auto-update plugin.' }); }
    }
    return { updated: updates, errors, installed: this.installed() };
  }

  static importLocal(pack, botManager, { autoUpdate = true, installedBy = null } = {}) {
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('Choose a valid ARC plugin manifest.');
    const serialized = JSON.stringify(pack);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PACK_BYTES) throw new Error('Local pack exceeds the 1 MiB size limit.');
    const entry = {
      id: pack.id,
      name: pack.name,
      description: pack.description || '',
      author: pack.author || '',
      license: pack.license || '',
      minArcStudioVersion: declaredMinimumVersion(pack.minArcStudioVersion, pack.name || pack.id),
      settingsSchema: validatePluginSettingsSchema(pack.settingsSchema),
      version: pack.version,
      arcApiVersion: pack.arcApiVersion,
      sourceUrl: null,
      repositoryUrl: normalizeRepositoryUrl(pack.repositoryUrl || readPluginSettings().url).url
    };
    if (BUILTIN_PLUGINS.has(entry.id)) throw new Error(`Plugin ID “${entry.id}” is reserved for an ARC built-in integration.`);
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(entry.id || '') || !String(entry.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.version || '')) {
      throw new Error('Local pack needs a valid ID, name, and SemVer version.');
    }
    return savePack(entry, pack, botManager, 'local', { autoUpdate, installedBy });
  }

  static uninstall(pluginId, botManager) {
    const installed = readInstalled();
    const record = installed[pluginId];
    if (!record) throw new Error('Plugin is not installed.');
    if (record.kind === 'wasm-adapter' || record.kind === 'host-adapter') {
      const types = new Set((record.nodes || []).map((node) => node.type));
      const refs = botManager.getGraphs().flatMap((graph) => (graph.nodes || []).filter((node) => types.has(node.type)).map((node) => graph.name || graph.id));
      if (refs.length) throw new Error(`This adapter is used by ${refs.slice(0, 4).join(', ')}. Remove those nodes before uninstalling.`);
      delete installed[pluginId];
      writeInstalled(installed);
      if (record.kind === 'wasm-adapter') fs.rmSync(path.join(adapterRoot, pluginId), { recursive: true, force: true });
      registerInstalledAdapters();
      return true;
    }
    const graphIds = new Set(record.graphIds || []);
    const refs = [];
    for (const graph of botManager.getGraphs()) {
      if (graphIds.has(graph.id)) continue;
      if ((graph.nodes || []).some((node) => node.type === 'function_call' && graphIds.has(node.data?.graphId))) refs.push(graph.name || graph.id);
    }
    if (refs.length) throw new Error(`This pack is used by ${refs.slice(0, 4).join(', ')}. Remove those calls before uninstalling.`);
    for (const graphId of graphIds) botManager.deleteGraph(graphId);
    delete installed[pluginId];
    writeInstalled(installed);
    return true;
  }

  static settingsSchema(pluginId) {
    return BUILTIN_PLUGINS.get(pluginId)?.settingsSchema || readInstalled()[pluginId]?.settingsSchema || [];
  }

  static readProjectSettings(projectDir, pluginId, schema = this.settingsSchema(pluginId), revealSecrets = false) {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(path.join(projectDir, 'plugin-settings.json'), 'utf8'))?.[pluginId] || {}; } catch {}
    const values = {};
    for (const field of schema) {
      const value = saved[field.id];
      if (field.secret) {
        values[field.id] = revealSecrets && CryptoEngine.isEncrypted(value) ? CryptoEngine.decrypt(value, null, projectSettingAad(projectDir, pluginId, field.id)) : '';
        values[`${field.id}Configured`] = Boolean(CryptoEngine.isEncrypted(value));
      } else if (value !== undefined) values[field.id] = value;
      else if (field.defaultValue !== undefined) values[field.id] = field.defaultValue;
    }
    return values;
  }

  static publicProjectSettings(projectDir, pluginId) {
    const schema = this.settingsSchema(pluginId);
    const values = this.readProjectSettings(projectDir, pluginId, schema, false);
    for (const field of schema) if (field.secret) delete values[field.id];
    return { schema, values };
  }

  static saveProjectSettings(projectDir, pluginId, input) {
    const schema = this.settingsSchema(pluginId);
    if (!schema.length) throw new Error('This plugin has no project settings.');
    const filePath = path.join(projectDir, 'plugin-settings.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {}; } catch {}
    const current = saved[pluginId] || {};
    const next = { ...current };
    for (const field of schema) {
      let value = input?.[field.id];
      if (field.secret) {
        if (value === undefined || value === '') continue;
        value = String(value);
        if (value.length > 4096) throw new Error(`${field.label} is too long.`);
        next[field.id] = CryptoEngine.encrypt(value, null, projectSettingAad(projectDir, pluginId, field.id));
      } else if (field.type === 'boolean') next[field.id] = Boolean(value);
      else if (field.type === 'number') {
        if (value === '' || value === undefined) value = field.defaultValue ?? field.min ?? 0;
        value = Number(value);
        if (!Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) throw new Error(`${field.label} is outside its allowed range.`);
        next[field.id] = value;
      } else {
        value = String(value ?? field.defaultValue ?? '').trim();
        if (field.required && !value) throw new Error(`${field.label} is required.`);
        if (value.length > 512) throw new Error(`${field.label} is too long.`);
        next[field.id] = value;
      }
    }
    for (const fieldId of Array.isArray(input?.clearSecrets) ? input.clearSecrets : []) {
      if (!schema.some((field) => field.id === fieldId && field.secret)) throw new Error('Unknown plugin secret field.');
      delete next[fieldId];
    }
    saved[pluginId] = next;
    fs.mkdirSync(projectDir, { recursive: true, mode: 0o700 });
    const temporary = `${filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(saved, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, filePath);
    const bundled = BUILTIN_PLUGINS.get(pluginId);
    if (bundled?.runtime.closeProject) void loadHostAdapterRuntime(bundled).then((runtime) => runtime[bundled.runtime.closeProject]?.(projectDir)).catch(() => {});
    return this.publicProjectSettings(projectDir, pluginId);
  }
}
