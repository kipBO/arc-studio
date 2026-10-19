function isDesktopRuntime() {
  return Boolean(window.__ARC_STUDIO_CONFIG__?.desktop);
}
//
export function workspaceStorageKey(key) {
  if (!isDesktopRuntime()) return key;
  try {
    if (localStorage.getItem('arc_workspace_mode') !== 'remote') return key;
    const remoteUrl = new URL(localStorage.getItem('arc_remote_workspace_url') || '');
    return `${key}::workspace:${encodeURIComponent(remoteUrl.origin)}`;
  } catch {
    return key;
  }
}

export function readAppStorage(key, fallback = null) {
  try { return localStorage.getItem(workspaceStorageKey(key)) ?? fallback; }
  catch { return fallback; }
}

export function writeAppStorage(key, value) {
  try { localStorage.setItem(workspaceStorageKey(key), value); return true; }
  catch { return false; }
}

export function removeAppStorage(key) {
  try { localStorage.removeItem(workspaceStorageKey(key)); }
  catch {}
}
