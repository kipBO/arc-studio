import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const clientIndex = path.join(repositoryRoot, 'packages/studio-client/dist/index.html');
const nightlyIcon = path.join(repositoryRoot, 'packages/studio-client/dist/nightly-icon.png');
const clientBuildVersionFile = path.join(repositoryRoot, 'packages/studio-client/dist/.arc-studio-version');
const serverOnly = process.argv.includes('--server-only');
const desktopMode = process.env.ARC_DESKTOP_MODE === '1';
//
if (!serverOnly && !desktopMode) {
  const { version } = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  if (typeof version !== 'string' || !version.trim()) throw new Error('Could not determine the ARC Studio version for the web client build.');
  let previousBuildVersion = '';
  try { previousBuildVersion = fs.readFileSync(clientBuildVersionFile, 'utf8').trim(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const assetsMissing = !fs.existsSync(clientIndex) || !fs.existsSync(nightlyIcon);
  if (assetsMissing || previousBuildVersion !== version) {
    const reason = assetsMissing ? 'Web client assets are missing' : `Web client build is ${previousBuildVersion || 'unversioned'} and this checkout is ${version}`;
    console.log(`[ARC Studio] ${reason}, building the web client before startup...`);
    const isWindows = process.platform === 'win32';
    const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      shell: isWindows
    });

    if (result.error) throw new Error(`Could not build the web client: ${result.error.message}`);
    if (result.status !== 0) process.exit(result.status ?? 1);
    if (!fs.existsSync(clientIndex) || !fs.existsSync(nightlyIcon)) throw new Error('Web client build did not produce the expected Studio assets.');

    const markerTemporaryFile = `${clientBuildVersionFile}.${process.pid}.tmp`;
    fs.writeFileSync(markerTemporaryFile, `${version}\n`, 'utf8');
    fs.renameSync(markerTemporaryFile, clientBuildVersionFile);
  }
}

if (!serverOnly && desktopMode && (!fs.existsSync(clientIndex) || !fs.existsSync(nightlyIcon))) {
  console.log('[ARC Studio] Desktop web assets are missing, building them before startup...');
  const isWindows = process.platform === 'win32';
  const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build'], {
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
