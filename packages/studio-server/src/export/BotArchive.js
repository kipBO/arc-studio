import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(serverRoot, '../..');
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function pickOwnFields(source, fields) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(source, field)).map((field) => [field, source[field]]));
}

function projectRuntimeGraph(graph) {
  return {
    id: graph.id,
    name: typeof graph.name === 'string' ? graph.name : 'Untitled graph',
    ...(graph.graphType === 'function' ? { graphType: 'function' } : {}),
    variables: (Array.isArray(graph.variables) ? graph.variables : []).map((variable) => pickOwnFields(variable, ['id', 'name', 'type', 'valueType', 'initialValue', 'persist'])),
    nodes: graph.nodes.map((node) => pickOwnFields(node, ['id', 'type', 'label', 'data', 'permission', 'requiredPermission'])),
    connections: graph.connections.map((connection) => pickOwnFields(connection, ['sourceNodeId', 'sourcePinId', 'targetNodeId', 'targetPinId']))
  };
}

export function buildBotArchive(graphs = [], projectVariables = [], pluginAdapters = [], exportOptions = {}) {
  const safeGraphs = graphs
    .filter((graph) => graph && typeof graph.id === 'string' && Array.isArray(graph.nodes) && Array.isArray(graph.connections))
    .map(projectRuntimeGraph);
  const safeProjectVariables = (Array.isArray(projectVariables) ? projectVariables : [])
    .map((variable) => pickOwnFields(variable, ['id', 'name', 'type', 'initialValue']));
  const includeCryptoSecret = exportOptions.includeCryptoSecret === true;
  const includeBotToken = exportOptions.includeBotToken === true;
  const botToken = includeBotToken ? String(exportOptions.botToken || '').replace(/[\r\n]/g, '') : '';
  if (includeBotToken && !botToken) throw new Error('A bot token is not configured for this project.');
  const cryptoSecret = includeCryptoSecret
    ? String(exportOptions.cryptoSecret || randomBytes(32).toString('hex')).replace(/[\r\n]/g, '')
    : '';
  const requestedLogRetention = String(exportOptions.logRetentionDays ?? 7);
  const logRetentionDays = ['1', '7', '14', '30', '90', '365', '0', 'forever'].includes(requestedLogRetention) ? requestedLogRetention : '7';
  const projectName = String(exportOptions.projectName || 'Untitled Project').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64) || 'Untitled Project';
  const projectAuthor = String(exportOptions.projectAuthor || 'Unknown').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32) || 'Unknown';
  const usedTypes = new Set(safeGraphs.flatMap((graph) => graph.nodes.map((node) => node?.type).filter((type) => typeof type === 'string')));
  const exports = normalizePluginExports(pluginAdapters, usedTypes);
  const dependencies = { chezcord: 'file:./chezcord' };
  const environment = [];
  const permissionSections = [];
  const pluginFiles = [];
  for (const plugin of exports) {
    Object.assign(dependencies, plugin.dependencies || {});
    environment.push(...(plugin.environment || []));
    permissionSections.push(plugin.permissionSection);
    if (plugin.kind === 'wasm-adapter') pluginFiles.push(plugin.file);
    else pluginFiles.push(...plugin.files);
  }
  const pluginStoreSource = createExportPluginStore(exports);
  const readme = `${baseReadme}\n${exports.length ? `This export includes ${exports.map((plugin) => `${plugin.name} ${plugin.version}`).join(', ')} adapter${exports.length === 1 ? '' : 's'}. See PLUGIN-PERMISSIONS.md for declared capabilities and plugin notices.\n` : ''}`;
  const seenEnvironmentNames = new Set(['DISCORD_BOT_TOKEN', 'ARC_CRYPTO_SECRET', 'ARC_LOG_RETENTION_DAYS']);
  const environmentExamples = environment.filter((item) => {
    if (seenEnvironmentNames.has(item.name)) return false;
    seenEnvironmentNames.add(item.name);
    return true;
  });
  const envExample = [
    '# Discord bot token. This export includes it only if you selected that option.',
    'DISCORD_BOT_TOKEN=',
    '',
    '# Used by AES encrypt/decrypt nodes when no passphrase is connected. Keep it stable to decrypt stored data after restarts.',
    'ARC_CRYPTO_SECRET=',
    '',
    '# Days to keep daily bot logs. Use 0 or forever to keep them all.',
    'ARC_LOG_RETENTION_DAYS=',
    ...environmentExamples.flatMap((item) => ['', `# ${item.description}${item.required ? ' (required)' : ''}`, `${item.name}=`]),
    ''
  ].join('\n');
  const envFile = [
    `DISCORD_BOT_TOKEN=${botToken}`,
    `ARC_CRYPTO_SECRET=${cryptoSecret}`,
    `ARC_LOG_RETENTION_DAYS=${logRetentionDays}`,
    ''
  ].join('\n');
  const entries = [
    { name: 'README.md', data: readme },
    { name: '.env', data: envFile },
    { name: '.env.example', data: envExample },
    { name: 'package.json', data: JSON.stringify({
      name: 'arc-bot-export',
      private: true,
      type: 'module',
      scripts: { prestart: 'node scripts/ensure-dependencies.mjs', start: 'node src/index.js' },
      dependencies,
      engines: { node: '>=22.0.0' }
    }, null, 2) },
    { name: 'scripts/ensure-dependencies.mjs', data: runtimeDependencyBootstrap },
    { name: 'graphs.json', data: JSON.stringify(safeGraphs) },
    { name: 'project-variables.json', data: JSON.stringify(safeProjectVariables) },
    { name: 'src/env.js', data: runtimeEnv },
    { name: 'src/index.js', data: runtimeIndex
      .replace('__ARC_PROJECT_NAME__', JSON.stringify(projectName))
      .replace('__ARC_PROJECT_AUTHOR__', JSON.stringify(projectAuthor)) },
    { name: 'src/engine/GraphRunner.js', data: readText('src/engine/GraphRunner.js') },
    { name: 'src/engine/MathOperations.js', data: readText('src/engine/MathOperations.js') },
    { name: 'src/engine/CronSchedule.js', data: readText('src/engine/CronSchedule.js') },
    { name: 'src/engine/SafeHttpRequest.js', data: readText('src/engine/SafeHttpRequest.js') },
    { name: 'src/engine/PluginStore.js', data: pluginStoreSource },
    { name: 'src/engine/NodeRegistry.js', data: readText('src/engine/NodeRegistry.js') },
    { name: 'src/security/CryptoEngine.js', data: standaloneCryptoSource() },
    { name: 'LICENSE', data: readText('LICENSE', repoRoot) }
  ];
  if (exports.some((plugin) => plugin.kind === 'wasm-adapter')) entries.push({ name: 'src/engine/WasmAdapterRuntime.js', data: readText('src/engine/WasmAdapterRuntime.js') });
  entries.push(...pluginFiles);
  if (permissionSections.length) entries.push({ name: 'PLUGIN-PERMISSIONS.md', data: `# Plugin permissions\n\nThe exported process runs outside ARC Studio's per-project permission enforcement. Review each plugin's declared capabilities and restrict its external credentials accordingly.\n\n${permissionSections.join('\n\n')}\n` });
  for (const file of walk(path.resolve(repoRoot, 'packages/chezcord'))) {
    const relative = path.relative(path.resolve(repoRoot, 'packages/chezcord'), file).split(path.sep).join('/');
    if (relative === 'package.json' || relative.startsWith('src/')) {
      entries.push({ name: `chezcord/${relative}`, data: fs.readFileSync(file) });
    }
  }
  return zip(entries);
}

function normalizePluginExports(pluginAdapters, usedTypes) {
  const result = [];
  const coveredTypes = new Set();
  const dependencyVersions = new Map([['chezcord', 'file:./chezcord']]);
  const environmentNames = new Map();
  for (const item of pluginAdapters || []) {
    const manifest = item?.manifest;
    const directory = item?.directory;
    if (!manifest || !['host-adapter', 'wasm-adapter'].includes(manifest.kind) || typeof manifest.id !== 'string' || !directory) throw new Error('An installed adapter supplied invalid export metadata.');
    const id = manifest.id;
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(id)) throw new Error(`Plugin ID “${id}” is invalid for export.`);
    const nodes = (manifest.nodes || []).filter((node) => usedTypes.has(node.type));
    if (!nodes.length) continue;
    if (nodes.some((node) => coveredTypes.has(node.type))) throw new Error(`More than one plugin claims a node used by this graph: ${nodes.find((node) => coveredTypes.has(node.type)).type}.`);
    for (const node of nodes) coveredTypes.add(node.type);
    if (manifest.kind === 'wasm-adapter') {
      const modulePath = path.resolve(directory, manifest.wasmArtifact);
      if (!modulePath.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(modulePath) || !fs.statSync(modulePath).isFile()) throw new Error(`${manifest.name || id} WebAssembly module is unavailable.`);
      const file = { name: `src/plugins/${id}/${manifest.version}/adapter.wasm`, data: fs.readFileSync(modulePath) };
      const notices = (manifest.thirdPartyNotices || []).map((notice) => `- **${notice.name} ${notice.version}** — ${notice.license}${notice.sourceUrl ? ` ([source](${notice.sourceUrl}))` : ''}${notice.notice ? `\n  ${notice.notice}` : ''}`).join('\n');
      const permissionSection = `## ${manifest.name || id} ${manifest.version || ''}\n\nAuthor: ${manifest.author || 'Unspecified'} · License: ${manifest.license || 'Unspecified'}\n\nThis adapter runs in an isolated WebAssembly worker without host permissions.${notices ? `\n\n### Third-party notices\n\n${notices}` : ''}`;
      result.push({ kind: 'wasm-adapter', id, name: String(manifest.name || id), version: String(manifest.version || ''), nodes, limits: manifest.limits, file, permissionSection });
      continue;
    }
    const runtime = manifest.runtime;
    const exportInfo = manifest.export;
    if (!runtime || path.basename(runtime.module || '') !== runtime.module || !runtime.module.endsWith('.js') || !/^[$A-Z_a-z][$\w]*$/.test(runtime.execute || '') || !exportInfo || typeof exportInfo !== 'object') {
      throw new Error(`${manifest.name || id} does not declare a valid standalone export runtime.`);
    }
    if (runtime.closeProject !== undefined && !/^[$A-Z_a-z][$\w]*$/.test(runtime.closeProject)) throw new Error(`${manifest.name || id} declares an invalid shutdown function.`);
    const dependencies = {};
    for (const [name, version] of Object.entries(exportInfo.dependencies || {})) {
      if (!/^(?:@[-\w.]+\/)?[-\w.]+$/.test(name) || typeof version !== 'string' || !version.trim()) throw new Error(`${manifest.name || id} declares an invalid export dependency.`);
      if (dependencyVersions.has(name) && dependencyVersions.get(name) !== version) throw new Error(`Plugins declare conflicting versions of dependency “${name}”.`);
      dependencyVersions.set(name, version);
      dependencies[name] = version;
    }
    const environment = [];
    for (const entry of exportInfo.environment || []) {
      if (!entry || !/^[A-Z_][A-Z0-9_]*$/.test(entry.name || '') || typeof entry.description !== 'string') throw new Error(`${manifest.name || id} declares an invalid environment variable for export.`);
      const shape = JSON.stringify({ description: entry.description, required: entry.required === true });
      if (environmentNames.has(entry.name) && environmentNames.get(entry.name) !== shape) throw new Error(`Plugins declare conflicting meanings for environment variable “${entry.name}”.`);
      environmentNames.set(entry.name, shape);
      environment.push({ name: entry.name, description: entry.description.slice(0, 300), required: entry.required === true });
    }
    const config = {};
    for (const [key, source] of Object.entries(exportInfo.runtimeConfig || {})) {
      if (!/^[A-Za-z_$][\w$]*$/.test(key) || !source || typeof source !== 'object') throw new Error(`${manifest.name || id} declares invalid runtime configuration.`);
      if (typeof source.env === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(source.env)) config[key] = { env: source.env, ...(source.defaultValue !== undefined ? { defaultValue: source.defaultValue } : {}) };
      else if (Object.hasOwn(source, 'value')) config[key] = { value: source.value };
      else throw new Error(`${manifest.name || id} declares an invalid runtime configuration source.`);
    }
    const files = [];
    const runtimePath = path.resolve(directory, runtime.module);
    if (!runtimePath.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(runtimePath) || !fs.statSync(runtimePath).isFile()) throw new Error(`${manifest.name || id} export runtime file is unavailable.`);
    files.push({ name: `src/plugins/${id}/${runtime.module}`, data: fs.readFileSync(runtimePath) });
    for (const relative of exportInfo.files || []) {
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => part === '..' || part === '')) throw new Error(`${manifest.name || id} declares an unsafe export file path.`);
      const sourcePath = path.resolve(directory, relative);
      if (!sourcePath.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`${manifest.name || id} export file “${relative}” is unavailable.`);
      files.push({ name: `plugins/${id}/${relative.split(path.sep).join('/')}`, data: fs.readFileSync(sourcePath) });
    }
    const usedPermissions = new Set(nodes.map((node) => node.requiredPermission || node.permission).filter(Boolean));
    const permissions = (manifest.permissions || []).filter((permission) => usedPermissions.has(permission.id));
    const notices = (manifest.thirdPartyNotices || []).map((notice) => `- **${notice.name} ${notice.version}** — ${notice.license}${notice.sourceUrl ? ` ([source](${notice.sourceUrl}))` : ''}${notice.notice ? `\n  ${notice.notice}` : ''}`).join('\n');
    const permissionSection = `## ${manifest.name || id} ${manifest.version || ''}\n\nAuthor: ${manifest.author || 'Unspecified'} · License: ${manifest.license || 'Unspecified'}\n\n${permissions.length ? permissions.map((permission) => `- **${permission.name || permission.id}** (${permission.id}): ${permission.description || 'No description provided.'}`).join('\n') : 'This graph uses no declared permissions.'}${notices ? `\n\n### Third-party notices\n\n${notices}` : ''}`;
    result.push({ kind: 'host-adapter', id, name: String(manifest.name || id), version: String(manifest.version || ''), runtime, config, nodes, dependencies, environment, files, permissionSection });
  }
  const missing = [...usedTypes].filter((type) => type.startsWith('arc.') && !coveredTypes.has(type));
  if (missing.length) throw new Error(`The export is missing installed host adapter files for: ${missing.slice(0, 5).join(', ')}.`);
  return result;
}

function createExportPluginStore(plugins) {
  const declarations = plugins.map((plugin, index) => plugin.kind === 'wasm-adapter'
    ? `  { kind: 'wasm-adapter', id: ${JSON.stringify(plugin.id)}, nodes: ${JSON.stringify(plugin.nodes)}, module: new URL('../plugins/${plugin.id}/${plugin.version}/adapter.wasm', import.meta.url), limits: ${JSON.stringify(plugin.limits)} }`
    : `  { kind: 'host-adapter', id: ${JSON.stringify(plugin.id)}, nodes: ${JSON.stringify(plugin.nodes)}, config: ${JSON.stringify(plugin.config)}, execute: runtime${index}[${JSON.stringify(plugin.runtime.execute)}]${plugin.runtime.closeProject ? `, closeProject: runtime${index}[${JSON.stringify(plugin.runtime.closeProject)}]` : ''} }`).join(',\n');
  const imports = plugins.map((plugin, index) => plugin.kind === 'wasm-adapter' ? '' : `import * as runtime${index} from '../plugins/${plugin.id}/${plugin.runtime.module}';`).filter(Boolean).join('\n');
  const wasmImport = plugins.some((plugin) => plugin.kind === 'wasm-adapter') ? "import { runWasmAdapter } from './WasmAdapterRuntime.js';" : '';
  const wasmRun = `    if (adapter.kind === 'wasm-adapter') {
      const definition = adapter.nodes.find((node) => node.type === nodeType);
      const safeInputs = {};
      for (const pin of definition.inputs) {
        if (pin.type === 'exec') continue;
        let value = inputs?.[pin.id] ?? pin.defaultValue;
        if (pin.type === 'string') { value = String(value ?? ''); if (Buffer.byteLength(value, 'utf8') > adapter.limits.inputBytes) throw new Error('Input ' + pin.label + ' exceeds the adapter input limit.'); }
        else if (pin.type === 'number') { value = Number(value); if (!Number.isFinite(value)) throw new Error('Input ' + pin.label + ' must be a finite number.'); }
        else if (pin.type === 'boolean') value = Boolean(value);
        safeInputs[pin.id] = value;
      }
      if (Buffer.byteLength(JSON.stringify(safeInputs), 'utf8') > 1048576) throw new Error('Combined adapter inputs exceed the 1 MiB request limit.');
      const result = await runWasmAdapter(adapter.module, safeInputs, { timeoutMs: adapter.limits.timeoutMs, maxOutputBytes: adapter.limits.outputBytes });
      const outputs = {};
      for (const pin of definition.outputs) {
        if (pin.type === 'exec' || result[pin.id] === undefined) continue;
        const value = result[pin.id];
        if (pin.type === 'string' && (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > adapter.limits.outputBytes)) throw new Error('Adapter returned an invalid or oversized value for ' + pin.label + '.');
        if (pin.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Adapter returned an invalid number for ' + pin.label + '.');
        if (pin.type === 'boolean' && typeof value !== 'boolean') throw new Error('Adapter returned an invalid boolean for ' + pin.label + '.');
        outputs[pin.id] = value;
      }
      return outputs;
    }`;
  return `${imports}\n${wasmImport}\nimport { registerAdapterNodeDefinitions } from './NodeRegistry.js';\n\nconst adapters = [\n${declarations}\n];\nregisterAdapterNodeDefinitions(adapters.flatMap((adapter) => adapter.nodes.map((node) => ({ ...node, pluginAdapter: true, pluginId: adapter.id, ...(adapter.kind === 'host-adapter' ? { hostAdapter: adapter.id } : {}) }))));\n\nfunction configFor(adapter) {\n  return Object.fromEntries(Object.entries(adapter.config || {}).map(([key, source]) => [key, Object.hasOwn(source, 'env') ? (process.env[source.env] ?? source.defaultValue ?? '') : source.value]));\n}\nexport class PluginStore {\n  static async executeAdapter(nodeType, inputs = {}, { projectDir = '' } = {}) {\n    const adapter = adapters.find((entry) => entry.nodes.some((node) => node.type === nodeType));\n    if (!adapter) throw new Error('No exported adapter provides node ' + nodeType + '.');\n${wasmRun}\n    if (typeof adapter.execute !== 'function') throw new Error('Adapter ' + adapter.id + ' has no execution function.');\n    const config = configFor(adapter);\n    if (projectDir && Object.hasOwn(config, '__projectDir')) config.__projectDir = projectDir;\n    return adapter.execute(nodeType, inputs, config);\n  }\n  static async closeProject(projectDir = '') {\n    for (const adapter of adapters) {\n      if (typeof adapter.closeProject !== 'function') continue;\n      const config = configFor(adapter);\n      const directory = projectDir || config.__projectDir || 'exported-bot';\n      await adapter.closeProject(directory);\n    }\n  }\n}\n`;
}

function readText(relative, root = serverRoot) {
  return fs.readFileSync(path.resolve(root, relative), 'utf8');
}

const baseReadme = `# ARC bot export

This standalone bot contains the graphs selected at export time and does not require ARC Studio to run. The generated runtime and bundled Chezcord source are licensed under Apache-2.0. Graph data and separately published plugin content may carry their own licenses, keep the included notices and license files when redistributing this archive.

## Start

1. Install Node.js 22 or newer.
2. Copy \`.env.example\` to \`.env\` and set \`DISCORD_BOT_TOKEN\` plus any adapter values listed there.
3. Run \`npm install\`, then \`npm start\`.

The bot reads graph definitions from \`graphs.json\`. Message content and member-join, and other event graphs need their privileged intents enabled in the Discord Developer Portal. Slash-command graphs handle incoming interactions, register those commands with Discord separately from ARC Studio or your App. Keep \`.env\` private and never commit your bot token.

This bot export cannot be imported into ARC Studio.
`;

function standaloneCryptoSource() {
  return readText('src/security/CryptoEngine.js')
    .replace("import { serverConfig } from '../config.js';", "const serverConfig = { sessionSecret: process.env.ARC_CRYPTO_SECRET || crypto.randomBytes(32).toString('hex') };");
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile()) yield fullPath;
  }
}

function zip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  const date = new Date();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const compressed = deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localChunks.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralChunks.push(central);
    localOffset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localChunks, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const runtimeIndex = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './env.js';
import { Client, GatewayIntents } from 'chezcord';
import { GraphRunner } from './engine/GraphRunner.js';
import { NodeDefinitions } from './engine/NodeRegistry.js';
import { startCronScheduler } from './engine/CronSchedule.js';
import { PluginStore } from './engine/PluginStore.js';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('Set DISCORD_BOT_TOKEN in .env before starting the bot.');
  process.exit(1);
}
const logDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../logs');
const logRetention = String(process.env.ARC_LOG_RETENTION_DAYS || '7').trim().toLowerCase();
let logDate = '';
let logStream = null;
let logWriteWarningShown = false;
function rotateLogs() {
  const today = new Date().toISOString().slice(0, 10);
  if (today === logDate && logStream) return;
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  logStream?.end();
  logDate = today;
  logStream = fs.createWriteStream(path.join(logDirectory, 'arc-bot-' + today + '.log'), { flags: 'a', mode: 0o600 });
  logStream.on('error', (error) => {
    if (logWriteWarningShown) return;
    logWriteWarningShown = true;
    console.error('[Log File] Could not write bot logs: ' + error.message);
  });
  if (logRetention === 'forever' || Number(logRetention) === 0) return;
  const retentionDays = Math.min(365, Math.max(1, Number.parseInt(logRetention, 10) || 7));
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(logDirectory)) {
    if (!/^arc-bot-\\d{4}-\\d{2}-\\d{2}\\.log$/.test(file)) continue;
    const filePath = path.join(logDirectory, file);
    if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath);
  }
}
function writeLog(level, message) {
  if (String(level).toUpperCase() === 'DEBUG') return;
  const line = '[' + new Date().toISOString() + '] [' + String(level).toUpperCase().padEnd(5) + '] ' + String(message);
  (level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log)(line);
  try {
    rotateLogs();
    logStream?.write(line + '\\n');
  } catch (error) {
    if (!logWriteWarningShown) {
      logWriteWarningShown = true;
      console.error('[Log File] Could not write bot logs: ' + error.message);
    }
  }
}
const retentionLabel = logRetention === 'forever' || Number(logRetention) === 0 ? 'forever' : logRetention + ' days';
console.log([
  '',
  '==============================================================================',
  '   █████╗ ██████╗  ██████╗      ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗ ',
  '  ██╔══██╗██╔══██╗██╔════╝      ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗',
  '  ███████║██████╔╝██║     █████╗███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║',
  '  ██╔══██║██╔══██╗██╔════╝      ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║',
  '  ██║  ██║██║  ██║╚██████╗      ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝',
  '  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝ ',
  '==============================================================================',
  '  Project: ' + __ARC_PROJECT_NAME__,
  '  Made by: ' + __ARC_PROJECT_AUTHOR__,
  '  Log files: ' + logDirectory,
  '  Log retention: ' + retentionLabel,
  '==============================================================================',
  ''
].join('\\n'));
function formatError(error) {
  return error instanceof Error ? (error.stack || error.message) : String(error);
}
const graphs = JSON.parse(fs.readFileSync(new URL('../graphs.json', import.meta.url), 'utf8'));
const requiredIntentNames = new Set(['GUILDS', 'GUILD_EMOJIS_AND_STICKERS']);
for (const graph of graphs) for (const node of graph.nodes || []) {
  for (const intent of NodeDefinitions[node.type]?.gatewayIntents || []) requiredIntentNames.add(intent);
}
const intents = [...requiredIntentNames].reduce((mask, name) => mask | (GatewayIntents[name] || 0), 0);
const client = new Client({ token, intents });
const app = await client.rest.getCurrentApplication().catch(() => null);
const appEmojis = app?.id ? ((await client.rest.getApplicationEmojis(app.id).catch(() => null))?.items || []) : [];
const variables = new Map();
const projectVariables = JSON.parse(fs.readFileSync(new URL('../project-variables.json', import.meta.url), 'utf8'));
const projectVariableValues = new Map();
const resolveFunctionGraph = (graphId) => graphs.find((graph) => graph.id === graphId);
let stopCronScheduler = null;
let stopping = false;
const graphRunAbortController = new AbortController();
const activeGraphRuns = new Set();
async function deploySlashCommands() {
  const application = await client.rest.getCurrentApplication();
  if (!application?.id) throw new Error('Could not get the Discord application ID.');
  const desired = [];
  const names = new Set();
  for (const graph of graphs) for (const node of graph.nodes || []) {
    if (node.type !== 'event_slash_command') continue;
    const name = String(node.data?.commandName || '').trim().toLowerCase();
    const description = String(node.data?.description || '').trim();
    if (!name || !description) throw new Error('Every slash command needs a name and description before deployment.');
    if (names.has(name)) throw new Error('Duplicate slash command /' + name + ' is configured in more than one graph.');
    names.add(name);
    if ((node.data?.options || []).some((option) => option?.autocomplete && option?.dynamicAutocomplete)
      && (!(graph.nodes || []).some((item) => item.type === 'event_slash_autocomplete') || !(graph.nodes || []).some((item) => item.type === 'action_respond_autocomplete'))) {
      throw new Error('Slash command /' + name + ' uses graph-generated suggestions but needs On Command Autocomplete and Respond to Autocomplete nodes.');
    }
    const options = (Array.isArray(node.data?.options) ? node.data.options : []).map((option) => {
      const type = Number(option.type) || 3;
      const result = { type, name: String(option.name || '').trim().toLowerCase(), description: String(option.description || '').trim(), required: Boolean(option.required) };
      if (option.autocomplete) result.autocomplete = true;
      else if (Array.isArray(option.choices) && option.choices.length) result.choices = option.choices.slice(0, 25).map((choice) => ({ name: String(choice.name || '').slice(0, 100), value: type === 4 ? Number.parseInt(choice.value, 10) : type === 10 ? Number(choice.value) : String(choice.value ?? '').slice(0, 100) }));
      return result;
    }).sort((a, b) => Number(b.required) - Number(a.required));
    desired.push({ name, description, type: 1, ...(options.length ? { options } : {}), ...(node.data?.defaultMemberPermissions ? { default_member_permissions: String(node.data.defaultMemberPermissions) } : {}), ...(Array.isArray(node.data?.integrationTypes) ? { integration_types: node.data.integrationTypes } : {}), ...(Array.isArray(node.data?.contexts) ? { contexts: node.data.contexts } : {}) });
  }
  if (desired.length > 100) throw new Error('Discord allows at most 100 global slash commands.');
  const current = await client.rest.getGlobalApplicationCommands(application.id);
  const desiredByName = new Map(desired.map((command) => [command.name, command]));
  const payload = (Array.isArray(current) ? current : []).map((command) => {
    const raw = Object.fromEntries(['name', 'name_localizations', 'description', 'description_localizations', 'options', 'default_member_permissions', 'dm_permission', 'default_permission', 'integration_types', 'contexts', 'nsfw', 'type'].filter((key) => command[key] !== undefined).map((key) => [key, command[key]]));
    return Number(command.type || 1) === 1 && desiredByName.has(String(command.name).toLowerCase()) ? { ...raw, ...desiredByName.get(String(command.name).toLowerCase()) } : raw;
  });
  const existingNames = new Set((Array.isArray(current) ? current : []).filter((item) => Number(item.type || 1) === 1).map((item) => String(item.name).toLowerCase()));
  for (const command of desired) if (!existingNames.has(command.name)) payload.push(command);
  await client.rest.bulkOverwriteGlobalApplicationCommands(application.id, payload);
  return { deployed: desired.length };
}

client.on('ready', () => {
  writeLog('INFO', 'Connected as ' + (client.user?.username || 'Discord bot') + '; ' + graphs.length + ' graph(s) loaded.');
  stopCronScheduler?.();
  stopCronScheduler = startCronScheduler({
    getGraphs: () => graphs,
    dispatch: async (graph, _node, payload) => {
      const result = await trackGraphRun(GraphRunner.execute(graph, 'CRON_TICK', payload, graphContext(graph)));
      if (result.error && !graphRunAbortController.signal.aborted) writeLog('ERROR', '[Graph ' + (graph.name || graph.id) + '] ' + result.error);
    },
    onError: ({ graph, node, error }) => writeLog('ERROR', '[Cron ' + (graph.name || graph.id) + '/' + (node.label || node.id) + '] ' + formatError(error))
  });
});
client.on('gatewayDiagnostics', (diagnostics) => {
  if (diagnostics.sessionResumed === true) writeLog('INFO', 'Gateway session resumed successfully.');
  if (diagnostics.status === 'DISCONNECTED' && diagnostics.reconnectAttempts > 0) {
    writeLog('WARN', 'Gateway reconnecting (attempt ' + diagnostics.reconnectAttempts + (diagnostics.lastCloseCode == null ? '' : ', close ' + diagnostics.lastCloseCode) + ').');
  }
});
client.on('messageCreate', async (message) => {
  if (message.author?.id === client.user?.id) return;
  await dispatchGraphs('MESSAGE_CREATE', message);
});
client.on('interactionCreate', async (interaction) => {
  if (Number(interaction.type) === 4) {
    const commandName = String(interaction.data?.name || '').toLowerCase();
    const graph = graphs.find((item) => (item.nodes || []).some((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === commandName));
    const commandNode = graph?.nodes?.find((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === commandName);
    const findFocused = (options) => {
      for (const option of options || []) {
        if (option.focused) return option;
        const nested = findFocused(option.options);
        if (nested) return nested;
      }
      return null;
    };
    const focused = findFocused(interaction.data?.options);
    const configured = commandNode?.data?.options?.find((option) => option.name === focused?.name);
    if (configured?.autocomplete && configured.dynamicAutocomplete && graph?.nodes?.some((node) => node.type === 'event_slash_autocomplete')) {
      const interactionState = { applicationId: interaction.application_id || '', acknowledged: false, deferred: false, pending: null };
      await dispatchGraphs('INTERACTION_CREATE', interaction, graph.id, interactionState);
      if (!interactionState.acknowledged) {
        try { await client.rest.createInteractionResponse(interaction.id, interaction.token, { type: 8, data: { choices: [] } }); }
        catch (error) { writeLog('WARN', 'Autocomplete response failed for /' + commandName + ': ' + error.message); }
      }
      return;
    }
    const query = String(focused?.value ?? '').toLocaleLowerCase();
    const choices = configured?.autocomplete && Array.isArray(configured.choices)
      ? configured.choices.filter((choice) => String(choice.name || '').toLocaleLowerCase().includes(query)).slice(0, 25).map((choice) => ({
        name: String(choice.name || '').slice(0, 100),
        value: Number(configured.type) === 4 ? Number.parseInt(choice.value, 10) : Number(configured.type) === 10 ? Number(choice.value) : String(choice.value ?? '').slice(0, 100)
      }))
      : [];
    try { await client.rest.createInteractionResponse(interaction.id, interaction.token, { type: 8, data: { choices } }); }
    catch (error) { writeLog('WARN', 'Autocomplete response failed for /' + commandName + ': ' + error.message); }
    return;
  }
  const eventName = interaction.data?.component_type ? 'BUTTON_CLICK' : 'INTERACTION_CREATE';
  await dispatchGraphs(eventName, interaction);
});
client.on('guildMemberAdd', async (member) => {
  await dispatchGraphs('GUILD_MEMBER_ADD', member);
});
client.on('error', (error) => writeLog('ERROR', 'Chezcord: ' + formatError(error)));
client.on('fatalError', (error) => { writeLog('ERROR', 'Fatal gateway error: ' + formatError(error)); process.exitCode = 1; void shutdown('fatal gateway error'); });
async function dispatchGraphs(eventName, payload, onlyGraphId = null, interactionState = null) {
  if (stopping || graphRunAbortController.signal.aborted) return;
  const run = Promise.all(graphs.filter((graph) => !onlyGraphId || graph.id === onlyGraphId).map(async (graph) => {
    try {
      const result = await GraphRunner.execute(graph, eventName, payload, graphContext(graph, payload, interactionState));
      if (result.error && !graphRunAbortController.signal.aborted) writeLog('ERROR', '[Graph ' + (graph.name || graph.id) + '] Event ' + eventName + ' failed: ' + result.error);
    } catch (error) {
      writeLog('ERROR', '[Graph ' + (graph.name || graph.id) + '] Event ' + eventName + ' failed: ' + formatError(error));
    }
  }));
  await trackGraphRun(run);
}
async function trackGraphRun(run) {
  activeGraphRuns.add(run);
  try { return await run; }
  finally { activeGraphRuns.delete(run); }
}
function graphContext(graph, eventPayload = null, interactionState = null) {
  return {
    rest: client.rest, client, resolveFunctionGraph, variablesState: variableState(graph), projectVariables, deploySlashCommands,
    ...(interactionState ? { interactionState } : {}),
    canDeploySlashCommands: () => {
      let permissions = 0n;
      try { permissions = BigInt(String(eventPayload?.member?.permissions || 0)); } catch {}
      return (permissions & 8n) !== 0n || (permissions & 32n) !== 0n;
    },
    projectVariablesState: projectVariableValues, appEmojis, signal: graphRunAbortController.signal,
    log: () => {},
    onNodeError: (failure) => writeLog('ERROR', '[' + failure.graphName + '] Node ' + failure.nodeLabel + ' (' + failure.nodeId + '): ' + failure.error)
  };
}
function variableState(graph) {
  if (!variables.has(graph.id)) variables.set(graph.id, new Map());
  return variables.get(graph.id);
}
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  writeLog('INFO', 'Received ' + signal + '; shutting down.');
  stopCronScheduler?.();
  stopCronScheduler = null;
  graphRunAbortController.abort();
  try { client.destroy(); }
  catch (error) { writeLog('ERROR', 'Gateway shutdown error: ' + formatError(error)); process.exitCode = 1; }
  let timeout;
  try {
    await Promise.race([
      Promise.allSettled([...activeGraphRuns]),
      new Promise((resolve) => { timeout = setTimeout(resolve, 8000); })
    ]);
    if (timeout) clearTimeout(timeout);
    await PluginStore.closeProject().catch((error) => writeLog('WARN', 'Adapter shutdown warning: ' + formatError(error)));
    writeLog('INFO', 'Shutdown complete.');
    if (logStream) await new Promise((resolve) => logStream.end(resolve));
  }
  catch (error) { writeLog('ERROR', 'Shutdown error: ' + formatError(error)); process.exitCode = 1; }
}
process.once('SIGINT', () => { shutdown('SIGINT'); });
process.once('SIGTERM', () => { shutdown('SIGTERM'); });
await client.login();
`;

const runtimeDependencyBootstrap = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies });
const missing = dependencies.filter((name) => !fs.existsSync(path.join(root, 'node_modules', ...name.split('/'), 'package.json')));
if (missing.length) {
  console.log('Installing bot packages for the first run...');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
`;

const runtimeEnv = `import fs from 'node:fs';

const envPath = new URL('../.env', import.meta.url);
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\\r?\\n/)) {
    const match = line.match(/^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*?)\\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(?:\"(.*)\"|'(.*)')$/, (_all, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted ?? '');
    process.env[match[1]] = value;
  }
}
`;

