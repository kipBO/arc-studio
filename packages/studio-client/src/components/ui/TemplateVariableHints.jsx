import React, { useMemo } from 'react';
//
export function TemplateVariableHints({ value, graphVariables = [], inputSlots = [], connectedInputIds = new Set() }) {
  const tokens = useMemo(() => Array.from(new Map(Array.from(
    String(value || '').matchAll(/(?<!\\)\{\{\s*([^{}]+?)\s*\}\}/g), (match) => {
      const expression = match[1];
      const base = expression.split('|')[0].split('?')[0].trim();
      const name = base.match(/[A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/)?.[0];
      return name ? [match[0], { name, token: match[0], expression, pipeline: expression.includes('|') ? ` | ${expression.split('|').slice(1).join('|').trim()}` : '' }] : null;
    }
  ).filter(Boolean)).values()).filter(({ name }) => !name.toLowerCase().startsWith('e_') && !/^arg\d+$/i.test(name)), [value]);
  if (!tokens.length) return null;
  return <div className="template-token-hints" aria-label="Template values">
    {tokens.map(({ name, token, pipeline, expression }) => {
      const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
      const inputPin = inputSlots.find((pin) => pin.id === `slot_${name}`);
      const label = <><span>{'{{'}{name}</span>{pipeline && <small>{pipeline}</small>}<span>{'}}'}</span></>;
      if (inputPin && connectedInputIds.has(inputPin.id)) {
        return <span className="template-token-chip" key={token} data-tooltip={`${name} input socket · value supplied by its connected wire`}>{label}</span>;
      }
      if (!variable && /\|\s*default\s*\(/i.test(expression)) {
        const fallback = previewTemplateValue(undefined, pipeline, token, expression, graphVariables);
        return <span className="template-token-chip" key={token} data-tooltip={`Fallback preview · ${fallback}`}>{label}</span>;
      }
      if (!variable && inputPin) {
        return <span className="template-token-chip" key={token} data-tooltip={`${name} input socket · connect a wire to supply this placeholder`}>{label}</span>;
      }
      if (!variable) return <span className="template-token-chip is-unresolved" key={token} data-tooltip="No matching graph variable or input socket exists. This placeholder will stay as written.">{label}</span>;
      const type = variable.valueType || variable.type || 'text';
      const initial = variable.initialValue;
      const preview = previewTemplateValue(initial, pipeline, token, expression, graphVariables);
      const expected = initial === undefined ? 'No default value' : `Initial value: ${preview}`;
      return <span className="template-token-chip" key={token} data-tooltip={`${variable.name} · ${type} · ${expected}${pipeline ? ` · transforms: ${pipeline.replace(/\|/g, '').trim()}` : ''}`}>{label}</span>;
    })}
  </div>;
}

function previewTemplateValue(value, pipeline, _token, expression, variables) {
  let result = value;
  const conditional = String(expression || '').split('|')[0];
  const question = conditional.indexOf('?');
  if (question >= 0) {
    const condition = conditional.slice(0, question).trim();
    const branches = conditional.slice(question + 1).split(/\s*:\s*/, 2);
    const comparison = /^(.*?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.*?)$/.exec(condition);
    const read = (part) => {
      const clean = part.trim();
      if (/^".*"$|^'.*'$/.test(clean)) return clean.slice(1, -1);
      if (clean === 'true') return true;
      if (clean === 'false') return false;
      if (clean === 'null' || clean === 'undefined') return null;
      if (/^-?\d+(?:\.\d+)?$/.test(clean)) return Number(clean);
      return variables.find((item) => item.name?.toLowerCase() === clean.toLowerCase())?.initialValue;
    };
    let truth;
    if (comparison) {
      const left = read(comparison[1]); const right = read(comparison[3]);
      truth = comparison[2] === '==' || comparison[2] === '===' ? left === right
        : comparison[2] === '!=' || comparison[2] === '!==' ? left !== right
          : comparison[2] === '>' ? left > right : comparison[2] === '>=' ? left >= right : comparison[2] === '<' ? left < right : left <= right;
    } else {
      const negated = condition.startsWith('!');
      truth = Boolean(read(negated ? condition.slice(1) : condition));
      if (negated) truth = !truth;
    }
    result = read(branches[truth ? 0 : 1] || '');
  }
  if (result === undefined && !pipeline.toLowerCase().includes('default(')) return 'unavailable';
  const steps = String(pipeline || '').match(/[A-Za-z][A-Za-z0-9]*(?:\([^{}]*\))?/g) || [];
  for (const step of steps) {
    const match = /^([A-Za-z][A-Za-z0-9]*)(?:\((.*)\))?$/.exec(step);
    const name = match?.[1]?.toLowerCase();
    const args = match?.[2] === undefined ? [] : match[2].split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, ''));
    const text = () => result == null ? '' : typeof result === 'object' ? JSON.stringify(result) : String(result);
    if (['lower', 'lowercase', 'tolowercase'].includes(name)) result = text().toLocaleLowerCase();
    else if (['upper', 'uppercase', 'touppercase'].includes(name)) result = text().toLocaleUpperCase();
    else if (name === 'title' || name === 'titlecase') result = text().toLocaleLowerCase().replace(/(^|[\s\p{P}\p{S}])([\p{L}\p{N}])/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`);
    else if (name === 'capitalize') result = text().replace(/^\s*\p{L}/u, (letter) => letter.toLocaleUpperCase());
    else if (name === 'trim') result = text().trim();
    else if (name === 'trimstart') result = text().trimStart();
    else if (name === 'trimend') result = text().trimEnd();
    else if (name === 'replace' && args.length > 1 && args[0]) result = text().split(args[0]).join(args[1]);
    else if (name === 'replacefirst' && args.length > 1 && args[0]) result = text().replace(args[0], args[1]);
    else if (name === 'join' && Array.isArray(result)) result = result.map((item) => item == null ? '' : String(item)).join(args[0] ?? ', ');
    else if (name === 'length') result = result?.length ?? text().length;
    else if (name === 'json') result = JSON.stringify(result) ?? '';
    else if (name === 'slice') result = result?.slice?.(Number(args[0]) || 0, args[1] === undefined ? undefined : Number(args[1]));
    else if (name === 'default' && (result == null || result === '')) result = args[0] ?? '';
  }
  let display;
  try { display = typeof result === 'string' ? result : JSON.stringify(result); } catch { display = String(result); }
  if (display == null || display === '') display = '(empty)';
  return display.length > 120 ? `${display.slice(0, 117)}…` : display;
}
