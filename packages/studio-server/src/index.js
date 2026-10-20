import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import fs from 'node:fs';

import { serverConfig } from './config.js';
import { Logger } from './engine/Logger.js';
import { UserStore } from './security/UserStore.js';
import { StartupDiagnostics } from './engine/StartupDiagnostics.js';
import { BotManager } from './engine/BotManager.js';
import { createApiRouter } from './routes/api.js';
import { createBotManagerProxy } from './engine/RequestBotManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = new Logger();
const diagnostics = StartupDiagnostics.run();
const requiredEnvironmentFailure = diagnostics.checks.find((check) => check.name === 'Environment Variables' && check.status === 'FAIL');
if (requiredEnvironmentFailure) {
  const message = `[Startup] ${requiredEnvironmentFailure.message}. Set the value in .env or the server environment before starting ARC Studio.`;
  console.error(message);
  logger.log('ERROR', message);
  await new Promise((resolveClose) => logger.close(resolveClose));
  process.exit(1);
}
const userStore = new UserStore();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 40 * 1024 * 1024 });
//
const liveGraphStates = new Map();
const liveCollaborationActions = new Map();
const liveCollaborationStudioDrafts = new Map();
const liveNoteEditLocks = new Map();
const liveProjectTabs = new Map();
const recentProjectGraphUse = new Map();
const NOTE_EDIT_LOCK_TTL_MS = 15_000;
const collaboratorColors = ['#63b3ed', '#f687b3', '#68d391', '#f6ad55', '#b794f4', '#4fd1c5', '#fc8181', '#90cdf4', '#fbd38d', '#9ae6b4'];
const collaboratorColor = (id) => {
  let hash = 0;
  for (const char of String(id || '')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return collaboratorColors[(hash >>> 0) % collaboratorColors.length];
};
const collaborationRoomKey = (projectId, graphId) => `${projectId}:${graphId}`;
const sendToCollaborationRoom = (roomKey, data, excludedClient = null) => {
  const serialized = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== excludedClient && client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcRoomKey === roomKey) client.send(serialized);
  }
};
const noteLockSnapshot = (roomKey) => [...(liveNoteEditLocks.get(roomKey)?.values() || [])]
  .map(({ timer, socket, note, ...lock }) => lock);
const sameCollaborationValue = (left, right) => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameCollaborationValue(value, right[index]));
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key) && sameCollaborationValue(left[key], right[key]));
};
const publishNoteEditLocks = (roomKey) => {
  const [projectId, ...graphParts] = roomKey.split(':');
  sendToCollaborationRoom(roomKey, {
    type: 'NOTE_EDIT_LOCKS_UPDATED',
    payload: { projectId, graphId: graphParts.join(':'), locks: noteLockSnapshot(roomKey) }
  });
};
function publishPresence() {
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.readyState !== WebSocket.OPEN || !client.arcPresence) continue;
    const peers = [...wss.clients].filter((peer) => peer !== client && peer.arcAuthenticated && peer.readyState === WebSocket.OPEN
      && peer.arcPresence?.projectId === client.arcPresence.projectId && peer.arcPresence?.graphId === client.arcPresence.graphId)
      .map((peer) => ({ id: peer.arcUser?.id, username: peer.arcUser?.username }))
      .filter((user) => user.id && user.username)
      .filter((user, index, users) => users.findIndex((item) => item.id === user.id) === index);
    client.send(JSON.stringify({ type: 'COLLABORATORS_UPDATED', payload: peers }));
  }
  const projectUsers = new Map();
  for (const peer of wss.clients) {
    if (!peer.arcAuthenticated || peer.readyState !== WebSocket.OPEN || !peer.arcProjectId || !peer.arcUser?.username) continue;
    const members = projectUsers.get(peer.arcProjectId) || [];
    if (!members.some((member) => member.id === peer.arcUser.id)) members.push({ id: peer.arcUser.id, username: peer.arcUser.username });
    projectUsers.set(peer.arcProjectId, members);
  }
  const payload = Object.fromEntries(projectUsers);
  for (const client of wss.clients) if (client.arcAuthenticated && client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'PROJECT_USERS_UPDATED', payload }));
  const projectIds = new Set([...wss.clients].filter((client) => client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcProjectId).map((client) => client.arcProjectId));
  for (const projectId of new Set([...projectIds, ...liveProjectTabs.keys()])) publishProjectCollaboration(projectId);
}
function publishProjectCollaboration(projectId) {
  if (!projectId) return;
  const clients = [...wss.clients].filter((client) => client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcProjectId === projectId);
  if (!clients.length) return;
  const users = new Map();
  for (const client of clients) {
    const user = client.arcUser;
    if (!user?.id || !user.username) continue;
    let collaborator = users.get(user.id);
    if (!collaborator) {
      collaborator = { userId: user.id, username: user.username, color: client.arcColor || collaboratorColor(user.id), graphIds: [] };
      users.set(user.id, collaborator);
    }
    const graphId = client.arcPresence?.projectId === projectId ? client.arcPresence.graphId : '';
    if (graphId && !collaborator.graphIds.includes(graphId)) collaborator.graphIds.push(graphId);
  }
  const activity = new Map();
  for (const state of liveGraphStates.values()) {
    if (state.projectId !== projectId || Date.now() - state.updatedAt > 30 * 60 * 1000 || !state.user?.id) continue;
    activity.set(state.graphId, { graphId: state.graphId, userId: state.user.id, updatedAt: state.updatedAt });
  }
  for (const [key, entry] of recentProjectGraphUse) {
    if (!key.startsWith(`${projectId}:`)) continue;
    if (Date.now() - entry.updatedAt > 30 * 60 * 1000) { recentProjectGraphUse.delete(key); continue; }
    const previous = activity.get(entry.graphId);
    if (!previous || previous.updatedAt < entry.updatedAt) activity.set(entry.graphId, { graphId: entry.graphId, userId: entry.userId, updatedAt: entry.updatedAt });
  }
  const payload = {
    projectId,
    graphIds: [...(liveProjectTabs.get(projectId) || [])].slice(0, 12),
    tabsInitialized: liveProjectTabs.has(projectId),
    graphActivity: [...activity.values()],
    users: [...users.values()]
  };
  const message = JSON.stringify({ type: 'PROJECT_COLLABORATION_UPDATED', payload });
  for (const client of clients) client.send(message);
}

const desktopOrigins = (process.env.ARC_CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors(desktopOrigins.length ? {
  origin(origin, callback) {
    if (!origin || desktopOrigins.includes(origin)) callback(null, true);
    else callback(new Error('This origin is not allowed to access the local Studio service.'));
  }
} : undefined));
app.use(express.json({ limit: '40mb' }));

function broadcast(data) {
  const json = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.arcAuthenticated && client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

function notifyUser(userId, data) {
  const json = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.arcAuthenticated && client.arcUser?.id === userId && client.readyState === WebSocket.OPEN) client.send(json);
  }
}

userStore.on('sessionReplacementPending', ({ userId, expiresAt }) => notifyUser(userId, {
  type: 'SESSION_REPLACEMENT_PENDING',
  payload: { expiresAt }
}));
userStore.on('sessionReplaced', ({ userId }) => notifyUser(userId, { type: 'SESSION_REPLACED' }));
userStore.on('sessionExpired', ({ userId, reason }) => notifyUser(userId, { type: 'SESSION_IDLE_EXPIRED', payload: { reason } }));
userStore.on('permissionsUpdated', ({ user }) => {
  const payload = JSON.stringify({ type: 'USER_PERMISSIONS_UPDATED', payload: { user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions || [] } } });
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.arcUser?.id !== user.id || client.readyState !== WebSocket.OPEN) continue;
    client.arcUser = { ...client.arcUser, role: user.role, permissions: user.permissions || [] };
    client.send(payload);
  }
});
userStore.on('usernameUpdated', ({ user }) => {
  const payload = JSON.stringify({ type: 'USER_PROFILE_UPDATED', payload: { user: { id: user.id, username: user.username } } });
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.arcUser?.id !== user.id || client.readyState !== WebSocket.OPEN) continue;
    client.arcUser = { ...client.arcUser, username: user.username };
    client.send(payload);
  }
  publishPresence();
});
userStore.on('sessionRevoked', ({ userId }) => {
  const payload = JSON.stringify({ type: 'SESSION_REVOKED', payload: { reason: 'admin' } });
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.arcUser?.id !== userId || client.readyState !== WebSocket.OPEN) continue;
    client.send(payload, () => client.close(1008, 'Session ended by a workspace administrator.'));
  }
});

logger.onLog((entry) => {
  broadcast({ type: 'LOG_ENTRY', payload: entry });
});

const botManager = new BotManager({ broadcastWS: broadcast, logger });
const projectStore = botManager.projectStore;
const userBotManagers = new Map();
const managerForUser = (user) => {
  const requestedId = projectStore.projects.some((project) => project.id === user?.activeProjectId) ? user.activeProjectId : projectStore.activeProjectId;
  const managerKey = requestedId;
  let manager = userBotManagers.get(managerKey);
  if (!manager) {
    manager = new BotManager({
      projectStore,
      projectId: requestedId,
      logger,
      broadcastWS(message) {
        const json = JSON.stringify(message);
        for (const client of wss.clients) {
          if (client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcPresence?.projectId === manager.project.id) client.send(json);
        }
      }
    });
    userBotManagers.set(managerKey, manager);
  }
  return manager;
};
managerForUser.stopOtherGateways = async (currentManager) => {
  for (const manager of userBotManagers.values()) {
    if (manager !== currentManager && (manager.status === 'ONLINE' || manager.status === 'CONNECTING')) manager.stopBot();
  }
  if (botManager !== currentManager && (botManager.status === 'ONLINE' || botManager.status === 'CONNECTING')) botManager.stopBot();
};
const scopedBotManager = createBotManagerProxy(botManager);

const idleDisconnectTimer = !serverConfig.desktopMode ? setInterval(() => {
  const now = Date.now();
  for (const user of userStore.users) {
    if (!user.activeSessionId) continue;
    const activeSockets = [...wss.clients].filter((client) => client.arcAuthenticated && client.arcUser?.id === user.id && client.readyState === WebSocket.OPEN);
    if (!activeSockets.length) continue;
    const project = projectStore.projects.find((item) => item.id === user.activeProjectId) || projectStore.projects.find((item) => item.id === activeSockets[0].arcProjectId);
    const timeoutMinutes = Number.isInteger(project?.idleDisconnectMinutes) ? project.idleDisconnectMinutes : 15;
    if (timeoutMinutes === 0) continue;
    const timeoutMs = timeoutMinutes * 60_000;
    if (activeSockets.every((socket) => now - (socket.arcLastActivityAt || socket.arcAuthenticatedAt || now) >= timeoutMs)) {
      userStore.expireUserSession(user.id, 'idle');
    }
  }
}, 15_000) : null;
idleDisconnectTimer?.unref?.();

app.use('/api', createApiRouter(
  scopedBotManager,
  userStore,
  logger,
  managerForUser,
  broadcast,
  (userId) => [...wss.clients].some((client) => client.arcAuthenticated && client.arcUser?.id === userId && client.readyState === WebSocket.OPEN)
));

const clientDistPath = resolve(__dirname, '../../studio-client/dist');
const serverOnlyMode = process.env.ARC_SERVER_ONLY === '1';
if (!serverOnlyMode && fs.existsSync(clientDistPath)) {
  const studioHtmlPath = resolve(clientDistPath, 'index.html');
  const sendStudioPage = (req, res, next) => {
    try {
      const isNightly = String(serverConfig.version).includes('-');
      const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
      const protocol = ['http', 'https'].includes(forwardedProtocol) ? forwardedProtocol : req.protocol;
      const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
      const imageName = isNightly ? 'nightly-icon.png' : 'arc.png';
      const imageUrl = host ? new URL(`/${imageName}`, `${protocol}://${host}`).href : `/${imageName}`;
      let html = fs.readFileSync(studioHtmlPath, 'utf8');
      html = html.replace(/(<meta property="og:image" content=")[^"]+("\s*\/>)/, (_match, prefix, suffix) => `${prefix}${imageUrl}${suffix}`);
      html = html.replace(/(<meta name="twitter:image" content=")[^"]+("\s*\/>)/, (_match, prefix, suffix) => `${prefix}${imageUrl}${suffix}`);
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  };
  app.get('/', sendStudioPage);
  app.use(express.static(clientDistPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      } else if (filePath.includes(`${sep}assets${sep}`)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('/assets/*', (_req, res) => {
    res.set('Cache-Control', 'no-store').status(404).type('text/plain').send('ARC Studio client asset not found. Refresh the page to load the current version.');
  });
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      sendStudioPage(req, res, (error) => {
        if (error) logger.log('ERROR', `Could not serve Studio page: ${error.message}`);
        if (!res.headersSent) res.status(500).send('Could not load ARC Studio.');
      });
    }
  });
}
//
wss.on('connection', (ws) => {
  ws.arcAuthenticated = false;
  const authTimeout = setTimeout(() => {
    if (!ws.arcAuthenticated && ws.readyState === WebSocket.OPEN) ws.close(1008, 'Authentication required.');
  }, 5000);
  authTimeout.unref?.();
  const clearCollaborationAction = (leaveRoom = true, clearDrafts = true, studioId = '') => {
    clearTimeout(ws.arcActionExpiry);
    ws.arcActionExpiry = null;
    const roomKey = ws.arcRoomKey;
    if (!roomKey || !ws.arcUser?.id) return;
    const room = liveCollaborationActions.get(roomKey);
    if (room?.delete(ws.arcUser.id)) sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_CLEARED', payload: { userId: ws.arcUser.id } }, ws);
    if (!room?.size) liveCollaborationActions.delete(roomKey);
    if (clearDrafts) {
      const drafts = liveCollaborationStudioDrafts.get(roomKey);
      if (drafts) {
        for (const [key, draft] of drafts) if (draft.userId === ws.arcUser.id && (!studioId || draft.action.studioId === studioId)) drafts.delete(key);
        if (!drafts.size) liveCollaborationStudioDrafts.delete(roomKey);
      }
    }
    if (leaveRoom) ws.arcRoomKey = null;
  };
  const removeNoteEditLock = (roomKey, noteId, { expired = false } = {}) => {
    const room = liveNoteEditLocks.get(roomKey);
    const lock = room?.get(noteId);
    if (!lock) return false;
    clearTimeout(lock.timer);
    room.delete(noteId);
    if (!room.size) liveNoteEditLocks.delete(roomKey);
    if (expired && lock.socket?.readyState === WebSocket.OPEN) {
      const graph = liveGraphStates.get(`${lock.projectId}:${lock.graphId}`)?.graph;
      const note = graph?.notes?.find((item) => item.id === noteId) || lock.note || null;
      lock.socket.send(JSON.stringify({ type: 'NOTE_EDIT_LOCK_LOST', payload: { projectId: lock.projectId, graphId: lock.graphId, noteId, note } }));
    }
    publishNoteEditLocks(roomKey);
    return true;
  };
  const clearNoteEditLocksForSocket = (socket, roomFilter = null, deferUntilExpiry = false) => {
    const changedRooms = new Set();
    for (const [roomKey, room] of liveNoteEditLocks) {
      if (roomFilter && roomFilter !== roomKey) continue;
      for (const [noteId, lock] of room) {
        if (lock.socket !== socket) continue;
        if (deferUntilExpiry && lock.expiresAt > Date.now()) continue;
        clearTimeout(lock.timer);
        room.delete(noteId);
        changedRooms.add(roomKey);
      }
      if (!room.size) liveNoteEditLocks.delete(roomKey);
    }
    for (const roomKey of changedRooms) publishNoteEditLocks(roomKey);
  };
  ws.on('close', () => { clearTimeout(authTimeout); clearCollaborationAction(); clearNoteEditLocksForSocket(ws, null, true); publishPresence(); });
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!ws.arcAuthenticated) {
        const user = msg.type === 'AUTH' ? userStore.validateSession(msg.token) : null;
        if (!user) {
          ws.close(1008, 'Authentication required.');
          return;
        }
        if (user.mustChangePassword) {
          ws.close(1008, 'Change your password before continuing.');
          return;
        }
        ws.arcAuthenticated = true;
        ws.arcAuthenticatedAt = Date.now();
        ws.arcLastActivityAt = ws.arcAuthenticatedAt;
        ws.arcToken = msg.token;
        ws.arcUser = { id: user.id, username: user.username, role: user.role, permissions: user.permissions || [] };
        ws.arcProjectId = projectStore.projects.some((project) => project.id === user.activeProjectId) ? user.activeProjectId : projectStore.activeProjectId;
        ws.arcManager = managerForUser({ ...user, activeProjectId: ws.arcProjectId });
        ws.arcColor = collaboratorColor(user.id);
        clearTimeout(authTimeout);
        ws.send(JSON.stringify({
          type: 'INIT_STATE',
          payload: {
            botStatus: ws.arcManager.status,
            botMetrics: ws.arcManager.gatewayMetrics,
            botProfile: ws.arcManager.botProfile ? { ...ws.arcManager.botProfile, intentSummary: ws.arcManager.getIntentPlan() } : null,
            logs: ws.arcManager.getLogs().slice(-100),
            graphs: ws.arcManager.getGraphs(),
            graphLibrary: ws.arcManager.getGraphLibrary(),
            projects: ws.arcManager.getProjects(),
            projectVariables: ws.arcManager.getProjectVariables(),
            version: serverConfig.version,
            chezcordVersion: serverConfig.chezcordVersion,
            diagnostics
          }
        }));
        publishPresence();
      } else if (msg.type !== 'AUTH') {
        const currentUser = userStore.validateSession(ws.arcToken);
        if (!currentUser) {
          ws.arcAuthenticated = false;
          ws.close(1008, 'Session expired or permissions changed. Sign in again.');
          return;
        }
        ws.arcUser = { id: currentUser.id, username: currentUser.username, role: currentUser.role, permissions: currentUser.permissions || [] };
        if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      } else if (msg.type === 'USER_ACTIVITY') {
        ws.arcLastActivityAt = Date.now();
      } else if (['PROJECT_TABS_SYNC', 'PROJECT_TAB_OPEN', 'PROJECT_TAB_CLOSE'].includes(msg.type)) {
        const projectId = ws.arcProjectId;
        if (!projectId || !projectStore.projects.some((project) => project.id === projectId)) return;
        const availableGraphIds = new Set(ws.arcManager.getGraphs().map((graph) => graph.id));
        let graphIds = liveProjectTabs.get(projectId);
        if (!graphIds) {
          graphIds = new Set();
          liveProjectTabs.set(projectId, graphIds);
        }
        const isSync = msg.type === 'PROJECT_TABS_SYNC';
        const requestedIds = isSync && Array.isArray(msg.graphIds) ? msg.graphIds.slice(0, 12) : [msg.graphId];
        const requestedSet = new Set(requestedIds.filter((id) => typeof id === 'string'));
        const graphSnapshots = isSync && Array.isArray(msg.graphs) ? msg.graphs.slice(0, 12) : msg.type === 'PROJECT_TAB_OPEN' && msg.graph ? [msg.graph] : [];
        const snapshotBytes = graphSnapshots.reduce((size, graph) => {
          try { return size + JSON.stringify(graph).length; } catch { return size; }
        }, 0);
        if (snapshotBytes > (isSync ? 20_000_000 : 30_000_000)) return;
        let acceptedSnapshots = 0;
        for (const candidate of graphSnapshots) {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !requestedSet.has(candidate.id)
            || availableGraphIds.has(candidate.id) || typeof candidate.id !== 'string' || candidate.id.length > 100
            || !Array.isArray(candidate.nodes) || !Array.isArray(candidate.connections)
            || candidate.nodes.length > 2000 || candidate.connections.length > 10000) continue;
          if (!ws.arcUser?.permissions?.includes('*') && !ws.arcUser?.permissions?.includes('graphs:write')) continue;
          let serialized;
          try { serialized = JSON.stringify(candidate); } catch { continue; }
          if (serialized.length > 30_000_000) continue;
          const graphKey = `${projectId}:${candidate.id}`;
          if (!liveGraphStates.has(graphKey)) {
            const graph = JSON.parse(serialized);
            liveGraphStates.set(graphKey, { projectId, graphId: graph.id, graph, revision: 0, updatedAt: Date.now(), user: { id: ws.arcUser.id, username: ws.arcUser.username }, serializedGraph: serialized });
          }
          const sharedGraph = liveGraphStates.get(graphKey)?.graph;
          if (sharedGraph) {
            const message = JSON.stringify({ type: 'PROJECT_TAB_GRAPH_UPDATED', payload: { projectId, graph: sharedGraph } });
            for (const client of wss.clients) if (client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcProjectId === projectId) client.send(message);
          }
          availableGraphIds.add(candidate.id);
          acceptedSnapshots += 1;
        }
        let changed = false;
        let rejectedForLimit = false;
        for (const graphId of requestedIds) {
          if (typeof graphId !== 'string' || graphId.length > 100 || !availableGraphIds.has(graphId)) continue;
          if (msg.type === 'PROJECT_TAB_CLOSE') changed = graphIds.delete(graphId) || changed;
          else if (!graphIds.has(graphId)) {
            if (graphIds.size < 12) {
              graphIds.add(graphId);
              changed = true;
            } else rejectedForLimit = true;
          }
        }
        for (const graphId of graphIds) {
          if (availableGraphIds.has(graphId)) continue;
          const liveState = liveGraphStates.get(`${projectId}:${graphId}`);
          if (liveState?.graph) ws.send(JSON.stringify({ type: 'PROJECT_TAB_GRAPH_UPDATED', payload: { projectId, graph: liveState.graph } }));
          else { graphIds.delete(graphId); changed = true; }
        }
        if (msg.type === 'PROJECT_TAB_OPEN' && typeof msg.graphId === 'string' && rejectedForLimit) {
          ws.send(JSON.stringify({ type: 'PROJECT_TAB_REJECTED', payload: { projectId, graphId: msg.graphId, reason: 'limit', message: 'The shared workspace already has 12 open graphs. Close a shared tab before opening another.' } }));
        } else if (msg.type === 'PROJECT_TAB_OPEN' && typeof msg.graphId === 'string' && !availableGraphIds.has(msg.graphId)) {
          ws.send(JSON.stringify({ type: 'PROJECT_TAB_REJECTED', payload: { projectId, graphId: msg.graphId, reason: 'unavailable', message: 'This unsaved graph could not be shared. Save it first, then reopen it.' } }));
        }
        if (changed || isSync || acceptedSnapshots) publishProjectCollaboration(projectId);
      } else if (msg.type === 'PRESENCE') {
        const projectId = typeof msg.projectId === 'string' && projectStore.projects.some((project) => project.id === msg.projectId) ? msg.projectId : '';
        if (projectId && projectId !== ws.arcProjectId) {
          const owner = userStore.users.find((item) => item.id === ws.arcUser.id);
          if (owner) owner.activeProjectId = projectId;
          ws.arcProjectId = projectId;
          ws.arcManager = managerForUser({ ...ws.arcUser, activeProjectId: projectId });
          if (owner) userStore.saveState();
        }
        const graphId = typeof msg.graphId === 'string' && msg.graphId.length <= 100 ? msg.graphId : '';
        const nextRoomKey = projectId && graphId ? collaborationRoomKey(projectId, graphId) : null;
        if (ws.arcRoomKey !== nextRoomKey) {
          clearNoteEditLocksForSocket(ws, ws.arcRoomKey);
          clearCollaborationAction();
        }
        ws.arcPresence = projectId && graphId ? { projectId, graphId } : null;
        ws.arcRoomKey = nextRoomKey;
        if (projectId && graphId) {
          const now = Date.now();
          recentProjectGraphUse.set(`${projectId}:${graphId}`, { projectId, graphId, userId: ws.arcUser.id, updatedAt: now });
        }
        if (nextRoomKey) {
          const room = liveCollaborationActions.get(nextRoomKey);
          if (room) for (const action of room.values()) ws.send(JSON.stringify({ type: 'COLLAB_ACTION_UPDATED', payload: action }));
          ws.send(JSON.stringify({ type: 'NOTE_EDIT_LOCKS_UPDATED', payload: { projectId, graphId, locks: noteLockSnapshot(nextRoomKey) } }));
        }
        let liveState = ws.arcPresence ? liveGraphStates.get(`${projectId}:${graphId}`) : null;
        if (ws.arcPresence && !liveState) {
          const initialGraph = ws.arcManager.getGraphs().find((graph) => graph.id === graphId);
          if (initialGraph) {
            const serializedGraph = JSON.stringify(initialGraph);
            liveState = { projectId, graphId, graph: initialGraph, revision: 0, updatedAt: Date.now(), user: null, serializedGraph };
            liveGraphStates.set(`${projectId}:${graphId}`, liveState);
          }
        }
        if (liveState) {
          const payload = { ...liveState };
          delete payload.serializedGraph;
          ws.send(JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload }));
        } else if (ws.arcPresence) ws.send(JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload: { projectId, graphId, ready: true, revision: 0 } }));
        publishPresence();
      } else if (msg.type === 'NOTE_EDIT_LOCK_REQUEST' || msg.type === 'NOTE_EDIT_LOCK_RELEASE') {
        const roomKey = ws.arcRoomKey;
        const actionProjectId = typeof msg.projectId === 'string' ? msg.projectId : '';
        const actionGraphId = typeof msg.graphId === 'string' ? msg.graphId : '';
        const noteId = typeof msg.noteId === 'string' ? msg.noteId : '';
        if (!roomKey || !ws.arcPresence || actionProjectId !== ws.arcPresence.projectId || actionGraphId !== ws.arcPresence.graphId
          || !noteId || noteId.length > 100) return;
        if (msg.type === 'NOTE_EDIT_LOCK_RELEASE') {
          const room = liveNoteEditLocks.get(roomKey);
          if (room?.get(noteId)?.socket === ws) removeNoteEditLock(roomKey, noteId);
          return;
        }
        const now = Date.now();
        if (!ws.arcNoteLockRate || now - ws.arcNoteLockRate.windowAt >= 1000) ws.arcNoteLockRate = { windowAt: now, count: 0 };
        if (++ws.arcNoteLockRate.count > 20) return;
        const permissions = ws.arcUser?.permissions || [];
        if (!permissions.includes('*') && !permissions.includes('graphs:write')) return;
        const clientId = typeof msg.clientId === 'string' && msg.clientId.length <= 120 ? msg.clientId : '';
        if (!clientId) return;
        const liveState = liveGraphStates.get(`${actionProjectId}:${actionGraphId}`);
        const sourceGraph = liveState?.graph || ws.arcManager.getGraphs().find((graph) => graph.id === actionGraphId);
        const note = sourceGraph?.notes?.find((item) => item.id === noteId);
        if (!note) {
          ws.send(JSON.stringify({ type: 'NOTE_EDIT_LOCK_REJECTED', payload: { projectId: actionProjectId, graphId: actionGraphId, noteId, message: 'This note is no longer in the graph.' } }));
          return;
        }
        let room = liveNoteEditLocks.get(roomKey);
        if (!room) { room = new Map(); liveNoteEditLocks.set(roomKey, room); }
        const existing = room.get(noteId);
        if (existing && existing.expiresAt <= now) removeNoteEditLock(roomKey, noteId, { expired: true });
        const current = liveNoteEditLocks.get(roomKey)?.get(noteId);
        if (current && (current.socket !== ws || current.clientId !== clientId || current.userId !== ws.arcUser.id)) {
          ws.send(JSON.stringify({ type: 'NOTE_EDIT_LOCKS_UPDATED', payload: { projectId: actionProjectId, graphId: actionGraphId, locks: noteLockSnapshot(roomKey) } }));
          return;
        }
        const isRenewal = Boolean(current);
        if (current) clearTimeout(current.timer);
        const lock = {
          projectId: actionProjectId,
          graphId: actionGraphId,
          noteId,
          userId: ws.arcUser.id,
          username: ws.arcUser.username,
          color: ws.arcColor || collaboratorColor(ws.arcUser.id),
          clientId,
          expiresAt: now + NOTE_EDIT_LOCK_TTL_MS,
          socket: ws,
          note: JSON.parse(JSON.stringify(note))
        };
        lock.timer = setTimeout(() => {
          if (liveNoteEditLocks.get(roomKey)?.get(noteId) === lock) removeNoteEditLock(roomKey, noteId, { expired: true });
        }, NOTE_EDIT_LOCK_TTL_MS + 10);
        lock.timer.unref?.();
        room = liveNoteEditLocks.get(roomKey) || new Map();
        room.set(noteId, lock);
        liveNoteEditLocks.set(roomKey, room);
        publishNoteEditLocks(roomKey);
      } else if (msg.type === 'COLLAB_ACTION') {
        const roomKey = ws.arcRoomKey;
        const action = msg.action;
        const permissions = ws.arcUser?.permissions || [];
        if (!roomKey || !ws.arcPresence || !action || typeof action !== 'object' || Array.isArray(action)) return;
        const now = Date.now();
        const kind = action.kind;
        if (!['cursor', 'selection', 'node-drag', 'note-drag', 'wire-drag', 'library-drag', 'navigation', 'node-edit', 'studio-focus', 'studio-draft', 'studio-cursor', 'idle'].includes(kind)) return;
        if (!ws.arcActionRates || now - ws.arcActionRates.windowAt >= 1000) ws.arcActionRates = { windowAt: now, counts: Object.create(null) };
        const rateGroup = kind === 'studio-draft' ? 'studio-draft' : ['cursor', 'selection', 'node-drag', 'note-drag', 'wire-drag', 'library-drag'].includes(kind) ? 'canvas' : 'other';
        ws.arcActionRates.counts[rateGroup] = (ws.arcActionRates.counts[rateGroup] || 0) + 1;
        const limit = rateGroup === 'studio-draft' ? 30 : rateGroup === 'canvas' ? 90 : 35;
        if (ws.arcActionRates.counts[rateGroup] > limit) return;
        const point = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) <= 1_000_000 && Math.abs(value.y) <= 1_000_000 ? { x: value.x, y: value.y } : null;
        if (kind === 'idle') {
          const cursor = point(action.cursor);
          if (!cursor) { clearCollaborationAction(false, true, typeof action.studioId === 'string' ? action.studioId : ''); return; }
          const room = liveCollaborationActions.get(roomKey) || new Map();
          const envelope = { userId: ws.arcUser.id, username: ws.arcUser.username, color: ws.arcColor || collaboratorColor(ws.arcUser.id), projectId: ws.arcPresence.projectId, graphId: ws.arcPresence.graphId, action: { kind: 'idle', cursor }, updatedAt: now };
          room.set(ws.arcUser.id, envelope);
          liveCollaborationActions.set(roomKey, room);
          sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: envelope }, ws);
          clearTimeout(ws.arcActionExpiry);
          ws.arcActionExpiry = null;
          return;
        }
        const readOnlyCollaboration = ['cursor', 'selection', 'navigation', 'studio-focus', 'studio-cursor'].includes(kind);
        if (!readOnlyCollaboration && !permissions.includes('*') && !permissions.includes('graphs:write')) return;
        let cleanAction;
        if (kind === 'navigation') {
          cleanAction = { kind: 'navigation', label: typeof action.label === 'string' ? action.label.slice(0, 32) : 'Navigating menus' };
        } else if (['cursor', 'selection', 'node-drag', 'note-drag', 'wire-drag', 'library-drag'].includes(kind)) {
          const cursor = point(action.cursor);
          if (kind !== 'selection' && !cursor) return;
          cleanAction = { kind, ...(cursor ? { cursor } : {}), mode: typeof action.mode === 'string' ? action.mode.slice(0, 24) : kind };
          if (Array.isArray(action.selectedNodeIds)) cleanAction.selectedNodeIds = action.selectedNodeIds.filter((id) => typeof id === 'string' && id.length <= 100).slice(0, 2000);
          if (kind === 'selection' && action.selectionRect && typeof action.selectionRect === 'object') {
            const left = Number(action.selectionRect.left); const top = Number(action.selectionRect.top);
            const right = Number(action.selectionRect.right); const bottom = Number(action.selectionRect.bottom);
            if ([left, top, right, bottom].every((value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000) && right >= left && bottom >= top) {
              cleanAction.selectionRect = { left, top, right, bottom };
            }
          }
          if (kind === 'library-drag') {
            if (typeof action.nodeType !== 'string' || action.nodeType.length > 100) return;
            cleanAction.nodeType = action.nodeType;
            cleanAction.label = typeof action.label === 'string' ? action.label.slice(0, 80) : '';
          }
          if (kind === 'node-drag' && Array.isArray(action.nodeIds)) cleanAction.nodeIds = action.nodeIds.filter((id) => typeof id === 'string' && id.length <= 100).slice(0, 50);
          if (kind === 'note-drag' && typeof action.noteId === 'string') cleanAction.noteId = action.noteId.slice(0, 100);
          if (kind === 'wire-drag') {
            const start = point(action.start);
            if (!start) return;
            cleanAction.start = start;
            cleanAction.pinType = typeof action.pinType === 'string' ? action.pinType.slice(0, 32) : 'any';
          }
          if (kind === 'node-edit' && typeof action.nodeId === 'string') cleanAction.nodeId = action.nodeId.slice(0, 100);
        } else if (kind === 'studio-draft') {
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !['embed', 'text', 'arguments'].includes(action.studioType) || !action.draft || typeof action.draft !== 'object' || Array.isArray(action.draft)) return;
          let serialized;
          try { serialized = JSON.stringify(action.draft); } catch { return; }
          if (serialized.length > 300_000) return;
          cleanAction = { kind, studioId: action.studioId, studioType: action.studioType, draft: JSON.parse(serialized) };
          if (Number.isInteger(action.draft.caret) && action.draft.caret >= 0 && action.draft.caret <= 1_000_000) cleanAction.draft.caret = action.draft.caret;
        } else if (kind === 'studio-cursor') {
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !Number.isInteger(action.caret) || action.caret < 0 || action.caret > 1_000_000) return;
          cleanAction = { kind, studioId: action.studioId, caret: action.caret };
        } else if (kind === 'studio-focus') {
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !['embed', 'text', 'arguments'].includes(action.studioType)) return;
          cleanAction = { kind, studioId: action.studioId, studioType: action.studioType, label: typeof action.label === 'string' ? action.label.slice(0, 80) : '' };
        } else if (kind === 'node-edit') {
          if (typeof action.nodeId !== 'string' || action.nodeId.length > 100) return;
          cleanAction = { kind, nodeId: action.nodeId.slice(0, 100), mode: 'text' };
        } else cleanAction = { kind: 'idle' };
        const room = liveCollaborationActions.get(roomKey) || new Map();
        const priorAction = room.get(ws.arcUser.id)?.action;
        if (kind !== 'idle' && !cleanAction.cursor && priorAction?.cursor) cleanAction.cursor = priorAction.cursor;
        if (kind !== 'idle' && !Array.isArray(cleanAction.selectedNodeIds) && Array.isArray(priorAction?.selectedNodeIds)) cleanAction.selectedNodeIds = priorAction.selectedNodeIds;
        const envelope = { userId: ws.arcUser.id, username: ws.arcUser.username, color: ws.arcColor || collaboratorColor(ws.arcUser.id), projectId: ws.arcPresence.projectId, graphId: ws.arcPresence.graphId, action: cleanAction, updatedAt: now };
        if (kind === 'studio-draft') {
          const drafts = liveCollaborationStudioDrafts.get(roomKey) || new Map();
          drafts.set(`${ws.arcUser.id}:${cleanAction.studioId}`, envelope);
          liveCollaborationStudioDrafts.set(roomKey, drafts);
        } else if (kind === 'studio-focus' || kind === 'studio-cursor') {
          const drafts = liveCollaborationStudioDrafts.get(roomKey);
          const requestedStudioId = cleanAction.studioId;
          if (drafts) for (const draft of drafts.values()) {
            if (draft.userId !== ws.arcUser.id && draft.action.studioId === requestedStudioId) ws.send(JSON.stringify({ type: 'COLLAB_ACTION_UPDATED', payload: draft }));
          }
        }
        room.set(ws.arcUser.id, envelope);
        liveCollaborationActions.set(roomKey, room);
        sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: envelope }, ws);
        clearTimeout(ws.arcActionExpiry);
        ws.arcActionExpiry = setTimeout(() => {
          const activeRoom = liveCollaborationActions.get(roomKey);
          const active = activeRoom?.get(ws.arcUser?.id);
          if (active?.action?.selectedNodeIds?.length) {
            const selection = {
              ...active,
              action: { kind: 'selection', mode: 'select', selectedNodeIds: active.action.selectedNodeIds, ...(active.action.cursor ? { cursor: active.action.cursor, cursorIdle: true } : {}) },
              updatedAt: Date.now()
            };
            activeRoom.set(ws.arcUser.id, selection);
            sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: selection }, ws);
          } else if (active?.action?.cursor) {
            const idleCursor = { ...active, action: { kind: 'idle', cursor: active.action.cursor }, updatedAt: Date.now() };
            activeRoom.set(ws.arcUser.id, idleCursor);
            sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: idleCursor }, ws);
          } else clearCollaborationAction(false, false);
          ws.arcActionExpiry = null;
        }, 12_000);
        ws.arcActionExpiry.unref?.();
      } else if (msg.type === 'GRAPH_STATE') {
        const payload = msg.payload || msg;
        const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
        const graph = payload.graph;
        const permissions = ws.arcUser?.permissions || [];
        const rejectGraphState = (message) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'GRAPH_STATE_REJECTED', payload: { graphId: payload.graphId, message } }));
        };
        if (!permissions.includes('*') && !permissions.includes('graphs:write')) {
          rejectGraphState('Your account has read-only graph access. Ask a workspace admin for graph edit permission.');
          return;
        }
        if (!ws.arcPresence || projectId !== ws.arcProjectId || projectId !== ws.arcPresence.projectId || payload.graphId !== ws.arcPresence.graphId) {
          rejectGraphState('Open the graph in this workspace before editing it collaboratively.');
          return;
        }
        if (!graph || graph.id !== payload.graphId || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections)
          || graph.nodes.length > 2000 || graph.connections.length > 10000) {
          rejectGraphState('This graph update is invalid or exceeds the collaboration limits.');
          return;
        }
        const key = `${projectId}:${graph.id}`;
        for (const [stateKey, stateValue] of liveGraphStates) {
          if (Date.now() - stateValue.updatedAt > 30 * 60 * 1000) liveGraphStates.delete(stateKey);
        }
        let previous = liveGraphStates.get(key);
        if (!previous) {
          const initialGraph = ws.arcManager.getGraphs().find((item) => item.id === graph.id);
          if (initialGraph) {
            const initialSerialized = JSON.stringify(initialGraph);
            previous = { projectId, graphId: graph.id, graph: initialGraph, revision: 0, updatedAt: Date.now(), user: null, serializedGraph: initialSerialized };
            liveGraphStates.set(key, previous);
          }
        }
        const candidateGraph = { ...graph };
        if (Array.isArray(graph.notes)) candidateGraph.notes = graph.notes.map((note) => ({ ...note }));
        const previousNotes = new Map((previous?.graph?.notes || []).map((note) => [note.id, note]));
        const incomingNotes = Array.isArray(candidateGraph.notes)
          ? candidateGraph.notes
          : (previous?.graph?.notes || []).map((note) => ({ ...note }));
        const incomingById = new Map(incomingNotes.map((note) => [note.id, note]));
        const roomKey = collaborationRoomKey(projectId, graph.id);
        const locks = liveNoteEditLocks.get(roomKey);
        let adjustedNotes = false;
        const rejectedNoteEdits = [];
        for (const noteId of new Set([...previousNotes.keys(), ...incomingById.keys(), ...(locks?.keys() || [])])) {
          const previousNote = previousNotes.get(noteId);
          const incomingNote = incomingById.get(noteId);
          const lock = locks?.get(noteId);
          if (lock && lock.expiresAt <= Date.now()) removeNoteEditLock(roomKey, noteId, { expired: true });
          const activeLock = liveNoteEditLocks.get(roomKey)?.get(noteId);
          const ownsLock = activeLock && activeLock.socket === ws && activeLock.clientId === payload.clientId
            && activeLock.userId === ws.arcUser.id;
          if (activeLock && !ownsLock) {
            const authoritative = activeLock.note || previousNote;
            if (!authoritative) continue;
            if (!incomingNote || !sameCollaborationValue(incomingNote, authoritative)) {
              if (incomingNote) {
                const index = incomingNotes.findIndex((item) => item.id === noteId);
                incomingNotes[index] = JSON.parse(JSON.stringify(authoritative));
                incomingById.set(noteId, incomingNotes[index]);
              } else {
                incomingNotes.push(JSON.parse(JSON.stringify(authoritative)));
                incomingById.set(noteId, incomingNotes[incomingNotes.length - 1]);
              }
              rejectedNoteEdits.push({ noteId, note: authoritative });
              adjustedNotes = true;
            }
          } else if (previousNote && incomingNote && incomingNote.text !== previousNote.text && !ownsLock) {
            incomingNote.text = previousNote.text;
            if (Object.hasOwn(previousNote, 'editedAt')) incomingNote.editedAt = previousNote.editedAt;
            else delete incomingNote.editedAt;
            if (Object.hasOwn(previousNote, 'editedBy')) incomingNote.editedBy = previousNote.editedBy;
            else delete incomingNote.editedBy;
            rejectedNoteEdits.push({ noteId, note: incomingNote });
            adjustedNotes = true;
          }
          if (ownsLock && incomingNote) activeLock.note = JSON.parse(JSON.stringify(incomingNote));
          if (ownsLock && !incomingNote) removeNoteEditLock(roomKey, noteId);
        }
        if (Array.isArray(graph.notes) || adjustedNotes || Array.isArray(previous?.graph?.notes)) candidateGraph.notes = incomingNotes;
        const serializedGraph = JSON.stringify(candidateGraph);
        const reportRejectedNoteEdits = () => {
          for (const rejected of rejectedNoteEdits) ws.send(JSON.stringify({ type: 'NOTE_EDIT_REJECTED', payload: { projectId, graphId: graph.id, ...rejected } }));
        };
        if (previous?.serializedGraph === serializedGraph) {
          ws.send(JSON.stringify({ type: 'GRAPH_STATE_ACK', payload: { graphId: graph.id, revision: previous.revision, syncId: payload.syncId || null } }));
          reportRejectedNoteEdits();
          return;
        }
        const state = {
          projectId,
          graphId: graph.id,
          graph: candidateGraph,
          revision: (previous?.revision || 0) + 1,
          updatedAt: Date.now(),
          user: { id: ws.arcUser.id, username: ws.arcUser.username },
          serializedGraph
        };
        liveGraphStates.set(key, state);
        ws.send(JSON.stringify({ type: 'GRAPH_STATE_ACK', payload: { graphId: graph.id, revision: state.revision, syncId: payload.syncId || null } }));
        reportRejectedNoteEdits();
        const syncPayload = { ...state };
        delete syncPayload.serializedGraph;
        const message = JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload: syncPayload });
        for (const client of wss.clients) {
          if (client !== ws && client.arcAuthenticated && client.readyState === WebSocket.OPEN
            && client.arcPresence?.projectId === projectId && client.arcPresence?.graphId === graph.id) client.send(message);
        }
        publishProjectCollaboration(projectId);
        }
      }
    } catch {}
  });
});

server.listen(serverConfig.port, serverConfig.host, () => {
  const activePort = server.address()?.port || serverConfig.port;
  const portFile = process.env.ARC_PORT_FILE?.trim();
  if (portFile) {
    try {
      fs.mkdirSync(dirname(portFile), { recursive: true });
      fs.writeFileSync(portFile, String(activePort), { mode: 0o600 });
    } catch (error) {
      logger.log('ERROR', `Could not publish the local server port: ${error.message}`);
    }
  }
  const localUrl = `http://${serverConfig.host}:${activePort}`;

  const retention = logger.retentionDays === 'forever' || Number(logger.retentionDays) === 0 ? 'forever' : `${logger.retentionDays}d`;
  console.log(`\n==============================================================================`);
  console.log(`   █████╗ ██████╗  ██████╗      ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗ `);
  console.log(`  ██╔══██╗██╔══██╗██╔════╝      ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗`);
  console.log(`  ███████║██████╔╝██║     █████╗███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║`);
  console.log(`  ██╔══██║██╔══██╗██║     ╚════╝╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║`);
  console.log(`  ██║  ██║██║  ██║╚██████╗      ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝`);
  console.log(`  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝ `);
  console.log(`==============================================================================`);
  console.log(`  ★ ARC Studio:            v${serverConfig.version}`);
  console.log(`  ★ Chezcord:              v${serverConfig.chezcordVersion}`);
  console.log(`──────────────────────────────────────────────────────────────────────────────`);
  console.log(`  ➜ ${serverOnlyMode ? 'API / WebSocket' : 'Web Studio'}:        ${localUrl}`);
  console.log(`  ➜ Setup:                 ${userStore.isSetupCompleted() ? 'Complete' : 'Required'}`);
  console.log(`  ➜ Master Setup Key:      Hidden`);
  console.log(`  ➜ Project Log Retention: ${retention}`);
  console.log(`==============================================================================`);
  for (const check of diagnostics.checks.filter((item) => item.status !== 'PASS')) console.log(`  ${check.status} ${check.name}: ${check.message}`);
  if (serverConfig.wasSecretAutoGenerated) console.log('  INFO Session secret generated.');
  console.log('\n');
});
//
if (process.env.ARC_DESKTOP_MODE === '1') {
  let controlBuffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    controlBuffer = `${controlBuffer}${chunk}`.slice(-128);
    if (controlBuffer.includes('ARC_STUDIO_SHUTDOWN')) {
      controlBuffer = '';
      botManager.stopBot();
      botManager.flushStatistics();
      for (const manager of new Set(userBotManagers.values())) {
        manager.stopBot();
        manager.flushStatistics();
      }
      for (const client of wss.clients) client.close(1001, 'ARC Studio is closing');
      wss.close();
      const forceExit = setTimeout(() => process.exit(0), 3000);
      forceExit.unref();
      server.close(() => logger.close(() => process.exit(0)));
    }
  });
}
