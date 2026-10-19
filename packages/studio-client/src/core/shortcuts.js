export const DEFAULT_SHORTCUTS = {
  addNode: 'shift+a',
  arrangeNodes: 'shift+r',
  toggleLibrary: 'shift+l',
  openSearch: 'mod+k',
  emojiPicker: 'mod+shift+e',
  saveGraph: 'mod+s',
  undo: 'mod+z',
  redo: 'mod+shift+z'
};

const keyAliases = { ' ': 'space', '+': 'plus', '-': 'minus', ',': 'comma', '.': 'period', '/': 'slash', '\\': 'backslash', '[': 'bracketleft', ']': 'bracketright' };
const displayAliases = { plus: '+', minus: '−', comma: ',', period: '.', slash: '/', backslash: '\\', bracketleft: '[', bracketright: ']' };
const arrowLabels = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' };
const normalizeKey = (key) => keyAliases[key] || key.toLowerCase();
//
export function shortcutMatches(event, binding) {
  if (!binding) return false;
  const parts = String(binding).toLowerCase().split('+');
  const key = parts.at(-1);
  const wantsMod = parts.includes('mod');
  const wantsCtrl = parts.includes('ctrl');
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.includes('alt');
  const hasMod = event.metaKey || event.ctrlKey;
  return normalizeKey(event.key) === key
    && (wantsCtrl ? event.ctrlKey && !event.metaKey : hasMod === wantsMod)
    && event.shiftKey === wantsShift
    && event.altKey === wantsAlt;
}

export function formatShortcut(binding, platform = '') {
  const mac = platform === 'macos' || (platform === 'browser' && /Mac|iPhone|iPad/.test(navigator.platform || ''));
  return String(binding || '').split('+').map((part) => {
    if (part === 'mod') return mac ? '⌘' : 'Ctrl';
    if (part === 'ctrl') return 'Ctrl';
    if (part === 'shift') return mac ? '⇧' : 'Shift';
    if (part === 'alt') return mac ? '⌥' : 'Alt';
    if (part === 'space') return 'Space';
    if (displayAliases[part]) return displayAliases[part];
    if (arrowLabels[part]) return arrowLabels[part];
    return part.length === 1 ? part.toUpperCase() : part;
  }).join(mac && !String(binding || '').toLowerCase().split('+').includes('ctrl') ? '' : ' + ');
}

export function shortcutFromEvent(event) {
  const modifiers = [];
  if (event.metaKey) modifiers.push('mod');
  else if (event.ctrlKey) modifiers.push('ctrl');
  if (event.shiftKey) modifiers.push('shift');
  if (event.altKey) modifiers.push('alt');
  const key = event.key.toLowerCase();
  if (['control', 'meta', 'shift', 'alt'].includes(key)) return null;
  const normalized = normalizeKey(event.key);
  return [...modifiers, normalized].join('+');
}

export function getShortcutReservation(binding, platform = '') {
  if (platform !== 'macos' || !binding) return '';
  const parts = String(binding).toLowerCase().split('+');
  const key = parts.at(-1);
  const has = (modifier) => parts.includes(modifier);
  const command = has('mod');
  const shift = has('shift');
  const alt = has('alt');
  const control = has('ctrl');
  if (command && key === 'tab') return '⌘+Tab is reserved by macOS for switching apps.';
  if (command && ['q', 'h', 'm', 'space', 'grave', 'comma', 'n', 'o', 'p', 'r', 'l'].includes(key) && !alt) return 'That Command shortcut is reserved by macOS or ARC Studio.';
  if (command && alt && key === 'escape') return '⌘+Option+Esc is reserved by macOS.';
  if (command && alt && key === 'h') return '⌘+Option+H is reserved by macOS.';
  if (command && shift && ['3', '4', '5', '6'].includes(key) && !alt) return 'That screenshot shortcut is reserved by macOS.';
  if (control && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'f2', 'f3', 'f4'].includes(key) && !shift && !alt) return 'That Control shortcut is reserved by macOS.';
  if (command && key === 'w' && !shift && !alt) return '⌘+W is reserved for closing the active graph.';
  if (command && key === 't' && !alt) return '⌘+T is reserved for creating a graph.';
  if (control && key === 'tab' && !alt) return 'Ctrl+Tab is reserved for switching graph tabs.';
  if (command && shift && key === 'r' && !alt) return '⌘+Shift+R is reserved for reloading ARC Studio.';
  if (command && shift && key === 'j' && !alt) return '⌘+Shift+J is reserved for the server console.';
  return '';
}
