import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from '../storage.js';

const filePath = path.join(dataDir, 'collaboration-last-seen.json');
const MAX_PROJECTS = 500;
const MAX_GRAPHS = 5000;
const MAX_USERS_PER_ENTRY = 20;
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
        this.projects = this.#normalizeStore(data.projects);
        this.graphs = this.#normalizeStore(data.graphs);
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
    const history = this.#entries(store[key]);
    const existingIndex = history.findIndex((entry) => entry.userId === next.userId);
    const current = existingIndex >= 0 ? history[existingIndex] : null;
    if (current && now - Number(current.updatedAt || 0) < MIN_RECORD_INTERVAL_MS) return false;
    if (existingIndex >= 0) history.splice(existingIndex, 1);
    history.push(next);
    history.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
    store[key] = history.slice(0, MAX_USERS_PER_ENTRY);
    return true;
  }

  #entries(value) {
    const values = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
    return values.filter((entry) => entry && typeof entry.userId === 'string' && typeof entry.username === 'string');
  }

  #normalizeStore(store) {
    if (!store || typeof store !== 'object' || Array.isArray(store)) return {};
    return Object.fromEntries(Object.entries(store).map(([key, value]) => [key, this.#entries(value)]).filter(([, history]) => history.length));
  }

  projectSnapshot(excludeUserId = '') {
    return Object.fromEntries(Object.entries(this.projects).flatMap(([projectId, value]) => {
      const latest = this.#entries(value).find((entry) => !excludeUserId || entry.userId !== String(excludeUserId));
      return latest ? [[projectId, latest]] : [];
    }));
  }

  graphSnapshot(projectId, excludeUserId = '') {
    const prefix = `${projectId}:`;
    return Object.entries(this.graphs).flatMap(([key, value]) => {
      if (!key.startsWith(prefix)) return [];
      const latest = this.#entries(value).find((entry) => (!excludeUserId || entry.userId !== String(excludeUserId)) && typeof entry.graphId === 'string');
      return latest ? [latest] : [];
    }).sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
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
