import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const clientIndex = path.join(repositoryRoot, 'packages/studio-client/dist/index.html');
const nightlyIcon = path.join(repositoryRoot, 'packages/studio-client/dist/nightly-icon.png');
const serverOnly = process.argv.includes('--server-only');
//
if (!serverOnly && (!fs.existsSync(clientIndex) || !fs.existsSync(nightlyIcon))) {
  console.log('[ARC Studio] Web client assets are missing, building them before startup...');
  const isWindows = process.platform === 'win32';
  const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build:client'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: isWindows
  });

  if (result.error) throw new Error(`Could not build the web client: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (!fs.existsSync(clientIndex) || !fs.existsSync(nightlyIcon)) throw new Error('Web client build did not produce the expected Studio assets.');
}

if (serverOnly) process.env.ARC_SERVER_ONLY = '1';
await import('../src/index.js');
