import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
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
const userStore = new UserStore();

const diagnostics = StartupDiagnostics.run();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 40 * 1024 * 1024 });
//
const liveGraphStates = new Map();
const liveCollaborationActions = new Map();
const liveCollaborationStudioDrafts = new Map();
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
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(resolve(clientDistPath, 'index.html'));
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
  const publishPresence = () => {
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
  };
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
  ws.on('close', () => { clearTimeout(authTimeout); clearCollaborationAction(); publishPresence(); });
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!ws.arcAuthenticated) {
        const user = msg.type === 'AUTH' ? userStore.validateSession(msg.token) : null;
        if (!user) {
          ws.close(1008, 'Authentication required.');
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
        if (ws.arcRoomKey !== nextRoomKey) clearCollaborationAction();
        ws.arcPresence = projectId && graphId ? { projectId, graphId } : null;
        ws.arcRoomKey = nextRoomKey;
        if (nextRoomKey) {
          const room = liveCollaborationActions.get(nextRoomKey);
          if (room) for (const action of room.values()) ws.send(JSON.stringify({ type: 'COLLAB_ACTION_UPDATED', payload: action }));
        }
        const liveState = ws.arcPresence ? liveGraphStates.get(`${projectId}:${graphId}`) : null;
        if (liveState) {
          const payload = { ...liveState };
          delete payload.serializedGraph;
          ws.send(JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload }));
        } else if (ws.arcPresence) ws.send(JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload: { projectId, graphId, ready: true, revision: 0 } }));
        publishPresence();
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
        if (kind === 'idle') { clearCollaborationAction(false, true, typeof action.studioId === 'string' ? action.studioId : ''); return; }
        const readOnlyCollaboration = ['cursor', 'selection', 'navigation', 'studio-focus', 'studio-cursor'].includes(kind);
        if (!readOnlyCollaboration && !permissions.includes('*') && !permissions.includes('graphs:write')) return;
        let cleanAction;
        const point = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) <= 1_000_000 && Math.abs(value.y) <= 1_000_000 ? { x: value.x, y: value.y } : null;
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
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !['embed', 'text'].includes(action.studioType) || !action.draft || typeof action.draft !== 'object' || Array.isArray(action.draft)) return;
          let serialized;
          try { serialized = JSON.stringify(action.draft); } catch { return; }
          if (serialized.length > 300_000) return;
          cleanAction = { kind, studioId: action.studioId, studioType: action.studioType, draft: JSON.parse(serialized) };
          if (Number.isInteger(action.draft.caret) && action.draft.caret >= 0 && action.draft.caret <= 1_000_000) cleanAction.draft.caret = action.draft.caret;
        } else if (kind === 'studio-cursor') {
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !Number.isInteger(action.caret) || action.caret < 0 || action.caret > 1_000_000) return;
          cleanAction = { kind, studioId: action.studioId, caret: action.caret };
        } else if (kind === 'studio-focus') {
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !['embed', 'text'].includes(action.studioType)) return;
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
              action: { kind: 'selection', mode: 'select', selectedNodeIds: active.action.selectedNodeIds },
              updatedAt: Date.now()
            };
            activeRoom.set(ws.arcUser.id, selection);
            sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: selection }, ws);
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
        const serializedGraph = JSON.stringify(graph);
        const previous = liveGraphStates.get(key);
        if (previous?.serializedGraph === serializedGraph) {
          ws.send(JSON.stringify({ type: 'GRAPH_STATE_ACK', payload: { graphId: graph.id, revision: previous.revision, syncId: payload.syncId || null } }));
          return;
        }
        const state = {
          projectId,
          graphId: graph.id,
          graph,
          revision: (previous?.revision || 0) + 1,
          updatedAt: Date.now(),
          user: { id: ws.arcUser.id, username: ws.arcUser.username },
          serializedGraph
        };
        liveGraphStates.set(key, state);
        ws.send(JSON.stringify({ type: 'GRAPH_STATE_ACK', payload: { graphId: graph.id, revision: state.revision, syncId: payload.syncId || null } }));
        const syncPayload = { ...state };
        delete syncPayload.serializedGraph;
        const message = JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload: syncPayload });
        for (const client of wss.clients) {
          if (client !== ws && client.arcAuthenticated && client.readyState === WebSocket.OPEN
            && client.arcPresence?.projectId === projectId && client.arcPresence?.graphId === graph.id) client.send(message);
        }
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
  console.log(`\n============================================================================`);
  console.log(`   █████╗ ██████╗  ██████╗      ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗ `);
  console.log(`  ██╔══██╗██╔══██╗██╔════╝      ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗`);
  console.log(`  ███████║██████╔╝██║     █████╗███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║`);
  console.log(`  ██╔══██║██╔══██╗██║     ╚════╝╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║`);
  console.log(`  ██║  ██║██║  ██║╚██████╗      ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝`);
  console.log(`  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝ `);
  console.log(`==============================================================================`);
  console.log(`  ★ ARC Studio:            v${serverConfig.version}`);
  console.log(`  ★ Chezcord:              v${serverConfig.chezcordVersion}`);
  console.log(`────────────────────────────────────────────────────────────────────----------`);
  console.log(`  ➜ Web Studio:      ${localUrl}`);
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
