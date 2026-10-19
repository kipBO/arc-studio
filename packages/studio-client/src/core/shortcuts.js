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
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.includes('alt');
  const hasMod = event.metaKey || event.ctrlKey;
  return normalizeKey(event.key) === key
    && hasMod === wantsMod
    && event.shiftKey === wantsShift
    && event.altKey === wantsAlt;
}

export function formatShortcut(binding, platform = '') {
  const mac = platform === 'macos' || (platform === 'browser' && /Mac|iPhone|iPad/.test(navigator.platform || ''));
  return String(binding || '').split('+').map((part) => {
    if (part === 'mod') return mac ? '⌘' : 'Ctrl';
    if (part === 'shift') return mac ? '⇧' : 'Shift';
    if (part === 'alt') return mac ? '⌥' : 'Alt';
    if (part === 'space') return 'Space';
    if (displayAliases[part]) return displayAliases[part];
    if (arrowLabels[part]) return arrowLabels[part];
    return part.length === 1 ? part.toUpperCase() : part;
  }).join(mac ? '' : ' + ');
}

export function shortcutFromEvent(event) {
  const modifiers = [];
  if (event.metaKey || event.ctrlKey) modifiers.push('mod');
  if (event.shiftKey) modifiers.push('shift');
  if (event.altKey) modifiers.push('alt');
  const key = event.key.toLowerCase();
  if (['control', 'meta', 'shift', 'alt'].includes(key)) return null;
  const normalized = normalizeKey(event.key);
  return [...modifiers, normalized].join('+');
}
