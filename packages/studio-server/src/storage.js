import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(serverRoot, '../..');
const configuredDataDir = process.env.ARC_DATA_DIR?.trim();
//
export const dataDir = path.resolve(configuredDataDir || path.join(serverRoot, 'data'));
export const logsDir = path.resolve(process.env.ARC_LOG_DIR?.trim() || (configuredDataDir
  ? path.join(dataDir, 'logs')
  : path.join(serverRoot, 'logs')));
export const envFilePath = path.resolve(process.env.ARC_ENV_FILE?.trim() || path.join(workspaceRoot, '.env'));
