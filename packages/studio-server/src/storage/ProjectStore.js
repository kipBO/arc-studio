import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDir } from '../storage.js';
import { serverConfig } from '../config.js';
import { getStarterProject } from './StarterProjects.js';

const registryPath = path.join(dataDir, 'projects.json');
const projectRoot = path.join(dataDir, 'projects');
const projectFiles = ['graphs.json', 'graph-library.json', 'bot-config.json', 'statistics.json', 'embeds.json', 'project-variables.json'];
const DEFAULT_MAX_PROJECTS = 10;
//
function cleanName(value) {
  const name = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64);
  if (!name) throw new TypeError('Enter a project name.');
  return name;
}

function normalizedName(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

export class ProjectStore {
  constructor(options = {}) {
    this.projects = [];
    this.activeProjectId = '';
    this.maxProjects = serverConfig.desktopMode ? null : DEFAULT_MAX_PROJECTS;
    this.load();
    if (options.activeProjectId && this.projects.some((project) => project.id === options.activeProjectId)) this.activeProjectId = options.activeProjectId;
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      if (Array.isArray(saved.projects)) {
        const ids = new Set();
        this.projects = saved.projects.filter((item) => {
          if (!item || !/^project_[a-f0-9-]{36}$/.test(item.id) || typeof item.name !== 'string' || ids.has(item.id)) return false;
          ids.add(item.id);
          return true;
        });
      }
      if (typeof saved.activeProjectId === 'string') this.activeProjectId = saved.activeProjectId;
      if (!serverConfig.desktopMode) {
        if (saved.maxProjects === null) this.maxProjects = null;
        else if (Number.isInteger(saved.maxProjects) && saved.maxProjects >= 1) this.maxProjects = saved.maxProjects;
      }
      for (const project of this.projects) {
        if (!Number.isInteger(project.idleDisconnectMinutes) || project.idleDisconnectMinutes < 0 || project.idleDisconnectMinutes > 1440) project.idleDisconnectMinutes = 15;
      }
    } catch {}
    if (!this.projects.length) {
      const hasLegacyData = projectFiles.filter((filename) => filename !== 'graph-library.json').some((filename) => {
        try { return fs.existsSync(path.join(dataDir, filename)); } catch { return false; }
      });
      const project = { id: `project_${randomUUID()}`, name: 'Default Project', createdAt: new Date().toISOString(), trusted: true, idleDisconnectMinutes: 15, ...(hasLegacyData ? {} : { emptyStart: true, pendingStarterChoice: true }) };
      this.projects = [project];
      this.activeProjectId = project.id;
      const destination = this.directory(project.id);
      fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
      for (const filename of projectFiles) {
        const source = path.join(dataDir, filename);
        const target = path.join(destination, filename);
        try { if (fs.existsSync(source) && !fs.existsSync(target)) fs.copyFileSync(source, target); } catch {}
      }
      this.persist();
    }
    if (!this.projects.some((item) => item.id === this.activeProjectId)) this.activeProjectId = this.projects[0].id;
    this.persist();
  }

  directory(id = this.activeProjectId) {
    if (!/^project_[a-f0-9-]{36}$/.test(String(id))) throw new TypeError('Invalid project ID.');
    return path.join(projectRoot, id);
  }

  persist() {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const temporary = `${registryPath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ activeProjectId: this.activeProjectId, maxProjects: this.maxProjects, projects: this.projects }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, registryPath);
    try { fs.chmodSync(registryPath, 0o600); } catch {}
  }

  list() { return { projects: this.projects.map((project) => ({ ...project })), activeProjectId: this.activeProjectId, maxProjects: this.maxProjects }; }
  active() { return this.projects.find((project) => project.id === this.activeProjectId) || this.projects[0]; }

  assertUniqueName(name, exceptId = '') {
    const normalized = normalizedName(name);
    if (this.projects.some((project) => project.id !== exceptId && normalizedName(project.name) === normalized)) {
      throw new TypeError('A project with this name already exists. Choose a different name.');
    }
  }

  create(name, starterId = 'blank', ownerId = '') {
    if (this.maxProjects !== null && this.projects.length >= this.maxProjects) throw new RangeError(`This workspace has reached its ${this.maxProjects}-project limit.`);
    const starter = getStarterProject(starterId) || getStarterProject('blank');
    const projectName = cleanName(name);
    this.assertUniqueName(projectName);
    const project = { id: `project_${randomUUID()}`, name: projectName, createdAt: new Date().toISOString(), ...(ownerId ? { ownerId } : {}), emptyStart: true, trusted: true, idleDisconnectMinutes: 15 };
    fs.mkdirSync(this.directory(project.id), { recursive: true, mode: 0o700 });
    if (starter.graphs.length) fs.writeFileSync(path.join(this.directory(project.id), 'graphs.json'), JSON.stringify({ graphs: starter.graphs, deletedIds: [] }, null, 2), { mode: 0o600 });
    if (starter.projectVariables?.length) fs.writeFileSync(path.join(this.directory(project.id), 'project-variables.json'), JSON.stringify(starter.projectVariables, null, 2), { mode: 0o600 });
    this.projects.push(project);
    this.persist();
    return { ...project };
  }

  initializeFirstProject(name, starterId = 'blank', ownerId = '') {
    const project = this.projects.find((item) => item.pendingStarterChoice);
    if (!project) throw new Error('This workspace already has a project.');
    const starter = getStarterProject(starterId);
    if (!starter) throw new TypeError('Choose one of the available project starters.');
    const projectName = cleanName(name);
    this.assertUniqueName(projectName, project.id);
    project.name = projectName;
    if (ownerId) project.ownerId = ownerId;
    project.emptyStart = true;
    project.pendingStarterChoice = false;
    project.trusted = true;
    const directory = this.directory(project.id);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(directory, 'graphs.json'), JSON.stringify({ graphs: starter.graphs, deletedIds: [] }, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'graph-library.json'), JSON.stringify({ defaultGraphId: starter.graphs[0]?.id || '', templates: [], snapshots: [] }, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'project-variables.json'), JSON.stringify(starter.projectVariables || [], null, 2), { mode: 0o600 });
    this.persist();
    return { ...project };
  }

  setMaxProjects(value) {
    if (serverConfig.desktopMode) throw new TypeError('Local desktop workspaces do not have a project limit.');
    if (value !== null && (!Number.isInteger(value) || value < 1)) throw new TypeError('Set a whole-number project limit, or choose unlimited.');
    this.maxProjects = value;
    this.persist();
    return this.maxProjects;
  }

  setIdleDisconnectMinutes(projectId, value) {
    if (serverConfig.desktopMode) throw new TypeError('Local desktop workspaces are exempt from idle disconnects.');
    if (!Number.isInteger(value) || value < 0 || value > 1440) throw new TypeError('Choose 0 (never) or a timeout from 1 to 1440 minutes.');
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) throw new Error('That project no longer exists.');
    project.idleDisconnectMinutes = value;
    this.persist();
    return value;
  }

  exportProject(id, { includeSecrets = false } = {}) {
    const project = this.projects.find((item) => item.id === id);
    if (!project) throw new Error('That project no longer exists.');
    const files = {};
    for (const filename of projectFiles) {
      try { files[filename] = JSON.parse(fs.readFileSync(path.join(this.directory(id), filename), 'utf8')); }
      catch { files[filename] = filename === 'graphs.json' ? { graphs: [], deletedIds: [] } : filename === 'graph-library.json' ? { templates: [], snapshots: [] } : {}; }
    }
    let sensitiveCount = 0;
    const redact = (value) => {
      if (Array.isArray(value)) return value.map(redact);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
        if (/token|authorization|cookie|secret|password|api[-_]?key|headers?/i.test(key)) {
          if (entry !== '' && entry !== null && entry !== undefined) sensitiveCount += 1;
          return includeSecrets ? [[key, redact(entry)]] : [];
        }
        return [[key, redact(entry)]];
      }));
    };
    const exportedFiles = redact(files);
    return { format: 'arc-project', version: 1, project: { name: project.name, exportedAt: new Date().toISOString() }, files: exportedFiles, sensitiveData: includeSecrets ? undefined : { omittedFields: sensitiveCount } };
  }

  importProject(bundle, { trusted = false, ownerId = '' } = {}) {
    if (!trusted) throw new Error('Confirm that you trust this project file before importing it.');
    if (!bundle || bundle.format !== 'arc-project' || bundle.version !== 1 || !bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) throw new TypeError('This is not a supported ARC project file.');
    if (this.maxProjects !== null && this.projects.length >= this.maxProjects) throw new RangeError(`This workspace has reached its ${this.maxProjects}-project limit.`);
    const name = cleanName(bundle.project?.name || 'Imported Project');
    this.assertUniqueName(name);
    const project = { id: `project_${randomUUID()}`, name, createdAt: new Date().toISOString(), ...(ownerId ? { ownerId } : {}), importedAt: new Date().toISOString(), emptyStart: true, trusted: true, idleDisconnectMinutes: 15 };
    const destination = this.directory(project.id);
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    try {
      for (const filename of projectFiles) {
        if (!Object.prototype.hasOwnProperty.call(bundle.files, filename)) continue;
        const content = JSON.stringify(bundle.files[filename], null, 2);
        if (content.length > 40 * 1024 * 1024) throw new RangeError(`Project file ${filename} is too large.`);
        fs.writeFileSync(path.join(destination, filename), content, { mode: 0o600 });
      }
      this.projects.push(project);
      this.persist();
      return { ...project };
    } catch (error) {
      fs.rmSync(destination, { recursive: true, force: true });
      throw error;
    }
  }

  activate(id, { persist = true } = {}) {
    const project = this.projects.find((item) => item.id === id);
    if (!project) throw new Error('That project no longer exists.');
    if (persist) this.activeProjectId = id;
    fs.mkdirSync(this.directory(id), { recursive: true, mode: 0o700 });
    if (persist) this.persist();
    return { ...project };
  }

  delete(id, confirmationName) {
    const project = this.projects.find((item) => item.id === id);
    if (!project) throw new Error('That project no longer exists.');
    if (this.projects.length <= 1) throw new Error('Keep at least one project in this workspace.');
    if (String(confirmationName || '').trim() !== project.name) throw new Error('Enter the project name exactly to confirm deletion.');
    if (this.activeProjectId === id) throw new Error('Open another project before deleting this one.');
    fs.rmSync(this.directory(id), { recursive: true, force: true });
    this.projects = this.projects.filter((item) => item.id !== id);
    this.persist();
    return { ...project };
  }
}
