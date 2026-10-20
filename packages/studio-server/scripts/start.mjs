import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const clientIndex = path.join(repositoryRoot, 'packages/studio-client/dist/index.html');
//
if (!fs.existsSync(clientIndex)) {
  console.log('[ARC Studio] Web client build is missing, building it before startup...');
  const isWindows = process.platform === 'win32';
  const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build:client'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: isWindows
  });

  if (result.error) throw new Error(`Could not build the web client: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (!fs.existsSync(clientIndex)) throw new Error('Web client build completed without producing packages/studio-client/dist/index.html.');
}

await import('../src/index.js');
