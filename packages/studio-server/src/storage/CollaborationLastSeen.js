import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from '../storage.js';

const filePath = path.join(dataDir, 'collaboration-last-seen.json');
const MAX_PROJECTS = 500;
const MAX_GRAPHS = 5000;
const MIN_RECORD_INTERVAL_MS = 60_000;
//
export class CollaborationLastSeen {
  constructor(targetPath = filePath) {
    this.filePath = targetPath;
    this.projects = {};
    this.graphs = {};
    this.lastPersistAt = 0;
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (data && typeof data === 'object') {
        this.projects = data.projects && typeof data.projects === 'object' ? data.projects : {};
        this.graphs = data.graphs && typeof data.graphs === 'object' ? data.graphs : {};
      }
    } catch {}
  }

  record(projectId, graphId, user) {
    if (typeof projectId !== 'string' || !projectId || !user?.id || !user?.username) return false;
    const now = Date.now();
    const seen = { userId: String(user.id), username: String(user.username).slice(0, 80), updatedAt: now };
    let changed = this.#recordEntry(this.projects, projectId, seen, now);
    if (typeof graphId === 'string' && graphId) {
      const key = `${projectId}:${graphId}`;
      changed = this.#recordEntry(this.graphs, key, { ...seen, graphId }, now) || changed;
    }
    if (changed) this.#persist();
    return changed;
  }

  #recordEntry(store, key, next, now) {
    const current = store[key];
    if (current?.userId === next.userId && now - Number(current.updatedAt || 0) < MIN_RECORD_INTERVAL_MS) return false;
    store[key] = next;
    return true;
  }

  projectSnapshot() { return { ...this.projects }; }

  graphSnapshot(projectId) {
    const prefix = `${projectId}:`;
    return Object.entries(this.graphs)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value)
      .filter((entry) => entry && typeof entry.graphId === 'string')
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
  }

  #persist() {
    const prune = (store, limit) => Object.fromEntries(Object.entries(store)
      .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
      .slice(0, limit));
    this.projects = prune(this.projects, MAX_PROJECTS);
    this.graphs = prune(this.graphs, MAX_GRAPHS);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify({ projects: this.projects, graphs: this.graphs }), { mode: 0o600 });
      fs.renameSync(temporaryPath, this.filePath);
      try { fs.chmodSync(this.filePath, 0o600); } catch {}
    } finally {
      try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    }
  }
}
