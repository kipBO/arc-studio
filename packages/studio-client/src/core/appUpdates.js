export function compareArcVersions(candidate, current) {
  const parse = (value) => {
    const match = String(value || '').replace(/^v/i, '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match) return null;
    const pre = match[4] ? match[4].split('.') : null;
    if (pre?.some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))) return null;
    return { core: match.slice(1, 4).map(Number), pre };
  };
  const next = parse(candidate);
  const installed = parse(current);
  if (!next || !installed) return null;
  for (let index = 0; index < 3; index += 1) {
    if (next.core[index] !== installed.core[index]) return next.core[index] > installed.core[index] ? 1 : -1;
  }
  if (!next.pre && installed.pre) return 1;
  if (next.pre && !installed.pre) return -1;
  if (!next.pre && !installed.pre) return 0;
  const length = Math.max(next.pre.length, installed.pre.length);
  for (let index = 0; index < length; index += 1) {
    if (next.pre[index] === undefined) return -1;
    if (installed.pre[index] === undefined) return 1;
    const nextNumber = /^\d+$/.test(next.pre[index]) ? Number(next.pre[index]) : null;
    const currentNumber = /^\d+$/.test(installed.pre[index]) ? Number(installed.pre[index]) : null;
    if (nextNumber !== null && currentNumber !== null && nextNumber !== currentNumber) return nextNumber > currentNumber ? 1 : -1;
    if (nextNumber !== null && currentNumber === null) return -1;
    if (nextNumber === null && currentNumber !== null) return 1;
    const order = next.pre[index].localeCompare(installed.pre[index]);
    if (order) return order > 0 ? 1 : -1;
  }
  return 0;
}

export function getArcVersionDistance(candidate, current) {
  const parse = (value) => {
    const match = String(value || '').replace(/^v/i, '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match) return null;
    return { core: match.slice(1, 4).map(Number), pre: match[4] ? match[4].split('.') : null };
  };
  const next = parse(candidate);
  const installed = parse(current);
  if (!next || !installed) return null;
  if (next.core[0] !== installed.core[0]) return Math.abs(next.core[0] - installed.core[0]) * 10_000;
  if (next.core[1] !== installed.core[1]) return Math.abs(next.core[1] - installed.core[1]) * 100;
  if (next.core[2] !== installed.core[2]) return Math.abs(next.core[2] - installed.core[2]);
  if (!next.pre && !installed.pre) return 0;
  if (!next.pre || !installed.pre) return 1;
  const trailingNumber = (parts) => /^\d+$/.test(parts.at(-1) || '') ? Number(parts.at(-1)) : null;
  const nextNumber = trailingNumber(next.pre);
  const installedNumber = trailingNumber(installed.pre);
  const nextStem = nextNumber === null ? next.pre : next.pre.slice(0, -1);
  const installedStem = installedNumber === null ? installed.pre : installed.pre.slice(0, -1);
  if (nextNumber !== null && installedNumber !== null && nextStem.join('.') === installedStem.join('.')) return Math.abs(nextNumber - installedNumber);
  return next.pre.join('.') === installed.pre.join('.') ? 0 : 1;
}

export function classifyArcUpdate(candidate, current) {
  const next = String(candidate || '').replace(/^v/i, '').split(/[.+-]/);
  const installed = String(current || '').replace(/^v/i, '').split(/[.+-]/);
  if (next[0] !== installed[0] || next[1] !== installed[1]) return 'major';
  if (next[2] !== installed[2]) return 'feature';
  return 'maintenance';
}
