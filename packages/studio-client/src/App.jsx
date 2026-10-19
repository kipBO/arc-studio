import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AppWindow, Bot, Braces, CircleHelp, Database, Download, FileCode2, FileUp, FolderTree, LayoutGrid, LockKeyhole, MoreHorizontal, PackageOpen, Plus, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Ticket, TrendingUp, Trash2, Users, X } from 'lucide-react';
import { TopBar } from './components/navigation/TopBar.jsx';
import { NodeCanvas } from './components/canvas/NodeCanvas.jsx';
import { ControlDock } from './components/dock/ControlDock.jsx';
import { NodePalette } from './components/palette/NodePalette.jsx';
import { CommandPalette } from './components/palette/CommandPalette.jsx';
import { SplashScreen } from './components/splash/SplashScreen.jsx';
import { UserManagementModal } from './components/modals/UserManagementModal.jsx';
import { EditorSettingsModal } from './components/modals/EditorSettingsModal.jsx';
import { GraphVariablesModal } from './components/modals/GraphVariablesModal.jsx';
import { GraphLibraryPanel } from './components/panels/GraphLibraryPanel.jsx';
import { EmbedStudioView } from './components/panels/EmbedStudioView.jsx';
import { DiscordTextStudioView } from './components/panels/DiscordTextStudioView.jsx';
import { PermissionStudioView } from './components/panels/PermissionStudioView.jsx';
import { GraphValidationModal } from './components/modals/GraphValidationModal.jsx';
import { BotSettingsModal } from './components/modals/BotSettingsModal.jsx';
import { PluginStoreModal } from './components/modals/PluginStoreModal.jsx';
import { ToastContainer } from './components/ui/ToastContainer.jsx';
import { Modal } from './components/ui/Modal.jsx';
import { TextInput } from './components/ui/Inputs.jsx';
import { Button } from './components/ui/Button.jsx';
import { TooltipLayer } from './components/ui/TooltipLayer.jsx';
import { EmojiPickerOverlay } from './components/ui/EmojiPickerOverlay.jsx';
import { SelectionContextMenu } from './components/ui/SelectionContextMenu.jsx';
import { SidebarResizeHandle } from './components/ui/SidebarResizeHandle.jsx';
import { arcEvents } from './core/ArcEvents.js';
import { apiUrl, normalizeWorkspaceUrl, studioWebSocketUrl } from './core/api.js';
import { xhrJson } from './core/xhrJson.js';
import { readAppStorage, removeAppStorage, writeAppStorage } from './core/storage.js';
import { getArcUiScale } from './core/uiScale.js';
import studioPackage from '../package.json';
import { classifyArcUpdate, compareArcVersions } from './core/appUpdates.js';
import { DEFAULT_SHORTCUTS, formatShortcut, shortcutMatches } from './core/shortcuts.js';
import { playUiSound, unlockUiSounds } from './core/uiSounds.js';
import { BuiltInNodeDefinitions, createDefaultNodeData, getArrayCreatePins, getMathListPins, getNodeArgumentPins, getPermissionOverwritePins, getTextTemplateSlots, registerPluginNodeDefinitions, renderTextTemplate } from './components/nodes/nodeDefinitions.js';
import { embedBlockPins, getEmbedBlocks } from './components/nodes/EmbedNodeBuilder.jsx';
//
const DEFAULT_SETTINGS = {
  snapToGrid: true,
  wirePulse: true,
  wireStyle: 'bezier',
  doubleClickWireToCut: false,
  magneticSnap: true,
  showGrid: true,
  reduceMotion: false,
  uiScale: '100',
  autoSave: true,
  autoSaveIntervalSeconds: 30,
  autoSnapshots: true,
  snapshotIntervalMinutes: 30,
  snapshotRetentionHours: 12,
  uiSounds: false,
  autoUpdateChecks: true,
  updateChannel: 'stable',
  compactContextMenus: false,
  discordRpcEnabled: true,
  discordRpcRedactWorkspace: false,
  discordRpcRedactProject: false,
  discordRpcRedactGraph: false,
  discordRpcRedactBot: false
};
const MAX_OPEN_GRAPH_TABS = 12;
const SIDEBAR_WIDTH_MIN = 280;
const SIDEBAR_WIDTH_MAX = 480;
const DEFAULT_SIDEBAR_WIDTHS = { projects: 320, library: 320, plugins: 360, bot: 360, variables: 320 };
const APP_EMOJI_CACHE_TTL = 14 * 24 * 60 * 60 * 1000;
const PROJECT_STARTERS = [
  { id: 'blank', name: 'Start Blank', description: 'An empty project, ready for your first graph.', Icon: Plus },
  { id: 'ticket', name: 'Ticket Bot', description: 'Ticket command examples and a message trigger.', Icon: Ticket },
  { id: 'leveling', name: 'Leveling Bot', description: 'A shared XP counter and rank command.', Icon: TrendingUp },
  { id: 'moderation', name: 'Basic Moderation', description: 'Rules and report command examples.', Icon: ShieldCheck },
  { id: 'basic', name: 'Basic Bot', description: 'A ping reply and help command.', Icon: Bot },
  { id: 'utility', name: 'Utility Bot', description: 'Random rolls, server info, rules, and a message trigger.', Icon: Braces }
];
const TAG_GROUP_COLORS = [
  { id: 'blue', label: 'Blue', value: '#5798ee' },
  { id: 'purple', label: 'Purple', value: '#a77af4' },
  { id: 'teal', label: 'Teal', value: '#39b8b1' },
  { id: 'green', label: 'Green', value: '#62bd74' },
  { id: 'amber', label: 'Amber', value: '#e6aa4b' },
  { id: 'red', label: 'Red', value: '#e47777' }
];

function mergeCollaborativeAttachments(current, incoming) {
  const localByName = new Map((current || []).filter((item) => item?.filename).map((item) => [item.filename, item]));
  return (incoming || []).map((item) => {
    const local = localByName.get(item?.filename);
    return { ...item, ...(item?.data ? {} : local?.data ? { data: local.data } : {}) };
  });
}

function collaborativeAttachments(attachments = []) {
  return attachments.map(({ data, ...metadata }) => data && data.length <= 80_000 ? { ...metadata, data } : metadata);
}

function collaborativeEmbedDraft(studio) {
  return { name: studio.name, content: studio.content || '', blocks: studio.blocks || [], components: studio.components || [], attachments: collaborativeAttachments(studio.attachments || []) };
}

function getTextEdit(base, next) {
  let start = 0;
  while (start < base.length && start < next.length && base[start] === next[start]) start += 1;
  let suffix = 0;
  while (suffix < base.length - start && suffix < next.length - start && base[base.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
  return { start, deleteCount: base.length - start - suffix, insertText: next.slice(start, next.length - suffix) };
}

function applyTextEdit(value, edit) {
  return `${value.slice(0, edit.start)}${edit.insertText}${value.slice(edit.start + edit.deleteCount)}`;
}

function mergeCollaborativeText(base, local, remote, localUserId, remoteUserId) {
  if (local === base) return remote;
  if (remote === base || local === remote) return local;
  if (remote.includes(local)) return remote;
  if (local.includes(remote)) return local;
  const localEdit = getTextEdit(base, local);
  const remoteEdit = getTextEdit(base, remote);
  const localEnd = localEdit.start + localEdit.deleteCount;
  const remoteEnd = remoteEdit.start + remoteEdit.deleteCount;
  const sameInsertPoint = localEdit.deleteCount === 0 && remoteEdit.deleteCount === 0 && localEdit.start === remoteEdit.start;
  if (!sameInsertPoint && localEnd <= remoteEdit.start) return applyTextEdit(applyTextEdit(base, localEdit), { ...remoteEdit, start: remoteEdit.start + localEdit.insertText.length - localEdit.deleteCount });
  if (!sameInsertPoint && remoteEnd <= localEdit.start) return applyTextEdit(applyTextEdit(base, remoteEdit), { ...localEdit, start: localEdit.start + remoteEdit.insertText.length - remoteEdit.deleteCount });
  return String(localUserId || '') <= String(remoteUserId || '') ? local : remote;
}

function makeExportJsonSafe(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value !== 'object') return undefined;
  if (ancestors.has(value)) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (ArrayBuffer.isView(value)) return Array.from(value, (item) => makeExportJsonSafe(item, ancestors));
  ancestors.add(value);
  let safe;
  if (Array.isArray(value)) {
    safe = value.map((item) => {
      const result = makeExportJsonSafe(item, ancestors);
      return result === undefined ? null : result;
    });
  } else {
    safe = {};
    for (const [key, item] of Object.entries(value)) {
      const result = makeExportJsonSafe(item, ancestors);
      if (result !== undefined) safe[key] = result;
    }
  }
  ancestors.delete(value);
  return safe;
}

function exportGraphPayload(graph) {
  return makeExportJsonSafe({
    id: graph?.id,
    name: graph?.name,
    graphType: graph?.graphType,
    variables: graph?.variables || [],
    nodes: graph?.nodes || [],
    connections: graph?.connections || [],
    tagGroups: graph?.tagGroups || [],
    notes: graph?.notes || []
  });
}

function getInitialTheme() {
  const savedTheme = readAppStorage('arc_theme');
  if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function hasSavedThemeChoice() {
  const savedTheme = readAppStorage('arc_theme');
  return savedTheme === 'dark' || savedTheme === 'light';
}

function safeStorageGet(key, fallback = '') {
  return readAppStorage(key, fallback);
}

function safeStorageSet(key, value) {
  writeAppStorage(key, value);
}

function safeStorageRemove(key) {
  removeAppStorage(key);
}

function readStoredJson(key, fallback) {
  try {
    const saved = readAppStorage(key);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function readSidebarWidths() {
  const saved = readStoredJson('arc_sidebar_widths', DEFAULT_SIDEBAR_WIDTHS);
  return Object.fromEntries(Object.keys(DEFAULT_SIDEBAR_WIDTHS).map((id) => {
    const value = Number(saved[id]);
    return [id, Number.isFinite(value) ? Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, value)) : DEFAULT_SIDEBAR_WIDTHS[id]];
  }));
}

function nodeTopLeftAtCenter(type, center) {
  const definition = BuiltInNodeDefinitions.find((item) => item.type === type);
  const rows = Math.max(definition?.inputs?.length || 0, definition?.outputs?.length || 0);
  return { x: (center?.x || 0) - 124, y: (center?.y || 0) - (76 + rows * 23) / 2 };
}

function readBrowserStudioRoute() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)(?:\/graphs\/([^/]+))?\/?$/);
  const params = new URLSearchParams(window.location.search);
  try {
    return {
      projectId: match ? decodeURIComponent(match[1]) : '',
      graphId: match?.[2] ? decodeURIComponent(match[2]) : '',
      nodeId: params.get('node') || '',
      panel: params.get('panel') || '',
      librarySection: params.get('library') || ''
    };
  } catch { return { projectId: '', graphId: '', nodeId: '', panel: '', librarySection: '' }; }
}
//
export function App() {
  const desktopMode = Boolean(window.__ARC_STUDIO_CONFIG__?.desktop);
  const initialBrowserRouteRef = useRef(null);
  if (!desktopMode && initialBrowserRouteRef.current === null) initialBrowserRouteRef.current = readBrowserStudioRoute();
  const browserRouteHandledRef = useRef(false);
  const browserProjectSwitchRef = useRef(false);
  const shortcutPlatform = window.__ARC_STUDIO_CONFIG__?.platform || (/Mac|iPhone|iPad/.test(navigator.platform) ? 'macos' : 'windows');
  const macOSDesktop = desktopMode && shortcutPlatform === 'macos';
  const shortcutModifier = shortcutPlatform === 'macos' ? '⌘' : 'Ctrl';
  const [workspaceMode, setWorkspaceMode] = useState(() => {
    try { return desktopMode && localStorage.getItem('arc_workspace_mode') === 'remote' ? 'remote' : 'local'; }
    catch { return 'local'; }
  });
  const [workspaceSwitchOpen, setWorkspaceSwitchOpen] = useState(false);
  const localSessionRef = useRef(null);
  if (desktopMode && !localSessionRef.current) {
    const savedLocalToken = safeStorageGet('arc_local_session_token');
    if (savedLocalToken) localSessionRef.current = { token: savedLocalToken, user: null };
  }
  const localDesktopWorkspace = desktopMode && workspaceMode === 'local';
  const [remoteWorkspaceUrl, setRemoteWorkspaceUrl] = useState(() => {
    try { return desktopMode ? localStorage.getItem('arc_remote_workspace_url') || '' : ''; }
    catch { return ''; }
  });
  const [remoteWorkspaceName, setRemoteWorkspaceName] = useState(() => {
    try { return desktopMode ? (localStorage.getItem('arc_remote_workspace_name') || '').slice(0, 35) : ''; }
    catch { return ''; }
  });
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine !== false);
  const [appUpdate, setAppUpdate] = useState(null);
  const [canResetPrimaryAdminWithMasterKey, setCanResetPrimaryAdminWithMasterKey] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [authToken, setAuthToken] = useState(() => safeStorageGet('arc_token'));
  const [currentUser, setCurrentUser] = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [remoteCollaborationActions, setRemoteCollaborationActions] = useState([]);
  const [collaborationSocketStatus, setCollaborationSocketStatus] = useState('connecting');
  const remoteGraphConflictsRef = useRef(new Set());
  const [socketReadyRevision, setSocketReadyRevision] = useState(0);
  const [liveSyncRevision, setLiveSyncRevision] = useState(0);
  const [localAccountUsername, setLocalAccountUsername] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [studioVersion, setStudioVersion] = useState(studioPackage.version);
  const [isReady, setIsReady] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [hasThemeChoice, setHasThemeChoice] = useState(hasSavedThemeChoice);
  const [settings, setSettings] = useState(() => readStoredJson('arc_editor_settings', { ...DEFAULT_SETTINGS, uiSounds: desktopMode }));
  const [pendingSettingsReload, setPendingSettingsReload] = useState(null);
  const uiScale = ['80', '90', '100', '110', '120', '130', '140'].includes(String(settings.uiScale)) ? String(settings.uiScale) : '100';
  const [isLocked, setIsLocked] = useState(() => {
    try { return readAppStorage('arc_ui_locked') === 'true'; }
    catch { return false; }
  });
  const [isUserMgmtOpen, setIsUserMgmtOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [consoleOpenRequest, setConsoleOpenRequest] = useState(0);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectUsers, setProjectUsers] = useState({});
  const [maxProjects, setMaxProjects] = useState(() => localDesktopWorkspace ? null : 10);
  useEffect(() => { if (localDesktopWorkspace) setMaxProjects(null); }, [localDesktopWorkspace]);
  const [needsProjectOnboarding, setNeedsProjectOnboarding] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState('');
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const startupProjectHandledRef = useRef(false);
  const projectVariablesSaveRef = useRef({ timer: null, revision: 0 });
  const [savingProjectVariables, setSavingProjectVariables] = useState(false);
  const [projectVariables, setProjectVariables] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectNameInvalid, setProjectNameInvalid] = useState(false);
  const [projectNameShakeKey, setProjectNameShakeKey] = useState(0);
  const [projectError, setProjectError] = useState('');
  const [projectBusy, setProjectBusy] = useState(false);
  const [exportInProgress, setExportInProgress] = useState(false);
  const [exportReview, setExportReview] = useState(null);
  const exportInFlightRef = useRef(false);
  const [projectMenu, setProjectMenu] = useState(null);
  const [projectDelete, setProjectDelete] = useState(null);
  const [projectDeleteName, setProjectDeleteName] = useState('');
  const [projectDeleteError, setProjectDeleteError] = useState('');
  const [projectDeletePromptError, setProjectDeletePromptError] = useState('');
  const [projectDeleteFieldShake, setProjectDeleteFieldShake] = useState(false);
  const projectDeleteInputRef = useRef(null);
  const projectDeleteFeedbackTimerRef = useRef(null);
  const projectDeleteShakeTimerRef = useRef(null);
  const [projectImportFile, setProjectImportFile] = useState(null);
  const projectImportPathRef = useRef(null);
  const [openedProjectFiles, setOpenedProjectFiles] = useState([]);
  const [projectImportTrusted, setProjectImportTrusted] = useState(false);
  const [projectImportError, setProjectImportError] = useState('');
  const [projectTemplateDialog, setProjectTemplateDialog] = useState(false);
  const [newProjectTemplate, setNewProjectTemplate] = useState('ticket');
  const [projectNameManuallyEdited, setProjectNameManuallyEdited] = useState(false);
  const [isPluginStoreOpen, setIsPluginStoreOpen] = useState(false);
  const [pluginDefinitionsRevision, setPluginDefinitionsRevision] = useState(0);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [isBotSettingsOpen, setIsBotSettingsOpen] = useState(false);
  const [isBotSidebarOpen, setIsBotSidebarOpen] = useState(false);
  const [commandBrowserRequest, setCommandBrowserRequest] = useState(0);
  const [isVariablesOpen, setIsVariablesOpen] = useState(false);
  const [paletteNodePosition, setPaletteNodePosition] = useState(null);
  const viewportCenterRef = useRef({ x: 0, y: 0 });
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [librarySection, setLibrarySection] = useState('graphs');
  const [sidebarWidths, setSidebarWidths] = useState(readSidebarWidths);
  const [nameDialog, setNameDialog] = useState(null);
  const [nameDialogError, setNameDialogError] = useState('');
  const [nodeRenameDialog, setNodeRenameDialog] = useState(null);
  const [nodeRenameValue, setNodeRenameValue] = useState('');
  const [tagGroupDialog, setTagGroupDialog] = useState(null);
  const [tagGroupName, setTagGroupName] = useState('');
  const [tagGroupColor, setTagGroupColor] = useState(TAG_GROUP_COLORS[0].value);
  const [tagGroupNodeIds, setTagGroupNodeIds] = useState([]);
  const [tagGroupNoteIds, setTagGroupNoteIds] = useState([]);
  const [tagGroupSearch, setTagGroupSearch] = useState('');
  const [tagGroupError, setTagGroupError] = useState('');
  const [closeGraphDialog, setCloseGraphDialog] = useState(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState([]);
  const [recoveryDraftKey, setRecoveryDraftKey] = useState('');
  const [recoveryCompareId, setRecoveryCompareId] = useState(null);
  const recoveryDraftsRef = useRef([]);
  const recoveryCheckedKeysRef = useRef(new Set());
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [gatewayIntentConfirm, setGatewayIntentConfirm] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [botStatus, setBotStatus] = useState('DISCONNECTED');
  const [botMetrics, setBotMetrics] = useState({ latencyMs: null, averageLatencyMs: null, jitterMs: null, rateLimitedUntil: 0, rateLimitScope: null });
  const botStartPendingRef = useRef(false);
  const rateLimitAnnouncedUntilRef = useRef(0);
  const [gatewayStartedRequest, setGatewayStartedRequest] = useState(0);
  const [botProfile, setBotProfile] = useState(null);
  const [appEmojis, setAppEmojis] = useState([]);
  const [appEmojisLoading, setAppEmojisLoading] = useState(false);
  const [appEmojisCachedAt, setAppEmojisCachedAt] = useState(0);
  const emojiCacheStorageKey = `arc_bot_emojis:${workspaceMode}:${activeProjectId}:${botProfile?.application?.id || 'no-app'}`;
  const handleAppEmojisChange = useCallback((emojis) => {
    const list = Array.isArray(emojis) ? emojis : [];
    const cachedAt = Date.now();
    setAppEmojis(list);
    setAppEmojisCachedAt(cachedAt);
    writeAppStorage(emojiCacheStorageKey, JSON.stringify({ cachedAt, emojis: list }));
  }, [emojiCacheStorageKey]);
  const [tabs, setTabs] = useState([]);
  const [savedGraphs, setSavedGraphs] = useState([]);
  const savedGraphsRef = useRef(savedGraphs);
  savedGraphsRef.current = savedGraphs;
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [graphTemplates, setGraphTemplates] = useState([]);
  const [graphSnapshots, setGraphSnapshots] = useState([]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const liveGraphBaseRef = useRef(new Map());
  const liveGraphRevisionRef = useRef(new Map());
  const lastLiveGraphSentRef = useRef(new Map());
  const pendingLiveGraphRef = useRef(new Map());
  const rejectedLiveGraphToastRef = useRef(new Set());
  const liveGraphReadyRef = useRef(new Set());
  const autoSaveInFlightRef = useRef(new Set());
  const collaborationClientIdRef = useRef(globalThis.crypto?.randomUUID?.() || `arc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const collaborationActionTimerRef = useRef(null);
  const pendingCollaborationActionRef = useRef(new Map());
  const errorPulseUntilRef = useRef(new Map());
  const autoSnapshotInFlightRef = useRef(false);
  useEffect(() => {
    if (!desktopMode) return undefined;
    const queue = window.__ARC_STUDIO_OPEN_PROJECT_FILES__;
    if (Array.isArray(queue) && queue.length) {
        setOpenedProjectFiles((current) => [...new Set([...current, ...queue.filter((path) => typeof path === 'string')])]);
      window.__ARC_STUDIO_OPEN_PROJECT_FILES__ = [];
    }
    const onFileOpened = (event) => {
      if (typeof event.detail === 'string') {
        const queuedIndex = window.__ARC_STUDIO_OPEN_PROJECT_FILES__?.indexOf(event.detail) ?? -1;
        if (queuedIndex >= 0) window.__ARC_STUDIO_OPEN_PROJECT_FILES__.splice(queuedIndex, 1);
        setOpenedProjectFiles((current) => current.includes(event.detail) || projectImportPathRef.current === event.detail ? current : [...current, event.detail]);
      }
    };
    window.addEventListener('arc:project-file-opened', onFileOpened);
    return () => window.removeEventListener('arc:project-file-opened', onFileOpened);
  }, [desktopMode]);
  useEffect(() => {
    if (!desktopMode || projectImportFile || !openedProjectFiles.length) return;
    const [path, ...remaining] = openedProjectFiles;
    setOpenedProjectFiles(remaining);
    const normalizedPath = String(path).replace(/\\/g, '/');
    const name = normalizedPath.split('/').pop() || 'project.arcproject';
    if (!name.toLowerCase().endsWith('.arcproject')) {
      arcEvents.emit('toast:notify', { title: 'Unsupported file', message: 'Choose an .arcproject file.', type: 'error' });
      return;
    }
    projectImportPathRef.current = path;
    setProjectImportFile({ name, path, text: async () => {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') throw new Error('ARC Studio could not open this project file.');
      return invoke('read_arc_project_file', { path });
    } });
    setProjectImportTrusted(false);
    setProjectImportError('');
  }, [desktopMode, openedProjectFiles, projectImportFile]);
  useEffect(() => {
    const updateNetworkState = () => setNetworkOnline(navigator.onLine !== false);
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    updateNetworkState();
    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
    };
  }, []);

  useEffect(() => {
    if (!networkOnline || (desktopMode && settings.autoUpdateChecks === false)) return undefined;
    let active = true;
    const checkForStudioUpdate = async () => {
      try {
        const channel = desktopMode && settings.updateChannel === 'nightly' ? 'nightly' : 'stable';
        const endpoint = channel === 'nightly'
          ? 'https://api.github.com/repos/relentiousdragon/arc-studio/releases?per_page=100'
          : 'https://api.github.com/repos/relentiousdragon/arc-studio/releases/latest';
        const response = await fetch(endpoint, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store'
        });
        if (!response.ok) {
          if (response.status === 404 && active) setAppUpdate(null);
          return;
        }
        const responseData = await response.json();
        const releases = channel === 'nightly' ? (Array.isArray(responseData) ? responseData : []) : [responseData];
        const release = releases.filter((item) => !item.draft && (channel === 'nightly' ? item.prerelease === true : item.prerelease !== true) && compareArcVersions(item.tag_name, studioVersion) === 1)
          .sort((left, right) => compareArcVersions(right.tag_name, left.tag_name) || 0)[0];
        if (!release) { if (active) setAppUpdate(null); return; }
        const version = String(release.tag_name || '').replace(/^v/i, '');
        if (!version || compareArcVersions(version, studioVersion) !== 1) {
          if (active) setAppUpdate(null);
          return;
        }
        if (!active) return;
        setAppUpdate({
          version,
          url: release.html_url,
          title: release.name || `ARC Studio ${version}`,
          notes: String(release.body || '').slice(0, 6000),
          kind: classifyArcUpdate(version, studioVersion)
        });
      } catch {}
    };
    checkForStudioUpdate();
    const interval = window.setInterval(checkForStudioUpdate, 6 * 60 * 60 * 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [networkOnline, desktopMode, settings.autoUpdateChecks, settings.updateChannel, studioVersion]);

  useEffect(() => {
    if (!settings.uiSounds) return undefined;
    const playControl = (target) => {
      const control = target.closest?.('button, [role="button"], [role="tab"], [role="option"], [role="checkbox"], [role="switch"], input[type="checkbox"], input[type="radio"], a[href]');
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true' || control.dataset.sound === 'off') return;
      unlockUiSounds();
      playUiSound('click');
    };
    const onPointerDown = (event) => playControl(event.target);
    const onKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') playControl(event.target);
    };
    const stopToastSound = arcEvents.on('toast:notify', (toast) => playUiSound(toast?.type || 'info'));
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      stopToastSound();
    };
  }, [settings.uiSounds]);
  useEffect(() => {
    if (botStatus === 'ONLINE' && botStartPendingRef.current) {
      botStartPendingRef.current = false;
      setGatewayStartedRequest((request) => request + 1);
      arcEvents.emit('toast:notify', { title: 'Bot started', message: 'The gateway is connected and ready.', type: 'success' });
    }
    if (botStatus === 'ERROR') botStartPendingRef.current = false;
  }, [botStatus]);
  useEffect(() => {
    if (!saveFeedback) return undefined;
    const timeout = window.setTimeout(() => setSaveFeedback(null), 1500);
    return () => window.clearTimeout(timeout);
  }, [saveFeedback]);
  const [nodePrefabs, setNodePrefabs] = useState(() => {
    try { const saved = readAppStorage('arc_node_prefabs'); const parsed = saved ? JSON.parse(saved) : []; return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  });
  const [embedAssets, setEmbedAssets] = useState([]);
  const [embedStudio, setEmbedStudio] = useState(null);
  const embedStudioRef = useRef(embedStudio);
  embedStudioRef.current = embedStudio;
  const saveEmbedShortcutRef = useRef(null);
  const collaborativeEmbedBaseRef = useRef(new Map());
  const [discordTextStudio, setDiscordTextStudio] = useState(null);
  const textCollaborationRef = useRef(new Map());
  const [permissionStudio, setPermissionStudio] = useState(null);
  const [graphUploadProgress, setGraphUploadProgress] = useState(null);
  const [savingGraphIds, setSavingGraphIds] = useState([]);
  const [nodePrefabDialog, setNodePrefabDialog] = useState(null);
  const [nodePrefabError, setNodePrefabError] = useState('');
  const [defaultGraphId, setDefaultGraphId] = useState('tab_slash_help');
  const [activeTabId, setActiveTabId] = useState(null);
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState('');
  const [selectedCanvasNodeCount, setSelectedCanvasNodeCount] = useState(0);
  const [activeNodes, setActiveNodes] = useState([]);
  const [activeConnections, setActiveConnections] = useState([]);
  const [activePulseNodeIds, setActivePulseNodeIds] = useState([]);
  const [activePulseGraphId, setActivePulseGraphId] = useState(null);
  const [nodeFocusRequest, setNodeFocusRequest] = useState(null);
  const handleCanvasNodeSelect = useCallback((nodeId) => setSelectedCanvasNodeId(nodeId || ''), []);
  useEffect(() => { setSelectedCanvasNodeId(''); setSelectedCanvasNodeCount(0); }, [activeTabId]);
  const traceRequestIdRef = useRef(0);
  const [activeDebugStep, setActiveDebugStep] = useState(null);
  const [logs, setLogs] = useState([]);
  const wsRef = useRef(null);
  const sendCollaborationAction = useCallback((action, immediate = false) => {
    const entry = { action, projectId: activeProjectId, graphId: activeTabId };
    const actionKey = `${action.kind}:${action.studioId || ''}`;
    pendingCollaborationActionRef.current.set(actionKey, entry);
    const flush = () => {
      collaborationActionTimerRef.current = null;
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const pending = [...pendingCollaborationActionRef.current.values()];
      pendingCollaborationActionRef.current.clear();
      for (const entry of pending) if (entry.projectId && entry.graphId) socket.send(JSON.stringify({ type: 'COLLAB_ACTION', projectId: entry.projectId, graphId: entry.graphId, action: entry.action }));
    };
    if (immediate || action.kind === 'idle') {
      window.clearTimeout(collaborationActionTimerRef.current);
      flush();
    } else if (!collaborationActionTimerRef.current) {
      collaborationActionTimerRef.current = window.setTimeout(flush, 40);
    }
  }, [activeProjectId, activeTabId]);
  useEffect(() => {
    setRemoteCollaborationActions([]);
    return () => sendCollaborationAction({ kind: 'idle' }, true);
  }, [activeProjectId, activeTabId, sendCollaborationAction]);
  const loadingBarTimerRef = useRef(null);
  const graphCheckToastAtRef = useRef(0);
  const graphsHydratedRef = useRef(false);
  const discordRpcRequestRef = useRef(null);
  const discordRpcRevisionRef = useRef(0);
  const discordRpcInFlightRef = useRef(false);
  const historyRef = useRef(new Map());
  const historyGroupRef = useRef(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const activeGraph = tabs.find((tab) => tab.id === activeTabId);
  const canWriteGraphs = Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'));
  const graphVariables = Array.isArray(activeGraph?.variables) ? activeGraph.variables : [];
  const availableVariables = useMemo(() => [
    ...graphVariables.map((variable) => ({ ...variable, scope: 'graph' })),
    ...projectVariables.map((variable) => ({ ...variable, scope: 'project' }))
  ], [graphVariables, projectVariables]);
  const workspaceLabel = desktopMode && workspaceMode === 'local' ? 'Local Workspace' : 'Private Workspace';
  const graphLookup = useMemo(() => new Map([...savedGraphs, ...tabs].map((graph) => [graph.id, graph])), [savedGraphs, tabs]);
  const activeProjectName = projects.find((project) => project.id === activeProjectId)?.name || '';
  const functionGraphs = useMemo(() => [...graphLookup.values()].filter((graph) => graph.graphType === 'function'), [graphLookup]);
  const callableGraphs = useMemo(() => [...graphLookup.values()], [graphLookup]);
  const graphValidation = useMemo(() => validateGraph(activeGraph, graphLookup, botProfile?.intentSummary, projectVariables), [activeGraph, graphLookup, botProfile?.intentSummary, projectVariables]);
  const embedStudioOpenForActiveGraph = Boolean(embedStudio && embedStudio.graphId === activeTabId && embedStudio.projectId === activeProjectId);
  const discordTextStudioOpenForActiveGraph = Boolean(discordTextStudio && discordTextStudio.graphId === activeTabId && discordTextStudio.projectId === activeProjectId);
  const permissionStudioOpenForActiveGraph = Boolean(permissionStudio && permissionStudio.graphId === activeTabId && permissionStudio.projectId === activeProjectId);
  const activeCollabStudio = discordTextStudioOpenForActiveGraph ? { id: discordTextStudio.collabId, type: 'text', label: discordTextStudio.label || 'Text editor' }
    : embedStudioOpenForActiveGraph ? { id: embedStudio.collabId, type: 'embed', label: 'Embed Studio' } : null;
  const studioCollaborators = activeCollabStudio ? remoteCollaborationActions.filter((peer) => peer.action?.studioId === activeCollabStudio.id) : [];
  const textStudioCursors = studioCollaborators.filter((peer) => peer.action?.kind === 'studio-cursor' || peer.action?.kind === 'studio-draft').map((peer) => ({ username: peer.username, color: peer.color, caret: peer.action.kind === 'studio-cursor' ? peer.action.caret : peer.action.draft?.caret ?? 0 }));
  useEffect(() => {
    if (!activeCollabStudio?.id) return undefined;
    sendCollaborationAction({ kind: 'studio-focus', studioId: activeCollabStudio.id, studioType: activeCollabStudio.type, label: activeCollabStudio.label }, true);
    return () => sendCollaborationAction({ kind: 'idle', studioId: activeCollabStudio.id }, true);
  }, [activeCollabStudio?.id, activeCollabStudio?.label, activeCollabStudio?.type, sendCollaborationAction]);
  const graphTabStatuses = useMemo(() => new Map(tabs.map((tab) => [tab.id, {
    unsaved: Boolean(tab.isDirty) || !savedGraphs.some((saved) => saved.id === tab.id),
    hasErrors: validateGraph(tab, graphLookup, botProfile?.intentSummary, projectVariables).errors.length > 0
  }])), [tabs, savedGraphs, graphLookup, botProfile?.intentSummary, projectVariables]);
  useEffect(() => {
    if (desktopMode || ![...graphTabStatuses.values()].some((status) => status.unsaved)) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [desktopMode, graphTabStatuses]);
  const historyAvailability = useMemo(() => {
    const history = historyRef.current.get(activeTabId);
    return { canUndo: Boolean(history?.past.length), canRedo: Boolean(history?.future.length) };
  }, [activeTabId, historyRevision]);

  useEffect(() => {
    if (!desktopMode) return undefined;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return undefined;
    const enabled = settings.discordRpcEnabled !== false;
    const anonymous = settings.discordRpcRedactWorkspace
      && settings.discordRpcRedactProject
      && settings.discordRpcRedactGraph
      && settings.discordRpcRedactBot;
    const details = anonymous || settings.discordRpcRedactGraph
      ? 'Working on a Discord bot'
      : activeGraph?.name ? `Editing ${activeGraph.name}` : 'Building a Discord bot';
    const stateParts = [
      settings.discordRpcRedactWorkspace ? 'Workspace' : workspaceLabel,
      settings.discordRpcRedactProject ? 'Project' : activeProjectName,
      settings.discordRpcRedactBot ? '' : (botProfile?.application?.name || botProfile?.username || '')
    ].filter(Boolean);
    const stateText = anonymous ? 'Private workspace' : stateParts.join(' · ') || 'Workspace';
    const revision = ++discordRpcRevisionRef.current;
    discordRpcRequestRef.current = enabled
      ? { revision, details, stateText }
      : { revision, clear: true };
    const publishLatest = async () => {
      if (discordRpcInFlightRef.current) return;
      discordRpcInFlightRef.current = true;
      let processedRevision = 0;
      try {
        while (discordRpcRequestRef.current) {
          const request = discordRpcRequestRef.current;
          processedRevision = request.revision;
          try {
            if (request.clear) await invoke('clear_discord_presence');
            else {
              await invoke('update_discord_presence', { details: request.details, stateText: request.stateText, activityType: 0 });
            }
          } catch { /* app retries */ }
          if (discordRpcRequestRef.current?.revision === request.revision) break;
        }
      } finally {
        discordRpcInFlightRef.current = false;
        if (discordRpcRequestRef.current && discordRpcRequestRef.current.revision !== processedRevision) queueMicrotask(publishLatest);
      }
    };
    publishLatest();
    if (!enabled) return undefined;
    const retry = window.setInterval(publishLatest, 20000);
    return () => window.clearInterval(retry);
  }, [desktopMode, settings.discordRpcEnabled, settings.discordRpcRedactWorkspace, settings.discordRpcRedactProject, settings.discordRpcRedactGraph, settings.discordRpcRedactBot, workspaceLabel, activeProjectName, activeGraph?.id, activeGraph?.name, botProfile?.application?.name, botProfile?.username]);

  const triggerLoadingBar = useCallback(() => {
    const bar = document.getElementById('top-loading-bar');
    if (!bar) return;
    window.clearTimeout(loadingBarTimerRef.current);
    bar.classList.remove('is-loading', 'is-complete', 'is-fading');
    void bar.offsetWidth;
    bar.classList.add('is-loading');
    loadingBarTimerRef.current = window.setTimeout(() => {
      bar.classList.add('is-complete');
      loadingBarTimerRef.current = window.setTimeout(() => {
        bar.classList.add('is-fading');
        loadingBarTimerRef.current = window.setTimeout(() => {
          bar.classList.remove('is-loading', 'is-complete', 'is-fading');
          loadingBarTimerRef.current = null;
        }, 220);
      }, 260);
    }, 700);
  }, []);

  useEffect(() => () => window.clearTimeout(loadingBarTimerRef.current), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.releaseChannel = desktopMode && settings.updateChannel === 'nightly' ? 'nightly' : 'stable';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'dark' ? '#191c21' : '#f5f6f7';
    if (hasThemeChoice) safeStorageSet('arc_theme', theme);
  }, [theme, hasThemeChoice, desktopMode, settings.updateChannel]);

  useEffect(() => {
    if (!desktopMode || !macOSDesktop) return;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return;
    let cancelled = false;
    const updateDockIcon = async () => {
      try {
        const image = new Image();
        image.src = '/arc.png';
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.filter = settings.updateChannel === 'nightly' ? 'hue-rotate(42deg) saturate(1.08)' : 'none';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob || cancelled) return;
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        await invoke('set_release_channel_icon', { iconPng: bytes });
      } catch {}
    };
    updateDockIcon();
    return () => { cancelled = true; };
  }, [desktopMode, macOSDesktop, settings.updateChannel]);

  useEffect(() => {
    document.body.dataset.compactContext = settings.compactContextMenus ? 'true' : 'false';
    return () => { delete document.body.dataset.compactContext; };
  }, [settings.compactContextMenus]);

  useEffect(() => {
    if (hasThemeChoice || !window.matchMedia) return undefined;
    const preference = window.matchMedia('(prefers-color-scheme: light)');
    const syncTheme = (event) => setTheme(event.matches ? 'light' : 'dark');
    preference.addEventListener?.('change', syncTheme);
    if (!preference.addEventListener) preference.addListener?.(syncTheme);
    return () => {
      preference.removeEventListener?.('change', syncTheme);
      if (!preference.removeEventListener) preference.removeListener?.(syncTheme);
    };
  }, [hasThemeChoice]);

  const toggleTheme = useCallback(() => {
    setHasThemeChoice(true);
    setTheme((value) => value === 'dark' ? 'light' : 'dark');
  }, []);

  const handleThemeChange = useCallback((choice) => {
    if (choice === 'system') {
      safeStorageRemove('arc_theme');
      setHasThemeChoice(false);
      const preference = window.matchMedia?.('(prefers-color-scheme: light)');
      setTheme(preference?.matches ? 'light' : 'dark');
      return;
    }
    if (choice === 'dark' || choice === 'light') {
      setHasThemeChoice(true);
      setTheme(choice);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    triggerLoadingBar();
    setWorkspaceError('');
    const startupError = desktopMode && workspaceMode === 'local' ? window.__ARC_STUDIO_CONFIG__?.startupError : null;
    if (startupError) {
      setWorkspaceError(startupError);
      setNeedsSetup(false);
      setIsReady(true);
      return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
    }
    fetch(apiUrl('/api/system/status'), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Workspace returned HTTP ${res.status}.`);
        return res.json();
      })
      .then(async (system) => {
        if (cancelled) return;
        if (typeof system.isSetupCompleted !== 'boolean') throw new Error('Workspace returned an invalid status response.');
        if (!desktopMode && typeof system.version === 'string' && system.version.trim()) setStudioVersion(system.version.trim());
        if (desktopMode && workspaceMode === 'local') {
          const ownerUsername = typeof system.localUsername === 'string' ? system.localUsername : '';
          setLocalAccountUsername(ownerUsername);
          if (ownerUsername) safeStorageSet('arc_local_username', ownerUsername);
        }
        setCanResetPrimaryAdminWithMasterKey(system.canResetPrimaryAdminWithMasterKey === true);
        if (typeof system.workspaceName === 'string' && system.workspaceName.trim()) {
          const name = system.workspaceName.trim().slice(0, 35);
          setRemoteWorkspaceName(name);
          if (desktopMode && workspaceMode === 'remote') {
            try { localStorage.setItem('arc_remote_workspace_name', name); } catch {}
          }
        }
        const localOwnerMissing = desktopMode && workspaceMode === 'local' && system.hasLocalAccount === false;
        if (!system.isSetupCompleted || localOwnerMissing) {
          setNeedsSetup(true);
          setAuthToken('');
          safeStorageRemove('arc_token');
          setCurrentUser(null);
          setIsReady(true);
          return;
        }
        setNeedsSetup(false);
        if (authToken) {
          try {
            const res = await fetch(apiUrl('/api/auth/me'), { headers: { 'x-arc-token': authToken }, signal: controller.signal });
            if (!res.ok) throw new Error('Session invalid');
            const data = await res.json();
            if (!cancelled) setCurrentUser(data.user);
          } catch {
            if (!cancelled) {
              setAuthToken('');
              safeStorageRemove('arc_token');
            }
          }
        }
        if (!cancelled) setIsReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceError(error.name === 'AbortError'
            ? 'The workspace did not respond in time. Check that it is running and try again.'
            : error.message === 'Failed to fetch'
              ? workspaceMode === 'remote' ? 'Could not reach this workspace. Check its URL and network access.' : 'Could not reach the local workspace service. Restart ARC Studio and try again.'
              : error.message || 'Could not connect to the workspace.');
          setIsReady(true);
        }
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [workspaceRevision, workspaceMode, desktopMode]);

  useEffect(() => {
    if (!authToken) { setProjectVariables([]); return undefined; }
    let cancelled = false;
    fetch(apiUrl('/api/variables/project'), { headers: { 'x-arc-token': authToken } })
      .then((response) => response.json())
      .then((data) => { if (!cancelled && Array.isArray(data.variables)) setProjectVariables(data.variables); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authToken, activeProjectId, workspaceRevision, workspaceMode]);

  useEffect(() => {
    if (!authToken) {
      registerPluginNodeDefinitions([]);
      setInstalledPlugins([]);
      setPluginDefinitionsRevision((revision) => revision + 1);
      return undefined;
    }
    let cancelled = false;
    fetch(apiUrl('/api/plugins/installed'), { headers: { 'x-arc-token': authToken } })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const plugins = Array.isArray(data.plugins) ? data.plugins : [];
        setInstalledPlugins(plugins);
        registerPluginNodeDefinitions(plugins);
        setPluginDefinitionsRevision((revision) => revision + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authToken, workspaceRevision, workspaceMode]);

  useEffect(() => {
    if (!authToken) { setEmbedAssets([]); return undefined; }
    let current = true;
    const loadEmbeds = async () => {
      try {
        const response = await fetch(apiUrl('/api/embeds'), { headers: { 'x-arc-token': authToken } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load shared embeds.');
        let embeds = Array.isArray(data.embeds) ? data.embeds : [];
        if (!embeds.length && desktopMode && workspaceMode === 'local') {
          try {
            const legacy = readAppStorage('arc_embed_assets');
            const parsed = legacy ? JSON.parse(legacy) : [];
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 1000) {
              let migrated = true;
              for (const embed of parsed) {
                const saved = await fetch(apiUrl('/api/embeds'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify(embed) });
                if (!saved.ok) { migrated = false; break; }
                const savedData = await saved.json();
                embeds = savedData.embeds || embeds;
              }
              if (migrated) safeStorageRemove('arc_embed_assets');
            }
          } catch {}
        }
        if (current) setEmbedAssets(embeds);
      } catch (error) {
        if (current) arcEvents.emit('toast:notify', { title: 'Embed library', message: error.message, type: 'error' });
      }
    };
    loadEmbeds();
    return () => { current = false; };
  }, [authToken, workspaceRevision, workspaceMode, desktopMode]);

  useEffect(() => {
    if (!authToken) { setAppEmojis([]); setAppEmojisLoading(false); setAppEmojisCachedAt(0); return undefined; }
    let cachedEmojis = [];
    let cachedAt = 0;
    try {
      const cached = JSON.parse(readAppStorage(emojiCacheStorageKey) || 'null');
      const age = Date.now() - Number(cached?.cachedAt || 0);
      if (Array.isArray(cached?.emojis) && age >= 0 && age <= APP_EMOJI_CACHE_TTL) { cachedEmojis = cached.emojis; cachedAt = Number(cached.cachedAt); }
      else if (cached) removeAppStorage(emojiCacheStorageKey);
    } catch { removeAppStorage(emojiCacheStorageKey); }
    setAppEmojis(cachedEmojis);
    setAppEmojisCachedAt(cachedAt);
    if (!networkOnline || (Number(botMetrics?.rateLimitedUntil) || 0) > Date.now()) { setAppEmojisLoading(false); return undefined; }
    let current = true;
    setAppEmojisLoading(true);
    fetch(apiUrl('/api/bot/emojis'), { headers: { 'x-arc-token': authToken } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load app emojis.');
        return Array.isArray(data.emojis) ? data.emojis : [];
      })
      .then((items) => {
        if (!current) return;
        const fetchedAt = Date.now();
        setAppEmojis(items);
        setAppEmojisCachedAt(fetchedAt);
        writeAppStorage(emojiCacheStorageKey, JSON.stringify({ cachedAt: fetchedAt, emojis: items }));
      })
      .catch(() => { if (current) setAppEmojis(cachedEmojis); })
      .finally(() => { if (current) setAppEmojisLoading(false); });
    return () => { current = false; };
  }, [authToken, activeProjectId, workspaceMode, workspaceRevision, networkOnline, emojiCacheStorageKey, botMetrics?.rateLimitedUntil]);

  useEffect(() => {
    if (!authToken) {
      setCollaborationSocketStatus('disconnected');
      setCollaborators([]);
      return undefined;
    }
    const wsUrl = studioWebSocketUrl();
    let active = true;
    let reconnectTimer;
    let initialConnectTimer;
    let heartbeatTimer;
    let socket;

    const connect = () => {
      if (!active) return;
      setCollaborationSocketStatus('connecting');
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;
      let lastPongAt = Date.now();
      socket.onopen = () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'AUTH', token: authToken }));
          heartbeatTimer = window.setInterval(() => {
            if (socket.readyState !== WebSocket.OPEN) return;
            if (Date.now() - lastPongAt > 45000) { socket.close(); return; }
            socket.send(JSON.stringify({ type: 'PING' }));
          }, 15000);
          let lastActivitySentAt = 0;
          const reportActivity = () => {
            const now = Date.now();
            if (now - lastActivitySentAt < 15000 || socket.readyState !== WebSocket.OPEN) return;
            lastActivitySentAt = now;
            socket.send(JSON.stringify({ type: 'USER_ACTIVITY' }));
          };
          const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
          activityEvents.forEach((name) => window.addEventListener(name, reportActivity, { passive: true, capture: true }));
          const reportVisibility = () => { if (document.visibilityState === 'visible') reportActivity(); };
          document.addEventListener('visibilitychange', reportVisibility);
          socket.addEventListener('close', () => {
            activityEvents.forEach((name) => window.removeEventListener(name, reportActivity, true));
            document.removeEventListener('visibilitychange', reportVisibility);
          }, { once: true });
        }
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'PONG') {
            lastPongAt = Date.now();
            return;
          }
          if (msg.type === 'SESSION_REPLACEMENT_PENDING') {
            arcEvents.emit('toast:notify', { id: 'arc-session-replacement', title: 'Session change', message: "You'll be logged out in 5 seconds.", type: 'info', loading: true, persistent: true });
            return;
          }
          if (msg.type === 'SESSION_REPLACED') {
            arcEvents.emit('toast:notify', { id: 'arc-session-replacement', title: 'Signed out', message: 'This account was signed in elsewhere.', type: 'warning', duration: 3200 });
            safeStorageRemove('arc_token');
            if (desktopMode && workspaceMode === 'local') {
              safeStorageRemove('arc_local_session_token');
              localSessionRef.current = null;
            }
            setAuthToken('');
            setCurrentUser(null);
            setTabs([]);
            setActiveTabId(null);
            setActiveNodes([]);
            setActiveConnections([]);
            setNeedsProjectOnboarding(false);
            graphsHydratedRef.current = false;
            return;
          }
          if (msg.type === 'USER_PERMISSIONS_UPDATED') {
            const updatedUser = msg.payload?.user;
            if (updatedUser?.id) setCurrentUser((current) => current?.id === updatedUser.id ? { ...current, ...updatedUser } : current);
            return;
          }
          if (msg.type === 'SESSION_REVOKED') {
            arcEvents.emit('toast:notify', { id: 'arc-session-revoked', title: 'Signed out', message: 'A workspace administrator ended this session.', type: 'warning', duration: 5000 });
            safeStorageRemove('arc_token');
            if (desktopMode && workspaceMode === 'local') {
              safeStorageRemove('arc_local_session_token');
              localSessionRef.current = null;
            }
            setAuthToken('');
            setCurrentUser(null);
            setTabs([]);
            setActiveTabId(null);
            setActiveNodes([]);
            setActiveConnections([]);
            setNeedsProjectOnboarding(false);
            graphsHydratedRef.current = false;
            return;
          }
          if (msg.type === 'SESSION_IDLE_EXPIRED') {
            arcEvents.emit('toast:notify', { id: 'arc-session-idle', title: 'Signed out', message: 'You were signed out after being idle.', type: 'info', duration: 5000 });
            safeStorageRemove('arc_token');
            if (desktopMode && workspaceMode === 'local') {
              safeStorageRemove('arc_local_session_token');
              localSessionRef.current = null;
            }
            setAuthToken('');
            setCurrentUser(null);
            setTabs([]);
            setActiveTabId(null);
            setActiveNodes([]);
            setActiveConnections([]);
            setNeedsProjectOnboarding(false);
            graphsHydratedRef.current = false;
            return;
          }
          if (msg.type === 'INIT_STATE') {
            if (!desktopMode && typeof msg.payload.version === 'string' && msg.payload.version.trim()) setStudioVersion(msg.payload.version.trim());
            setCollaborationSocketStatus('connected');
            liveGraphRevisionRef.current.clear();
            liveGraphReadyRef.current.clear();
            lastLiveGraphSentRef.current.clear();
            pendingLiveGraphRef.current.clear();
            setSocketReadyRevision((revision) => revision + 1);
            if (Array.isArray(msg.payload.projectVariables)) setProjectVariables(msg.payload.projectVariables);
            if (msg.payload.projects) {
              const nextProjects = Array.isArray(msg.payload.projects.projects) ? msg.payload.projects.projects : [];
              setProjects(nextProjects);
              setMaxProjects(localDesktopWorkspace ? null : msg.payload.projects.maxProjects === undefined ? 10 : msg.payload.projects.maxProjects);
              setActiveProjectId(msg.payload.projects.activeProjectId || '');
              setNeedsProjectOnboarding(nextProjects.length === 0 || nextProjects.some((project) => project.id === msg.payload.projects.activeProjectId && project.pendingStarterChoice));
            }
            setBotStatus(msg.payload.botStatus || 'DISCONNECTED');
            setBotMetrics(msg.payload.botMetrics || { latencyMs: null, averageLatencyMs: null, jitterMs: null, rateLimitedUntil: 0, rateLimitScope: null });
            setBotProfile(msg.payload.botProfile || null);
            setLogs(msg.payload.logs || []);
            if (msg.payload.graphLibrary) {
              setGraphTemplates(msg.payload.graphLibrary.templates || []);
              setGraphSnapshots(msg.payload.graphLibrary.snapshots || []);
              setDefaultGraphId(msg.payload.graphLibrary.defaultGraphId ?? '');
            }
            if (Array.isArray(msg.payload.graphs)) {
              const graphs = msg.payload.graphs;
              liveGraphBaseRef.current = new Map(graphs.map((graph) => [graph.id, snapshotGraph(graph)]));
              liveGraphRevisionRef.current.clear();
              setSavedGraphs(graphs);
              if (!graphsHydratedRef.current) {
                graphsHydratedRef.current = true;
                let storedIds = null;
                try {
                  const projectId = msg.payload.projects?.activeProjectId;
                  const scopedKey = projectId ? `arc_project_${projectId}_arc_open_graph_ids` : 'arc_open_graph_ids';
                  let rawIds = readAppStorage(scopedKey);
                  if (rawIds === null && projectId) {
                    rawIds = readAppStorage('arc_open_graph_ids');
                    if (rawIds !== null) writeAppStorage(scopedKey, rawIds);
                  }
                  if (rawIds !== null) {
                    const parsed = JSON.parse(rawIds);
                    storedIds = Array.isArray(parsed) ? parsed : [];
                  }
                } catch { storedIds = []; }
                const savedById = new Map(graphs.map((graph) => [graph.id, graph]));
                const opened = (storedIds === null ? graphs : storedIds.map((id) => savedById.get(id)).filter(Boolean)).slice(0, MAX_OPEN_GRAPH_TABS);
                const projectId = msg.payload.projects?.activeProjectId;
                let preferredId = projectId
                  ? safeStorageGet(`arc_project_${projectId}_arc_active_graph_id`, '')
                  : safeStorageGet('arc_active_graph_id', '');
                if (!opened.some((graph) => graph.id === preferredId)) preferredId = opened[0]?.id || null;
                setTabs(opened);
                setActiveTabId(preferredId);
              }
            }
          } else if (msg.type === 'PROJECTS_UPDATED') {
            const payload = msg.payload || {};
            const nextProjects = Array.isArray(payload.projects) ? payload.projects : [];
            setProjects(nextProjects);
            setMaxProjects(localDesktopWorkspace ? null : payload.maxProjects === undefined ? 10 : payload.maxProjects);
            setNeedsProjectOnboarding(nextProjects.length === 0 || nextProjects.some((project) => project.id === payload.activeProjectId && project.pendingStarterChoice));
          } else if (msg.type === 'PROJECT_CHANGED') {
            const payload = msg.payload || {};
            const nextProjects = Array.isArray(payload.projects) ? payload.projects : [];
            const nextProjectId = payload.activeProjectId || '';
            setProjects(nextProjects);
            setMaxProjects(localDesktopWorkspace ? null : payload.maxProjects === undefined ? 10 : payload.maxProjects);
            setActiveProjectId(nextProjectId);
            setNeedsProjectOnboarding(nextProjects.length === 0 || nextProjects.some((project) => project.id === nextProjectId && project.pendingStarterChoice));
            setProjectVariables(Array.isArray(payload.projectVariables) ? payload.projectVariables : []);
            const projectGraphs = Array.isArray(payload.graphs) ? payload.graphs : [];
            liveGraphBaseRef.current = new Map(projectGraphs.map((graph) => [graph.id, snapshotGraph(graph)]));
            liveGraphRevisionRef.current.clear();
            lastLiveGraphSentRef.current.clear();
            pendingLiveGraphRef.current.clear();
            setSavedGraphs(projectGraphs);
            setGraphTemplates(payload.graphLibrary?.templates || []);
            setGraphSnapshots(payload.graphLibrary?.snapshots || []);
            setDefaultGraphId(payload.graphLibrary?.defaultGraphId ?? '');
            setBotProfile(payload.botProfile || null);
            setBotStatus('DISCONNECTED');
            setTabs([]);
            setActiveTabId(null);
            historyRef.current.clear();
            graphsHydratedRef.current = true;
            const graphs = Array.isArray(payload.graphs) ? payload.graphs : [];
            const byId = new Map(graphs.map((graph) => [graph.id, graph]));
            let ids = [];
            try { ids = JSON.parse(safeStorageGet(`arc_project_${nextProjectId}_arc_open_graph_ids`, '[]')); } catch {}
            const opened = (Array.isArray(ids) ? ids.map((id) => byId.get(id)).filter(Boolean) : []).slice(0, MAX_OPEN_GRAPH_TABS);
            setTabs(opened);
            const preferred = safeStorageGet(`arc_project_${nextProjectId}_arc_active_graph_id`, '');
            setActiveTabId(opened.some((graph) => graph.id === preferred) ? preferred : opened[0]?.id || null);
            setWorkspaceRevision((revision) => revision + 1);
          } else if (msg.type === 'PROJECT_VARIABLES_UPDATED') {
            setProjectVariables(Array.isArray(msg.payload.variables) ? msg.payload.variables : []);
          } else if (msg.type === 'GRAPH_STATE_SYNC' && msg.payload?.graphId) {
            const payload = msg.payload;
            if (payload.projectId !== activeProjectIdRef.current) return;
            liveGraphReadyRef.current.add(`${payload.projectId}:${payload.graphId}`);
            setLiveSyncRevision((revision) => revision + 1);
            if (!payload.graph?.id) return;
            const incoming = payload.graph;
            if (payload.graphId !== incoming.id) return;
            const previousRevision = liveGraphRevisionRef.current.get(incoming.id) || 0;
            if (Number(payload.revision) <= previousRevision) return;
            liveGraphRevisionRef.current.set(incoming.id, Number(payload.revision) || previousRevision + 1);
            const base = liveGraphBaseRef.current.get(incoming.id) || savedGraphsRef.current.find((item) => item.id === incoming.id) || incoming;
            const local = tabsRef.current.find((item) => item.id === incoming.id);
            const merged = mergeGraphState(base, local || base, incoming);
            liveGraphBaseRef.current.set(incoming.id, snapshotGraph(incoming));
            lastLiveGraphSentRef.current.set(incoming.id, JSON.stringify(snapshotGraph(incoming)));
            setTabs((current) => current.map((tab) => {
              if (tab.id !== incoming.id) return tab;
              const saved = savedGraphsRef.current.find((item) => item.id === incoming.id);
              return { ...merged, isDirty: saved ? !sameGraphContent(merged, saved) : true };
            }));
          } else if (msg.type === 'GRAPH_STATE_ACK' && msg.payload?.graphId) {
            const pending = pendingLiveGraphRef.current.get(msg.payload.graphId);
            if (pending?.syncId === msg.payload.syncId && pending?.clientId === collaborationClientIdRef.current) {
              lastLiveGraphSentRef.current.set(msg.payload.graphId, pending.serialized);
              pendingLiveGraphRef.current.delete(msg.payload.graphId);
              rejectedLiveGraphToastRef.current.delete(msg.payload.graphId);
            }
          } else if (msg.type === 'GRAPH_STATE_REJECTED') {
            const graphId = msg.payload?.graphId;
            const pending = graphId ? pendingLiveGraphRef.current.get(graphId) : null;
            if (graphId) {
              pendingLiveGraphRef.current.delete(graphId);
              if (pending) lastLiveGraphSentRef.current.set(graphId, pending.serialized);
            }
            if (!graphId || !rejectedLiveGraphToastRef.current.has(graphId)) {
              if (graphId) rejectedLiveGraphToastRef.current.add(graphId);
              arcEvents.emit('toast:notify', { title: 'Live edit not shared', message: msg.payload?.message || 'This workspace did not accept the graph update. Check your graph edit permissions and connection.', type: 'warning' });
            }
          } else if (msg.type === 'GRAPH_UPDATED' && msg.payload?.graph?.id) {
            const incoming = msg.payload.graph;
            liveGraphBaseRef.current.set(incoming.id, snapshotGraph(incoming));
            liveGraphRevisionRef.current.delete(incoming.id);
            setSavedGraphs((current) => [incoming, ...current.filter((graph) => graph.id !== incoming.id)]);
            setTabs((current) => current.map((tab) => {
              if (tab.id !== incoming.id) return tab;
              if (tab.isDirty && !sameGraphContent(tab, incoming)) {
                if (!remoteGraphConflictsRef.current.has(tab.id)) {
                  remoteGraphConflictsRef.current.add(tab.id);
                  arcEvents.emit('toast:notify', { title: 'Shared graph updated', message: `A collaborator saved “${incoming.name || incoming.id}” while you had local edits. Your draft is preserved; review it before saving.`, type: 'warning' });
                }
                return tab;
              }
              remoteGraphConflictsRef.current.delete(tab.id);
              return { ...incoming, isDirty: false };
            }));
          } else if (msg.type === 'LOG_ENTRY') {
            setLogs((previous) => [...previous.slice(-499), msg.payload]);
          } else if (msg.type === 'COLLABORATORS_UPDATED') {
            setCollaborators(Array.isArray(msg.payload) ? msg.payload : []);
          } else if (msg.type === 'PROJECT_USERS_UPDATED') {
            setProjectUsers(msg.payload && typeof msg.payload === 'object' ? msg.payload : {});
          } else if (msg.type === 'COLLAB_ACTION_UPDATED') {
            const action = msg.payload;
            if (action?.projectId !== activeProjectIdRef.current || action?.graphId !== activeTabIdRef.current || action.userId === currentUser?.id) return;
            setRemoteCollaborationActions((previous) => [...previous.filter((item) => item.userId !== action.userId), action]);
            if (action.action?.kind === 'studio-draft') {
              if (action.action.studioType === 'embed') {
                setEmbedStudio((current) => {
                  if (current?.collabId !== action.action.studioId) return current;
                  const localDraft = { name: current.name, content: current.content || '', blocks: current.blocks || [], components: current.components || [], attachments: collaborativeAttachments(current.attachments || []) };
                  const baseDraft = collaborativeEmbedBaseRef.current.get(current.collabId) || localDraft;
                  const merged = mergeCollaborativeValue(baseDraft, localDraft, action.action.draft);
                  collaborativeEmbedBaseRef.current.set(current.collabId, action.action.draft);
                  return { ...current, ...merged, attachments: mergeCollaborativeAttachments(current.attachments || [], action.action.draft.attachments || []), isDirty: true };
                });
              } else {
                const collabId = action.action.studioId;
                const remoteText = String(action.action.draft?.text || '');
                const previous = textCollaborationRef.current.get(collabId) || { baseText: remoteText, localText: remoteText, caret: 0 };
                const mergedText = mergeCollaborativeText(previous.baseText, previous.localText, remoteText, currentUser?.id, action.userId);
                textCollaborationRef.current.set(collabId, { ...previous, baseText: remoteText, localText: mergedText });
                if (mergedText !== remoteText) {
                  sendCollaborationAction({ kind: 'studio-draft', studioId: collabId, studioType: 'text', draft: { text: mergedText, caret: previous.caret } });
                }
                setDiscordTextStudio((current) => current?.collabId === collabId ? { ...current, sharedDraft: mergedText, localDraft: mergedText } : current);
              }
            }
          } else if (msg.type === 'COLLAB_ACTION_CLEARED') {
            setRemoteCollaborationActions((previous) => previous.filter((item) => item.userId !== msg.payload?.userId));
          } else if (msg.type === 'LOGS_CLEARED') {
            setLogs([]);
          } else if (msg.type === 'EMBEDS_UPDATED' && Array.isArray(msg.payload?.embeds)) {
            setEmbedAssets(msg.payload.embeds);
          } else if (msg.type === 'BOT_STATUS') {
            setBotStatus(msg.payload.status);
            if (msg.payload.user) setBotProfile((profile) => ({ ...profile, ...msg.payload.user }));
          } else if (msg.type === 'BOT_METRICS') {
            const rateLimitedUntil = Number(msg.payload?.rateLimitedUntil) || 0;
            if (rateLimitedUntil > Date.now() && rateLimitedUntil > rateLimitAnnouncedUntilRef.current) {
              rateLimitAnnouncedUntilRef.current = rateLimitedUntil;
              const seconds = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
              arcEvents.emit('toast:notify', { title: 'Discord API rate limit', message: `Live API requests are paused for about ${seconds}s. Use Simulation while the cooldown clears.`, type: 'warning' });
            }
            setBotMetrics((metrics) => ({ ...metrics, ...msg.payload }));
          } else if (msg.type === 'GRAPH_EXECUTION_PULSE') {
            const { tabId, nodeIds = [] } = msg.payload || {};
            setActivePulseGraphId(tabId || null);
            setActivePulseNodeIds(nodeIds);
            window.setTimeout(() => setActivePulseNodeIds((current) => current.filter((nodeId) => errorPulseUntilRef.current.get(`${tabId}:${nodeId}`) > Date.now())), 1200);
          } else if (msg.type === 'GRAPH_NODE_ERROR') {
            const failure = msg.payload || {};
            const { graphId, graphName, nodeId, nodeLabel, error } = failure;
            if (graphId && nodeId) {
              const expiresAt = Date.now() + 15000;
              errorPulseUntilRef.current.set(`${graphId}:${nodeId}`, expiresAt);
              let graph = tabsRef.current.find((item) => item.id === graphId);
              if (!graph) {
                graph = savedGraphsRef.current.find((item) => item.id === graphId);
                if (graph && tabsRef.current.length < MAX_OPEN_GRAPH_TABS) {
                  setTabs((current) => current.some((item) => item.id === graphId) ? current : [...current, { ...graph, isDirty: false }]);
                } else graph = null;
              }
              if (graph) setActiveTabId(graphId);
              setActivePulseGraphId(graphId);
              setActivePulseNodeIds([nodeId]);
              window.setTimeout(() => {
                if (errorPulseUntilRef.current.get(`${graphId}:${nodeId}`) === expiresAt) {
                  errorPulseUntilRef.current.delete(`${graphId}:${nodeId}`);
                  setActivePulseNodeIds((current) => current.filter((id) => id !== nodeId));
                }
              }, 15000);
            }
            const shortError = String(error || 'An unexpected error occurred.').replace(/\s+/g, ' ').slice(0, 120);
            arcEvents.emit('toast:notify', {
              title: 'Graph node failed',
              message: `${graphName || 'Graph'} · ${nodeLabel || 'Node'}: ${shortError}`,
              type: 'error',
              duration: 15000
            });
          } else if (msg.type === 'MOCK_DEBUG_STEP') {
            setActivePulseNodeIds(msg.payload.step?.nodeId ? [msg.payload.step.nodeId] : []);
            setActivePulseGraphId(msg.payload.tabId || null);
            setActiveDebugStep(msg.payload.step || null);
            arcEvents.emit('simulation:debug-step', msg.payload);
          } else if (msg.type === 'MOCK_DEBUG_FINISHED') {
            setActivePulseNodeIds([]);
            setActivePulseGraphId(null);
            setActiveDebugStep(null);
            arcEvents.emit('simulation:debug-finished', msg.payload);
          }
        } catch { /* malformed/unrelated socket messages. */ }
      };
      socket.onclose = () => {
        window.clearInterval(heartbeatTimer);
        setRemoteCollaborationActions([]);
        if (active) setCollaborationSocketStatus('reconnecting');
        if (active) reconnectTimer = window.setTimeout(connect, 2500);
      };
      socket.onerror = () => socket.close();
    };
    //
    initialConnectTimer = window.setTimeout(connect, 0);
    return () => {
      active = false;
      window.clearTimeout(initialConnectTimer);
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.close(1000, 'Studio view changed');
      } else if (socket?.readyState === WebSocket.CONNECTING) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.onopen = () => socket.close(1000, 'Studio view changed');
      }
      if (wsRef.current === socket) wsRef.current = null;
    };
  }, [authToken, workspaceMode]);

  useEffect(() => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (activeProjectId) {
      liveGraphReadyRef.current.delete(`${activeProjectId}:${activeTabId}`);
      socket.send(JSON.stringify({ type: 'PRESENCE', projectId: activeProjectId, graphId: activeTabId || '' }));
      if (pendingCollaborationActionRef.current.size) {
        window.clearTimeout(collaborationActionTimerRef.current);
        collaborationActionTimerRef.current = null;
        const pending = [...pendingCollaborationActionRef.current.values()];
        pendingCollaborationActionRef.current.clear();
        for (const entry of pending) if (entry.projectId && entry.graphId) socket.send(JSON.stringify({ type: 'COLLAB_ACTION', projectId: entry.projectId, graphId: entry.graphId, action: entry.action }));
      }
    }
    else { setCollaborators([]); socket.send(JSON.stringify({ type: 'PRESENCE', projectId: '', graphId: '' })); }
  }, [activeProjectId, activeTabId, authToken, socketReadyRevision]);

  useEffect(() => {
    if (!activeProjectId || !activeTabId) return undefined;
    const graph = tabs.find((tab) => tab.id === activeTabId);
    const socket = wsRef.current;
    if (!graph?.isDirty || !socket || socket.readyState !== WebSocket.OPEN || !liveGraphReadyRef.current.has(`${activeProjectId}:${activeTabId}`)) return undefined;
    const graphState = snapshotGraph(graph);
    const serialized = JSON.stringify(graphState);
    if (lastLiveGraphSentRef.current.get(graph.id) === serialized) return undefined;
    const timer = window.setTimeout(() => {
      if (socket !== wsRef.current || socket.readyState !== WebSocket.OPEN) return;
      const syncId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      socket.send(JSON.stringify({
        type: 'GRAPH_STATE',
        projectId: activeProjectId,
        graphId: graph.id,
        clientId: collaborationClientIdRef.current,
        syncId,
        graph: graphState
      }));
      pendingLiveGraphRef.current.set(graph.id, { serialized, syncId, clientId: collaborationClientIdRef.current });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, activeTabId, liveSyncRevision, socketReadyRevision, tabs]);

  useEffect(() => {
    if (!graphsHydratedRef.current || !activeProjectId) return;
    safeStorageSet(`arc_project_${activeProjectId}_arc_open_graph_ids`, JSON.stringify(tabs.map((tab) => tab.id)));
    if (activeTabId) safeStorageSet(`arc_project_${activeProjectId}_arc_active_graph_id`, activeTabId);
    else safeStorageRemove(`arc_project_${activeProjectId}_arc_active_graph_id`);
  }, [tabs, activeTabId, activeProjectId]);

  useEffect(() => {
    if (!activeTabId) {
      setActiveNodes([]);
      setActiveConnections([]);
      return;
    }
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (graph) {
      setActiveNodes(graph.nodes || []);
      setActiveConnections(graph.connections || []);
    }
  }, [activeTabId, tabs]);

  const recordHistory = useCallback((graphId = activeTabId, { force = false, graph: fallbackGraph = null } = {}) => {
    if (!graphId || historyGroupRef.current) return;
    const graph = tabs.find((tab) => tab.id === graphId) || fallbackGraph;
    if (!graph) return;
    let history = historyRef.current.get(graphId);
    if (!history) {
      history = { past: [], future: [], lastAt: 0 };
      historyRef.current.set(graphId, history);
    }
    const now = Date.now();
    const hadRedo = history.future.length > 0;
    if (force || now - history.lastAt > 500) {
      history.past.push(snapshotGraph(graph));
      if (history.past.length > 100) history.past.shift();
    }
    history.future = [];
    if (force || now - history.lastAt > 500 || hadRedo) setHistoryRevision((revision) => revision + 1);
    history.lastAt = now;
  }, [activeTabId, tabs]);

  const handleHistoryGroupStart = useCallback(() => {
    if (historyGroupRef.current) return;
    historyGroupRef.current = true;
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (graph) {
      let history = historyRef.current.get(activeTabId);
      if (!history) { history = { past: [], future: [], lastAt: 0 }; historyRef.current.set(activeTabId, history); }
      history.past.push(snapshotGraph(graph));
      if (history.past.length > 100) history.past.shift();
      history.future = [];
      history.lastAt = Date.now();
      setHistoryRevision((revision) => revision + 1);
    }
  }, [activeTabId, tabs]);

  const handleHistoryGroupEnd = useCallback(() => { historyGroupRef.current = false; }, []);

  const handleNodesChange = useCallback((nextNodes) => {
    const previousNodes = activeGraph?.nodes || activeNodes;
    const previousIds = previousNodes.map((node) => node.id).join('|');
    const nextIds = nextNodes.map((node) => node.id).join('|');
    const structuralChange = previousIds !== nextIds;
    recordHistory(activeTabId, { force: structuralChange });
    setActiveNodes(nextNodes);
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
  }, [activeGraph, activeNodes, activeTabId, recordHistory]);

  const handleTagGroupsChange = useCallback((nextGroups) => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    recordHistory(activeTabId, { force: true, graph });
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, tagGroups: nextGroups, isDirty: true } : tab));
  }, [tabs, activeTabId, recordHistory]);

  const handleGraphNotesChange = useCallback((nextNotes) => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    recordHistory(activeTabId, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, notes: nextNotes, isDirty: true } : tab));
  }, [tabs, activeTabId, recordHistory]);

  const openNodeRename = (node) => {
    if (!node) return;
    const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
    setNodeRenameValue(node.label || definition?.label || node.type);
    setNodeRenameDialog({ nodeId: node.id, fallback: definition?.label || node.type });
  };

  const saveNodeRename = (event) => {
    event?.preventDefault?.();
    if (!nodeRenameDialog) return;
    const label = nodeRenameValue.trim() || nodeRenameDialog.fallback;
    handleNodesChange(activeNodes.map((node) => node.id === nodeRenameDialog.nodeId ? { ...node, label } : node));
    setNodeRenameDialog(null);
  };

  const openTagGroupDialog = (nodeId = null, existingGroup = null, noteIds = []) => {
    setTagGroupDialog(existingGroup ? { id: existingGroup.id } : { id: null });
    setTagGroupName(existingGroup?.name || '');
    setTagGroupColor(existingGroup?.color || TAG_GROUP_COLORS[0].value);
    setTagGroupNodeIds(existingGroup ? [...(existingGroup.nodeIds || [])] : Array.isArray(nodeId) ? [...nodeId] : nodeId ? [nodeId] : []);
    setTagGroupNoteIds(existingGroup ? [...(existingGroup.noteIds || [])] : [...noteIds]);
    setTagGroupSearch('');
    setTagGroupError('');
  };

  const saveTagGroup = (event) => {
    event?.preventDefault?.();
    const name = tagGroupName.trim();
    const nodeIds = [...new Set(tagGroupNodeIds)].filter((id) => activeNodes.some((node) => node.id === id));
    const noteIds = [...new Set(tagGroupNoteIds)].filter((id) => (activeGraph?.notes || []).some((note) => note.id === id));
    if (!name) return setTagGroupError('Give this section a name.');
    if (!nodeIds.length && !noteIds.length) return setTagGroupError('Choose at least one node or note.');
    const group = { id: tagGroupDialog?.id || `tag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: name.slice(0, 48), color: tagGroupColor, nodeIds, noteIds };
    const currentGroups = activeGraph?.tagGroups || [];
    handleTagGroupsChange(tagGroupDialog?.id ? currentGroups.map((item) => item.id === group.id ? group : item) : [...currentGroups, group]);
    setTagGroupDialog(null);
  };

  const handleConnectionsChange = useCallback((nextConnections) => {
    recordHistory(activeTabId, { force: true });
    setActiveConnections(nextConnections);
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? { ...tab, connections: nextConnections, isDirty: true } : tab));
  }, [activeTabId, recordHistory]);

  const handleVariablesChange = useCallback((nextVariables) => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    recordHistory(activeTabId, { force: true, graph });
    const previousVariables = Array.isArray(graph.variables) ? graph.variables : [];
    const changedTypeIds = new Set(previousVariables.filter((item) => nextVariables.some((next) => next.id === item.id && next.type !== item.type)).map((item) => item.id));
    const affectedNodeIds = new Set((graph.nodes || []).filter((node) =>
      (['variable_get', 'variable_set'].includes(node.type) && changedTypeIds.has(node.data?.variableId))
      || (node.type === 'format_text' && previousVariables.some((variable) => changedTypeIds.has(variable.id) && new RegExp(`\\{\\{\\s*${escapeRegExp(variable.name)}\\s*\\}\\}`).test(node.data?.template || '')))
    ).map((node) => node.id));
    const nextNodes = graph.nodes || [];
    const nextConnections = (graph.connections || []).filter((connection) => !affectedNodeIds.has(connection.sourceNodeId) && !affectedNodeIds.has(connection.targetNodeId));
    if (affectedNodeIds.size && graph.id === activeTabId) {
      setActiveNodes(nextNodes);
      setActiveConnections(nextConnections);
    }
    setTabs((previous) => previous.map((tab) => tab.id === activeTabId ? {
      ...tab,
      variables: nextVariables,
      isDirty: true,
      nodes: affectedNodeIds.size ? nextNodes : tab.nodes,
      connections: affectedNodeIds.size ? nextConnections : tab.connections
    } : tab));
  }, [tabs, activeTabId, recordHistory]);

  const handleProjectVariablesChange = useCallback((nextVariables) => {
    if (!authToken) return;
    const projectId = activeProjectId;
    setProjectVariables(nextVariables);
    const revision = ++projectVariablesSaveRef.current.revision;
    window.clearTimeout(projectVariablesSaveRef.current.timer);
    setSavingProjectVariables(true);
    projectVariablesSaveRef.current.timer = window.setTimeout(async () => {
      try {
        const response = await fetch(apiUrl('/api/variables/project'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
          body: JSON.stringify({ projectId, variables: nextVariables })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save project variables.');
        if (projectVariablesSaveRef.current.revision === revision && activeProjectIdRef.current === projectId) setProjectVariables(Array.isArray(data.variables) ? data.variables : nextVariables);
      } catch (error) {
        if (projectVariablesSaveRef.current.revision !== revision || activeProjectIdRef.current !== projectId) return;
        arcEvents.emit('toast:notify', { title: 'Project variables not saved', message: error.message, type: 'error' });
        try {
          const response = await fetch(apiUrl('/api/variables/project'), { headers: { 'x-arc-token': authToken } });
          const data = await response.json();
          if (response.ok && activeProjectIdRef.current === projectId && Array.isArray(data.variables)) setProjectVariables(data.variables);
        } catch {}
      } finally {
        if (projectVariablesSaveRef.current.revision === revision) setSavingProjectVariables(false);
      }
    }, 220);
  }, [authToken, activeProjectId]);

  useEffect(() => () => window.clearTimeout(projectVariablesSaveRef.current.timer), [activeProjectId, workspaceRevision, authToken]);

  const notifyGraphCheckIssues = useCallback((graph, lookup = graphLookup) => {
    const report = validateGraph(graph, lookup, botProfile?.intentSummary, projectVariables);
    if (!report.errors.length) return;
    const now = Date.now();
    if (now - graphCheckToastAtRef.current < 5000) return;
    graphCheckToastAtRef.current = now;
    arcEvents.emit('toast:notify', {
      title: 'Graph needs attention',
      message: `${report.errors.length} issue${report.errors.length === 1 ? '' : 's'} found`,
      type: 'warning'
    });
  }, [graphLookup, botProfile?.intentSummary, projectVariables]);

  const persistGraph = useCallback(async (graph, name = graph?.name) => {
    if (!graph || !authToken) return false;
    setSavingGraphIds((current) => current.includes(graph.id) ? current : [...current, graph.id]);
    triggerLoadingBar();
    try {
      const graphToSave = { ...graph, name };
      delete graphToSave.isDirty;
      const body = JSON.stringify(graphToSave);
      const hasAttachments = (graphToSave.nodes || []).some((node) => (node.data?.attachments || []).some((file) => typeof file.data === 'string' && file.data.startsWith('data:')));
      if (hasAttachments) setGraphUploadProgress({ graphId: graph.id, graphName: graph.name || 'Graph', percent: 0 });
      const response = await xhrJson(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body,
        onUploadProgress: hasAttachments ? (percent) => setGraphUploadProgress({ graphId: graph.id, graphName: graph.name || 'Graph', percent }) : undefined
      });
      const data = response.data;
      if (!response.ok) throw new Error(data.error || 'Could not save graph.');
      setTabs((previous) => previous.map((tab) => {
        if (tab.id !== graph.id) return tab;
        return sameGraphContent(tab, graphToSave) ? { ...data.graph, isDirty: false } : { ...tab, name: data.graph.name, isDirty: true };
      }));
      remoteGraphConflictsRef.current.delete(graph.id);
      setSavedGraphs((previous) => [data.graph, ...previous.filter((item) => item.id !== data.graph.id)]);
      setSaveFeedback({ graphId: graph.id, savedAt: Date.now() });
      const validationLookup = new Map(graphLookup);
      validationLookup.set(data.graph.id, data.graph);
      notifyGraphCheckIssues(data.graph, validationLookup);
      return true;
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Save failed', message: error.message, type: 'error' });
      return false;
    } finally {
      setGraphUploadProgress((current) => current?.graphId === graph.id ? null : current);
      setSavingGraphIds((current) => current.filter((id) => id !== graph.id));
    }
  }, [authToken, graphLookup, notifyGraphCheckIssues, triggerLoadingBar]);

  const saveGraphWithProgress = useCallback(async (graph) => {
    setSavingGraphIds((current) => current.includes(graph.id) ? current : [...current, graph.id]);
    const graphToSave = { ...graph };
    delete graphToSave.isDirty;
    const hasAttachments = (graphToSave.nodes || []).some((node) => (node.data?.attachments || []).some((file) => typeof file.data === 'string' && file.data.startsWith('data:')));
    if (hasAttachments) setGraphUploadProgress({ graphId: graph.id, graphName: graph.name || 'Graph', percent: 0 });
    try {
      const response = await xhrJson(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify(graphToSave),
        onUploadProgress: hasAttachments ? (percent) => setGraphUploadProgress({ graphId: graph.id, graphName: graph.name || 'Graph', percent }) : undefined
      });
      if (!response.ok) throw new Error(response.data.error || `Could not save ${graph.name || 'graph'}.`);
      const validationLookup = new Map(graphLookup);
      validationLookup.set(response.data.graph.id, response.data.graph);
      notifyGraphCheckIssues(response.data.graph, validationLookup);
      return response.data.graph;
    } finally {
      setGraphUploadProgress((current) => current?.graphId === graph.id ? null : current);
      setSavingGraphIds((current) => current.filter((id) => id !== graph.id));
    }
  }, [authToken, graphLookup, notifyGraphCheckIssues]);

  useEffect(() => {
    if (!authToken || !networkOnline || settings.autoSave === false) return undefined;
    const intervalSeconds = Math.max(5, Math.min(300, Number(settings.autoSaveIntervalSeconds) || 30));
    const timer = window.setInterval(async () => {
      for (const graph of tabsRef.current) {
        if (!graph?.isDirty || remoteGraphConflictsRef.current.has(graph.id) || autoSaveInFlightRef.current.has(graph.id)) continue;
        autoSaveInFlightRef.current.add(graph.id);
        const savedSnapshot = snapshotGraph(graph);
        try {
          const saved = await saveGraphWithProgress(graph);
          liveGraphBaseRef.current.set(graph.id, snapshotGraph(saved));
          setSavedGraphs((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          setTabs((current) => current.map((tab) => tab.id !== graph.id ? tab
            : sameGraphContent(tab, savedSnapshot) ? { ...saved, isDirty: false } : tab));
        } catch (error) {
          arcEvents.emit('toast:notify', { title: 'Auto-save failed', message: error.message || `Could not save ${graph.name || 'graph'}.`, type: 'error' });
        } finally {
          autoSaveInFlightRef.current.delete(graph.id);
        }
      }
    }, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [authToken, networkOnline, saveGraphWithProgress, settings.autoSave, settings.autoSaveIntervalSeconds]);

  const recoveryWorkspace = workspaceMode === 'remote' ? (() => { try { const url = new URL(remoteWorkspaceUrl); return `${url.origin}${url.pathname}`; } catch { return 'remote'; } })() : (desktopMode ? 'desktop-local' : window.location.origin);
  const recoveryStorageKey = `arc_graph_recovery:${workspaceMode}:${recoveryWorkspace}:${currentUser?.id || 'guest'}:${activeProjectId || 'default'}`;
  useEffect(() => {
    if (!authToken || !activeProjectId || !graphsHydratedRef.current || recoveryCheckedKeysRef.current.has(recoveryStorageKey)) return;
    recoveryCheckedKeysRef.current.add(recoveryStorageKey);
    recoveryDraftsRef.current = [];
    setRecoveryDrafts([]);
    setRecoveryDraftKey(recoveryStorageKey);
    let stored = [];
    try { stored = JSON.parse(safeStorageGet(recoveryStorageKey, '[]')); } catch {}
    const savedById = new Map(savedGraphs.map((graph) => [graph.id, graph]));
    const recoverable = (Array.isArray(stored) ? stored : []).filter((entry) => entry?.graph?.id
      && (!savedById.has(entry.graph.id) || !sameGraphContent(entry.graph, savedById.get(entry.graph.id))))
      .slice(0, MAX_OPEN_GRAPH_TABS);
    recoveryDraftsRef.current = recoverable;
    setRecoveryDrafts(recoverable);
  }, [authToken, activeProjectId, recoveryStorageKey, savedGraphs]);

  useEffect(() => {
    if (!authToken || !activeProjectId || !recoveryCheckedKeysRef.current.has(recoveryStorageKey)) return;
    const entries = new Map(recoveryDraftsRef.current.map((entry) => [entry.graph.id, entry]));
    for (const graph of tabs) {
      if (!graph?.id) continue;
      const saved = savedGraphs.find((item) => item.id === graph.id);
      if (graph.isDirty || !saved) entries.set(graph.id, { graph: snapshotGraph(graph), savedAt: Date.now() });
      else if (sameGraphContent(graph, saved)) entries.delete(graph.id);
    }
    const next = [...entries.values()].filter((entry) => {
      const saved = savedGraphs.find((graph) => graph.id === entry.graph.id);
      return !saved || !sameGraphContent(saved, entry.graph);
    }).slice(0, MAX_OPEN_GRAPH_TABS);
    recoveryDraftsRef.current = next;
    try {
      if (next.length) safeStorageSet(recoveryStorageKey, JSON.stringify(next));
      else safeStorageRemove(recoveryStorageKey);
    } catch {}
  }, [authToken, activeProjectId, recoveryStorageKey, savedGraphs, tabs]);

  const handleSaveGraph = useCallback(async () => {
    if (!activeTabId || !authToken) return;
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    if (!savedGraphs.some((saved) => saved.id === graph.id)) {
      setNameDialogError('');
      setNameDialog({ graphId: graph.id, value: graph.name || '', mode: 'save' });
      return;
    }
    await persistGraph(graph);
  }, [activeTabId, authToken, persistGraph, savedGraphs, tabs]);

  const handleRenameGraph = useCallback((graph) => {
    if (!graph) return;
    setNameDialogError('');
    setNameDialog({ graphId: graph.id, value: graph.name || '', mode: 'rename' });
  }, []);

  const handleDuplicateGraph = useCallback(async (sourceGraph) => {
    if (!sourceGraph) return;
    if (tabs.length >= MAX_OPEN_GRAPH_TABS) {
      arcEvents.emit('toast:notify', { title: 'Graph tab limit reached', message: 'Close a tab before duplicating this graph.', type: 'warning' });
      return;
    }
    const baseName = `${sourceGraph.name || 'Untitled graph'} copy`;
    const existingNames = new Set([...savedGraphs, ...tabs].map((graph) => String(graph.name || '').toLowerCase()));
    let name = baseName;
    let suffix = 2;
    while (existingNames.has(name.toLowerCase())) name = `${baseName} ${suffix++}`;
    const clone = structuredClone(sourceGraph);
    const id = `graph_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    const nodeIds = new Map((clone.nodes || []).map((node) => [node.id, `node_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`]));
    clone.id = id;
    clone.name = name;
    clone.nodes = (clone.nodes || []).map((node) => ({ ...node, id: nodeIds.get(node.id) }));
    clone.connections = (clone.connections || []).map((connection) => ({
      ...connection,
      id: `connection_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
      sourceNodeId: nodeIds.get(connection.sourceNodeId) || connection.sourceNodeId,
      targetNodeId: nodeIds.get(connection.targetNodeId) || connection.targetNodeId
    }));
    clone.isDirty = true;
    setTabs((previous) => [...previous, clone]);
    setActiveTabId(id);
    setIsLibraryOpen(false);
    const saved = await persistGraph(clone, name);
    if (saved) setTabs((previous) => previous.map((tab) => tab.id === id ? { ...saved, isDirty: false } : tab));
  }, [persistGraph, savedGraphs, tabs]);

  const closeTabImmediately = useCallback((id) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    recoveryDraftsRef.current = recoveryDraftsRef.current.filter((entry) => entry.graph?.id !== id);
    setRecoveryDrafts((current) => current.filter((entry) => entry.graph?.id !== id));
    historyRef.current.delete(id);
    historyGroupRef.current = false;
    if (activeTabId === id) setActiveTabId(remaining[Math.min(index, remaining.length - 1)]?.id || null);
  }, [activeTabId, tabs]);

  const handleNameDialogSubmit = useCallback(async (event) => {
    event?.preventDefault?.();
    const name = String(nameDialog?.value || '').trim();
    if (!name) { setNameDialogError('Enter a graph name.'); return; }
    const graph = tabs.find((tab) => tab.id === nameDialog?.graphId) || savedGraphs.find((item) => item.id === nameDialog?.graphId);
    if (!graph) { setNameDialog(null); return; }
    const renamed = { ...graph, name, isDirty: true };
    if (nameDialog.mode === 'save' || nameDialog.mode === 'save-close' || savedGraphs.some((item) => item.id === graph.id)) {
      setTabs((previous) => previous.map((tab) => tab.id === graph.id ? renamed : tab));
      const saved = await persistGraph(renamed, name);
      if (saved) {
        setNameDialog(null);
        if (nameDialog.mode === 'save-close') closeTabImmediately(graph.id);
      }
      return;
    }
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? renamed : tab));
    setNameDialog(null);
    arcEvents.emit('toast:notify', { title: 'Name updated', message: `${name} · save to keep this change.`, type: 'success' });
  }, [nameDialog, persistGraph, savedGraphs, tabs, closeTabImmediately]);

  const handleAutoLayout = useCallback(() => {
    if (!activeNodes.length) return;
    const nodes = activeNodes.map((node, index) => ({
      ...node,
      x: 72 + index * 286,
      y: 104 + (index % 2 ? 46 : 0)
    }));
    handleNodesChange(nodes);
  }, [activeNodes, handleNodesChange]);

  const handleExportGraph = useCallback(() => {
    const graph = tabs.find((tab) => tab.id === activeTabId);
    if (!graph) return;
    const exportData = { ...graph };
    delete exportData.isDirty;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(graph.name || 'graph').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.arc.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [activeTabId, tabs]);

  const ensureWorkspaceGraphsSaved = useCallback(async () => {
    if (!authToken) throw new Error('Sign in again before saving graphs.');
    const unsavedTabs = tabs.filter((graph) => graph.isDirty || !savedGraphs.some((saved) => saved.id === graph.id));
    const savedNow = [];
    for (const graph of unsavedTabs) {
      savedNow.push(await saveGraphWithProgress(graph));
    }
    if (savedNow.length) {
      const byId = new Map(savedNow.map((graph) => [graph.id, graph]));
      setSavedGraphs((previous) => [...byId.values(), ...previous.filter((graph) => !byId.has(graph.id))]);
      setTabs((previous) => previous.map((graph) => {
        const saved = byId.get(graph.id);
        return saved ? (sameGraphContent(graph, saved) ? { ...saved, isDirty: false } : graph) : graph;
      }));
    }
  }, [authToken, savedGraphs, saveGraphWithProgress, tabs]);

  const handleAddTab = useCallback((sourceGraph = null, { blank = false } = {}) => {
    if (tabs.length >= MAX_OPEN_GRAPH_TABS) {
      arcEvents.emit('toast:notify', { title: 'Graph tab limit reached', message: 'Close a tab to open another graph. Saved graphs remain available in the Library.', type: 'warning' });
      return null;
    }
    const id = `graph_${Date.now()}`;
    const selectedSource = blank ? null : sourceGraph || savedGraphs.find((graph) => graph.id === defaultGraphId) || graphTemplates.find((graph) => graph.id === defaultGraphId);
    const sourceNodes = selectedSource?.nodes || (blank ? [] : [{ id: `node_${Date.now()}`, type: 'event_slash_command', label: 'On Slash Command', x: 72, y: 104, data: { commandName: 'help', description: 'Show help and bot information.' } }]);
    const clonedNodes = structuredClone(sourceNodes);
    const nodeIds = new Map(clonedNodes.map((node) => [node.id, `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`]));
    const graph = {
      id,
      ...(selectedSource?.graphType ? { graphType: selectedSource.graphType } : {}),
      name: blank ? `Graph ${tabs.length + 1}` : sourceGraph ? `${sourceGraph.name || 'Template'} copy` : `Graph ${tabs.length + 1}`,
      variables: structuredClone(selectedSource?.variables || []),
      nodes: clonedNodes.map((node) => ({ ...node, id: nodeIds.get(node.id) })),
      connections: structuredClone(selectedSource?.connections || []).map((connection) => ({ ...connection, id: `connection_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, sourceNodeId: nodeIds.get(connection.sourceNodeId) || connection.sourceNodeId, targetNodeId: nodeIds.get(connection.targetNodeId) || connection.targetNodeId })),
      isDirty: false
    };
    setTabs((previous) => [...previous, graph]);
    setActiveTabId(id);
    return graph;
  }, [defaultGraphId, graphTemplates, savedGraphs, tabs.length]);

  const handleAddBlankGraph = useCallback(() => handleAddTab(null, { blank: true }), [handleAddTab]);

  const handleAddFunctionGraph = useCallback(() => {
    if (tabs.length >= MAX_OPEN_GRAPH_TABS) {
      arcEvents.emit('toast:notify', { title: 'Graph tab limit reached', message: 'Close a tab to open another graph.', type: 'warning' });
      return;
    }
    const graphId = `function_${Date.now()}`;
    const graph = {
      id: graphId,
      graphType: 'function',
      name: `Function ${functionGraphs.length + 1}`,
      variables: [],
      nodes: [
        { id: `${graphId}_input_a`, type: 'function_input', label: 'Function Input', x: 72, y: 92, data: { paramId: 'param_a', name: 'A', valueType: 'number', optional: false, defaultValue: 0 } },
        { id: `${graphId}_input_b`, type: 'function_input', label: 'Function Input', x: 72, y: 250, data: { paramId: 'param_b', name: 'B', valueType: 'number', optional: false, defaultValue: 0 } },
        { id: `${graphId}_add`, type: 'math_add', label: 'Add', x: 390, y: 145, data: {} },
        { id: `${graphId}_scale`, type: 'math_multiply', label: 'Multiply', x: 690, y: 145, data: {} },
        { id: `${graphId}_factor`, type: 'value_number', label: 'Number', x: 390, y: 330, data: { value: 2 } },
        { id: `${graphId}_return`, type: 'function_return', label: 'Return Value', x: 1000, y: 145, data: { valueType: 'number' } }
      ],
      connections: [
        { id: `${graphId}_wire_a`, sourceNodeId: `${graphId}_input_a`, sourcePinId: 'value', targetNodeId: `${graphId}_add`, targetPinId: 'a' },
        { id: `${graphId}_wire_b`, sourceNodeId: `${graphId}_input_b`, sourcePinId: 'value', targetNodeId: `${graphId}_add`, targetPinId: 'b' },
        { id: `${graphId}_wire_sum`, sourceNodeId: `${graphId}_add`, sourcePinId: 'result', targetNodeId: `${graphId}_scale`, targetPinId: 'a' },
        { id: `${graphId}_wire_factor`, sourceNodeId: `${graphId}_factor`, sourcePinId: 'value', targetNodeId: `${graphId}_scale`, targetPinId: 'b' },
        { id: `${graphId}_wire_result`, sourceNodeId: `${graphId}_scale`, sourcePinId: 'result', targetNodeId: `${graphId}_return`, targetPinId: 'value' }
      ],
      isDirty: false
    };
    setTabs((previous) => [...previous, graph]);
    setActiveTabId(graphId);
    setIsLibraryOpen(false);
  }, [functionGraphs.length, tabs.length]);

  const handleSaveGraphTemplate = useCallback(async (graph) => {
    if (!authToken || !graph) return;
    try {
      const { isDirty, ...snapshot } = graph;
      const res = await fetch(apiUrl('/api/graphs/templates'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ graph: snapshot }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save template.');
      setGraphTemplates(data.templates || []);
      arcEvents.emit('toast:notify', { title: 'Template saved', message: data.template.name, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Template save failed', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleDeleteGraphTemplate = useCallback(async (template) => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl(`/api/graphs/templates/${encodeURIComponent(template.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete template.');
      setGraphTemplates(data.templates || []);
      setDefaultGraphId(data.defaultGraphId || 'tab_slash_help');
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Template delete failed', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleSetDefaultGraph = useCallback(async (graph) => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl('/api/graphs/default'), { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ graphId: graph.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change the default graph.');
      setDefaultGraphId(data.defaultGraphId);
      arcEvents.emit('toast:notify', { title: 'Default updated', message: `${graph.name} will be used for new graphs.`, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Default update failed', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleCloseTab = useCallback((id) => {
    const closingGraph = tabs.find((tab) => tab.id === id);
    if (!closingGraph) return;
    if (!closingGraph.isDirty && savedGraphs.some((saved) => saved.id === closingGraph.id)) {
      closeTabImmediately(id);
      return;
    }
    setCloseGraphDialog({ id, name: closingGraph.name || 'Untitled graph' });
  }, [closeTabImmediately, savedGraphs, tabs]);

  const handleSaveAndCloseGraph = useCallback(async () => {
    if (!closeGraphDialog) return;
    const graph = tabs.find((tab) => tab.id === closeGraphDialog.id);
    if (!graph) { setCloseGraphDialog(null); return; }
    const isSaved = savedGraphs.some((saved) => saved.id === graph.id);
    setCloseGraphDialog(null);
    if (!isSaved) {
      setNameDialogError('');
      setNameDialog({ graphId: graph.id, value: graph.name || '', mode: 'save-close' });
      return;
    }
    if (await persistGraph(graph)) closeTabImmediately(graph.id);
  }, [closeGraphDialog, tabs, savedGraphs, persistGraph, closeTabImmediately]);

  const handleDiscardAndCloseGraph = useCallback(() => {
    if (!closeGraphDialog) return;
    closeTabImmediately(closeGraphDialog.id);
    setCloseGraphDialog(null);
  }, [closeGraphDialog, closeTabImmediately]);

  const handleOpenGraph = useCallback((graph) => {
    const existing = tabs.some((tab) => tab.id === graph.id);
    if (!existing && tabs.length >= MAX_OPEN_GRAPH_TABS) {
      arcEvents.emit('toast:notify', { title: 'Graph tab limit reached', message: 'Close a tab to open another graph. Saved graphs remain available in the Library.', type: 'warning' });
      return;
    }
    if (!existing) setTabs((previous) => [...previous, { ...graph, isDirty: false }]);
    setActiveTabId(graph.id);
    setIsLibraryOpen(false);
  }, [tabs]);

  const traceGraphNode = useCallback((graphId, nodeId) => {
    const graph = graphLookup.get(graphId);
    if (!graph || !nodeId) return;
    setEmbedStudio(null);
    setDiscordTextStudio(null);
    setPermissionStudio(null);
    handleOpenGraph(graph);
    setNodeFocusRequest({ graphId, nodeId, requestId: ++traceRequestIdRef.current });
    const expiresAt = Date.now() + 15000;
    errorPulseUntilRef.current.set(`${graphId}:${nodeId}`, expiresAt);
    setActivePulseGraphId(graphId);
    setActivePulseNodeIds([nodeId]);
    window.setTimeout(() => {
      if (errorPulseUntilRef.current.get(`${graphId}:${nodeId}`) === expiresAt) {
        errorPulseUntilRef.current.delete(`${graphId}:${nodeId}`);
        setActivePulseNodeIds((current) => current.filter((id) => id !== nodeId));
      }
    }, 15000);
  }, [graphLookup, handleOpenGraph]);

  const handleImportGraph = useCallback(async (file) => {
    if (!authToken || !file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const graph = parsed?.graph || parsed;
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) throw new Error('Choose an ARC Studio graph JSON file.');
      if (!graph.name) graph.name = file.name.replace(/\.arc\.json$|\.json$/i, '').replace(/[_-]+/g, ' ') || 'Imported graph';
      const body = JSON.stringify({ graph });
      const hasAttachments = (graph.nodes || []).some((node) => (node.data?.attachments || []).some((attachment) => typeof attachment.data === 'string' && attachment.data.startsWith('data:')));
      if (hasAttachments) setGraphUploadProgress({ graphId: graph.id || 'import', graphName: graph.name || 'Graph', percent: 0 });
      let data;
      try {
        const response = await xhrJson(apiUrl('/api/graphs/import'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
          body,
          onUploadProgress: hasAttachments ? (percent) => setGraphUploadProgress({ graphId: graph.id || 'import', graphName: graph.name || 'Graph', percent }) : undefined
        });
        data = response.data;
        if (!response.ok) throw new Error(data.error || 'Could not import this graph.');
      } finally {
        if (hasAttachments) setGraphUploadProgress((current) => current?.graphId === (graph.id || 'import') ? null : current);
      }
      setSavedGraphs((previous) => [data.graph, ...previous.filter((item) => item.id !== data.graph.id)]);
      handleOpenGraph(data.graph);
      arcEvents.emit('toast:notify', { title: 'Graph imported', message: `${data.graph.name} added to the Library.`, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Import failed', message: error.message || 'Could not read this graph file.', type: 'error' });
    }
  }, [authToken, handleOpenGraph]);

  const handleDeleteSavedGraph = useCallback(async (graph) => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete saved graph.');
      setSavedGraphs((previous) => previous.filter((item) => item.id !== graph.id));
      setDefaultGraphId(data.defaultGraphId || 'tab_slash_help');
      const remaining = tabs.filter((tab) => tab.id !== graph.id);
      setTabs(remaining);
      if (activeTabId === graph.id) setActiveTabId(remaining[0]?.id || null);
      arcEvents.emit('toast:notify', { title: 'Graph deleted', message: graph.name || 'Untitled graph', type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Delete failed', message: error.message, type: 'error' });
    }
  }, [activeTabId, authToken, tabs]);

  const handleExportBot = useCallback(async (projectId = activeProjectId, skipReview = false) => {
    if (!authToken || exportInFlightRef.current) return;
    const exportProjectId = typeof projectId === 'string' ? projectId : activeProjectId;
    if (!skipReview) {
      const exportGraphs = [...new Map([...savedGraphs, ...(exportProjectId === activeProjectId ? tabs : [])].map((graph) => [graph.id, graph])).values()];
      const issues = exportGraphs.flatMap((graph) => {
        const report = validateGraph(graph, graphLookup, botProfile?.intentSummary, projectVariables);
        return [
          ...report.errors.map((message) => ({ graphId: graph.id, nodeId: report.errorNodeIds?.[message], graphName: graph.name || 'Untitled graph', kind: 'error', message })),
          ...report.warnings.map((message) => ({ graphId: graph.id, nodeId: report.warningNodeIds?.[message], graphName: graph.name || 'Untitled graph', kind: 'warning', message }))
        ];
      });
      for (const graph of exportGraphs) for (const node of graph.nodes || []) {
        const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
        if (!definition || definition.pluginAdapter) issues.push({ graphId: graph.id, nodeId: node.id, graphName: graph.name || 'Untitled graph', kind: 'error', message: `${node.label || node.type}: this node type is not supported by the standalone bot runtime.` });
      }
      const gatewayIntents = [...new Set(['GUILDS', 'GUILD_EMOJIS_AND_STICKERS', ...exportGraphs.flatMap((graph) => (graph.nodes || []).flatMap((node) => BuiltInNodeDefinitions.find((definition) => definition.type === node.type)?.gatewayIntents || []))])].sort();
      const disabledIntents = gatewayIntents.filter((intent) => botProfile?.intentSummary?.some((item) => item.key === intent && item.portalEnabled === false));
      for (const intent of disabledIntents) issues.push({ kind: 'warning', message: `${intent.replaceAll('_', ' ')} is required by the exported graphs but is currently disabled in the Discord Developer Portal.` });
      const permissions = new Set();
      for (const graph of exportGraphs) for (const node of graph.nodes || []) {
        if (['action_send_message', 'action_edit_message'].includes(node.type)) {
          permissions.add('View Channels');
          permissions.add('Send Messages');
          if (node.data?.embed || node.data?.blocks?.length || graph.connections?.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed')) permissions.add('Embed Links');
          if (node.data?.files?.length || graph.connections?.some((wire) => ['files', 'file_data'].includes(wire.targetPinId) && wire.targetNodeId === node.id)) permissions.add('Attach Files');
        }
        if (['action_create_channel', 'action_edit_channel', 'action_delete_channel', 'action_voice_channel_status'].includes(node.type)) permissions.add('Manage Channels');
        if (['action_create_role', 'action_member_role'].includes(node.type)) permissions.add('Manage Roles');
        if (node.type === 'action_voice_state') permissions.add('Move Members');
      }
      const graphNames = exportGraphs.map((graph) => graph.name || 'Untitled graph');
      const summary = {
        graphNames,
        graphCount: exportGraphs.length,
        nodeCount: exportGraphs.reduce((count, graph) => count + (graph.nodes?.length || 0), 0),
        variableCount: exportGraphs.reduce((count, graph) => count + (graph.variables?.length || 0), 0) + projectVariables.length,
        requiredIntents: gatewayIntents,
        requiredPermissions: [...permissions].sort(),
        unsupportedNodeCount: exportGraphs.reduce((count, graph) => count + (graph.nodes || []).filter((node) => {
          const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
          return !definition || definition.pluginAdapter;
        }).length, 0),
        runtime: 'Node.js 22 or newer',
        configuration: [
          'Set DISCORD_BOT_TOKEN in the generated .env file before starting the bot, credentials are not included in the archive.',
          ...(exportGraphs.some((graph) => (graph.nodes || []).some((node) => String(node.type || '').startsWith('action_crypto_'))) ? ['Set a stable ARC_SESSION_SECRET in .env to keep encrypted values decryptable after restarts.'] : [])
        ],
        included: ['graphs.json and project-variables.json', 'src/index.js, src/env.js, and src/engine/{GraphRunner,NodeRegistry,MathOperations,CronSchedule,SafeHttpRequest,PluginStore}.js', 'src/security/CryptoEngine.js', 'Chezcord source and package metadata under chezcord/', 'package.json, README.md, .env.example, and LICENSE']
      };
      setExportReview({ projectId: exportProjectId, issues, summary });
      return;
    }
    exportInFlightRef.current = true;
    setExportInProgress(true);
    const toastId = 'bot-export-progress';
    const reportProgress = (percent, detail) => arcEvents.emit('toast:notify', {
      id: toastId,
      title: 'Exporting bot',
      message: detail,
      type: 'info',
      persistent: true,
      progress: Math.max(0, Math.min(100, Math.round(percent)))
    });
    try {
      reportProgress(2, 'Preparing graph data');
      const graphs = exportProjectId === activeProjectId
        ? tabs.map((graph) => exportGraphPayload(graph))
        : [];
      const body = JSON.stringify({ projectId: exportProjectId, graphs });
      const blob = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', apiUrl('/api/graphs/export/bot.zip'));
        request.setRequestHeader('Content-Type', 'application/json');
        request.setRequestHeader('x-arc-token', authToken);
        request.responseType = 'blob';
        request.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) reportProgress(8 + (event.loaded / event.total) * 22, 'Uploading graph data');
        });
        request.upload.addEventListener('load', () => reportProgress(35, 'Building the bot archive'));
        request.addEventListener('progress', (event) => {
          if (event.lengthComputable && event.total > 0) reportProgress(40 + (event.loaded / event.total) * 59, 'Downloading the archive');
          else reportProgress(40, 'Downloading the archive');
        });
        request.addEventListener('load', async () => {
          if (request.status >= 200 && request.status < 300) return resolve(request.response);
          let message = 'Could not export bot.';
          try {
            const data = JSON.parse(await request.response.text());
            message = data.error || message;
          } catch {}
          reject(new Error(message));
        });
        request.addEventListener('error', () => reject(new Error('The server could not be reached. Check the connection and try again.')));
        request.addEventListener('abort', () => reject(new Error('The export was cancelled.')));
        request.send(body);
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'arc-bot-export.zip';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      arcEvents.emit('toast:notify', { id: toastId, title: 'Bot exported', message: 'Standalone Discord bot bundle is ready.', type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { id: toastId, title: 'Export failed', message: error.message, type: 'error' });
    } finally {
      exportInFlightRef.current = false;
      setExportInProgress(false);
    }
  }, [activeProjectId, authToken, botProfile?.intentSummary, graphLookup, projectVariables, savedGraphs, tabs]);

  const applyHistorySnapshot = useCallback((snapshot, graphId) => {
    const restored = { ...snapshot, isDirty: true };
    setTabs((previous) => previous.map((tab) => tab.id === graphId ? restored : tab));
    if (graphId === activeTabId) {
      setActiveNodes(restored.nodes || []);
      setActiveConnections(restored.connections || []);
    }
  }, [activeTabId]);

  const handleUndo = useCallback(() => {
    const history = historyRef.current.get(activeTabId);
    const previous = history?.past.pop();
    if (!history || !previous || !activeGraph) return;
    history.future.push(snapshotGraph(activeGraph));
    history.lastAt = 0;
    applyHistorySnapshot(previous, activeTabId);
    setHistoryRevision((revision) => revision + 1);
  }, [activeGraph, activeTabId, applyHistorySnapshot]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current.get(activeTabId);
    const next = history?.future.pop();
    if (!history || !next || !activeGraph) return;
    history.past.push(snapshotGraph(activeGraph));
    history.lastAt = 0;
    applyHistorySnapshot(next, activeTabId);
    setHistoryRevision((revision) => revision + 1);
  }, [activeGraph, activeTabId, applyHistorySnapshot]);

  const handleValidateGraph = useCallback(() => {
    if (!activeGraph) return;
    const report = validateGraph(activeGraph, graphLookup, botProfile?.intentSummary, projectVariables);
      setValidationResult({ ...report, graphId: activeGraph.id, graphName: activeGraph?.name || 'Untitled graph' });
  }, [activeGraph, graphLookup, botProfile?.intentSummary, projectVariables]);

  const validationStatus = graphValidation.errors.length ? 'error' : graphValidation.warnings.length ? 'warning' : 'success';

  const makeNode = useCallback((type, position = null, data = null, label = null) => {
    const definition = BuiltInNodeDefinitions.find((item) => item.type === type);
    if (!definition) return null;
    const nodeData = data ? structuredClone(data) : createDefaultNodeData(type);
    if (type === 'function_input' && data) nodeData.paramId = `param_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    if (['variable_get', 'variable_set'].includes(type) && !availableVariables.some((variable) => variable.id === nodeData.variableId)) nodeData.variableId = '';
    return {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      label: label || definition.label,
      createdAt: new Date().toISOString(),
      x: position?.x ?? 300 + Math.random() * 24,
      y: position?.y ?? 150 + Math.random() * 24,
      data: nodeData
    };
  }, [availableVariables]);

  const appendNodeToGraph = useCallback((graph, node) => {
    if (!graph || !node) return;
    const additions = Array.isArray(node) ? node : [node];
    if (graph.id === activeTabId) {
      handleNodesChange([...activeNodes, ...additions]);
      return;
    }
    recordHistory(graph.id, { force: true, graph });
    const nextNodes = [...(graph.nodes || []), ...additions];
    setActiveNodes(nextNodes);
    setActiveConnections(graph.connections || []);
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
    setActiveTabId(graph.id);
  }, [activeNodes, activeTabId, handleNodesChange, recordHistory]);

  const handlePlaceNode = useCallback((type, position = null) => {
    const targetGraph = activeGraph || handleAddBlankGraph();
    if (!targetGraph) return;
    const center = position || paletteNodePosition || viewportCenterRef.current;
    const node = makeNode(type, nodeTopLeftAtCenter(type, center));
    appendNodeToGraph(targetGraph, node);
    setPaletteNodePosition(null);
  }, [activeGraph, appendNodeToGraph, handleAddBlankGraph, makeNode, paletteNodePosition]);

  const openPaletteAt = useCallback((position = null) => {
    const validPosition = Number.isFinite(position?.x) && Number.isFinite(position?.y) ? position : null;
    setPaletteNodePosition(validPosition || viewportCenterRef.current);
    setIsPaletteOpen(true);
  }, []);

  const handleDropNode = useCallback((payload, position) => {
    const targetGraph = activeGraph || handleAddBlankGraph();
    if (!targetGraph) return;
    const placement = position || nodeTopLeftAtCenter(
      payload?.type === 'graph-call' ? 'function_call' : payload?.type === 'prefab' ? nodePrefabs.find((item) => item.id === payload.prefabId)?.node?.type : payload?.type === 'embed-asset' ? 'build_embed' : payload?.nodeType,
      viewportCenterRef.current
    );
    let nodesToAdd = [];
    if (payload?.type === 'multi-node') {
      nodesToAdd = (payload.nodeTypes || []).map((type, index) => makeNode(type, { x: placement.x + (index % 3) * 220, y: placement.y + Math.floor(index / 3) * 150 })).filter(Boolean);
    } else if (payload?.type === 'variable-get') {
      const variables = Array.isArray(payload.variables) && payload.variables.length ? payload.variables : [payload.data || {}];
      nodesToAdd = variables.filter((item) => availableVariables.some((variable) => variable.id === item.variableId && (variable.scope || 'graph') === (item.scope || 'graph')))
        .map((item, index) => makeNode('variable_get', { x: placement.x + (index % 3) * 220, y: placement.y + Math.floor(index / 3) * 150 }, { variableId: item.variableId, scope: item.scope || 'graph' })).filter(Boolean);
      if (!nodesToAdd.length) return;
    }
    let node;
    if (payload?.type === 'graph-call') {
      const graph = graphLookup.get(payload.graphId);
      if (!graph || graph.id === targetGraph.id) return;
      node = makeNode('function_call', placement, { graphId: graph.id }, `Call ${graph.name || 'Graph'}`);
    } else if (payload?.type === 'prefab') {
      const prefab = nodePrefabs.find((item) => item.id === payload.prefabId);
      if (!prefab?.node) return;
      node = makeNode(prefab.node.type, placement, prefab.node.data, prefab.node.label || prefab.name);
    } else if (payload?.type === 'embed-asset') {
      node = makeNode('build_embed', placement, { blocks: structuredClone(payload.blocks || []), components: structuredClone(payload.components || []), attachments: structuredClone(payload.attachments || []), embedName: payload.name || 'Untitled embed' }, payload.name || 'Embed');
    } else {
      node = makeNode(payload?.nodeType, placement);
    }
    if (nodesToAdd.length) appendNodeToGraph(targetGraph, nodesToAdd);
    else if (node) appendNodeToGraph(targetGraph, node);
  }, [activeGraph, appendNodeToGraph, availableVariables, graphLookup, handleAddBlankGraph, makeNode, nodePrefabs]);

  const handleRequestSaveNodePrefab = useCallback((node) => {
    if (!node) return;
    setNodePrefabError('');
    setNodePrefabDialog({ node: structuredClone(node), name: node.label || BuiltInNodeDefinitions.find((definition) => definition.type === node.type)?.label || 'Node' });
  }, []);

  const handleSaveNodePrefab = useCallback((event) => {
    event?.preventDefault?.();
    const name = String(nodePrefabDialog?.name || '').trim();
    if (!name) { setNodePrefabError('Enter a name for this saved node.'); return; }
    const node = { ...nodePrefabDialog.node, id: undefined, x: undefined, y: undefined };
    const prefab = { id: `prefab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, node };
    const next = [prefab, ...nodePrefabs];
    setNodePrefabs(next);
    safeStorageSet('arc_node_prefabs', JSON.stringify(next));
    setNodePrefabDialog(null);
    arcEvents.emit('toast:notify', { title: 'Node saved', message: `${name} added to Saved nodes.`, type: 'success' });
  }, [nodePrefabDialog, nodePrefabs]);

  const handleDeleteNodePrefab = useCallback((prefab) => {
    const next = nodePrefabs.filter((item) => item.id !== prefab.id);
    setNodePrefabs(next);
    safeStorageSet('arc_node_prefabs', JSON.stringify(next));
  }, [nodePrefabs]);

  const openDiscordTextStudio = useCallback((node, fieldKey, label, value, maxLength, applyValue, parentStudioId = '', parentBlockContext = null) => {
    if (!activeGraph || !activeProjectId || (!applyValue && (!node?.id || !fieldKey))) return;
    const collabId = `text:${activeProjectId}:${activeGraph.id}:${parentStudioId || `${node?.id || 'inline'}:${fieldKey || label}`}`;
    const initialText = String(value ?? '');
    textCollaborationRef.current.set(collabId, { baseText: initialText, localText: initialText, caret: 0 });
    setDiscordTextStudio({
      projectId: activeProjectId,
      graphId: activeGraph.id,
      collabId,
      nodeId: node?.id || null,
      fieldKey,
      label,
      value: initialText,
      localDraft: initialText,
      maxLength,
      applyValue,
      parentBlockContext
    });
  }, [activeGraph, activeProjectId]);

  const openVariableTextEditor = useCallback((variable, scope) => {
    const targetGraphId = activeTabId;
    const structured = variable.type === 'array' || variable.type === 'object';
    const initialValue = structured ? JSON.stringify(variable.initialValue ?? (variable.type === 'array' ? [] : {}), null, 2) : String(variable.initialValue ?? '');
    const applyValue = (text) => {
      let initialValue = text;
      if (structured) {
        try {
          initialValue = JSON.parse(text);
          if (variable.type === 'array' ? !Array.isArray(initialValue) : !initialValue || typeof initialValue !== 'object' || Array.isArray(initialValue)) throw new Error('The JSON value has the wrong shape.');
          if (JSON.stringify(initialValue).length > 10000) throw new Error('Variable values are limited to 10,000 characters.');
        } catch (error) {
          arcEvents.emit('toast:notify', { title: 'Variable not updated', message: error.message === 'The JSON value has the wrong shape.' || error.message.startsWith('Variable values') ? error.message : 'Enter valid JSON before applying this value.', type: 'error' });
          return false;
        }
      } else initialValue = String(text).slice(0, 10000);
      if (scope === 'graph' && targetGraphId !== activeTabId) return false;
      const source = scope === 'project' ? projectVariables : (tabs.find((tab) => tab.id === targetGraphId)?.variables || []);
      const next = source.map((item) => item.id === variable.id ? { ...item, initialValue } : item);
      if (scope === 'project') handleProjectVariablesChange(next);
      else {
        const currentId = activeTabId;
        if (currentId !== targetGraphId) return false;
        handleVariablesChange(next);
      }
      return true;
    };
    openDiscordTextStudio(null, null, `${variable.name}${structured ? ' · JSON' : ''}`, initialValue, 12000, applyValue);
  }, [activeTabId, handleProjectVariablesChange, handleVariablesChange, openDiscordTextStudio, projectVariables, tabs]);

  const openPermissionStudio = useCallback((node) => {
    if (!node?.id || !activeGraph || !activeProjectId) return;
    const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
    setPermissionStudio({
      projectId: activeProjectId,
      graphId: activeGraph.id,
      nodeId: node.id,
      mode: node.type === 'data_permission_overwrites' ? 'overwrites' : 'role',
      nodeName: node.label || definition?.label || node.type,
      data: structuredClone(node.data || {}),
      connectedTargetIds: activeConnections.filter((wire) => wire.targetNodeId === node.id && /^target_id_\d+$/.test(wire.targetPinId)).map((wire) => wire.targetPinId),
      permissionsConnected: activeConnections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'permissions')
    });
  }, [activeGraph, activeConnections, activeProjectId]);

  const applyPermissionStudio = useCallback((data) => {
    if (!permissionStudio) return;
    const graph = tabs.find((tab) => tab.id === permissionStudio.graphId);
    if (!graph || permissionStudio.projectId !== activeProjectId) { setPermissionStudio(null); return; }
    const nextNodes = (graph.nodes || []).map((node) => node.id === permissionStudio.nodeId ? { ...node, data: { ...node.data, ...data } } : node);
    recordHistory(graph.id, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
    if (activeTabId === graph.id) setActiveNodes(nextNodes);
    setPermissionStudio(null);
  }, [activeProjectId, activeTabId, permissionStudio, recordHistory, tabs]);

  const updateEmbedStudioBlockValue = useCallback((blockId, fieldKey, value) => {
    setEmbedStudio((current) => {
      if (!current) return current;
      const blocks = (current.blocks || []).map((block) => block.id === blockId ? { ...block, [fieldKey]: value } : block);
      const next = { ...current, blocks, isDirty: true };
      sendCollaborationAction({ kind: 'studio-draft', studioId: current.collabId, studioType: 'embed', draft: collaborativeEmbedDraft(next) });
      return next;
    });
  }, [sendCollaborationAction]);

  const applyDiscordTextStudio = useCallback((value) => {
    if (!discordTextStudio) return false;
    const graph = tabs.find((tab) => tab.id === discordTextStudio.graphId);
    if (!graph || discordTextStudio.projectId !== activeProjectId) { setDiscordTextStudio(null); return false; }
    const nextValue = discordTextStudio.maxLength ? String(value).slice(0, discordTextStudio.maxLength) : String(value);
    if (discordTextStudio.parentBlockContext) {
      updateEmbedStudioBlockValue(discordTextStudio.parentBlockContext.blockId, discordTextStudio.parentBlockContext.blockKey, nextValue);
      setDiscordTextStudio(null);
      return true;
    }
    if (typeof discordTextStudio.applyValue === 'function') {
      if (discordTextStudio.applyValue(nextValue) === false) return false;
      setDiscordTextStudio(null);
      return true;
    }
    const nextNodes = (graph.nodes || []).map((node) => node.id === discordTextStudio.nodeId
      ? { ...node, data: { ...node.data, [discordTextStudio.fieldKey]: nextValue } }
      : node);
    recordHistory(graph.id, { graph });
    setTabs((previous) => previous.map((tab) => tab.id === graph.id ? { ...tab, nodes: nextNodes, isDirty: true } : tab));
    if (activeTabId === graph.id) setActiveNodes(nextNodes);
    setDiscordTextStudio(null);
    return true;
  }, [activeProjectId, activeTabId, discordTextStudio, recordHistory, tabs, updateEmbedStudioBlockValue]);

  const openEmbedStudioForNode = useCallback((node) => {
    const isMessageComponentsNode = ['action_send_message', 'action_reply_interaction', 'action_edit_message', 'action_edit_interaction_reply'].includes(node.type);

    const embedWire = activeConnections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed');
    const embedSourceNode = embedWire ? activeNodes.find((n) => n.id === embedWire.sourceNodeId) : null;
    const initialBlocks = embedSourceNode?.data?.blocks
      ? structuredClone(getEmbedBlocks(embedSourceNode.data))
      : node.data?.blocks
        ? structuredClone(getEmbedBlocks(node.data))
        : [];

    const componentsWire = activeConnections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'components');
    const compSourceNode = componentsWire ? activeNodes.find((n) => n.id === componentsWire.sourceNodeId) : null;
    const initialComponents = compSourceNode?.data?.components?.length
      ? structuredClone(compSourceNode.data.components)
      : Array.isArray(node.data?.components)
        ? structuredClone(node.data.components)
        : [];

    const contentWire = activeConnections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'content');
    const contentSourceNode = contentWire ? activeNodes.find((n) => n.id === contentWire.sourceNodeId) : null;
    let initialContent = String(node.data?.content || '');
    if (contentWire && contentSourceNode) {
      if (contentSourceNode.type === 'value_text') {
        initialContent = String(contentSourceNode.data?.value ?? '');
      } else if (contentSourceNode.type === 'format_text') {
        initialContent = String(contentSourceNode.data?.template ?? '');
      } else if (contentSourceNode.type === 'variable_get') {
        const v = availableVariables.find((item) => item.id === contentSourceNode.data?.variableId);
        if (v?.initialValue !== undefined) initialContent = String(v.initialValue);
      } else if (contentSourceNode.data?.value !== undefined) {
        initialContent = String(contentSourceNode.data.value);
      } else if (contentSourceNode.data?.template !== undefined) {
        initialContent = String(contentSourceNode.data.template);
      } else if (contentSourceNode.data?.content !== undefined) {
        initialContent = String(contentSourceNode.data.content);
      }
    }

    const studio = {
      graphId: activeTabId,
      projectId: activeProjectId,
      collabId: `embed:${activeProjectId}:${activeTabId}:node:${node.id}`,
      mode: isMessageComponentsNode ? 'components-node' : 'node',
      nodeId: node.id,
      connectedEmbedNodeId: embedSourceNode?.id || null,
      connectedComponentsNodeId: compSourceNode?.id || null,
      isEmbedWired: Boolean(embedWire),
      isComponentsWired: Boolean(componentsWire),
      isContentWired: Boolean(contentWire),
      id: null,
      name: node.data?.embedName || embedSourceNode?.data?.embedName || 'Untitled embed',
      content: initialContent,
      blocks: isMessageComponentsNode ? initialBlocks : structuredClone(getEmbedBlocks(node.data || {})),
      components: initialComponents,
      attachments: structuredClone(node.data?.attachments || embedSourceNode?.data?.attachments || []),
      isDirty: false
    };
    collaborativeEmbedBaseRef.current.set(studio.collabId, collaborativeEmbedDraft(studio));
    setEmbedStudio(studio);
  }, [activeConnections, activeNodes, activeProjectId, activeTabId, availableVariables]);

  const updateEmbedStudioDraft = useCallback((patch) => {
    setEmbedStudio((current) => {
      if (!current) return current;
      const next = { ...current, ...patch, isDirty: true };
      sendCollaborationAction({
        kind: 'studio-draft', studioId: current.collabId, studioType: 'embed',
        draft: collaborativeEmbedDraft(next)
      });
      return next;
    });
  }, [sendCollaborationAction]);

  const openEmbedAsset = useCallback((asset) => {
    const studio = { graphId: activeTabId, projectId: activeProjectId, collabId: `embed:${activeProjectId}:${activeTabId}:asset:${asset.id}`, mode: 'asset', id: asset.id, nodeId: null, name: asset.name || 'Untitled embed', blocks: structuredClone(asset.blocks || []), components: structuredClone(asset.components || []), attachments: structuredClone(asset.attachments || []), isDirty: false };
    collaborativeEmbedBaseRef.current.set(studio.collabId, collaborativeEmbedDraft(studio));
    setEmbedStudio(studio);
  }, [activeProjectId, activeTabId]);

  const createEmbedAsset = useCallback(() => {
    const studio = { graphId: activeTabId, projectId: activeProjectId, collabId: `embed:${activeProjectId}:${activeTabId}:new`, mode: 'new', id: null, nodeId: null, name: 'Untitled embed', blocks: [], components: [], attachments: [], isDirty: false };
    collaborativeEmbedBaseRef.current.set(studio.collabId, collaborativeEmbedDraft(studio));
    setEmbedStudio(studio);
  }, [activeProjectId, activeTabId]);

  const persistEmbedAsset = useCallback(async (studio) => {
    if (!authToken) throw new Error('Sign in before saving an embed to this workspace.');
    const name = String(studio?.name || '').trim() || 'Untitled embed';
    const id = studio?.id || `embed_asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const asset = { id, name, blocks: structuredClone(studio?.blocks || []), components: structuredClone(studio?.components || []), attachments: structuredClone(studio?.attachments || []), updatedAt: new Date().toISOString() };
    const response = await fetch(apiUrl('/api/embeds'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify(asset) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save this embed.');
    setEmbedAssets(data.embeds || [data.embed, ...embedAssets.filter((item) => item.id !== data.embed?.id)]);
    return data.embed;
  }, [authToken, embedAssets]);

  const handleSaveEmbedStudio = useCallback(async () => {
    if (!embedStudio) return;
    if (['node', 'components-node'].includes(embedStudio.mode)) {
      const nextNodes = activeNodes.map((node) => {
        if (node.id === embedStudio.nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...(embedStudio.attachments ? { attachments: structuredClone(embedStudio.attachments) } : {}),
              ...(embedStudio.mode === 'node' ? { blocks: structuredClone(embedStudio.blocks), embedName: embedStudio.name.trim() || 'Untitled embed' } : {}),
              ...(!embedStudio.isContentWired && ['action_send_message', 'action_reply_interaction', 'action_edit_message', 'action_edit_interaction_reply'].includes(node.type) ? { content: String(embedStudio.content || '') } : {}),
              components: structuredClone(embedStudio.components || [])
            }
          };
        }
        if (embedStudio.connectedEmbedNodeId && node.id === embedStudio.connectedEmbedNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              blocks: structuredClone(embedStudio.blocks),
              ...(embedStudio.attachments ? { attachments: structuredClone(embedStudio.attachments) } : {})
            }
          };
        }
        if (embedStudio.connectedComponentsNodeId && node.id === embedStudio.connectedComponentsNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              components: structuredClone(embedStudio.components || [])
            }
          };
        }
        return node;
      });
      handleNodesChange(nextNodes);
    } else {
      try { await persistEmbedAsset(embedStudio); }
      catch (error) { arcEvents.emit('toast:notify', { title: 'Embed not saved', message: error.message, type: 'error' }); return; }
    }
    setEmbedStudio(null);
  }, [activeNodes, embedStudio, handleNodesChange, persistEmbedAsset]);

  const handleSaveEmbedAsAsset = useCallback(async () => {
    if (!embedStudio) return;
    try {
      const asset = await persistEmbedAsset({ ...embedStudio, id: null });
      arcEvents.emit('toast:notify', { title: 'Embed saved', message: `${asset.name} added to Embeds.`, type: 'success' });
      if (embedStudio.mode === 'new') setEmbedStudio(null);
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Embed not saved', message: error.message, type: 'error' }); }
  }, [embedStudio, persistEmbedAsset]);

  const handleSaveEmbedShortcut = useCallback(async () => {
    const studio = embedStudioRef.current;
    if (!studio) return false;
    if (studio.mode === 'asset' && studio.id) {
      try {
        const asset = await persistEmbedAsset(studio);
        setEmbedStudio((current) => current?.collabId === studio.collabId ? { ...current, ...asset, mode: 'asset', isDirty: false } : current);
        arcEvents.emit('toast:notify', { title: 'Embed saved', message: `${asset.name} updated in the library.`, type: 'success' });
        return true;
      } catch (error) {
        arcEvents.emit('toast:notify', { title: 'Embed not saved', message: error.message, type: 'error' });
        return false;
      }
    }
    const proposedName = window.prompt('Name this embed for the library:', String(studio.name || 'Untitled embed'));
    if (proposedName === null) return false;
    const name = proposedName.trim();
    if (!name) {
      arcEvents.emit('toast:notify', { title: 'Embed not saved', message: 'Enter a name before saving this embed to the library.', type: 'warning' });
      return false;
    }
    if (!window.confirm(`Save “${name}” to the Embed Library?`)) return false;
    let asset;
    try { asset = await persistEmbedAsset({ ...studio, id: null, name }); }
    catch (error) {
      arcEvents.emit('toast:notify', { title: 'Embed not saved', message: error.message, type: 'error' });
      return false;
    }
    arcEvents.emit('toast:notify', { title: 'Embed saved', message: `${asset.name} added to the library.`, type: 'success' });
    if (['node', 'components-node'].includes(studio.mode)) {
      await handleSaveEmbedStudio();
      window.setTimeout(() => {
        const graph = tabsRef.current.find((tab) => tab.id === studio.graphId);
        if (graph?.isDirty) persistGraph(graph);
      }, 0);
    } else {
      setEmbedStudio((current) => current?.collabId === studio.collabId ? { ...current, ...asset, mode: 'asset', isDirty: false } : current);
    }
    return true;
  }, [handleSaveEmbedStudio, persistEmbedAsset, persistGraph]);
  saveEmbedShortcutRef.current = handleSaveEmbedShortcut;

  const handleSaveTextStudio = useCallback(() => {
    const studio = discordTextStudio;
    if (!studio) return false;
    const text = String(studio.sharedDraft ?? studio.localDraft ?? studio.value ?? '');
    if (applyDiscordTextStudio(text) === false) return false;
    if (studio.parentBlockContext) {
      window.setTimeout(() => { saveEmbedShortcutRef.current?.(); }, 0);
      return true;
    }
    window.setTimeout(() => {
      const graph = tabsRef.current.find((tab) => tab.id === studio.graphId);
      if (graph?.isDirty) persistGraph(graph);
    }, 0);
    return true;
  }, [applyDiscordTextStudio, discordTextStudio, handleSaveEmbedShortcut, persistGraph]);

  const handleDeleteEmbedAsset = useCallback(async (asset) => {
    if (!authToken) return;
    try {
      const response = await fetch(apiUrl(`/api/embeds/${encodeURIComponent(asset.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete this embed.');
      setEmbedAssets(data.embeds || []);
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Embed not deleted', message: error.message, type: 'error' }); }
  }, [authToken]);

  const handleStartBot = useCallback(async (confirmed = false) => {
    if (!authToken) return;
    if (!networkOnline) {
      arcEvents.emit('toast:notify', { title: 'Gateway unavailable', message: 'Reconnect to the internet before connecting to Discord. You can continue testing with Simulation.', type: 'warning' });
      return;
    }
    triggerLoadingBar();
    try {
      const runtimeGraphs = new Map(savedGraphs.map((graph) => [graph.id, graph]));
      for (const graph of tabs) runtimeGraphs.set(graph.id, graph);
      const failedGraphs = [...runtimeGraphs.values()].map((graph) => ({ graph, report: validateGraph(graph, runtimeGraphs, botProfile?.intentSummary, projectVariables) })).filter(({ report }) => report.errors.length);
      if (failedGraphs.length) {
        setValidationResult({
          graphName: 'Bot workspace',
          errors: failedGraphs.flatMap(({ graph, report }) => report.errors.map((issue) => `${graph.name || graph.id}: ${issue}`)),
          warnings: [],
          issueItems: failedGraphs.flatMap(({ graph, report }) => report.errors.map((message) => ({
            kind: 'error',
            message: `${graph.name || graph.id}: ${message}`,
            graphId: graph.id,
            nodeId: report.errorNodeIds?.[message]
          })))
        });
        arcEvents.emit('toast:notify', { title: 'Bot not started', message: 'Fix graph issues before connecting.', type: 'warning' });
        return;
      }
      let currentIntents = botProfile?.intentSummary || [];
      try {
        const intentResponse = await fetch(apiUrl('/api/bot/intents?refresh=1'), { headers: { 'x-arc-token': authToken } });
        const intentData = await intentResponse.json();
        if (intentResponse.ok && Array.isArray(intentData.intents)) {
          currentIntents = intentData.intents;
          setBotProfile((profile) => profile ? { ...profile, intentSummary: intentData.intents } : profile);
        }
      } catch {}
      const unavailablePrivileged = currentIntents.filter((intent) => intent.required && intent.privileged && intent.portalEnabled === false);
      if (unavailablePrivileged.length && confirmed !== true) {
        setGatewayIntentConfirm(unavailablePrivileged);
        return;
      }
      const newlySaved = [];
      for (const graph of tabs) {
        if (!graph.isDirty && savedGraphs.some((saved) => saved.id === graph.id)) continue;
        newlySaved.push(await saveGraphWithProgress(graph));
      }
      if (newlySaved.length) {
        const byId = new Map(newlySaved.map((graph) => [graph.id, graph]));
        setSavedGraphs((previous) => [...byId.values(), ...previous.filter((graph) => !byId.has(graph.id))]);
        setTabs((previous) => previous.map((graph) => {
          const saved = byId.get(graph.id);
          return saved && sameGraphContent(graph, saved) ? { ...saved, isDirty: false } : graph;
        }));
      }
      botStartPendingRef.current = true;
      arcEvents.emit('toast:notify', { title: 'Bot starting', message: `${runtimeGraphs.size} graph${runtimeGraphs.size === 1 ? '' : 's'} ready`, type: 'info' });
      const res = await fetch(apiUrl('/api/bot/start'), { method: 'POST', headers: { 'x-arc-token': authToken } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not connect the gateway.');
    } catch (error) {
      botStartPendingRef.current = false;
      arcEvents.emit('toast:notify', { title: 'Gateway error', message: error.message, type: 'error' });
    }
  }, [authToken, networkOnline, savedGraphs, saveGraphWithProgress, tabs, triggerLoadingBar, botProfile?.intentSummary]);

  const handleStopBot = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl('/api/bot/stop'), { method: 'POST', headers: { 'x-arc-token': authToken } });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not stop the gateway.');
      }
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Gateway error', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleIntentSummaryChange = useCallback((intents) => {
    if (!Array.isArray(intents)) return;
    setBotProfile((profile) => profile ? { ...profile, intentSummary: intents } : profile);
  }, []);

  const handleClearLogs = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl('/api/logs'), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      if (!res.ok) throw new Error('Could not clear console output.');
      setLogs([]);
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Console error', message: error.message, type: 'error' });
    }
  }, [authToken]);

  const handleLogout = () => {
    if (authToken) {
      fetch(apiUrl('/api/auth/logout'), { method: 'POST', headers: { 'x-arc-token': authToken } }).catch(() => {});
    }
    safeStorageRemove('arc_token');
    if (desktopMode && workspaceMode === 'local') {
      safeStorageRemove('arc_local_session_token');
      localSessionRef.current = null;
    }
    setAuthToken('');
    setCurrentUser(null);
    setTabs([]);
    setActiveTabId(null);
    setNeedsProjectOnboarding(false);
  };

  const handleAuthComplete = async (token, user, persistSession = true) => {
    if (desktopMode && !persistSession) safeStorageRemove('arc_token');
    else safeStorageSet('arc_token', token);
    if (desktopMode && workspaceMode === 'local') {
      if (persistSession) {
        safeStorageSet('arc_local_session_token', token);
        localSessionRef.current = { token, user };
      } else {
        safeStorageRemove('arc_local_session_token');
        localSessionRef.current = { token, user };
      }
    }
    let shouldCreateProject = false;
    try {
      const response = await fetch(apiUrl('/api/projects'), { headers: { 'x-arc-token': token } });
      const data = await response.json();
      if (response.ok) {
        const nextProjects = Array.isArray(data.projects) ? data.projects : [];
        setProjects(nextProjects);
        setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? 10 : data.maxProjects);
        setActiveProjectId(data.activeProjectId || '');
        shouldCreateProject = nextProjects.length === 0 || nextProjects.some((project) => project.id === data.activeProjectId && project.pendingStarterChoice);
      }
    } catch {}
    setNeedsProjectOnboarding(shouldCreateProject);
    setAuthToken(token);
    setCurrentUser(user);
    setNeedsSetup(false);
  };

  const handleCreateProject = async (event) => {
    event?.preventDefault?.();
    const name = newProjectName.trim();
    if (projectBusy) return;
    if (!name) {
      setProjectNameInvalid(true);
      setProjectNameShakeKey((key) => key + 1);
      setProjectError('');
      window.requestAnimationFrame(() => document.getElementById('new-project-name')?.focus());
      return;
    }
    setProjectNameInvalid(false);
    setProjectBusy(true);
    setProjectError('');
    try {
      const response = await fetch(apiUrl('/api/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create project.');
      setProjects(data.projects || []);
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      setNewProjectName('');
    } catch (error) { setProjectError(error.message); }
    finally { setProjectBusy(false); }
  };

  const handleCreateProjectFromTemplate = async () => {
    if (projectBusy || !newProjectName.trim()) return;
    setProjectBusy(true);
    setProjectError('');
    try {
      const response = await fetch(apiUrl('/api/projects'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ name: newProjectName.trim(), templateId: newProjectTemplate }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create the project.');
      setProjects(data.projects || []);
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      const project = data.project;
      setProjectTemplateDialog(false);
      setNewProjectName('');
      if (project?.id) await handleActivateProject(project.id, true);
    } catch (error) { setProjectError(error.message); }
    finally { setProjectBusy(false); }
  };

  const handleExportProject = async (project) => {
    if (!project || projectBusy) return;
    setProjectBusy(true);
    try {
      if (project.id === activeProjectId) await ensureWorkspaceGraphsSaved();
      let response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/export`), { headers: { 'x-arc-token': authToken } });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Could not export the project.'); }
      let bundle = await response.json();
      if (bundle.sensitiveData?.omittedFields > 0 && window.confirm(`This project contains ${bundle.sensitiveData.omittedFields} token, credential, or HTTP header field(s). These values are omitted by default. Include them in the exported file?\n\nChoose Cancel to export without them.`)) {
        response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/export?includeSecrets=1`), { headers: { 'x-arc-token': authToken } });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Could not export the project.'); }
        bundle = await response.json();
      }
      const filename = `${String(project.name || 'project').replace(/[\\/:*?"<>|]/g, '_')}.arcproject`;
      const contents = JSON.stringify(bundle, null, 2);
      if (desktopMode) {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') throw new Error('ARC Studio could not save the project file.');
        const receipt = await invoke('save_project_export', { filename, contents });
        const revealed = receipt?.revealed === true;
        arcEvents.emit('toast:notify', {
          title: 'Project exported',
          message: revealed ? `Saved ${filename} to Downloads and opened its location.` : `Saved ${filename} to Downloads.`,
          type: 'success'
        });
        if (typeof receipt?.path === 'string') console.info(`ARC Studio project export saved to ${receipt.path}`);
      } else {
        const blob = new Blob([contents], { type: 'application/vnd.arc-studio.project+json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        arcEvents.emit('toast:notify', { title: 'Project exported', message: `${filename} was downloaded.`, type: 'success' });
      }
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Project export failed', message: error.message || 'Could not export the project.', type: 'error' }); }
    finally { setProjectBusy(false); }
  };

  const handleImportProject = async () => {
    if (!projectImportFile || !projectImportTrusted || projectBusy) return;
    setProjectBusy(true);
    setProjectImportError('');
    try {
      const bundle = JSON.parse(await projectImportFile.text());
      const response = await fetch(apiUrl('/api/projects/import'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ bundle, trusted: true })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not import the project.');
      setProjects(data.projects || []);
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      const imported = data.project;
      projectImportPathRef.current = null;
      setProjectImportFile(null);
      setProjectImportTrusted(false);
      arcEvents.emit('toast:notify', { title: 'Project imported', message: imported?.name || 'Project added to your workspace', type: 'success' });
    } catch (error) { setProjectImportError(error.message); }
    finally { setProjectBusy(false); }
  };

  const cancelProjectImport = () => {
    const canceledPath = projectImportFile?.path;
    projectImportPathRef.current = null;
    if (canceledPath) {
      setOpenedProjectFiles((current) => current.filter((path) => path !== canceledPath));
      const queue = window.__ARC_STUDIO_OPEN_PROJECT_FILES__;
      if (Array.isArray(queue)) window.__ARC_STUDIO_OPEN_PROJECT_FILES__ = queue.filter((path) => path !== canceledPath);
    }
    setProjectImportFile(null);
    setProjectImportTrusted(false);
    setProjectImportError('');
  };

  const handleSetProjectLimit = async (value) => {
    if (localDesktopWorkspace) return;
    try {
      const response = await fetch(apiUrl('/api/projects/settings'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ maxProjects: value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the project limit.');
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects ?? null);
    } catch (error) { setProjectError(error.message); }
  };

  const handleSetIdleDisconnectMinutes = async (value) => {
    if (localDesktopWorkspace) return;
    try {
      const response = await fetch(apiUrl('/api/projects/idle-disconnect'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ idleDisconnectMinutes: Number(value) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the idle timeout.');
      setProjects((current) => current.map((project) => project.id === data.projectId ? { ...project, idleDisconnectMinutes: data.idleDisconnectMinutes } : project));
    } catch (error) { arcEvents.emit('toast:notify', { title: 'Idle timeout not changed', message: error.message, type: 'error' }); }
  };

  const handleActivateProject = async (projectId, allowWhileBusy = false) => {
    if (!projectId || projectId === activeProjectId || projectBusy && !allowWhileBusy) return;
    setProjectBusy(true);
    setProjectError('');
    try {
      await ensureWorkspaceGraphsSaved();
      const activationUrl = apiUrl(`/api/projects/${encodeURIComponent(projectId)}/activate`);
      const activationOptions = { method: 'POST', headers: { 'x-arc-token': authToken } };
      let response;
      try {
        response = await fetch(activationUrl, activationOptions);
      } catch (firstError) {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        try { response = await fetch(activationUrl, activationOptions); }
        catch { throw new Error('The workspace could not be reached while switching projects. Try again.'); }
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not open project.');
      setProjects(data.projects || []);
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      setNeedsProjectOnboarding(!(data.projects || []).length);
      setActiveProjectId(data.activeProjectId || projectId);
      setSavedGraphs(data.graphs || []);
      setGraphTemplates(data.graphLibrary?.templates || []);
      setGraphSnapshots(data.graphLibrary?.snapshots || []);
      setDefaultGraphId(data.graphLibrary?.defaultGraphId ?? '');
      setEmbedAssets(data.embeds || []);
      setBotProfile(data.botProfile || null);
      setBotStatus(data.botStatus || 'DISCONNECTED');
      setBotMetrics(data.botMetrics || { latencyMs: null, averageLatencyMs: null, jitterMs: null, rateLimitedUntil: 0, rateLimitScope: null });
      setLogs(data.logs || []);
      setTabs([]);
      setActiveTabId(null);
      setActiveNodes([]);
      setActiveConnections([]);
      setLogs([]);
      setIsProjectsOpen(false);
      graphsHydratedRef.current = true;
      const storedIds = safeStorageGet(`arc_project_${projectId}_arc_open_graph_ids`, null);
      let openIds = [];
      try { openIds = storedIds ? JSON.parse(storedIds) : []; } catch {}
      const graphs = data.graphs || [];
      const graphById = new Map(graphs.map((graph) => [graph.id, graph]));
      const opened = (Array.isArray(openIds) ? openIds.map((id) => graphById.get(id)).filter(Boolean) : []).slice(0, MAX_OPEN_GRAPH_TABS);
      setTabs(opened);
      const preferred = safeStorageGet(`arc_project_${projectId}_arc_active_graph_id`, '');
      setActiveTabId(opened.some((graph) => graph.id === preferred) ? preferred : opened[0]?.id || null);
      setWorkspaceRevision((revision) => revision + 1);
      historyRef.current.clear();
      return true;
    } catch (error) { setProjectError(error.message); return false; }
    finally { setProjectBusy(false); }
  };

  useEffect(() => {
    if (desktopMode || browserRouteHandledRef.current || !isReady || !authToken || projects.length === 0 || !graphsHydratedRef.current) return;
    const route = initialBrowserRouteRef.current;
    if (!route) return;
    if (route.projectId && !projects.some((project) => project.id === route.projectId)) {
      browserRouteHandledRef.current = true;
      arcEvents.emit('toast:notify', { title: 'Project unavailable', message: 'This project is not available in the current workspace.', type: 'warning' });
      return;
    }
    if (route.projectId && route.projectId !== activeProjectId) {
      if (browserProjectSwitchRef.current) return;
      browserProjectSwitchRef.current = true;
      void handleActivateProject(route.projectId, true).finally(() => { browserProjectSwitchRef.current = false; });
      return;
    }
    if (browserProjectSwitchRef.current) return;
    if (route.projectId && activeProjectId !== route.projectId) return;
    if (route.graphId) {
      const graph = savedGraphs.find((item) => item.id === route.graphId);
      if (!graph) {
        browserRouteHandledRef.current = true;
        arcEvents.emit('toast:notify', { title: 'Graph unavailable', message: 'This graph is not available in the selected project.', type: 'warning' });
        return;
      }
      handleOpenGraph(graph);
      if (route.nodeId) setNodeFocusRequest({ graphId: graph.id, nodeId: route.nodeId, requestId: `url-${Date.now()}` });
    }
    const panel = route.panel;
    setIsLibraryOpen(panel === 'library');
    setIsVariablesOpen(panel === 'variables');
    setIsPluginStoreOpen(panel === 'plugins');
    setIsBotSidebarOpen(panel === 'bot');
    setIsProjectsOpen(panel === 'projects');
    if (['graphs', 'nodes', 'data', 'assets'].includes(route.librarySection)) setLibrarySection(route.librarySection);
    browserRouteHandledRef.current = true;
  }, [activeProjectId, authToken, desktopMode, handleOpenGraph, isReady, projects, savedGraphs, socketReadyRevision]);

  useEffect(() => {
    if (desktopMode || !browserRouteHandledRef.current || !authToken || !activeProjectId) return;
    const graphId = activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : '';
    const segments = ['/projects', encodeURIComponent(activeProjectId)];
    if (graphId) segments.push('graphs', encodeURIComponent(graphId));
    const url = new URL(window.location.href);
    url.pathname = segments.join('/');
    url.search = '';
    const selectedNode = graphId ? selectedCanvasNodeId : '';
    if (selectedNode) url.searchParams.set('node', selectedNode);
    const panel = isLibraryOpen ? 'library' : isVariablesOpen ? 'variables' : isPluginStoreOpen ? 'plugins' : isBotSidebarOpen ? 'bot' : isProjectsOpen ? 'projects' : '';
    if (panel) url.searchParams.set('panel', panel);
    if (panel === 'library') url.searchParams.set('library', librarySection);
    if (url.pathname !== window.location.pathname || url.search !== window.location.search) window.history.replaceState(window.history.state, '', url);
  }, [activeProjectId, activeTabId, desktopMode, isBotSidebarOpen, isLibraryOpen, isPluginStoreOpen, isProjectsOpen, isVariablesOpen, librarySection, selectedCanvasNodeId, tabs, authToken]);

  useEffect(() => {
    const startupProjectId = window.__ARC_STUDIO_CONFIG__?.startupProjectId;
    if (!desktopMode || !startupProjectId || !isReady || !authToken || startupProjectHandledRef.current || !projects.length) return;
    if (!projects.some((project) => project.id === startupProjectId)) {
      startupProjectHandledRef.current = true;
      arcEvents.emit('toast:notify', { title: 'Could not open project', message: 'This project is no longer in the workspace.', type: 'error' });
      return;
    }
    startupProjectHandledRef.current = true;
    if (startupProjectId !== activeProjectId) void handleActivateProject(startupProjectId);
  }, [activeProjectId, authToken, desktopMode, isReady, projects]);

  const handleOpenProjectInNewWindow = async (project) => {
    if (!desktopMode || !localDesktopWorkspace || !project) return;
    try {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== 'function') throw new Error('Desktop window controls are unavailable.');
      await invoke('open_project_window', { projectId: project.id });
      arcEvents.emit('toast:notify', { title: 'Project window opened', message: project.name, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Could not open project window', message: error.message, type: 'error' });
    }
  };

  const openProjectMenu = (event, project, anchor = null) => {
    event.preventDefault?.();
    event.stopPropagation();
    const root = document.querySelector('.app-root');
    const bounds = root?.getBoundingClientRect();
    const scale = getArcUiScale();
    const rootWidth = root?.offsetWidth || window.innerWidth / scale;
    const rootHeight = root?.offsetHeight || window.innerHeight / scale;
    const clientX = anchor?.x ?? event.clientX;
    const clientY = anchor?.y ?? event.clientY;
    const x = (clientX - (bounds?.left || 0)) / scale;
    const y = (clientY - (bounds?.top || 0)) / scale;
    const menuWidth = 190;
    const menuHeight = project ? (desktopMode && localDesktopWorkspace ? 156 : 116) : 44;
    setProjectMenu({ project, kind: project ? 'project' : 'create', x: Math.max(8, Math.min(x, rootWidth - menuWidth - 8)), y: Math.max(8, Math.min(y, rootHeight - menuHeight - 8)) });
  };

  const handleDeleteProject = async () => {
    if (!projectDelete || projectBusy) return;
    setProjectBusy(true);
    setProjectDeleteError('');
    try {
      if (projectDelete.id === activeProjectId) await ensureWorkspaceGraphsSaved();
      const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectDelete.id)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ confirmName: projectDeleteName })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete the project.');
      setProjects((data.projects || []).filter((project) => project.id !== data.deletedProjectId));
      setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
      safeStorageRemove(`arc_project_${projectDelete.id}_arc_open_graph_ids`);
      safeStorageRemove(`arc_project_${projectDelete.id}_arc_active_graph_id`);
      if (projectDelete.id === activeProjectId) {
        setActiveProjectId(data.activeProjectId || '');
        setNeedsProjectOnboarding(!(data.projects || []).length);
        setSavedGraphs(data.graphs || []);
        setGraphTemplates(data.graphLibrary?.templates || []);
        setGraphSnapshots(data.graphLibrary?.snapshots || []);
        setDefaultGraphId(data.graphLibrary?.defaultGraphId ?? '');
        setEmbedAssets(data.embeds || []);
        setBotProfile(data.botProfile || null);
        setBotStatus('DISCONNECTED');
        setBotMetrics({ latencyMs: null, averageLatencyMs: null, jitterMs: null, rateLimitedUntil: 0, rateLimitScope: null });
        setTabs([]);
        setActiveTabId(null);
        setActiveNodes([]);
        setActiveConnections([]);
        setLogs([]);
        graphsHydratedRef.current = true;
        historyRef.current.clear();
        setWorkspaceRevision((revision) => revision + 1);
      }
      setProjectDelete(null);
      setProjectDeleteName('');
    } catch (error) { setProjectDeleteError(error.message); }
    finally { setProjectBusy(false); }
  };

  const attemptDeleteProject = () => {
    if (!projectDelete || projectBusy) return;
    if (projectDeleteName.trim() !== projectDelete.name) {
      setProjectDeletePromptError('Enter the exact project name to confirm.');
      setProjectDeleteFieldShake(false);
      if (projectDeleteFeedbackTimerRef.current) clearTimeout(projectDeleteFeedbackTimerRef.current);
      if (projectDeleteShakeTimerRef.current) clearTimeout(projectDeleteShakeTimerRef.current);
      projectDeleteInputRef.current?.focus();
      requestAnimationFrame(() => setProjectDeleteFieldShake(true));
      projectDeleteShakeTimerRef.current = setTimeout(() => setProjectDeleteFieldShake(false), 1000);
      projectDeleteFeedbackTimerRef.current = setTimeout(() => setProjectDeletePromptError(''), 1600);
      return;
    }
    setProjectDeletePromptError('');
    handleDeleteProject();
  };

  useEffect(() => {
    if (!projectMenu) return undefined;
    const dismiss = () => setProjectMenu(null);
    const keydown = (event) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', keydown);
    };
  }, [projectMenu]);

  const handleCreateFirstProject = async (name, templateId = 'blank') => {
    const response = await fetch(apiUrl('/api/projects/initialize'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
      body: JSON.stringify({ name, templateId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not create the project.');
    const projectId = data.project?.id;
    if (!projectId) throw new Error('The workspace did not return the new project.');
    setProjects(data.projects || []);
    setMaxProjects(localDesktopWorkspace ? null : data.maxProjects === undefined ? maxProjects : data.maxProjects);
    setActiveProjectId(data.activeProjectId || projectId);
    setSavedGraphs(data.graphs || []);
    setGraphTemplates(data.graphLibrary?.templates || []);
    setGraphSnapshots(data.graphLibrary?.snapshots || []);
    setDefaultGraphId(data.graphLibrary?.defaultGraphId ?? '');
    setEmbedAssets(data.embeds || []);
    setBotProfile(data.botProfile || null);
    const initialTabs = data.graphs || [];
    setTabs(initialTabs);
    setActiveTabId(initialTabs[0]?.id || null);
    setNeedsProjectOnboarding(false);
    graphsHydratedRef.current = true;
    historyRef.current.clear();
    setWorkspaceRevision((revision) => revision + 1);
  };

  const activateWorkspace = (mode, url = '') => {
    try {
      localStorage.setItem('arc_workspace_mode', mode);
      if (mode === 'remote') localStorage.setItem('arc_remote_workspace_url', url);
    } catch {}
    setWorkspaceMode(mode);
    setWorkspaceSwitchOpen(false);
    if (mode === 'remote') setRemoteWorkspaceUrl(url);
    if (mode === 'remote') {
      safeStorageRemove('arc_token');
      setAuthToken('');
    }
    setWorkspaceError('');
    setCurrentUser(null);
    setAuthToken(safeStorageGet('arc_token'));
    setNeedsSetup(false);
    setIsReady(false);
    setTabs([]);
    setSavedGraphs([]);
    setEmbedAssets([]);
    setActiveTabId(null);
    setActiveNodes([]);
    setActiveConnections([]);
    setGraphTemplates([]);
    setGraphSnapshots([]);
    graphsHydratedRef.current = false;
    historyRef.current.clear();
    setWorkspaceRevision((revision) => revision + 1);
  };

  const handleConnectWorkspace = async (value) => {
    if (!networkOnline) throw new Error('External workspaces are unavailable offline.');
    const url = normalizeWorkspaceUrl(value);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${url}/api/system/status`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Workspace responded with HTTP ${response.status}.`);
      let status;
      try { status = await response.json(); }
      catch { throw new Error('This server did not return a valid ARC Studio response.'); }
      if (typeof status.isSetupCompleted !== 'boolean') throw new Error('This server is not an ARC Studio workspace.');
      const name = (typeof status.workspaceName === 'string' && status.workspaceName.trim() ? status.workspaceName.trim() : new URL(url).host).slice(0, 35);
      setRemoteWorkspaceName(name);
      try { localStorage.setItem('arc_remote_workspace_name', name); } catch {}
      activateWorkspace('remote', url);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The workspace did not respond in time.');
      if (error instanceof TypeError) throw new Error('Could not reach this workspace. Check the URL, network, and server CORS settings.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
      controller.abort();
    }
  };

  const handleSelectWorkspace = (mode) => {
    if (mode === 'local' && workspaceMode !== 'local') activateWorkspace('local');
  };

  const handleRetryWorkspace = () => {
    setWorkspaceError('');
    setIsReady(false);
    setWorkspaceRevision((revision) => revision + 1);
  };

  const handleSwitchWorkspace = async () => {
    if (workspaceMode === 'local' && authToken && currentUser) {
      localSessionRef.current = { token: authToken, user: currentUser };
      try {
        if (localStorage.getItem('arc_local_keep_signed_in') !== 'false') safeStorageSet('arc_local_session_token', authToken);
        else safeStorageRemove('arc_local_session_token');
      } catch { safeStorageSet('arc_local_session_token', authToken); }
    } else if (workspaceMode === 'remote' && authToken) {
      try { await fetch(apiUrl('/api/auth/logout'), { method: 'POST', headers: { 'x-arc-token': authToken } }); } catch {}
      safeStorageRemove('arc_token');
      setAuthToken('');
      setCurrentUser(null);
    }
    setWorkspaceSwitchOpen(true);
  };

  const handleBackToLocalEditor = async () => {
    const session = localSessionRef.current;
    if (!session?.token) return;
    try { localStorage.setItem('arc_workspace_mode', 'local'); } catch {}
    setWorkspaceMode('local');
    setWorkspaceError('');
    try {
      const response = await fetch(apiUrl('/api/auth/me'), { headers: { 'x-arc-token': session.token } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) throw new Error('The saved Local Workspace session has expired. Sign in again.');
      localSessionRef.current = { token: session.token, user: data.user };
      safeStorageSet('arc_token', session.token);
      setAuthToken(session.token);
      setCurrentUser(data.user);
      setWorkspaceError('');
      setWorkspaceSwitchOpen(false);
      setIsReady(false);
      setWorkspaceRevision((revision) => revision + 1);
    } catch {
      localSessionRef.current = null;
      safeStorageRemove('arc_local_session_token');
      safeStorageRemove('arc_token');
      setAuthToken('');
      setCurrentUser(null);
      setWorkspaceError('');
      setWorkspaceSwitchOpen(false);
    }
  };

  const handleResetLocalData = async (password) => {
    if (!desktopMode || workspaceMode !== 'local') throw new Error('Reset is available for the desktop Local Workspace only.');
    if (currentUser?.isPrimaryAdmin !== true) throw new Error('Only the Local Workspace owner can delete its data.');
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') throw new Error('The desktop reset service is unavailable.');
    let serverPort = null;
    try {
      const configuredApiUrl = window.__ARC_STUDIO_CONFIG__?.apiBaseUrl || '';
      const serverUrl = new URL(configuredApiUrl || (import.meta.env.DEV ? window.location.origin : ''));
      if (serverUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(serverUrl.hostname)) {
        serverPort = Number(serverUrl.port) || 80;
      }
    } catch { /* Rust */ }
    const savedRemoteOrigins = Object.keys(localStorage).filter((key) => key.startsWith('arc_remember_password:') && localStorage.getItem(key) === 'true').map((key) => key.slice('arc_remember_password:'.length));
    await invoke('reset_local_data', { username: currentUser?.username || '', password, serverPort, savedRemoteOrigins });
    localStorage.clear();
    sessionStorage.clear();
  };

  const adjustUiScale = (step) => {
    setSettings((current) => {
      const currentScale = Number(current.uiScale) || 100;
      const nextScale = String(Math.min(140, Math.max(80, currentScale + step)));
      const next = { ...current, uiScale: nextScale };
      safeStorageSet('arc_editor_settings', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (!authToken || settings.autoSnapshots === false) return undefined;
    const intervalMinutes = Math.max(10, Math.min(1440, Number(settings.snapshotIntervalMinutes) || 30));
    const retentionHours = settings.snapshotRetentionHours === 0 || settings.snapshotRetentionHours === '0'
      ? 0
      : Math.max(12, Math.min(8760, Number(settings.snapshotRetentionHours) || 12));
    const timer = window.setInterval(async () => {
      if (autoSnapshotInFlightRef.current) return;
      const graphs = tabsRef.current.filter((graph) => graph?.id && Array.isArray(graph.nodes) && Array.isArray(graph.connections));
      if (!graphs.length) return;
      autoSnapshotInFlightRef.current = true;
      try {
        for (const graph of graphs) {
          const response = await fetch(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}/snapshots`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
            body: JSON.stringify({ graph, name: 'Automatic checkpoint', automatic: true, retentionHours })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not save an automatic graph snapshot.');
          if (Array.isArray(data.snapshots)) setGraphSnapshots(data.snapshots);
        }
      } catch (error) {
        arcEvents.emit('toast:notify', { title: 'Automatic snapshot failed', message: error.message, type: 'error' });
      } finally {
        autoSnapshotInFlightRef.current = false;
      }
    }, intervalMinutes * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [authToken, settings.autoSnapshots, settings.snapshotIntervalMinutes, settings.snapshotRetentionHours]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (event.key === 'F5') {
        event.preventDefault();
        event.stopPropagation();
        if (!(target instanceof HTMLElement && target.closest('[role="dialog"]'))) {
          if (botStatus !== 'CONNECTING' && !botStartPendingRef.current) {
            if (botStatus === 'ONLINE') handleStopBot();
            else handleStartBot();
          }
        }
        return;
      }
      if (target instanceof HTMLElement && target.closest('[role="dialog"]')) return;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (command && !event.altKey && key === 'tab' && tabs.length > 1) {
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
        const direction = event.shiftKey ? -1 : 1;
        setActiveTabId(tabs[(currentIndex + direction + tabs.length) % tabs.length].id);
        return;
      }
      const isTextEditingTarget = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (!desktopMode && command && !event.altKey && key === 'r') {
        event.preventDefault();
        event.stopPropagation();
        const hasUnsavedGraphs = tabs.some((graph) => graph.isDirty || !savedGraphs.some((saved) => saved.id === graph.id));
        const hasUnsavedEmbed = Boolean(embedStudio && (embedStudio.mode === 'new' || embedStudio.isDirty));
        if (hasUnsavedGraphs || hasUnsavedEmbed) setReloadConfirm(true);
        else window.location.reload();
        return;
      }
      if (command && !event.altKey && key === 't') {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) handleAddBlankGraph();
        else handleAddTab();
        return;
      }
      const renameShortcut = !isTextEditingTarget && !isLocked && selectedCanvasNodeCount === 1 && selectedCanvasNodeId
        && ((command && !event.shiftKey && !event.altKey && key === 'r') || event.key === 'F11');
      if (renameShortcut) {
        const selectedNode = activeNodes.find((node) => node.id === selectedCanvasNodeId);
        if (selectedNode) {
          event.preventDefault();
          event.stopPropagation();
          openNodeRename(selectedNode);
          return;
        }
      }
      if (command && !event.shiftKey && !event.altKey && key === 'w') {
        event.preventDefault();
        event.stopPropagation();
        if (activeTabId) handleCloseTab(activeTabId);
        return;
      }
      if (command && event.shiftKey && !event.altKey && key === 'r') {
        event.preventDefault();
        event.stopPropagation();
        const hasUnsavedGraphs = tabs.some((graph) => graph.isDirty || !savedGraphs.some((saved) => saved.id === graph.id));
        const hasUnsavedEmbed = Boolean(embedStudio && (embedStudio.mode === 'new' || embedStudio.isDirty));
        if (hasUnsavedGraphs || hasUnsavedEmbed) setReloadConfirm(true);
        else window.location.reload();
        return;
      }
      if (command && event.shiftKey && !event.altKey && key === 'j') {
        event.preventDefault();
        event.stopPropagation();
        setConsoleOpenRequest((request) => request + 1);
        return;
      }
      const shortcuts = { ...DEFAULT_SHORTCUTS, ...(desktopMode ? settings.shortcuts || {} : {}) };
      if (shortcutMatches(event, shortcuts.openSearch)) {
        event.preventDefault();
        setIsPaletteOpen(false);
        setIsCommandPaletteOpen(true);
        return;
      }
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || Boolean(target.closest('.arc-dropdown'))
      );
      if (command && !event.altKey && (key === '+' || key === '=' || key === 'add')) {
        event.preventDefault();
        adjustUiScale(10);
        return;
      }
      if (command && !event.altKey && (key === '-' || key === '_' || key === 'subtract')) {
        event.preventDefault();
        adjustUiScale(-10);
        return;
      }
      if (shortcutMatches(event, shortcuts.saveGraph) && discordTextStudioOpenForActiveGraph) {
        event.preventDefault();
        event.stopPropagation();
        handleSaveTextStudio();
        return;
      }
      if (shortcutMatches(event, shortcuts.saveGraph) && embedStudioOpenForActiveGraph) {
        event.preventDefault();
        event.stopPropagation();
        handleSaveEmbedShortcut();
        return;
      }
      if (shortcutMatches(event, shortcuts.saveGraph)) {
        event.preventDefault();
        handleSaveGraph();
        return;
      }
      if (isEditing) return;
      if (shortcutMatches(event, shortcuts.addNode)) {
        event.preventDefault();
        openPaletteAt();
      } else if (shortcutMatches(event, shortcuts.arrangeNodes)) {
        event.preventDefault();
        handleAutoLayout();
      } else if (shortcutMatches(event, shortcuts.toggleLibrary)) {
        event.preventDefault();
        const shouldOpen = !isLibraryOpen;
        setIsLibraryOpen(shouldOpen);
        if (shouldOpen) { setIsProjectsOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); }
      } else if (shortcutMatches(event, shortcuts.undo)) {
        event.preventDefault();
        handleUndo();
      } else if (shortcutMatches(event, shortcuts.redo)) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeNodes, activeTabId, botStatus, desktopMode, discordTextStudioOpenForActiveGraph, embedStudio, embedStudioOpenForActiveGraph, handleAddBlankGraph, handleAddTab, handleAutoLayout, handleCloseTab, handleSaveEmbedShortcut, handleSaveGraph, handleSaveTextStudio, handleRedo, handleStartBot, handleStopBot, handleUndo, isLibraryOpen, isLocked, openNodeRename, openPaletteAt, savedGraphs, selectedCanvasNodeCount, selectedCanvasNodeId, settings.shortcuts, tabs]);

  const handleToggleLock = () => {
    setIsLocked((locked) => {
      const next = !locked;
      safeStorageSet('arc_ui_locked', String(next));
      return next;
    });
  };

  const handleUpdateSettings = (next) => {
    if (desktopMode && (next.updateChannel === 'nightly' ? 'nightly' : 'stable') !== (settings.updateChannel === 'nightly' ? 'nightly' : 'stable')) {
      setPendingSettingsReload(next);
      const hasUnsavedGraphs = tabs.some((graph) => graph.isDirty || !savedGraphs.some((saved) => saved.id === graph.id));
      const hasUnsavedEmbed = Boolean(embedStudio && (embedStudio.mode === 'new' || embedStudio.isDirty));
      if (hasUnsavedGraphs || hasUnsavedEmbed) setReloadConfirm(true);
      else {
        setSettings(next);
        safeStorageSet('arc_editor_settings', JSON.stringify(next));
        window.location.reload();
      }
      return;
    }
    setSettings(next);
    safeStorageSet('arc_editor_settings', JSON.stringify(next));
  };

  const cancelPendingReload = () => {
    setReloadConfirm(false);
    setPendingSettingsReload(null);
  };

  const confirmPendingReload = () => {
    if (pendingSettingsReload) {
      setSettings(pendingSettingsReload);
      safeStorageSet('arc_editor_settings', JSON.stringify(pendingSettingsReload));
    }
    window.location.reload();
  };

  const handleOpenStudioUpdate = useCallback((url) => {
    if (!/^https:\/\/github\.com\/relentiousdragon\/arc-studio\/releases\//.test(String(url || ''))) return;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (desktopMode && typeof invoke === 'function') invoke('open_external_url', { url }).catch(() => {});
    else window.open(url, '_blank', 'noopener,noreferrer');
  }, [desktopMode]);

  const handleSidebarResize = (sidebarId, width) => {
    const next = { ...sidebarWidths, [sidebarId]: Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(width))) };
    setSidebarWidths(next);
    safeStorageSet('arc_sidebar_widths', JSON.stringify(next));
  };

  const handlePluginsChanged = async () => {
    const pluginsResponse = await fetch(apiUrl('/api/plugins/installed'), { headers: { 'x-arc-token': authToken } });
    const pluginsData = await pluginsResponse.json();
    const installed = Array.isArray(pluginsData.plugins) ? pluginsData.plugins : [];
    setInstalledPlugins(installed);
    registerPluginNodeDefinitions(installed);
    setPluginDefinitionsRevision((revision) => revision + 1);
    const response = await fetch(apiUrl('/api/graphs'), { headers: { 'x-arc-token': authToken } });
    const data = await response.json();
    if (response.ok) {
      const graphs = Array.isArray(data.graphs) ? data.graphs : [];
      const graphById = new Map(graphs.map((graph) => [graph.id, graph]));
      setSavedGraphs(graphs);
      setTabs((previous) => previous.map((tab) => {
        if (!tab.pluginId) return tab;
        const updated = graphById.get(tab.id);
        return updated ? { ...updated, isDirty: false } : tab;
      }));
    }
  };

  if (!isReady) {
    return <main className="boot-screen" data-theme={theme} data-release-channel={desktopMode && settings.updateChannel === 'nightly' ? 'nightly' : 'stable'}><div className="boot-mark"><img src="/arc.png" alt="ARC" /></div></main>;
  }

  if (workspaceSwitchOpen || needsSetup || needsProjectOnboarding || !authToken || !currentUser) {
    return (
      <div className={`app-root ${macOSDesktop ? 'is-macos' : ''}`} data-theme={theme} data-release-channel={desktopMode && settings.updateChannel === 'nightly' ? 'nightly' : 'stable'} data-ui-scale={uiScale} data-compact-context={settings.compactContextMenus ? 'true' : undefined} data-reduce-motion={settings.reduceMotion ? 'true' : undefined} onContextMenu={(event) => { if (desktopMode) event.preventDefault(); }} style={{ '--arc-ui-scale': Number(uiScale) / 100 }}>
        <SplashScreen
          studioVersion={studioVersion}
          needsSetup={needsSetup}
          localAccountUsername={desktopMode && workspaceMode === 'local' ? localAccountUsername : ''}
          needsProjectOnboarding={needsProjectOnboarding}
          theme={theme}
          workspaceMode={workspaceMode}
          remoteWorkspaceUrl={remoteWorkspaceUrl}
          workspaceName={desktopMode ? workspaceMode === 'remote' ? remoteWorkspaceName : 'Local Workspace' : remoteWorkspaceName}
          localSessionAvailable={desktopMode && (workspaceSwitchOpen || workspaceMode === 'remote') && Boolean(localSessionRef.current?.token)}
          onBackToEditor={handleBackToLocalEditor}
          networkOnline={networkOnline}
          workspaceError={workspaceError}
          onSelectWorkspace={handleSelectWorkspace}
          onConnectWorkspace={handleConnectWorkspace}
          onRetryWorkspace={handleRetryWorkspace}
          onCreateFirstProject={handleCreateFirstProject}
          onLocalSetupRequired={() => {
            setNeedsSetup(true);
            setAuthToken('');
            setCurrentUser(null);
            safeStorageRemove('arc_token');
          }}
          onToggleTheme={toggleTheme}
          canResetPrimaryAdminWithMasterKey={canResetPrimaryAdminWithMasterKey}
          onAuthComplete={async (...args) => { setWorkspaceSwitchOpen(false); return handleAuthComplete(...args); }} />
        <ToastContainer />
        <TooltipLayer />
        <SelectionContextMenu />
      </div>
    );
  }

  return (
    <div className={`app-root ${macOSDesktop ? 'is-macos' : ''}`} data-theme={theme} data-release-channel={desktopMode && settings.updateChannel === 'nightly' ? 'nightly' : 'stable'} data-ui-scale={uiScale} data-compact-context={settings.compactContextMenus ? 'true' : undefined} data-reduce-motion={settings.reduceMotion ? 'true' : undefined} onContextMenu={(event) => { if (desktopMode) event.preventDefault(); }} style={{ '--arc-ui-scale': Number(uiScale) / 100 }}>
      <TopBar
        tabs={tabs}
        graphTabStatuses={graphTabStatuses}
        saveFeedbackGraphId={saveFeedback?.graphId}
        hideGraphSave={embedStudioOpenForActiveGraph || discordTextStudioOpenForActiveGraph || permissionStudioOpenForActiveGraph}
        activeTabId={activeTabId}
        botStatus={botStatus}
        networkOnline={networkOnline}
        botProfile={botProfile}
        currentUser={currentUser}
        isLocked={isLocked || !canWriteGraphs}
        onToggleLock={canWriteGraphs ? handleToggleLock : undefined}
        onSelectTab={setActiveTabId}
        onAddTab={handleAddTab}
        onAddBlankGraph={handleAddBlankGraph}
        onAddFunctionGraph={handleAddFunctionGraph}
        onNewEmbed={createEmbedAsset}
        graphTemplates={graphTemplates}
        desktopMode={desktopMode}
        shortcutPlatform={shortcutPlatform}
        workspaceLabel={workspaceLabel}
        activeProjectId={activeProjectId}
        uploadProgress={graphUploadProgress}
        onUseTemplate={(template) => handleAddTab(template)}
        onCloseTab={handleCloseTab}
        onRenameGraph={handleRenameGraph}
        onDuplicateGraph={handleDuplicateGraph}
        onSaveGraph={handleSaveGraph}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyAvailability.canUndo}
        canRedo={historyAvailability.canRedo}
        onValidate={handleValidateGraph}
        validationStatus={validationStatus}
        validationErrors={graphValidation.errors.length}
        validationWarnings={graphValidation.warnings.length}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBotSettings={() => setIsBotSettingsOpen(true)}
        onOpenUsers={() => setIsUserMgmtOpen(true)}
        onLogout={handleLogout}
        onSwitchWorkspace={handleSwitchWorkspace}
        appUpdate={appUpdate}
        onOpenStudioUpdate={handleOpenStudioUpdate}
        onStartBot={handleStartBot}
        onStopBot={handleStopBot}
        onEnsureGraphsSaved={ensureWorkspaceGraphsSaved}
      />

      <div className="editor-workspace">
        <aside className="workspace-rail" aria-label="Workspace tools">
          <button className={`rail-button rail-button-primary ${isProjectsOpen ? 'is-selected' : ''}`} onClick={() => { setProjectError(''); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); setIsProjectsOpen((open) => !open); }} title={`${projects.find((project) => project.id === activeProjectId)?.name || 'Projects'} · switch project`} aria-label="Projects"><Plus size={18} /></button>
          <div className="rail-divider" />
          <button className={`rail-button ${isBotSidebarOpen ? 'is-selected' : ''}`} onClick={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsVariablesOpen(false); setIsBotSidebarOpen((open) => !open); }} title="App settings and profile" aria-label="App settings and profile"><Bot size={17} /></button>
          <button className={`rail-button ${isVariablesOpen ? 'is-selected' : ''}`} onClick={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen((open) => !open); }} title="Graph variables" aria-label="Graph variables"><Database size={17} /></button>
          <button className={`rail-button ${isLibraryOpen ? 'is-selected' : ''}`} onClick={() => { setIsProjectsOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); setIsLibraryOpen((open) => !open); }} title="Graph library (Shift + L)" aria-label="Graph library"><FolderTree size={17} /></button>
          <button className={`rail-button ${isPluginStoreOpen ? 'is-selected' : ''}`} onClick={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(false); setIsPluginStoreOpen((open) => !open); }} title="Plugin store" aria-label="Plugin store"><PackageOpen size={17} /></button>
          <button className="rail-button" onClick={() => setIsSettingsOpen(true)} title="Canvas settings" aria-label="Canvas settings"><SlidersHorizontal size={17} /></button>
          <button className="rail-button" onClick={handleAutoLayout} title="Arrange nodes" aria-label="Arrange nodes"><LayoutGrid size={17} /></button>
          <button className="rail-button" onClick={handleExportGraph} disabled={!activeGraph} title={activeGraph ? 'Export graph' : 'Open a graph to export it'} aria-label="Export graph"><Braces size={17} /></button>
          <div className="rail-spacer" />
          {!desktopMode && currentUser?.role === 'admin' && <button className="rail-button" onClick={() => setIsUserMgmtOpen(true)} title="Team access" aria-label="Team access"><Users size={17} /></button>}
          <button className="rail-button" onClick={() => setIsShortcutsOpen(true)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts"><CircleHelp size={17} /></button>
        </aside>

        <main
          className="canvas-workspace"
          style={{
            '--arc-active-sidebar-width': `${
              isLibraryOpen
                ? (sidebarWidths.library || DEFAULT_SIDEBAR_WIDTHS.library)
                : isProjectsOpen
                  ? (sidebarWidths.projects || DEFAULT_SIDEBAR_WIDTHS.projects)
                  : isVariablesOpen
                    ? (sidebarWidths.variables || DEFAULT_SIDEBAR_WIDTHS.variables)
                    : isBotSidebarOpen
                      ? (sidebarWidths.bot || DEFAULT_SIDEBAR_WIDTHS.bot)
                      : isPluginStoreOpen
                        ? (sidebarWidths.plugins || DEFAULT_SIDEBAR_WIDTHS.plugins)
                        : 0
            }px`
          }}
          aria-label="Graph editor"
        >
          {embedStudioOpenForActiveGraph && <EmbedStudioView
            key={`${embedStudio.graphId}:${embedStudio.nodeId || embedStudio.id || 'new'}`}
            name={embedStudio.name}
            content={embedStudio.content || ''}
            blocks={embedStudio.blocks}
            components={embedStudio.components || []}
            componentsOnly={embedStudio.mode === 'components-node'}
            isEmbedWired={Boolean(embedStudio.isEmbedWired)}
            isComponentsWired={Boolean(embedStudio.isComponentsWired)}
            isContentWired={Boolean(embedStudio.isContentWired)}
            appEmojis={appEmojis}
            graphVariables={availableVariables}
            botProfile={botProfile}
            botStatus={botStatus}
            theme={theme}
            collaborators={studioCollaborators}
            onNameChange={(name) => updateEmbedStudioDraft({ name })}
            onBlocksChange={(blocks) => updateEmbedStudioDraft({ blocks })}
            attachments={embedStudio.attachments || []}
            onAttachmentsChange={(attachments) => updateEmbedStudioDraft({ attachments })}
            onOpenTextStudio={(label, value, maxLength, applyValue, parentBlockContext) => openDiscordTextStudio(null, null, label, value, maxLength, applyValue, embedStudio.collabId, parentBlockContext)}
            onContentChange={(content) => updateEmbedStudioDraft({ content })}
            onComponentsChange={(components) => updateEmbedStudioDraft({ components })}
            onSave={handleSaveEmbedStudio}
            onSaveAs={handleSaveEmbedAsAsset}
            onClose={() => setEmbedStudio(null)}
            saveLabel={['node', 'components-node'].includes(embedStudio.mode) ? 'Apply to node' : 'Save embed'}
            showSave={embedStudio.mode !== 'new'}
          />}

          {discordTextStudioOpenForActiveGraph && <DiscordTextStudioView
            key={discordTextStudio.collabId}
            label={discordTextStudio.label}
            value={discordTextStudio.value}
            sharedDraft={discordTextStudio.sharedDraft}
            maxLength={discordTextStudio.maxLength}
            appEmojis={appEmojis}
            graphVariables={availableVariables}
            collaborators={studioCollaborators}
            remoteCursors={textStudioCursors}
            onDraftChange={(draft, caret) => {
              const collabId = discordTextStudio.collabId;
              const previous = textCollaborationRef.current.get(collabId) || { baseText: String(discordTextStudio.value || ''), localText: '', caret: 0 };
              textCollaborationRef.current.set(collabId, { ...previous, localText: String(draft), caret: Number(caret) || 0 });
              setDiscordTextStudio((current) => current?.collabId === collabId ? { ...current, localDraft: String(draft) } : current);
              sendCollaborationAction({ kind: 'studio-draft', studioId: collabId, studioType: 'text', draft: { text: draft, caret } });
            }}
            onCursorChange={(caret) => sendCollaborationAction({ kind: 'studio-cursor', studioId: discordTextStudio.collabId, caret })}
            onApply={applyDiscordTextStudio}
            onClose={() => setDiscordTextStudio(null)}
          />}

          {permissionStudioOpenForActiveGraph && <PermissionStudioView
            key={`${permissionStudio.graphId}:${permissionStudio.nodeId}`}
            mode={permissionStudio.mode}
            nodeName={permissionStudio.nodeName}
            data={permissionStudio.data}
            connectedTargetIds={permissionStudio.connectedTargetIds}
            permissionsConnected={permissionStudio.permissionsConnected}
            onApply={applyPermissionStudio}
            onClose={() => setPermissionStudio(null)}
          />}

          {!embedStudioOpenForActiveGraph && !discordTextStudioOpenForActiveGraph && !permissionStudioOpenForActiveGraph && <>
          <NodeCanvas
            graphId={activeTabId}
            projectId={activeProjectId}
            focusRequest={nodeFocusRequest}
            nodes={activeNodes}
            connections={activeConnections}
            authToken={authToken}
            graphName={activeGraph?.name || 'Untitled graph'}
            onSelectedNodeChange={handleCanvasNodeSelect}
            onSelectedNodeCountChange={setSelectedCanvasNodeCount}
            activePulseNodeIds={activePulseGraphId === activeTabId ? activePulseNodeIds : []}
            debugStep={activeDebugStep}
            onDebugAction={(action) => { if (action === 'continue') { setActiveDebugStep(null); setActivePulseNodeIds([]); } arcEvents.emit('simulation:debug-action-request', action); }}
            graphVariables={availableVariables}
            functionGraphs={functionGraphs}
            callableGraphs={callableGraphs}
            appEmojis={appEmojis}
            settings={settings}
            isLocked={isLocked || !canWriteGraphs}
            desktopMode={desktopMode}
            shortcutPlatform={shortcutPlatform}
            onNodesChange={handleNodesChange}
            tagGroups={activeGraph?.tagGroups || []}
            notes={activeGraph?.notes || []}
            currentUser={currentUser}
            onNotesChange={handleGraphNotesChange}
            onTagGroupsChange={handleTagGroupsChange}
            onRequestCreateTagGroup={(nodeIds, noteIds) => openTagGroupDialog(nodeIds, null, noteIds)}
            onRequestEditTagGroup={(group) => openTagGroupDialog(null, group)}
            onRenameNode={openNodeRename}
            onConnectionsChange={handleConnectionsChange}
            onOpenPalette={openPaletteAt}
            onViewportCenterChange={(position) => { viewportCenterRef.current = position; }}
            onOpenLibrary={() => { setIsProjectsOpen(false); setIsPluginStoreOpen(false); setIsLibraryOpen(true); }}
            onOpenVariables={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(true); }}
            onHistoryGroupStart={handleHistoryGroupStart}
            onHistoryGroupEnd={handleHistoryGroupEnd}
            onNodeDrop={handleDropNode}
            onSaveNodePrefab={handleRequestSaveNodePrefab}
            onOpenEmbedStudio={openEmbedStudioForNode}
            onOpenTextStudio={openDiscordTextStudio}
            onOpenPermissionStudio={openPermissionStudio}
            onOpenFunctionGraph={handleOpenGraph}
            remoteActions={remoteCollaborationActions}
            onCollaborationAction={sendCollaborationAction}
          />
          <div className={`canvas-context-label ${!activeGraph ? 'is-no-graph' : graphValidation.errors.length ? 'has-validation-errors' : graphValidation.warnings.length ? 'has-validation-warnings' : 'is-validation-ready'}`}>
            {activeGraph ? <><span className="context-dot" />
              {activeNodes.length} nodes <span className="context-separator">·</span> {activeConnections.length} connections
              <span className="context-separator">·</span> {graphValidation.errors.length ? `${graphValidation.errors.length} issues` : graphValidation.warnings.length ? 'Review' : 'Ready'}</>
              : 'Open a graph to run checks.'}
            {activeGraph && (!desktopMode || !localDesktopWorkspace) && collaborationSocketStatus !== 'connected' && <span className="collaboration-connection is-reconnecting" role="status" aria-live="polite"><span className="collaboration-connection-dot" />{collaborationSocketStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</span>}
            {activeGraph && collaborators.length > 0 && <span className="canvas-collaborators" title={collaborators.slice(0, 8).map((person) => person.username).concat(collaborators.length > 8 ? [`…and ${collaborators.length - 8} more`] : []).join('\n')}><span className="context-separator">·</span> {collaborators.slice(0, 2).map((person) => person.username).join(', ')}{collaborators.length > 2 ? ` …and ${collaborators.length - 2} more` : ''}</span>}
          </div>
          {isLocked && <div className="canvas-lock-state"><LockKeyhole size={13} /> Locked</div>}
          </>}

          {isLibraryOpen && <GraphLibraryPanel sidebarWidth={sidebarWidths.library} onSidebarResize={(width) => handleSidebarResize('library', width)} activeSection={librarySection} onActiveSectionChange={setLibrarySection} usageScope={activeProjectId} desktopMode={desktopMode} canImportGraph={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'))} onImportGraph={handleImportGraph} graphs={savedGraphs} templates={graphTemplates} snapshots={graphSnapshots} nodePrefabs={nodePrefabs} embedAssets={embedAssets} graphVariables={availableVariables} defaultGraphId={defaultGraphId} activeGraph={activeGraph} openGraphIds={tabs.map((tab) => tab.id)} activeTabId={activeTabId} onClose={() => setIsLibraryOpen(false)} onOpenGraph={handleOpenGraph} onUseTemplate={(template) => handleAddTab(template)} onCreateFunction={handleAddFunctionGraph} onDeleteGraph={handleDeleteSavedGraph} onDuplicateGraph={handleDuplicateGraph} onRenameGraph={handleRenameGraph} onSaveTemplate={handleSaveGraphTemplate} onDeleteTemplate={handleDeleteGraphTemplate} onSetDefault={handleSetDefaultGraph} onExportBot={handleExportBot} exportInProgress={exportInProgress} onAddNode={handlePlaceNode} onAddPrefab={(prefab) => handleDropNode({ type: 'prefab', prefabId: prefab.id })} onDeletePrefab={handleDeleteNodePrefab} onCreateEmbed={createEmbedAsset} onOpenEmbed={openEmbedAsset} onDeleteEmbed={handleDeleteEmbedAsset} onManageVariables={() => { setIsProjectsOpen(false); setIsLibraryOpen(false); setIsPluginStoreOpen(false); setIsBotSidebarOpen(false); setIsVariablesOpen(true); }} onCreateSnapshot={async (graph, name) => {
            await ensureWorkspaceGraphsSaved();
            const response = await fetch(apiUrl(`/api/graphs/${encodeURIComponent(graph.id)}/snapshots`), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken }, body: JSON.stringify({ graph, name }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not create graph snapshot.');
            setGraphSnapshots(data.snapshots || []);
            arcEvents.emit('toast:notify', { title: 'Snapshot saved', message: data.snapshot.name, type: 'success' });
          }} onDeleteSnapshot={async (snapshot) => {
            const response = await fetch(apiUrl(`/api/graphs/snapshots/${encodeURIComponent(snapshot.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not delete snapshot.');
            setGraphSnapshots(data.snapshots || []);
          }} onRestoreSnapshot={(snapshot) => {
            const restored = { ...structuredClone(snapshot.graph), id: activeGraph.id, name: activeGraph.name, isDirty: true };
            recordHistory(activeGraph.id);
            setActiveNodes(restored.nodes || []);
            setActiveConnections(restored.connections || []);
            setTabs((previous) => previous.map((tab) => tab.id === activeGraph.id ? restored : tab));
            arcEvents.emit('toast:notify', { title: 'Snapshot restored', message: `${snapshot.name} · save to keep these changes`, type: 'success' });
          }} />}
          {isProjectsOpen && <aside className="project-sidebar" aria-label="Projects" style={{ '--arc-sidebar-width': `${sidebarWidths.projects}px` }}>
            <SidebarResizeHandle width={sidebarWidths.projects} defaultWidth={DEFAULT_SIDEBAR_WIDTHS.projects} onResize={(width) => handleSidebarResize('projects', width)} />
            <header className="graph-library-header">
              <span><FolderTree size={14} />Projects <small>{projects.length}</small></span>
              <button className="icon-button compact" type="button" aria-label="Close projects" onClick={() => { if (!projectBusy) setIsProjectsOpen(false); }} disabled={projectBusy}><X size={14} /></button>
            </header>
            <p className="project-sidebar-description">Switch between bot projects or create a new one. {!localDesktopWorkspace && (maxProjects === null ? 'No project limit.' : `${projects.length} of ${maxProjects} projects.`)}</p>
            <div className="project-switcher-list">
              {projects.map((project) => <div key={project.id} className={`project-switcher-row ${project.id === activeProjectId ? 'is-active' : ''}`} onContextMenu={(event) => openProjectMenu(event, project)}>
                <button
                  type="button"
                  className="project-switcher-item"
                  title={(projectUsers[project.id] || []).map((user) => user.username).join(', ') || 'No users currently here'}
                  onClick={() => handleActivateProject(project.id)}
                  disabled={projectBusy || project.id === activeProjectId}
                  aria-current={project.id === activeProjectId ? 'page' : undefined}
                >
                  <span className="project-switcher-copy"><strong>{project.name}</strong><small>{(projectUsers[project.id] || []).length ? (projectUsers[project.id] || []).map((user) => user.username).join(', ') : 'No users currently here'}</small></span>
                  {project.id === activeProjectId && <span className="project-active-mark">Current</span>}
                </button>
                <button type="button" className="project-more-button" aria-label={`More actions for ${project.name}`} title="Project options" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  openProjectMenu(event, project, { x: rect.right, y: rect.bottom });
                }}><MoreHorizontal size={15} /></button>
              </div>)}
              {!projects.length && <p className="muted-copy">No projects yet.</p>}
            </div>
            <form className="project-create-form" onSubmit={handleCreateProject}>
              <TextInput key={projectNameShakeKey} id="new-project-name" label="New project" placeholder="e.g. Moderation bot" value={newProjectName} maxLength={64} error={projectNameInvalid ? 'Enter a project name.' : undefined} wrapperClassName={projectNameInvalid ? 'project-name-invalid-shake' : ''} onChange={(event) => { setNewProjectName(event.target.value); setProjectNameInvalid(false); setProjectError(''); }} />
              {projectError && <p className="field-error">{projectError}</p>}
              <Button type="submit" icon={Plus} onContextMenu={(event) => openProjectMenu(event, null)} disabled={projectBusy || maxProjects !== null && projects.length >= maxProjects} loading={projectBusy}>Create project</Button>
              <button className="project-import-button" type="button" disabled={projectBusy || maxProjects !== null && projects.length >= maxProjects} onClick={() => { document.getElementById('project-import-file')?.click(); }}><FileUp size={14} />Import project file</button>
              <input id="project-import-file" type="file" accept=".arcproject,.arcproject.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) { setProjectImportFile(file); setProjectImportTrusted(false); setProjectImportError(''); } event.target.value = ''; }} />
              {!localDesktopWorkspace && currentUser?.role === 'admin' && <label className="project-limit-control"><span>Project limit</span><div><input aria-label="Maximum projects" type="number" min="1" step="1" value={maxProjects ?? ''} placeholder="Unlimited" onChange={(event) => { const next = event.target.value; if (next === '') setMaxProjects(null); else if (/^\d+$/.test(next)) setMaxProjects(Number(next)); }} onBlur={(event) => handleSetProjectLimit(event.target.value === '' ? 'unlimited' : Number(event.target.value))} /><button type="button" onClick={() => handleSetProjectLimit('unlimited')}>Unlimited</button></div></label>}
            </form>
          </aside>}
          {projectMenu && <div className="project-context-menu" role="menu" style={{ left: projectMenu.x, top: projectMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
            {projectMenu.kind === 'create' ? <button type="button" role="menuitem" className="project-context-export" disabled={projectBusy || maxProjects !== null && projects.length >= maxProjects} onClick={() => { setProjectMenu(null); setNewProjectTemplate('ticket'); setNewProjectName('Ticket Bot'); setProjectNameManuallyEdited(false); setProjectError(''); setProjectTemplateDialog(true); }}><FileCode2 size={14} />Create from template</button> : <>
            <button type="button" role="menuitem" className="project-context-export" disabled={projectBusy} onClick={() => { const project = projectMenu.project; setProjectMenu(null); handleExportProject(project); }}><Download size={14} />Export project</button>
            <button type="button" role="menuitem" className="project-context-export" disabled={exportInProgress} onClick={() => {
              const projectId = projectMenu.project.id;
              setProjectMenu(null);
              handleExportBot(projectId);
            }}><Download size={14} />Export bot</button>
            {desktopMode && localDesktopWorkspace && <button type="button" role="menuitem" className="project-context-export" disabled={projectBusy} onClick={() => { const project = projectMenu.project; setProjectMenu(null); void handleOpenProjectInNewWindow(project); }}><AppWindow size={14} />Open in new window</button>}
            <button type="button" role="menuitem" className="project-context-delete" disabled={projects.length <= 1 || projectBusy} onClick={() => {
              setProjectDelete(projectMenu.project);
              setProjectDeletePromptError('');
              setProjectDeleteError('');
              setProjectDeleteFieldShake(false);
              setProjectDeleteName('');
              setProjectDeleteError('');
              setProjectMenu(null);
            }}><Trash2 size={14} />Delete project</button>
            </>}
          </div>}
          <BotSettingsModal presentation="sidebar" isOpen={isBotSidebarOpen} sidebarWidth={sidebarWidths.bot} onSidebarResize={(width) => handleSidebarResize('bot', width)} onClose={() => setIsBotSidebarOpen(false)} onViewCommands={() => setCommandBrowserRequest((request) => request + 1)} authToken={authToken} profile={botProfile} onProfileChange={setBotProfile} />
          <PluginStoreModal isOpen={isPluginStoreOpen} networkOnline={networkOnline} sidebarWidth={sidebarWidths.plugins} onSidebarResize={(width) => handleSidebarResize('plugins', width)} onClose={() => setIsPluginStoreOpen(false)} authToken={authToken} canInstall={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'))} canManageSource={currentUser?.permissions?.includes('*')} onInstalled={handlePluginsChanged} />
          <GraphVariablesModal presentation="sidebar" isOpen={isVariablesOpen} sidebarWidth={sidebarWidths.variables} onSidebarResize={(width) => handleSidebarResize('variables', width)} onClose={() => setIsVariablesOpen(false)} variables={graphVariables} projectVariables={projectVariables} canEdit={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'))} canEditGraph={Boolean(activeGraph && (currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write')))} canEditProject={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('graphs:write'))} onChange={handleVariablesChange} onProjectChange={handleProjectVariablesChange} onOpenTextEditor={openVariableTextEditor} isSaving={savingProjectVariables || savingGraphIds.includes(activeTabId)} />
        </main>
      </div>

      <ControlDock
        logs={logs}
        botStatus={botStatus}
        networkOnline={networkOnline}
        botMetrics={botMetrics}
        botProfile={botProfile}
        cachedAppEmojis={appEmojis}
        onEmojisChange={handleAppEmojisChange}
        activeTabId={activeTabId}
        graphs={[...graphLookup.values()]}
        emojiCacheScope={`${workspaceMode}:${activeProjectId}:${workspaceRevision}`}
        graphLookup={graphLookup}
        graphValidationReports={[...graphLookup.values()].map((graph) => ({ graph, report: validateGraph(graph, graphLookup, botProfile?.intentSummary, projectVariables) }))}
        graphNodes={activeNodes}
        authToken={authToken}
        isLocked={isLocked}
        canControlBot={Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('bot:control'))}
        consoleOpenRequest={consoleOpenRequest}
        gatewayStartedRequest={gatewayStartedRequest}
        commandBrowserRequest={commandBrowserRequest}
        onClearLogs={handleClearLogs}
        onStartBot={handleStartBot}
        onStopBot={handleStopBot}
        onIntentSummaryChange={handleIntentSummaryChange}
        onOpenGraph={handleOpenGraph}
        onTraceLog={traceGraphNode}
        onTraceIssue={traceGraphNode}
      />

      <NodePalette isOpen={isPaletteOpen} onClose={() => { setIsPaletteOpen(false); setPaletteNodePosition(null); }} onSelectNode={handlePlaceNode} pluginDefinitionsRevision={pluginDefinitionsRevision} />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        graphs={[...graphLookup.values()]}
        definitions={[...BuiltInNodeDefinitions]}
        plugins={installedPlugins}
        onClose={() => setIsCommandPaletteOpen(false)}
        onAddNode={handlePlaceNode}
        onOpenGraph={handleOpenGraph}
        onOpenPlugin={() => { setIsCommandPaletteOpen(false); setIsLibraryOpen(false); setIsProjectsOpen(false); setIsPluginStoreOpen(true); }}
        onGoToNode={traceGraphNode}
      />
      <EmojiPickerOverlay appEmojis={appEmojis} shortcut={(desktopMode ? settings.shortcuts?.emojiPicker : null) || DEFAULT_SHORTCUTS.emojiPicker} />
      <EditorSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={pendingSettingsReload || settings}
        onUpdateSettings={handleUpdateSettings}
        appUpdate={appUpdate}
        networkOnline={networkOnline}
        onAutoLayout={handleAutoLayout}
        onExportGraph={handleExportGraph}
        onResetLocalData={handleResetLocalData}
        desktopMode={desktopMode}
        localWorkspace={workspaceMode === 'local'}
        canResetLocalWorkspace={desktopMode && workspaceMode === 'local' && currentUser?.isPrimaryAdmin === true}
        platform={shortcutPlatform}
        themeChoice={hasThemeChoice ? theme : 'system'}
        onThemeChange={handleThemeChange}
        authToken={authToken}
        activeProjectId={activeProjectId}
        canManageLogRetention={currentUser?.permissions?.includes('*')}
        idleDisconnectMinutes={projects.find((project) => project.id === activeProjectId)?.idleDisconnectMinutes ?? 15}
        canManageIdleDisconnect={Boolean(currentUser?.permissions?.includes('*') || projects.find((project) => project.id === activeProjectId)?.ownerId === currentUser?.id)}
        onSetIdleDisconnectMinutes={handleSetIdleDisconnectMinutes}
      />
      <Modal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} title="Keyboard shortcuts" subtitle="ARC Studio editor" icon={CircleHelp}>
        <div className="keyboard-shortcut-list">
          {[
            ['Add node', formatShortcut((desktopMode ? settings.shortcuts?.addNode : null) || DEFAULT_SHORTCUTS.addNode, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Arrange nodes', formatShortcut((desktopMode ? settings.shortcuts?.arrangeNodes : null) || DEFAULT_SHORTCUTS.arrangeNodes, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Toggle Library', formatShortcut((desktopMode ? settings.shortcuts?.toggleLibrary : null) || DEFAULT_SHORTCUTS.toggleLibrary, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Open node search', formatShortcut((desktopMode ? settings.shortcuts?.openSearch : null) || DEFAULT_SHORTCUTS.openSearch, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Open emoji picker in a text field', formatShortcut((desktopMode ? settings.shortcuts?.emojiPicker : null) || DEFAULT_SHORTCUTS.emojiPicker, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Toggle server console', `${shortcutModifier} + Shift + J`],
            ['Connect / disconnect gateway', 'F5'],
            ['Reload ARC Studio', `${shortcutModifier} + Shift + R`],
            ...(desktopMode ? [['Close active graph tab', `${shortcutModifier} + W`]] : []),
            ['Save graph', formatShortcut((desktopMode ? settings.shortcuts?.saveGraph : null) || DEFAULT_SHORTCUTS.saveGraph, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Undo', formatShortcut((desktopMode ? settings.shortcuts?.undo : null) || DEFAULT_SHORTCUTS.undo, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Redo', formatShortcut((desktopMode ? settings.shortcuts?.redo : null) || DEFAULT_SHORTCUTS.redo, window.__ARC_STUDIO_CONFIG__?.platform || 'browser')],
            ['Copy / paste selected node', `${shortcutModifier} + C / V`],
            ['Increase / decrease UI scale', `${shortcutModifier} + + / −`],
            ['Pan canvas', 'Space + drag']
          ].map(([label, keys]) => <div className="keyboard-shortcut-row" key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}
        </div>
      </Modal>
      <BotSettingsModal isOpen={isBotSettingsOpen} onClose={() => setIsBotSettingsOpen(false)} authToken={authToken} profile={botProfile} onProfileChange={setBotProfile} />
      <Modal
        isOpen={Boolean(exportReview)}
        onClose={() => setExportReview(null)}
        title="Bot export preflight"
        subtitle={`${exportReview?.issues.length || 0} finding${exportReview?.issues.length === 1 ? '' : 's'} · review the package and runtime requirements before building.`}
        icon={PackageOpen}
        maxWidth="max-w-2xl"
        footer={<><Button variant="secondary" onClick={() => setExportReview(null)}>Cancel</Button><Button disabled={exportInProgress || exportReview?.issues.some((issue) => issue.kind === 'error')} onClick={() => { const review = exportReview; setExportReview(null); if (review) handleExportBot(review.projectId, true); }}>Build bot ZIP</Button></>}
      >
        {exportReview?.summary && <div className="export-preflight-summary">
          <div className="export-preflight-stats"><span><strong>{exportReview.summary.graphCount}</strong> graphs</span><span><strong>{exportReview.summary.nodeCount}</strong> nodes</span><span><strong>{exportReview.summary.variableCount}</strong> variables</span></div>
          <div className="export-preflight-section"><strong>Included in the archive</strong>{exportReview.summary.included.map((item) => <span key={item}>{item}</span>)}</div>
          {exportReview.summary.graphNames.length > 0 && <div className="export-preflight-section"><strong>Graphs</strong><span>{exportReview.summary.graphNames.join(' · ')}</span></div>}
          <div className="export-preflight-columns">
            <div className="export-preflight-section"><strong>Gateway intents</strong><span>{exportReview.summary.requiredIntents.length ? exportReview.summary.requiredIntents.join(', ') : 'Guilds (required)'}</span></div>
            <div className="export-preflight-section"><strong>Permissions used by nodes</strong><span>{exportReview.summary.requiredPermissions.length ? exportReview.summary.requiredPermissions.join(', ') : 'No additional permissions inferred'}</span><span>Inferred from node types; verify the bot role has these in each server.</span></div>
          </div>
          <div className="export-preflight-section"><strong>Runtime and configuration</strong><span>{exportReview.summary.runtime}</span>{exportReview.summary.configuration.map((item) => <span key={item}>{item}</span>)}</div>
          {exportReview.summary.unsupportedNodeCount > 0 && <div className="export-preflight-runtime-warning" role="alert">{exportReview.summary.unsupportedNodeCount} node type{exportReview.summary.unsupportedNodeCount === 1 ? ' is' : 's are'} not supported by the bundled runtime.</div>}
        </div>}
        <div className="validation-list">
          {exportReview?.issues.map((issue, index) => {
            const content = <><AlertCircle size={14} /><span>{issue.graphName && <strong>{issue.graphName}: </strong>}{issue.message}</span></>;
            return issue.nodeId
              ? <button key={`${issue.kind}-${issue.graphName}-${index}`} type="button" className={`validation-item is-${issue.kind} is-clickable`} title="Open graph and highlight node" onClick={() => { setExportReview(null); traceGraphNode(issue.graphId, issue.nodeId); }}>{content}</button>
              : <div key={`${issue.kind}-${issue.graphName}-${index}`} className={`validation-item is-${issue.kind}`}>{content}</div>;
          })}
        </div>
      </Modal>
      <GraphValidationModal isOpen={Boolean(validationResult)} onClose={() => setValidationResult(null)} graphName={validationResult?.graphName || activeGraph?.name} result={validationResult} onTraceIssue={traceGraphNode} />
      <Modal
        isOpen={gatewayIntentConfirm.length > 0}
        onClose={() => setGatewayIntentConfirm([])}
        title="Connect with limited gateway access?"
        subtitle="Discord currently reports these privileged intents as disabled."
        icon={AlertCircle}
        footer={<><Button variant="secondary" onClick={() => setGatewayIntentConfirm([])}>Cancel</Button><Button onClick={() => { setGatewayIntentConfirm([]); handleStartBot(true); }}>Connect anyway</Button></>}
      >
        <p className="close-graph-copy">ARC Studio can still connect the gateway, but graphs that need {gatewayIntentConfirm.map((intent) => intent.label).join(' and ')} may not receive the required events or data. Enable them in the Discord Developer Portal for full functionality.</p>
      </Modal>
      <Modal
        isOpen={Boolean(nameDialog)}
        onClose={() => { setNameDialog(null); setNameDialogError(''); }}
        title={nameDialog?.mode === 'save' || nameDialog?.mode === 'save-close' ? 'Save graph' : 'Rename graph'}
        subtitle={nameDialog?.mode === 'save' || nameDialog?.mode === 'save-close' ? 'Choose a name for this graph.' : 'Update the graph name.'}
        icon={FileCode2}
        footer={<><Button variant="secondary" onClick={() => setNameDialog(null)}>Cancel</Button><Button onClick={handleNameDialogSubmit}>{nameDialog?.mode === 'save' || nameDialog?.mode === 'save-close' ? 'Save graph' : 'Rename graph'}</Button></>}
      >
        <form onSubmit={handleNameDialogSubmit}>
          <TextInput label="Graph name" placeholder="Untitled graph" value={nameDialog?.value || ''} maxLength={80} autoFocus error={nameDialogError} onChange={(event) => { setNameDialog((current) => current ? { ...current, value: event.target.value } : current); setNameDialogError(''); }} />
        </form>
      </Modal>
      <Modal
        isOpen={Boolean(closeGraphDialog)}
        onClose={() => setCloseGraphDialog(null)}
        title="Save changes?"
        subtitle={`“${closeGraphDialog?.name || 'Untitled graph'}” has unsaved changes.`}
        icon={Save}
        footer={<><Button variant="secondary" onClick={() => setCloseGraphDialog(null)}>Cancel</Button><Button variant="danger" onClick={handleDiscardAndCloseGraph}>Discard</Button><Button icon={Save} onClick={handleSaveAndCloseGraph}>Save and close</Button></>}
      >
        <p className="close-graph-copy">Save this graph to your Library before closing?</p>
      </Modal>
      <Modal
        isOpen={recoveryDraftKey === recoveryStorageKey && recoveryDrafts.length > 0}
        onClose={() => {}}
        title="Recover unsaved graphs?"
        subtitle={`${recoveryDrafts.length} local recovery draft${recoveryDrafts.length === 1 ? '' : 's'} found from this workspace.`}
        icon={RotateCcw}
        footer={<><Button variant="secondary" onClick={() => { recoveryDraftsRef.current = []; setRecoveryDrafts([]); safeStorageRemove(recoveryStorageKey); setRecoveryCompareId(null); }}>Discard drafts</Button><Button icon={RotateCcw} disabled={!recoveryCompareId} onClick={() => {
          const selected = recoveryDrafts.find((entry) => entry.graph.id === recoveryCompareId);
          if (!selected) return;
          const recovered = [{ ...selected.graph, isDirty: true }];
          setTabs((current) => {
            const byId = new Map(recovered.map((graph) => [graph.id, graph]));
            for (const graph of current) if (!byId.has(graph.id)) byId.set(graph.id, graph);
            return [...byId.values()].slice(0, MAX_OPEN_GRAPH_TABS);
          });
          setActiveTabId(recovered[0]?.id || activeTabId);
          recoveryDraftsRef.current = [];
          setRecoveryDrafts([]);
          setRecoveryCompareId(null);
        }}>Recover selected draft</Button></>}
      >
        <div className="close-graph-copy">Choose a draft to compare it with the latest saved graph. Recovery opens it as an unsaved tab.</div>
        <ul className="recovery-graph-list">{recoveryDrafts.map((entry) => <li key={entry.graph.id} className={recoveryCompareId === entry.graph.id ? 'is-selected' : ''}><div><strong>{entry.graph.name || 'Untitled graph'}</strong><span>{new Date(entry.savedAt || 0).toLocaleString()}</span></div><Button variant="secondary" onClick={() => setRecoveryCompareId(entry.graph.id)}>{recoveryCompareId === entry.graph.id ? 'Comparing' : 'Compare'}</Button></li>)}</ul>
        {recoveryCompareId && (() => {
          const draft = recoveryDrafts.find((entry) => entry.graph.id === recoveryCompareId)?.graph;
          if (!draft) return null;
          const saved = savedGraphs.find((graph) => graph.id === draft.id);
          if (!saved) return <div className="recovery-diff"><strong>No saved version yet</strong><span>This draft will create a new saved graph when you save it.</span></div>;
          const savedNodes = new Map((saved.nodes || []).map((node) => [node.id, node]));
          const draftNodes = new Map((draft.nodes || []).map((node) => [node.id, node]));
          const added = [...draftNodes.values()].filter((node) => !savedNodes.has(node.id));
          const removed = [...savedNodes.values()].filter((node) => !draftNodes.has(node.id));
          const changed = [...draftNodes.values()].filter((node) => savedNodes.has(node.id) && JSON.stringify(node) !== JSON.stringify(savedNodes.get(node.id)));
          const changedNames = [...added.map((node) => `+ ${node.label || BuiltInNodeDefinitions.find((item) => item.type === node.type)?.label || node.type}`), ...changed.map((node) => `~ ${node.label || BuiltInNodeDefinitions.find((item) => item.type === node.type)?.label || node.type}`), ...removed.map((node) => `− ${node.label || BuiltInNodeDefinitions.find((item) => item.type === node.type)?.label || node.type}`)].slice(0, 12);
          const wireKey = (wire) => wire.id || `${wire.sourceNodeId}:${wire.sourcePinId}->${wire.targetNodeId}:${wire.targetPinId}`;
          const savedWires = new Map((saved.connections || []).map((wire) => [wireKey(wire), wire]));
          const draftWires = new Map((draft.connections || []).map((wire) => [wireKey(wire), wire]));
          const wiresAdded = [...draftWires].filter(([id, wire]) => !savedWires.has(id) || JSON.stringify(savedWires.get(id)) !== JSON.stringify(wire)).length;
          const wiresRemoved = [...savedWires].filter(([id, wire]) => !draftWires.has(id) || JSON.stringify(draftWires.get(id)) !== JSON.stringify(wire)).length;
          const savedVariables = new Map((saved.variables || []).map((variable) => [variable.id, variable]));
          const draftVariables = new Map((draft.variables || []).map((variable) => [variable.id, variable]));
          const variablesAdded = [...draftVariables].filter(([id]) => !savedVariables.has(id)).length;
          const variablesRemoved = [...savedVariables].filter(([id]) => !draftVariables.has(id)).length;
          const variablesChanged = [...draftVariables].filter(([id, variable]) => savedVariables.has(id) && JSON.stringify(savedVariables.get(id)) !== JSON.stringify(variable)).length;
          const hasChanges = changedNames.length || wiresAdded || wiresRemoved || variablesAdded || variablesRemoved || variablesChanged;
          return <div className="recovery-diff"><strong>Draft compared with latest saved graph</strong><span>{added.length} nodes added · {changed.length} changed · {removed.length} removed</span><span>{wiresAdded} wires added · {wiresRemoved} removed</span><span>{variablesAdded} variables added · {variablesChanged} changed · {variablesRemoved} removed</span>{changedNames.map((name, index) => <small key={`${index}-${name}`}>{name}</small>)}{!hasChanges && <small>Node, wire, and variable data match.</small>}</div>;
        })()}
      </Modal>
      <Modal
        isOpen={reloadConfirm}
        onClose={cancelPendingReload}
        title="Reload ARC Studio?"
        subtitle="Unsaved changes will be lost."
        icon={AlertCircle}
        footer={<><Button variant="secondary" onClick={cancelPendingReload}>Cancel</Button><Button variant="danger" onClick={confirmPendingReload}>Reload</Button></>}
      >
        <p className="close-graph-copy">You have unsaved graph or embed changes. Reloading now will discard them.</p>
      </Modal>
      <Modal isOpen={Boolean(nodePrefabDialog)} onClose={() => setNodePrefabDialog(null)} title="Save node prefab" subtitle="Add this configured node to Saved nodes." icon={FileCode2} footer={<><Button variant="secondary" onClick={() => setNodePrefabDialog(null)}>Cancel</Button><Button onClick={handleSaveNodePrefab}>Save node</Button></>}>
        <form onSubmit={handleSaveNodePrefab}><TextInput label="Node name" placeholder="My node" value={nodePrefabDialog?.name || ''} maxLength={80} autoFocus error={nodePrefabError} onChange={(event) => { setNodePrefabDialog((current) => current ? { ...current, name: event.target.value } : current); setNodePrefabError(''); }} /></form>
      </Modal>
      <Modal isOpen={Boolean(nodeRenameDialog)} onClose={() => setNodeRenameDialog(null)} title="Rename node" subtitle="This name is saved with this graph." icon={FileCode2} footer={<><Button variant="secondary" onClick={() => setNodeRenameDialog(null)}>Cancel</Button><Button onClick={saveNodeRename}>Rename</Button></>}>
        <form onSubmit={saveNodeRename}><TextInput label="Node name" placeholder={nodeRenameDialog?.fallback || 'Node'} value={nodeRenameValue} maxLength={64} autoFocus onChange={(event) => setNodeRenameValue(event.target.value)} /></form>
      </Modal>
      <Modal isOpen={Boolean(tagGroupDialog)} onClose={() => setTagGroupDialog(null)} title={tagGroupDialog?.id ? 'Edit canvas section' : 'Create canvas section'} subtitle="Group related nodes with a colored frame." icon={FolderTree} footer={<><Button variant="secondary" onClick={() => setTagGroupDialog(null)}>Cancel</Button><Button onClick={saveTagGroup}>{tagGroupDialog?.id ? 'Save section' : 'Create section'}</Button></>}>
        <form className="canvas-tag-group-form" onSubmit={saveTagGroup}>
          <TextInput label="Section name" placeholder="e.g. Ticket creation" value={tagGroupName} maxLength={48} autoFocus error={tagGroupError} onChange={(event) => { setTagGroupName(event.target.value); setTagGroupError(''); }} />
          <span className="field-label">Color</span>
          <div className="canvas-tag-group-colors">{TAG_GROUP_COLORS.map((color) => <button key={color.id} type="button" className={`canvas-tag-group-color${tagGroupColor === color.value ? ' is-selected' : ''}`} style={{ '--tag-group-color': color.value }} aria-label={`${color.label} section color`} aria-pressed={tagGroupColor === color.value} onClick={() => setTagGroupColor(color.value)} />)}</div>
          {(activeGraph?.notes || []).length > 0 && <><span className="field-label">Notes in section</span>{activeGraph.notes.length > 12 && <TextInput label="Search notes" placeholder="Filter by note text" value={tagGroupSearch} onChange={(event) => setTagGroupSearch(event.target.value)} />}<div className="canvas-tag-group-members">{activeGraph.notes.filter((note) => !tagGroupSearch.trim() || `${note.text || ''} ${note.createdBy || ''}`.toLowerCase().includes(tagGroupSearch.trim().toLowerCase())).map((note, index) => <label key={note.id}><input type="checkbox" checked={tagGroupNoteIds.includes(note.id)} onChange={(event) => setTagGroupNoteIds((current) => event.target.checked ? [...current, note.id] : current.filter((id) => id !== note.id))} /><span>{String(note.text || `Note ${index + 1}`).split('\n')[0].slice(0, 48)}</span><small>{note.createdBy || 'Unknown'}</small></label>)}</div></>}
        </form>
      </Modal>
      <Modal
        isOpen={Boolean(projectDelete)}
        onClose={() => { if (!projectBusy) { setProjectDelete(null); setProjectDeleteName(''); setProjectDeleteError(''); setProjectDeletePromptError(''); setProjectDeleteFieldShake(false); } }}
        onConfirm={attemptDeleteProject}
        title="Delete project?"
        subtitle="This permanently removes the project and its saved data."
        icon={Trash2}
        footer={<><Button variant="secondary" disabled={projectBusy} onClick={() => { setProjectDelete(null); setProjectDeleteName(''); setProjectDeleteError(''); setProjectDeletePromptError(''); }}>Cancel</Button><Button variant="danger" loading={projectBusy} disabled={projectBusy || projectDeleteName.trim() !== projectDelete?.name} onClick={handleDeleteProject}>Delete project</Button></>}
      >
        <p className="project-delete-copy">Type <strong>{projectDelete?.name}</strong> to confirm.</p>
        <TextInput inputRef={projectDeleteInputRef} label="Project name" placeholder={projectDelete?.name || ''} value={projectDeleteName} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus error={projectDeleteError} wrapperClassName={projectDeleteFieldShake ? 'field-shake project-delete-entry-flash' : ''} onChange={(event) => { setProjectDeleteName(event.target.value); setProjectDeleteError(''); setProjectDeletePromptError(''); }} />
        {projectDeletePromptError && <p className="field-error" role="alert">{projectDeletePromptError}</p>}
      </Modal>
      <Modal
        isOpen={Boolean(projectImportFile)}
        onClose={() => { if (!projectBusy) cancelProjectImport(); }}
        title="Import project file?"
        subtitle={projectImportFile?.name || ''}
        icon={ShieldCheck}
        footer={<><Button variant="secondary" disabled={projectBusy} onClick={cancelProjectImport}>Cancel</Button><Button icon={FileUp} loading={projectBusy} disabled={!projectImportTrusted || projectBusy} onClick={handleImportProject}>Trust and import</Button></>}
      >
        <div className="project-import-warning"><strong>Only import a project from someone you trust.</strong><p>Project files contain graphs, settings, and assets. Importing adds the project to this workspace and marks it trusted here.</p><label><input type="checkbox" checked={projectImportTrusted} onChange={(event) => setProjectImportTrusted(event.target.checked)} /><span>I trust the source of this project file.</span></label>{projectImportError && <p className="field-error" role="alert">{projectImportError}</p>}</div>
      </Modal>
      <Modal isOpen={projectTemplateDialog} onClose={() => { if (!projectBusy) { setProjectTemplateDialog(false); setProjectError(''); } }} title="Create from template" subtitle="Pick a starter project and give it a name." footer={<><Button variant="secondary" disabled={projectBusy} onClick={() => setProjectTemplateDialog(false)}>Cancel</Button><Button icon={Plus} loading={projectBusy} disabled={!newProjectName.trim() || projectBusy} onClick={handleCreateProjectFromTemplate}>Create project</Button></>}>
        <div className="project-template-dialog-form">
          <TextInput label="Project name" placeholder="e.g. Community bot" value={newProjectName} maxLength={64} autoFocus onChange={(event) => { setNewProjectName(event.target.value); setProjectNameManuallyEdited(true); setProjectNameInvalid(false); setProjectError(''); }} />
          <span className="field-label">Choose a starting point</span>
          <div className="splash-project-templates project-template-cards">
            {PROJECT_STARTERS.map(({ id, name, description, Icon }) => <button key={id} type="button" className={`splash-project-template ${newProjectTemplate === id ? 'is-selected' : ''}`} aria-pressed={newProjectTemplate === id} onClick={() => { setNewProjectTemplate(id); if (!projectNameManuallyEdited) setNewProjectName(name); }}><Icon size={16} /><span><strong>{name}</strong><small>{description}</small></span></button>)}
          </div>
          {projectError && <p className="field-error" role="alert">{projectError}</p>}
        </div>
      </Modal>
      {!desktopMode && <UserManagementModal isOpen={isUserMgmtOpen} onClose={() => setIsUserMgmtOpen(false)} authToken={authToken} currentUsername={currentUser?.username} currentUserId={currentUser?.id} />}
      <ToastContainer />
      <TooltipLayer />
      <SelectionContextMenu />
    </div>
  );
}

function snapshotGraph(graph) {
  const { isDirty, ...savedData } = graph;
  return JSON.parse(JSON.stringify(savedData));
}

function mergeGraphState(base, local, remote) {
  const merged = mergeCollaborativeValue(base, local, remote);
  return { ...merged, id: remote.id, isDirty: Boolean(local?.isDirty) };
}

function mergeCollaborativeValue(base, local, remote) {
  if (collaborationValuesEqual(local, base)) return cloneCollaborationValue(remote);
  if (collaborationValuesEqual(remote, base) || collaborationValuesEqual(local, remote)) return cloneCollaborationValue(local);
  if (isPlainCollaborationObject(base) && isPlainCollaborationObject(local) && isPlainCollaborationObject(remote)) {
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const value = mergeCollaborativeValue(base[key], local[key], remote[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if ([base, local, remote].every((value) => Array.isArray(value) && value.every((item) => item && typeof item === 'object' && item.id != null))) {
    const baseById = new Map(base.map((item) => [item.id, item]));
    const localById = new Map(local.map((item) => [item.id, item]));
    const remoteById = new Map(remote.map((item) => [item.id, item]));
    const order = [...remote.map((item) => item.id), ...local.map((item) => item.id)].filter((id, index, ids) => ids.indexOf(id) === index);
    const result = [];
    for (const id of order) {
      const value = mergeCollaborativeValue(baseById.get(id), localById.get(id), remoteById.get(id));
      if (value !== undefined) result.push(value);
    }
    return result;
  }
  return cloneCollaborationValue(remote);
}

function collaborationValuesEqual(left, right) {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

function cloneCollaborationValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainCollaborationObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sameGraphContent(left, right) {
  if (!left || !right) return false;
  const serialize = (graph) => JSON.stringify({
    name: graph.name,
    variables: graph.variables || [],
    nodes: graph.nodes || [],
    connections: graph.connections || [],
    tagGroups: graph.tagGroups || [],
    notes: graph.notes || []
  });
  return serialize(left) === serialize(right);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function semanticStringPin(pinId) {
  const id = String(pinId || '').toLowerCase();
  if (id === 'custom_id' || id === 'component_id') return { key: 'component-custom-id', label: 'a component Custom ID' };
  if (['channel_id', 'parent_id'].includes(id)) return { key: 'channel-id', label: 'a channel ID' };
  if (['guild_id', 'server_id'].includes(id)) return { key: 'guild-id', label: 'a server ID' };
  if (['user_id', 'author_id', 'member_id', 'reply_author_id'].includes(id)) return { key: 'user-id', label: 'a user ID' };
  if (id === 'role_id') return { key: 'role-id', label: 'a role ID' };
  if (id === 'message_id' || id === 'referenced_message_id') return { key: 'message-id', label: 'a message ID' };
  if (id === 'interaction_id') return { key: 'interaction-id', label: 'an interaction ID' };
  if (id === 'interaction_token') return { key: 'interaction-token', label: 'an interaction token' };
  if (id === 'application_id') return { key: 'application-id', label: 'an application ID' };
  return null;
}

function validateGraph(graph, graphLookup = null, intentSummary = null, projectVariables = []) {
  const errors = [];
  const warnings = [];
  if (!graph) return { errors, warnings };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph.connections) ? graph.connections : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const isFunction = graph.graphType === 'function' || nodes.some((node) => node.type === 'function_input' || node.type === 'function_return');
  const variableById = new Map([...(Array.isArray(graph.variables) ? graph.variables : []), ...projectVariables].map((variable) => [variable.id, variable]));
  const graphVariables = Array.isArray(graph.variables) ? graph.variables : [];
  for (const variable of graphVariables) {
    const name = String(variable?.name || '');
    if (!/^(?=.{1,64}$)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(name) && !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) errors.push(`Variable “${name || 'unnamed'}” must use 1–64 letters or numbers, with single hyphens between them.`);
  }
  const initialVariableValue = (variable) => variable?.initialValue ?? (variable?.valueType === 'number' || variable?.type === 'number' ? 0 : variable?.valueType === 'boolean' || variable?.type === 'boolean' ? false : variable?.type === 'array' ? [] : variable?.type === 'object' ? {} : '');
  const findInputWire = (nodeId, pinId) => connections.find((wire) => wire.targetNodeId === nodeId && wire.targetPinId === pinId);
  const hasUpstreamDefer = (targetNodeId) => {
    const pending = [targetNodeId];
    const visited = new Set();
    while (pending.length) {
      const currentId = pending.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      for (const wire of connections) {
        if (wire.targetNodeId !== currentId || wire.targetPinId !== 'exec' || wire.sourcePinId !== 'exec') continue;
        const source = nodeById.get(wire.sourceNodeId);
        if (['action_defer_reply', 'action_defer_update'].includes(source?.type)) return true;
        if (source) pending.push(source.id);
      }
    }
    return false;
  };
  const resolveKnownStringOutput = (nodeId, pinId, seen = new Set()) => {
    const source = nodeById.get(nodeId);
    const key = `${nodeId}:${pinId}`;
    if (!source || seen.has(key)) return undefined;
    const nextSeen = new Set(seen).add(key);
    if (source.type === 'variable_get' && pinId === 'value') return initialVariableValue(variableById.get(source.data?.variableId));
    if (source.type === 'function_input' && pinId === 'value') return source.data?.defaultValue ?? '';
    if (['value_text', 'value_number', 'value_boolean'].includes(source.type) && pinId === 'value') {
      const fallback = source.data?.value ?? (source.type === 'value_text' ? 'Hello World' : source.type === 'value_boolean');
      const wire = findInputWire(source.id, 'value');
      return wire ? resolveKnownStringOutput(wire.sourceNodeId, wire.sourcePinId, nextSeen) : fallback;
    }
    if (source.type === 'format_text' && pinId === 'text') {
      return renderTextTemplate(source.data?.template, (name) => {
        const slotWire = findInputWire(source.id, `slot_${name}`);
        const linked = slotWire ? resolveKnownStringOutput(slotWire.sourceNodeId, slotWire.sourcePinId, nextSeen) : undefined;
        if (linked !== undefined) return linked;
        const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase()) || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
        return variable ? initialVariableValue(variable) : undefined;
      }, []);
    }
    return undefined;
  };
  const resolveKnownStringInput = (target, pinId, fallback = '') => {
    const wire = findInputWire(target.id, pinId);
    if (!wire) return String(fallback ?? '');
    const value = resolveKnownStringOutput(wire.sourceNodeId, wire.sourcePinId);
    return value === undefined ? undefined : String(value ?? '');
  };
  const definitions = new Map(BuiltInNodeDefinitions.map((definition) => [definition.type, definition]));
  const execEdges = connections.filter((wire) => {
    const source = nodeById.get(wire.sourceNodeId);
    const target = nodeById.get(wire.targetNodeId);
    return source && target
      && graphPin(source, 'outputs', wire.sourcePinId, variableById, graphLookup, connections)?.type === 'exec'
      && graphPin(target, 'inputs', wire.targetPinId, variableById, graphLookup, connections)?.type === 'exec';
  });
  const execTargets = new Map();
  for (const wire of execEdges) {
    if (!execTargets.has(wire.sourceNodeId)) execTargets.set(wire.sourceNodeId, []);
    execTargets.get(wire.sourceNodeId).push(wire.targetNodeId);
  }
  const walkExec = (startIds, visit = () => {}) => {
    const pending = [...startIds];
    const visited = new Set();
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      visit(id);
      pending.push(...(execTargets.get(id) || []));
    }
    return visited;
  };
  if (!isFunction) {
    const eventNodes = nodes.filter((node) => String(node.type).startsWith('event_'));
    const reachableFromEvents = walkExec(eventNodes.map((node) => node.id));
    for (const node of nodes) {
      const definition = definitions.get(node.type);
      if (definition?.inputs?.some((pin) => pin.type === 'exec') && !String(node.type).startsWith('event_') && !reachableFromEvents.has(node.id)) {
        warnings.push(`${node.label || definition.label || node.type}: unreachable from every event node.`);
      }
    }

    for (const node of nodes.filter((item) => item.type === 'repeat_while')) {
      const conditionConnected = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'condition');
      if (!conditionConnected && node.data?.condition !== false) warnings.push(`${node.label || 'Repeat While'}: the condition is always true, so this loop has no clear exit.`);
    }

    let sccIndex = 0;
    const sccStack = [];
    const sccIndices = new Map();
    const sccLowLinks = new Map();
    const sccOnStack = new Set();
    const inspectExecScc = (id) => {
      sccIndices.set(id, sccIndex);
      sccLowLinks.set(id, sccIndex++);
      sccStack.push(id);
      sccOnStack.add(id);
      for (const next of execTargets.get(id) || []) {
        if (!sccIndices.has(next)) {
          inspectExecScc(next);
          sccLowLinks.set(id, Math.min(sccLowLinks.get(id), sccLowLinks.get(next)));
        } else if (sccOnStack.has(next)) sccLowLinks.set(id, Math.min(sccLowLinks.get(id), sccIndices.get(next)));
      }
      if (sccLowLinks.get(id) !== sccIndices.get(id)) return;
      const component = new Set();
      let member;
      do {
        member = sccStack.pop();
        sccOnStack.delete(member);
        component.add(member);
      } while (member !== id);
      const cyclic = component.size > 1 || (execTargets.get(id) || []).includes(id);
      if (!cyclic) return;
      const hasExit = [...component].some((nodeId) => {
        const node = nodeById.get(nodeId);
        if (['repeat_while', 'loop_count'].includes(node?.type)) return true;
        const outputIds = node?.type === 'branch_if' ? ['true_exec', 'false_exec']
          : node?.type === 'wait_until_condition' ? ['ready_exec', 'timeout_exec'] : [];
        if (!outputIds.length) return false;
        const wires = connections.filter((wire) => wire.sourceNodeId === nodeId && outputIds.includes(wire.sourcePinId));
        return wires.some((wire) => component.has(wire.targetNodeId))
          && (wires.some((wire) => !component.has(wire.targetNodeId)) || wires.length < outputIds.length);
      });
      if (!hasExit) {
        const node = nodeById.get(id);
        warnings.push(`${node?.label || definitions.get(node?.type)?.label || 'Execution graph'}: this execution cycle has no clear exit branch; the runtime safety limit will stop it.`);
      }
    };
    for (const node of nodes) if (!sccIndices.has(node.id)) inspectExecScc(node.id);

    const ackTypes = new Set(['action_defer_reply', 'action_defer_update', 'action_reply_interaction']);
    const ackNodes = nodes.filter((node) => ackTypes.has(node.type));
    for (const source of ackNodes) {
      const reachable = walkExec(execTargets.get(source.id) || []);
      for (const target of ackNodes) {
        if (source.id === target.id || !reachable.has(target.id)) continue;
        if (['action_defer_reply', 'action_defer_update'].includes(source.type) && target.type === 'action_reply_interaction') continue;
        warnings.push(`${target.label || definitions.get(target.type)?.label || 'Interaction action'}: may acknowledge the same interaction more than once along one execution path.`);
      }
    }

    const reachableJoins = (startNodeId) => [...walkExec([startNodeId])].filter((id) => nodeById.get(id)?.type === 'parallel_join');
    for (const node of nodes.filter((item) => item.type === 'parallel')) {
      const branchReachability = ['branch_a_exec', 'branch_b_exec'].map((pinId) => {
        const branchWire = connections.find((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === pinId);
        return branchWire ? reachableJoins(branchWire.targetNodeId) : [];
      });
      if (branchReachability.every((joins) => joins.length) && !branchReachability[0].some((joinId) => branchReachability[1].includes(joinId))) {
        warnings.push(`${node.label || 'Parallel'}: its two branches do not reach a common Join node.`);
      } else if (branchReachability.some((joins) => !joins.length) && ['branch_a_exec', 'branch_b_exec'].every((pinId) => connections.some((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === pinId))) {
        warnings.push(`${node.label || 'Parallel'}: at least one branch cannot reach a Join node.`);
      }
      const branchAcknowledgements = ['branch_a_exec', 'branch_b_exec'].map((pinId) => {
        const branchWire = connections.find((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === pinId);
        return branchWire ? [...walkExec([branchWire.targetNodeId])].filter((id) => ackTypes.has(nodeById.get(id)?.type)) : [];
      });
      if (branchAcknowledgements.every((acknowledgements) => acknowledgements.length)) {
        warnings.push(`${node.label || 'Parallel'}: both concurrent branches may acknowledge the same interaction. Acknowledge once, then edit the deferred response after Join.`);
      }
    }
  }
  if (nodeIds.size !== nodes.length) errors.push('Node IDs must be unique.');
  if (isFunction && !nodes.some((node) => node.type === 'function_return')) errors.push('Add a Return Value node to provide this function’s result.');
  if (isFunction) {
    const inputNames = new Set();
    for (const parameter of nodes.filter((node) => node.type === 'function_input')) {
      const name = String(parameter.data?.name || '').trim();
      if (!name) errors.push(`${parameter.label || 'Function Input'}: give this input a name.`);
      else if (inputNames.has(name.toLowerCase())) errors.push(`Function input “${name}” is duplicated. Input names must be unique.`);
      inputNames.add(name.toLowerCase());
    }
  }
  if (isFunction && nodes.some((node) => !isPureFunctionNode(node.type))) errors.push('Function graphs support value, text, comparison, calculation, and function-call nodes only.');
    if (graphLookup && hasFunctionCycle(graph, graphLookup)) errors.push('Graphs cannot call themselves, directly or indirectly.');
  const hasEventNode = nodes.some((node) => String(node.type).startsWith('event_'));
  const hasActionNode = nodes.some((node) => String(node.type).startsWith('action_'));
  if (!isFunction && !hasEventNode && hasActionNode) warnings.push('This graph has Discord actions but no event node to run them.');
  if (!isFunction && hasEventNode && !hasActionNode) warnings.push('This graph has no action nodes.');
  const privilegedEventIntents = new Set(nodes.flatMap((node) => definitions.get(node.type)?.gatewayIntents || []).filter((intent) => ['GUILD_MEMBERS', 'GUILD_PRESENCES', 'MESSAGE_CONTENT'].includes(intent)));
  const disabledPrivilegedIntents = [...privilegedEventIntents].filter((intent) => intentSummary?.some((item) => item.key === intent && item.portalEnabled === false));
  if (disabledPrivilegedIntents.length) warnings.push(`Enable ${disabledPrivilegedIntents.map((intent) => ({ GUILD_MEMBERS: 'Server Members', GUILD_PRESENCES: 'Presence', MESSAGE_CONTENT: 'Message Content' })[intent]).join(' and ')} intent${disabledPrivilegedIntents.length > 1 ? 's' : ''} in the Discord Developer Portal, then reconnect the gateway.`);

  const slashCommandNames = new Set();
  for (const node of nodes) {
    if (!definitions.has(node.type)) errors.push(`${node.label || node.type}: node type is unavailable.`);
    if (node.type === 'parallel') {
      for (const pinId of ['branch_a_exec', 'branch_b_exec']) {
        const count = connections.filter((wire) => wire.sourceNodeId === node.id && wire.sourcePinId === pinId).length;
        if (count !== 1) errors.push(`${node.label || 'Parallel'}: connect exactly one execution wire to ${pinId === 'branch_a_exec' ? 'Branch A' : 'Branch B'}.`);
      }
    }
    if (node.type === 'parallel_join') {
      const incoming = connections.filter((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'exec');
      const count = incoming.length;
      if (count < 2) errors.push(`${node.label || 'Join'}: connect both parallel branches to this node.`);
      else if (incoming.some((wire) => nodeById.get(wire.sourceNodeId)?.type === 'branch_if')) errors.push(`${node.label || 'Join'}: Join is only for Parallel branches. Connect If/Else paths directly to the same action node instead.`);
    }
    if (node.type === 'event_slash_command') {
      const name = String(node.data?.commandName ?? '');
      const description = String(node.data?.description ?? '').trim();
      if (!/^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u.test(name)) errors.push(`${node.label || 'Slash Command'}: use a valid 1–32 character Discord command name without /.`);
      else if (name !== name.toLowerCase()) errors.push(`${node.label || 'Slash Command'}: Discord command names must be lowercase.`);
      if (!description || Array.from(description).length > 100) errors.push(`${node.label || 'Slash Command'}: description must be 1–100 characters.`);
      const normalizedName = name.toLowerCase();
      const duplicateInGraph = name && slashCommandNames.has(normalizedName);
      const conflictingGraph = graphLookup && Array.from(graphLookup.values()).find((candidate) => candidate.id !== graph.id
        && (candidate.nodes || []).some((item) => item.type === 'event_slash_command' && String(item.data?.commandName || '').toLowerCase() === normalizedName));
      if (name && (duplicateInGraph || conflictingGraph)) errors.push(`Slash command /${name} is defined more than once. Names must be unique.`);
      if (name) slashCommandNames.add(normalizedName);
    }
    if (['variable_get', 'variable_set'].includes(node.type) && !variableById.has(node.data?.variableId)) errors.push(`${node.label || node.type}: select a graph variable.`);
    if (node.type === 'function_call') {
      const called = graphLookup?.get(node.data?.graphId);
      if (!called) errors.push(`${node.label || 'Call Graph'}: select a saved graph.`);
      else {
        if (!called.nodes?.some((item) => item.type === 'function_return')) warnings.push(`${node.label || 'Call Graph'}: the target graph has no Return Value, so this node produces no result.`);
        for (const parameter of called.nodes?.filter((item) => item.type === 'function_input' && item.data?.optional === false) || []) {
          const parameterId = parameter.data?.paramId || parameter.id;
          const connected = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === `arg_${parameterId}`);
          if (!connected) errors.push(`${node.label || 'Call Graph'}: connect the required “${parameter.data?.name || 'Input'}” input.`);
        }
      }
    }
    if (['math_divide', 'math_modulo'].includes(node.type) && !connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'b') && Number(node.data?.b ?? 0) === 0) {
      warnings.push(`${node.label || 'Math node'}: B is zero, so the result will be 0 until a non-zero value is connected.`);
    }
    if (['action_send_message', 'action_edit_message'].includes(node.type)) {
      const isEdit = node.type === 'action_edit_message';
      const label = node.label || (isEdit ? 'Edit Message' : 'Send Message');
      const hasChannel = Boolean(String(node.data?.channel_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'channel_id');
      const hasMessageId = Boolean(String(node.data?.message_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'message_id');
      const hasContent = Boolean(String(node.data?.content ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'content');
      const hasEmbed = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed');
      const hasComponents = (Array.isArray(node.data?.components) && node.data.components.some((row) => row.components?.length)) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'components');
      if (!hasChannel) errors.push(`${label}: connect a channel ID.`);
      if (isEdit && !hasMessageId) errors.push(`${label}: connect a message ID.`);
      if (!hasContent && !hasEmbed && !hasComponents && !isEdit) errors.push(`${label}: add message content, an embed, or components.`);
      const content = resolveKnownStringInput(node, 'content', node.data?.content || '');
      if (content !== undefined && content.length > 2000) errors.push(`${label}: content exceeds 2,000 characters after text variables are applied.`);
    }
    if (['action_reply_interaction', 'action_defer_reply', 'action_defer_update'].includes(node.type)) {
      const hasToken = Boolean(String(node.data?.interaction_token ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'interaction_token');
      if (!hasToken) errors.push(`${node.label || 'Interaction Action'}: connect an interaction token.`);
      if (['action_defer_reply', 'action_defer_update'].includes(node.type)) {
        const hasInteractionId = Boolean(String(node.data?.interaction_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'interaction_id');
        if (!hasInteractionId) warnings.push(`${node.label || 'Defer Interaction'}: connect an Interaction ID. Discord needs it to acknowledge the interaction.`);
      }
    }
    if (node.type === 'action_reply_interaction') {
      const hasInteractionId = Boolean(String(node.data?.interaction_id ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'interaction_id');
      if (!hasInteractionId && !hasUpstreamDefer(node.id)) warnings.push(`${node.label || 'Reply to Interaction'}: connect an Interaction ID.`);
      const hasContent = Boolean(String(node.data?.content ?? '').trim()) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'content');
      const hasEmbed = connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed');
      const hasComponents = (Array.isArray(node.data?.components) && node.data.components.some((row) => row.components?.length)) || connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'components');
      if (!hasContent && !hasEmbed && !hasComponents) errors.push(`${node.label || 'Reply to Interaction'}: add reply content, an embed, or components.`);
      const content = resolveKnownStringInput(node, 'content', node.data?.content || '');
      if (content !== undefined && content.length > 2000) errors.push(`${node.label || 'Reply to Interaction'}: content exceeds 2,000 characters after text variables are applied.`);
    }
    if ((String(node.type).startsWith('action_') || node.type === 'variable_set') && !connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'exec')) {
      warnings.push(`${node.label || node.type}: no execution input is connected.`);
    }
    if (node.type === 'build_embed') {
      const embedBlocks = Array.isArray(node.data?.blocks) ? node.data.blocks : null;
      const fields = embedBlocks ? embedBlocks.filter((block) => block.type === 'field') : Array.isArray(node.data?.fields) ? node.data.fields : [];
      if (fields.length > 25) errors.push(`${node.label || 'Create Embed'}: embeds support up to 25 fields.`);
      const label = node.label || 'Create Embed';
      let total = 0;
      let totalIsKnown = true;
      const checkText = (pinId, fallback, limit, fieldLabel) => {
        const value = resolveKnownStringInput(node, pinId, fallback);
        if (value === undefined) {
          totalIsKnown = false;
          return;
        }
        total += value.length;
        if (value.length > limit) errors.push(`${label}: ${fieldLabel} exceeds ${limit.toLocaleString()} characters after text variables are applied.`);
      };
      if (embedBlocks) {
        for (const [index, block] of embedBlocks.entries()) {
          if (block.type === 'title') checkText(`block_${block.id}_value`, block.value, 256, 'title');
          else if (block.type === 'description') checkText(`block_${block.id}_value`, block.value, 4096, 'description');
          else if (block.type === 'author') checkText(`block_${block.id}_name`, block.name, 256, 'author name');
          else if (block.type === 'footer') checkText(`block_${block.id}_text`, block.text, 2048, 'footer');
          else if (block.type === 'field') {
            const fieldIndex = fields.indexOf(block) + 1 || index + 1;
            checkText(`block_${block.id}_name`, block.name, 256, `field ${fieldIndex} name`);
            checkText(`block_${block.id}_value`, block.value, 1024, `field ${fieldIndex} value`);
          }
        }
      } else {
        checkText('title', node.data?.title, 256, 'title');
        checkText('description', node.data?.description, 4096, 'description');
        checkText('author_name', node.data?.author_name, 256, 'author name');
        checkText('footer_text', node.data?.footer_text, 2048, 'footer');
        fields.forEach((field, index) => {
          checkText(`field_${field.id}_name`, field.name, 256, `field ${index + 1} name`);
          checkText(`field_${field.id}_value`, field.value, 1024, `field ${index + 1} value`);
        });
      }
      if (totalIsKnown && total > 6000) errors.push(`${label}: combined text exceeds 6,000 characters after text variables are applied.`);
    }
  }
  for (const wire of connections) {
    const source = nodeById.get(wire.sourceNodeId);
    const target = nodeById.get(wire.targetNodeId);
    if (!source || !target) {
      errors.push('A connection points to a missing node.');
      continue;
    }
    const sourcePin = graphPin(source, 'outputs', wire.sourcePinId, variableById, graphLookup, connections);
    const targetPin = graphPin(target, 'inputs', wire.targetPinId, variableById, graphLookup, connections);
    if (!sourcePin || !targetPin) errors.push('A connection uses a missing node pin.');
    else if (sourcePin.type !== targetPin.type && sourcePin.type !== 'any' && targetPin.type !== 'any' && sourcePin.type !== 'arg' && targetPin.type !== 'arg') errors.push('A connection joins incompatible pin types.');
    else if (sourcePin.type === 'string' && targetPin.type === 'string') {
      const sourceMeaning = semanticStringPin(wire.sourcePinId);
      const targetMeaning = semanticStringPin(wire.targetPinId);
      if (sourceMeaning && targetMeaning && sourceMeaning.key !== targetMeaning.key) {
        const targetLabel = target.label || definitions.get(target.type)?.label || target.type;
        const sourceLabel = source.label || definitions.get(source.type)?.label || source.type;
        warnings.push(`${targetLabel}: ${sourceMeaning.label[0].toUpperCase()}${sourceMeaning.label.slice(1)} from ${sourceLabel} is connected to a socket expecting ${targetMeaning.label}. Check that this connection is intentional.`);
      }
    }
  }
  const variables = Array.isArray(graph.variables) ? graph.variables : [];
  const names = new Set();
  for (const variable of variables) {
    const normalized = String(variable.name || '').trim().toLowerCase();
    if (!normalized) errors.push('Every graph variable needs a name.');
    else if (names.has(normalized)) errors.push(`Variable name “${variable.name}” is used more than once.`);
    names.add(normalized);
  }
  const locateNodeId = (message) => {
    const labeledNode = nodes.find((node) => message.startsWith(`${node.label || node.type}:`));
    if (labeledNode) return labeledNode.id;
    const duplicateCommand = message.match(/^Slash command \/(.+?) is defined more than once/);
    if (duplicateCommand) return nodes.find((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === duplicateCommand[1].toLowerCase())?.id;
    if (message === 'Node IDs must be unique.') {
      const seen = new Set();
      for (const node of nodes) {
        if (seen.has(node.id)) return node.id;
        seen.add(node.id);
      }
      return undefined;
    }
    if (message.startsWith('A connection')) {
      const invalidWire = connections.find((wire) => {
        const source = nodeById.get(wire.sourceNodeId);
        const target = nodeById.get(wire.targetNodeId);
        if (!source || !target) return message.includes('missing node');
        const sourcePin = graphPin(source, 'outputs', wire.sourcePinId, variableById, graphLookup, connections);
        const targetPin = graphPin(target, 'inputs', wire.targetPinId, variableById, graphLookup, connections);
        if (!sourcePin || !targetPin) return message.includes('missing node pin');
        return message.includes('incompatible pin types') && sourcePin.type !== targetPin.type && sourcePin.type !== 'any' && targetPin.type !== 'any' && sourcePin.type !== 'arg' && targetPin.type !== 'arg';
      });
      return nodeById.get(invalidWire?.targetNodeId)?.id || nodeById.get(invalidWire?.sourceNodeId)?.id;
    }
    const variableName = message.match(/^Variable name “(.*)” is used more than once\.$/)?.[1];
    const missingVariableName = message === 'Every graph variable needs a name.';
    if (variableName !== undefined || missingVariableName) {
      const variable = graphVariables.find((item) => missingVariableName ? !String(item.name || '').trim() : item.name === variableName);
      return nodes.find((node) => ['variable_get', 'variable_set'].includes(node.type) && node.data?.variableId === variable?.id)?.id;
    }
    if (message === 'Graphs cannot call themselves, directly or indirectly.') return nodes.find((node) => node.type === 'function_call' && node.data?.graphId === graph.id)?.id;
    return undefined;
  };
  const uniqueErrors = [...new Set(errors)];
  const uniqueWarnings = [...new Set(warnings)];
  const errorNodeIds = Object.fromEntries(uniqueErrors.map((message) => [message, locateNodeId(message)]).filter(([, nodeId]) => nodeId));
  const warningNodeIds = Object.fromEntries(uniqueWarnings.map((message) => [message, locateNodeId(message)]).filter(([, nodeId]) => nodeId));
  return { errors: uniqueErrors, warnings: uniqueWarnings, errorNodeIds, warningNodeIds };
}

function isPureFunctionNode(type) {
  return type === 'function_input' || type === 'function_return' || type === 'function_call' || type === 'function_math' || type.startsWith('math_') || type.startsWith('logic_')
    || type === 'compare_text' || type === 'format_text' || type.startsWith('value_');
}

function hasFunctionCycle(graph, graphLookup, active = new Set(), visited = new Set()) {
  if (active.has(graph.id)) return true;
  if (visited.has(graph.id)) return false;
  active.add(graph.id);
  for (const node of graph.nodes || []) {
    if (node.type !== 'function_call') continue;
    const target = graphLookup.get(node.data?.graphId);
    if (target && hasFunctionCycle(target, graphLookup, active, visited)) return true;
  }
  active.delete(graph.id);
  visited.add(graph.id);
  return false;
}

function graphPin(node, direction, pinId, variables, graphLookup = null, connections = []) {
  const definition = BuiltInNodeDefinitions.find((item) => item.type === node.type);
  if (!definition) return null;
  const variablePinType = (variable) => ['array', 'object'].includes(variable?.type) ? 'object' : variable?.type || 'string';
  if (node.type === 'variable_get' && direction === 'outputs') {
    const variable = variables.get(node.data?.variableId);
    return variable && pinId === 'value' ? { id: 'value', type: variablePinType(variable) } : null;
  }
  if (node.type === 'variable_set' && direction === 'inputs') {
    const variable = variables.get(node.data?.variableId);
    if (pinId === 'value' && variable) return { id: 'value', type: variablePinType(variable) };
  }
  if (node.type === 'function_input' && direction === 'outputs' && pinId === 'value') return { id: 'value', type: node.data?.valueType || 'number' };
  if (node.type === 'function_return' && direction === 'inputs' && pinId === 'value') return { id: 'value', type: node.data?.valueType || 'number' };
  if (node.type === 'function_call') {
    const called = graphLookup?.get(node.data?.graphId);
    if (direction === 'inputs') {
      const parameter = called?.nodes?.find((item) => item.type === 'function_input' && `arg_${item.data?.paramId || item.id}` === pinId);
      if (parameter) return { id: pinId, type: parameter.data?.valueType || 'number' };
    } else if (direction === 'outputs' && pinId === 'result') {
      const returned = called?.nodes?.find((item) => item.type === 'function_return');
      return returned ? { id: 'result', type: returned.data?.valueType || 'number' } : null;
    }
  }
  if (node.type === 'data_permission_overwrites' && direction === 'inputs') return getPermissionOverwritePins(node, connections).find((pin) => pin.id === pinId) || null;
  if (node.type === 'data_array_create' && direction === 'inputs') return getArrayCreatePins(node, connections).find((pin) => pin.id === pinId) || null;
  if (['math_sum', 'math_average'].includes(node.type) && direction === 'inputs') return getMathListPins(node, connections).find((pin) => pin.id === pinId) || null;
  let pins = definition[direction] || [];
  if (node.type === 'format_text' && direction === 'inputs') {
    const slots = getTextTemplateSlots(node.data?.template).map((name) => ({ id: `slot_${name}`, type: variablePinType([...variables.values()].find((variable) => variable.name?.toLowerCase() === name.toLowerCase())) }));
    pins = slots;
  }
  if (node.type === 'build_embed' && direction === 'inputs') {
    if (Array.isArray(node.data?.blocks)) {
      const pins = embedBlockPins(getEmbedBlocks(node.data));
      return [...pins, ...getNodeArgumentPins(node, pins, connections)].find((pin) => pin.id === pinId) || null;
    }
    const fields = Array.isArray(node.data?.fields) ? node.data.fields : [];
    pins = [...pins, ...fields.flatMap((field) => [{ id: `field_${field.id}_name`, type: 'string' }, { id: `field_${field.id}_value`, type: 'string' }])];
  }
  if (direction === 'inputs') pins = [...pins, ...getNodeArgumentPins(node, pins, connections)];
  return pins.find((pin) => pin.id === pinId) || null;
}
