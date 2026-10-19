import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir, logsDir } from '../storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//
export class StartupDiagnostics {
  /**
   * @returns {{ healthy: boolean, checks: Array<{ name: string, status: 'PASS'|'WARN'|'FAIL', message: string }> }}
   */
  static run() {
    const checks = [];
    let healthy = true;
//
    const nodeVersion = process.versions.node;
    const majorVersion = parseInt(nodeVersion.split('.')[0], 10);

    if (majorVersion >= 22) {
      checks.push({
        name: 'Node Runtime',
        status: 'PASS',
        message: `Node.js v${nodeVersion}`
      });
    } else if (majorVersion >= 20) {
      checks.push({
        name: 'Node Runtime',
        status: 'WARN',
        message: `Node.js v${nodeVersion}; v22+ recommended`
      });
    } else {
      checks.push({
        name: 'Node Runtime',
        status: 'FAIL',
        message: `Node.js v${nodeVersion} is unsupported (requires v20+)`
      });
      healthy = false;
    }
//
    try {
      const chezcordPkgPath = path.resolve(__dirname, '../../../../packages/chezcord/package.json');
      const fallbackPkgPath = path.resolve(__dirname, '../../../chezcord/package.json');
      const targetPath = fs.existsSync(fallbackPkgPath) ? fallbackPkgPath : chezcordPkgPath;
      if (fs.existsSync(targetPath)) {
        const pkgData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        checks.push({
          name: 'Chezcord Library',
          status: 'PASS',
          message: `Chezcord v${pkgData.version}`
        });
      } else {
        checks.push({
          name: 'Chezcord Library',
          status: 'WARN',
          message: 'Chezcord package metadata unavailable'
        });
      }
    } catch (err) {
      checks.push({
        name: 'Chezcord Library',
        status: 'FAIL',
        message: `Chezcord metadata check failed: ${err.message}`
      });
      healthy = false;
    }
//
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

      const testFile = path.join(dataDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      checks.push({
        name: 'Filesystem Permissions',
        status: 'PASS',
        message: 'Storage is writable'
      });
    } catch (err) {
      checks.push({
        name: 'Filesystem Permissions',
        status: 'FAIL',
        message: `Cannot write to data/logs directory: ${err.message}`
      });
      healthy = false;
    }
//
    const rawSecret = process.env.SESSION_SECRET?.trim();
    if (!rawSecret || rawSecret === 'ARC-SESSIONSECRET') {
      checks.push({
        name: 'Session Security',
        status: 'PASS',
        message: 'Session secret was replaced with a generated value'
      });
    } else {
      checks.push({
        name: 'Session Security',
        status: 'PASS',
        message: 'Session secret is configured'
      });
    }

    return { healthy, checks };
  }
}
