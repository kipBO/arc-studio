import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from '../storage.js';

const activityPath = path.join(dataDir, 'activity.json');
const MAX_ENTRIES = 5000;
//
export class ActivityStore {
  constructor(filePath = activityPath) {
    this.filePath = filePath;
    this.entries = [];
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.entries = Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
    } catch {
      this.entries = [];
    }
  }

  record(user, action, summary, details = {}) {
    const entry = {
      id: `activity_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      actor: { id: String(user?.id || ''), username: String(user?.username || 'Unknown') },
      action: String(action).slice(0, 48),
      summary: String(summary).slice(0, 240),
      details
    };
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, MAX_ENTRIES);
    this.persist();
    return entry;
  }

  list(limit = 100) {
    return this.entries.slice(0, Math.max(1, Math.min(250, Number(limit) || 100)));
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.entries), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    try { fs.chmodSync(this.filePath, 0o600); } catch {}
  }
}
