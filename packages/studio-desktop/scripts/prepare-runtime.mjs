import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
//
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const desktopRoot = path.resolve(scriptDir, '..');
const runtimeRoot = path.join(desktopRoot, 'src-tauri/resources/runtime');
const appRoot = path.join(runtimeRoot, 'app');
const target = process.env.ARC_DESKTOP_TARGET || process.env.TAURI_ENV_TARGET_TRIPLE || execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
const nodeVersion = process.env.ARC_DESKTOP_NODE_VERSION || process.versions.node;

const targets = {
  'universal-apple-darwin': { archivePlatforms: ['darwin-x64', 'darwin-arm64'], archiveExt: 'tar.gz', binary: 'bin/node', universal: true },
  'x86_64-apple-darwin': { archivePlatforms: ['darwin-x64'], archiveExt: 'tar.gz', binary: 'bin/node' },
  'aarch64-apple-darwin': { archivePlatforms: ['darwin-arm64'], archiveExt: 'tar.gz', binary: 'bin/node' },
  'x86_64-unknown-linux-gnu': { archivePlatforms: ['linux-x64'], archiveExt: 'tar.xz', binary: 'bin/node' },
  'aarch64-unknown-linux-gnu': { archivePlatforms: ['linux-arm64'], archiveExt: 'tar.xz', binary: 'bin/node' },
  'x86_64-pc-windows-msvc': { archivePlatform: 'win-x64', archiveExt: 'zip', binary: 'node.exe' },
  'aarch64-pc-windows-msvc': { archivePlatform: 'win-arm64', archiveExt: 'zip', binary: 'node.exe' }
};
const targetConfig = targets[target];
if (!targetConfig) throw new Error(`Desktop packaging does not support target ${target}. Use macOS, Windows, or Linux.`);

const serverPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/studio-server/package.json'), 'utf8'));
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const dependencies = { ...serverPackage.dependencies, ...serverPackage.optionalDependencies, chezcord: 'file:./packages/chezcord' };
fs.rmSync(runtimeRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(appRoot, 'packages/studio-server'), { recursive: true });
fs.mkdirSync(path.join(appRoot, 'packages/chezcord'), { recursive: true });
fs.cpSync(path.join(repoRoot, 'packages/studio-server/src'), path.join(appRoot, 'packages/studio-server/src'), { recursive: true });
fs.cpSync(path.join(repoRoot, 'packages/studio-server/starter-projects'), path.join(appRoot, 'packages/studio-server/starter-projects'), { recursive: true });
fs.cpSync(path.join(repoRoot, 'packages/chezcord/src'), path.join(appRoot, 'packages/chezcord/src'), { recursive: true });
fs.copyFileSync(path.join(repoRoot, 'packages/chezcord/package.json'), path.join(appRoot, 'packages/chezcord/package.json'));
fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(appRoot, 'LICENSE'));
fs.writeFileSync(path.join(appRoot, 'packages/studio-server/package.json'), JSON.stringify({
  name: serverPackage.name,
  version: serverPackage.version,
  private: true,
  type: 'module',
  main: 'src/index.js'
}, null, 2));
fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({
  name: 'arc-studio-desktop-runtime',
  version: rootPackage.version || serverPackage.version,
  private: true,
  type: 'module',
  dependencies
}, null, 2));

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npmCommand, ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: appRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-studio-node-'));
try {
  const checksumsUrl = `https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`;
  const checksumsResponse = await fetch(checksumsUrl);
  if (!checksumsResponse.ok) throw new Error(`Could not download Node.js checksums (${checksumsResponse.status}).`);
  const checksumList = await checksumsResponse.text();
  const bundledNode = path.join(runtimeRoot, target.endsWith('windows-msvc') ? 'node.exe' : 'node');
  const archivePlatforms = targetConfig.archivePlatforms || [targetConfig.archivePlatform];
  const extractedNodes = [];
  for (const archivePlatform of archivePlatforms) {
    const archiveName = `node-v${nodeVersion}-${archivePlatform}.${targetConfig.archiveExt}`;
    const archiveUrl = `https://nodejs.org/dist/v${nodeVersion}/${archiveName}`;
    const archiveResponse = await fetch(archiveUrl);
    if (!archiveResponse.ok) throw new Error(`Could not download Node.js runtime (${archiveResponse.status}): ${archiveUrl}`);
    const archive = Buffer.from(await archiveResponse.arrayBuffer());
    const expectedHash = checksumList.split(/\r?\n/).find((line) => line.endsWith(`  ${archiveName}`))?.split(/\s+/)[0];
    if (!expectedHash) throw new Error(`Node.js checksum file does not contain ${archiveName}.`);
    const actualHash = crypto.createHash('sha256').update(archive).digest('hex');
    if (actualHash !== expectedHash) throw new Error(`Node.js runtime checksum mismatch for ${archiveName}.`);

    const archivePath = path.join(temporaryDir, archiveName);
    fs.writeFileSync(archivePath, archive, { mode: 0o600 });
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:ARC_RUNTIME_ARCHIVE -DestinationPath $env:ARC_RUNTIME_DESTINATION -Force'
      ], {
        env: {
          ...process.env,
          ARC_RUNTIME_ARCHIVE: archivePath,
          ARC_RUNTIME_DESTINATION: temporaryDir
        },
        stdio: 'inherit'
      });
    } else {
      execFileSync('tar', ['-xf', archivePath, '-C', temporaryDir], { stdio: 'inherit' });
    }
    const extractedRoot = path.join(temporaryDir, `node-v${nodeVersion}-${archivePlatform}`);
    extractedNodes.push(path.join(extractedRoot, targetConfig.binary));
    if (archivePlatform === archivePlatforms[0]) {
      fs.copyFileSync(path.join(extractedRoot, 'LICENSE'), path.join(runtimeRoot, 'Node-LICENSE.txt'));
      const npmSource = [path.join(extractedRoot, 'lib/node_modules/npm'), path.join(extractedRoot, 'node_modules/npm')].find((candidate) => fs.existsSync(path.join(candidate, 'bin/npm-cli.js')));
      if (!npmSource) throw new Error(`Node.js ${nodeVersion} archive does not include its npm CLI.`);
      fs.cpSync(npmSource, path.join(runtimeRoot, 'npm/node_modules/npm'), { recursive: true });
    }
  }
  if (targetConfig.universal) {
    execFileSync('lipo', ['-create', ...extractedNodes, '-output', bundledNode], { stdio: 'inherit' });
  } else {
    fs.copyFileSync(extractedNodes[0], bundledNode);
  }
  if (!target.endsWith('windows-msvc')) fs.chmodSync(bundledNode, 0o755);
  console.log(`Prepared ARC Studio desktop runtime for ${target} with Node.js ${nodeVersion}.`);
} finally {
  fs.rmSync(temporaryDir, { recursive: true, force: true });
}
