import fs from 'node:fs';
import { Worker } from 'node:worker_threads';

const MAX_MODULE_BYTES = 8 * 1024 * 1024;
const MAX_WASM_MEMORY_PAGES = 2048; // 128 MiB per invocation

const ADAPTER_WORKER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const decode = (memory, pointer, length) => new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(memory.buffer, pointer, length));
(async () => {
  const module = await WebAssembly.compile(new Uint8Array(workerData.moduleBytes));
  if (WebAssembly.Module.imports(module).length) throw new Error('Adapters cannot import host functions or WASI capabilities.');
  const instance = await WebAssembly.instantiate(module, {});
  const { memory, arc_alloc: alloc, arc_free: free, arc_run: run } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof alloc !== 'function' || typeof free !== 'function' || typeof run !== 'function') throw new Error('Adapter must export memory, arc_alloc, arc_free, and arc_run.');
  const requestBytes = new TextEncoder().encode(JSON.stringify(workerData.inputs));
  const inputPointer = alloc(requestBytes.length);
  if (!inputPointer || inputPointer + requestBytes.length > memory.buffer.byteLength) throw new Error('Adapter could not allocate its input buffer.');
  new Uint8Array(memory.buffer, inputPointer, requestBytes.length).set(requestBytes);
  const packed = BigInt.asUintN(64, run(inputPointer, requestBytes.length));
  free(inputPointer, requestBytes.length);
  const outputPointer = Number(packed >> 32n) >>> 0;
  const outputLength = Number(packed & 0xffffffffn) >>> 0;
  if (!outputPointer || !outputLength || outputLength > workerData.maxOutputBytes || outputPointer + outputLength > memory.buffer.byteLength) throw new Error('Adapter returned an invalid or oversized result.');
  const output = JSON.parse(decode(memory, outputPointer, outputLength));
  free(outputPointer, outputLength);
  if (!output || typeof output !== 'object' || output.ok !== true) throw new Error(typeof output?.error === 'string' ? output.error.slice(0, 500) : 'Adapter failed to render the input.');
  parentPort.postMessage(output);
})().catch((error) => parentPort.postMessage({ __arcError: String(error?.message || error).slice(0, 500) }));
`;

function readLeb(bytes, cursor) {
  let value = 0;
  let shift = 0;
  while (cursor.offset < bytes.length && shift <= 35) {
    const byte = bytes[cursor.offset++];
    value |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) return value >>> 0;
    shift += 7;
  }
  throw new Error('Invalid WebAssembly binary.');
}

function assertBoundedMemory(bytes) {
  if (bytes.length < 8 || bytes.subarray(0, 4).toString('hex') !== '0061736d') throw new Error('Adapter is not a WebAssembly module.');
  const cursor = { offset: 8 };
  let memories = 0;
  while (cursor.offset < bytes.length) {
    const section = bytes[cursor.offset++];
    const size = readLeb(bytes, cursor);
    const end = cursor.offset + size;
    if (end > bytes.length) throw new Error('Invalid WebAssembly section length.');
    if (section === 5) {
      const count = readLeb(bytes, cursor);
      memories += count;
      if (count > 1) throw new Error('Adapters may declare only one WebAssembly memory.');
      for (let index = 0; index < count; index += 1) {
        const flags = readLeb(bytes, cursor);
        if ((flags & 1) === 0 || (flags & 2) !== 0 || (flags & 4) !== 0) throw new Error('Adapter memory must have a fixed maximum and cannot be shared or memory64.');
        const minimum = readLeb(bytes, cursor);
        const maximum = readLeb(bytes, cursor);
        if (minimum > MAX_WASM_MEMORY_PAGES || maximum > MAX_WASM_MEMORY_PAGES || maximum < minimum) throw new Error('Adapter memory limit may not exceed 128 MiB.');
      }
    }
    cursor.offset = end;
  }
  if (memories !== 1) throw new Error('Adapter must declare exactly one bounded WebAssembly memory.');
}

export function inspectAdapterModule(modulePath) {
  const bytes = fs.readFileSync(modulePath);
  inspectAdapterBytes(bytes);
  return { bytes, sha256: null };
}

export function inspectAdapterBytes(bytes) {
  if (bytes.length > MAX_MODULE_BYTES) throw new Error('Adapter module exceeds the 8 MiB limit.');
  assertBoundedMemory(bytes);
  let module;
  try { module = new WebAssembly.Module(bytes); }
  catch { throw new Error('Adapter module could not be compiled as WebAssembly.'); }
  if (WebAssembly.Module.imports(module).length) throw new Error('Adapters cannot import host functions or WASI capabilities.');
  const exports = new Map(WebAssembly.Module.exports(module).map((entry) => [entry.name, entry.kind]));
  if (exports.get('memory') !== 'memory' || exports.get('arc_alloc') !== 'function' || exports.get('arc_free') !== 'function' || exports.get('arc_run') !== 'function') {
    throw new Error('Adapter must export memory, arc_alloc, arc_free, and arc_run.');
  }
  return true;
}

export async function runWasmAdapter(modulePath, inputs, { timeoutMs = 5000, maxOutputBytes = 5 * 1024 * 1024 } = {}) {
  const { bytes } = inspectAdapterModule(modulePath);
  return new Promise((resolve, reject) => {
    const worker = new Worker(ADAPTER_WORKER, {
      eval: true,
      workerData: { moduleBytes: bytes, inputs, maxOutputBytes },
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 }
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`Adapter exceeded its ${timeoutMs} ms execution limit.`)), timeoutMs);
    worker.once('message', (message) => message?.__arcError
      ? finish(new Error(message.__arcError))
      : finish(null, message));
    worker.once('error', (error) => finish(new Error(`Adapter worker failed: ${error.message}`)));
    worker.once('exit', (code) => { if (!settled && code !== 0) finish(new Error(`Adapter worker exited with code ${code}.`)); });
  });
}
