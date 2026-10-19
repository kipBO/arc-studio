import { NodeDefinitions } from './NodeRegistry.js';
import { EmbedBuilder, parseEmoji } from 'chezcord';
import { CryptoEngine } from '../security/CryptoEngine.js';
import { evaluateMathNode } from './MathOperations.js';
//
function waitFor(ms, signal) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('Graph execution cancelled.'), { name: 'AbortError' }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, Math.max(0, ms));
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(Object.assign(new Error('Graph execution cancelled.'), { name: 'AbortError' }));
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function evaluateDataNode(type, inputs = {}, data = {}) {
  if (type === 'data_permission_overwrites') {
    const permissionBits = {
      CreateInstantInvite: 0, KickMembers: 1, BanMembers: 2, Administrator: 3, ManageChannels: 4, ManageGuild: 5, AddReactions: 6, ViewAuditLog: 7,
      PrioritySpeaker: 8, Stream: 9, ViewChannel: 10, SendMessages: 11, SendTTSMessages: 12, ManageMessages: 13, EmbedLinks: 14, AttachFiles: 15,
      ReadMessageHistory: 16, MentionEveryone: 17, UseExternalEmojis: 18, ViewGuildInsights: 19, Connect: 20, Speak: 21, MuteMembers: 22,
      DeafenMembers: 23, MoveMembers: 24, UseVAD: 25, ChangeNickname: 26, ManageNicknames: 27, ManageRoles: 28, ManageWebhooks: 29,
      ManageGuildExpressions: 30, UseApplicationCommands: 31, RequestToSpeak: 32, ManageEvents: 33, ManageThreads: 34, CreatePublicThreads: 35,
      CreatePrivateThreads: 36, UseExternalStickers: 37, SendMessagesInThreads: 38, UseEmbeddedActivities: 39, ModerateMembers: 40,
      ViewCreatorMonetizationAnalytics: 41, UseSoundboard: 42, CreateGuildExpressions: 43, CreateEvents: 44, UseExternalSounds: 45,
      SendVoiceMessages: 46, SetVoiceChannelStatus: 48, SendPolls: 49, UseExternalApps: 50, PinMessages: 51, BypassSlowmode: 52
    };
    const parsePermissionBits = (value) => {
      const text = String(value ?? '').trim();
      if (!/^(?:\d+|0x[\da-f]+)$/i.test(text)) return 0n;
      try { return BigInt(text); } catch { return 0n; }
    };
    const serializePermissions = (value, customBits = '') => {
      const names = Array.isArray(value) ? value : [];
      const mask = names.reduce((total, name) => permissionBits[name] === undefined ? total : total | (1n << BigInt(permissionBits[name])), parsePermissionBits(customBits));
      return mask ? mask.toString() : '';
    };
    const overwrites = [];
    const targetCount = Math.min(100, Math.max(1, ...Object.keys(inputs).map((key) => Number(/^target_id_(\d+)$/.exec(key)?.[1]) || 0)));
    for (let index = 1; index <= targetCount; index += 1) {
      const id = String(inputs[`target_id_${index}`] ?? '').trim();
      if (!id) continue;
      const permission = { id, type: Number(data[`target_type_${index}`]) === 1 ? 1 : 0 };
      const allow = serializePermissions(data[`allow_${index}`], data[`allowBits_${index}`]);
      const deny = serializePermissions(data[`deny_${index}`], data[`denyBits_${index}`]);
      if (allow) permission.allow = allow;
      if (deny) permission.deny = deny;
      overwrites.push(permission);
    }
    return { overwrites };
  }
  if (type === 'data_to_json') {
    try {
      const json = JSON.stringify(inputs.value);
      return { json: json ?? '', valid: json !== undefined };
    } catch { return { json: '', valid: false }; }
  }
  if (type === 'data_parse_json') {
    try { return { value: JSON.parse(String(inputs.json ?? '')), valid: true }; }
    catch { return { value: null, valid: false }; }
  }
  if (type === 'data_array_create') {
    const array = Array.from({ length: 50 }, (_, index) => inputs[`item_${index + 1}`]).filter((value) => value !== undefined && value !== null);
    return { array, length: array.length };
  }
  if (type === 'data_array_concat') {
    const numberedArrays = Object.keys(inputs)
      .map((key) => ({ index: Number(/^array_(\d+)$/.exec(key)?.[1]), value: inputs[key] }))
      .filter(({ index }) => Number.isInteger(index) && index > 0)
      .sort((a, b) => a.index - b.index)
      .map(({ value }) => Array.isArray(value) ? value : []);
    const legacyArrays = [inputs.array_a, inputs.array_b].filter(Array.isArray);
    const array = [...numberedArrays.flat(), ...legacyArrays.flat()].slice(0, 10000);
    return { array, length: array.length };
  }
  if (type === 'data_text_uppercase') return { text: String(inputs.text ?? '').toUpperCase() };
  if (type === 'data_text_lowercase') return { text: String(inputs.text ?? '').toLowerCase() };
  if (type === 'data_text_titlecase') return { text: String(inputs.text ?? '').toLocaleLowerCase().replace(/(^|[\s\p{P}\p{S}])([\p{L}\p{N}])/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`) };
  if (type === 'data_text_trim') return { text: String(inputs.text ?? '').trim() };
  if (type === 'data_array_length') {
    const length = Array.isArray(inputs.array) ? inputs.array.length : 0;
    return { length, empty: length === 0 };
  }
  if (type === 'data_array_get') {
    const array = Array.isArray(inputs.array) ? inputs.array : [];
    const index = Math.trunc(Number(inputs.index));
    const found = Number.isInteger(index) && index >= 0 && index < array.length;
    return { value: found ? array[index] : null, found };
  }
  if (type === 'data_array_set') {
    const array = Array.isArray(inputs.array) ? inputs.array.slice(0, 10000) : [];
    const index = Math.trunc(Number(inputs.index));
    const updated = Number.isInteger(index) && index >= 0 && index < array.length;
    if (updated) array[index] = inputs.value;
    return { array, updated };
  }
  if (type === 'data_array_append') {
    const result = Array.isArray(inputs.array) ? inputs.array.slice(0, 10000) : [];
    const items = Object.keys(inputs)
      .map((key) => ({ index: Number(/^item_(\d+)$/.exec(key)?.[1]), value: inputs[key] }))
      .filter(({ index, value }) => Number.isInteger(index) && index > 0 && value !== undefined)
      .sort((a, b) => a.index - b.index)
      .map(({ value }) => value);
    if (inputs.value !== undefined) items.push(inputs.value);
    for (const item of items) {
      if (result.length >= 10000) break;
      result.push(item);
    }
    return { array: result, length: result.length };
  }
  if (type === 'data_object_get') {
    const object = inputs.object && typeof inputs.object === 'object' && !Array.isArray(inputs.object) ? inputs.object : {};
    const key = String(inputs.key ?? '');
    return { value: Object.hasOwn(object, key) ? object[key] : null, exists: Object.hasOwn(object, key) };
  }
  if (type === 'data_object_set') {
    const object = inputs.object && typeof inputs.object === 'object' && !Array.isArray(inputs.object) ? inputs.object : {};
    const key = String(inputs.key ?? '').slice(0, 256);
    return { object: key ? { ...object, [key]: inputs.value } : { ...object } };
  }
  if (type === 'data_object_keys') {
    const object = inputs.object && typeof inputs.object === 'object' && !Array.isArray(inputs.object) ? inputs.object : {};
    const keys = Object.keys(object);
    return { keys, length: keys.length };
  }
  if (type === 'data_string_split') {
    const text = String(inputs.text ?? '');
    const separator = String(inputs.separator ?? ',');
    const array = (separator ? text.split(separator) : Array.from(text)).slice(0, 10000);
    return { array, length: array.length, ...Object.fromEntries(array.slice(0, 50).map((value, index) => [`part_${index + 1}`, value])) };
  }
  if (type === 'data_parse_prefix_command') {
    const prefix = String(inputs.prefix ?? '!');
    const source = String(inputs.content ?? '').trimStart();
    if (!prefix || !source.startsWith(prefix)) return { recognized: false, command: '', arguments: [], argument_count: 0 };
    const raw = source.slice(prefix.length);
    const tokens = [];
    let current = '';
    let quote = '';
    let escaped = false;
    let started = false;
    for (const char of raw) {
      if (escaped) { current += char; escaped = false; started = true; continue; }
      if (char === '\\') { escaped = true; started = true; continue; }
      if (quote) {
        if (char === quote) quote = '';
        else current += char;
        started = true;
        continue;
      }
      if (char === '"' || char === "'") { quote = char; started = true; continue; }
      if (/\s/.test(char)) {
        if (started) { tokens.push(current); current = ''; started = false; }
        continue;
      }
      current += char;
      started = true;
    }
    if (escaped) current += '\\';
    if (started) tokens.push(current);
    const [command = '', ...args] = tokens;
    const boundedArgs = args.slice(0, 10000);
    return {
      recognized: Boolean(command), command, arguments: boundedArgs, argument_count: boundedArgs.length,
      ...Object.fromEntries(boundedArgs.slice(0, 50).map((value, index) => [`argument_${index + 1}`, value]))
    };
  }
  if (type === 'data_string_join') {
    const array = Array.isArray(inputs.array) ? inputs.array : [];
    return { text: array.map((value) => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)).join(String(inputs.separator ?? ', ')) };
  }
  if (type === 'data_text_replace') {
    const text = String(inputs.text ?? '');
    const search = String(inputs.search ?? '');
    if (!search) return { text, replacements: 0 };
    const parts = text.split(search);
    return { text: parts.join(String(inputs.replacement ?? '')), replacements: parts.length - 1 };
  }
  if (type === 'data_format_time' || type === 'data_to_iso_time') {
    const raw = inputs.value;
    const date = typeof raw === 'number' || (typeof raw === 'string' && /^-?\d+(?:\.\d+)?$/.test(raw.trim()))
      ? new Date(Number(raw)) : new Date(raw);
    if (!Number.isFinite(date.getTime())) return { text: '', valid: false };
    if (type === 'data_to_iso_time') return { text: date.toISOString(), valid: true };
    try {
      const options = { timeZone: String(inputs.timeZone || 'UTC') };
      const dateStyle = String(inputs.dateStyle || 'medium');
      const timeStyle = String(inputs.timeStyle || 'short');
      if (dateStyle !== 'none') options.dateStyle = dateStyle;
      if (timeStyle !== 'none') options.timeStyle = timeStyle;
      if (!options.dateStyle && !options.timeStyle) options.dateStyle = 'medium';
      return { text: new Intl.DateTimeFormat(String(inputs.locale || 'en-US'), options).format(date), valid: true };
    } catch { return { text: '', valid: false }; }
  }
  return {};
}
import { performSafeHttpRequest } from './SafeHttpRequest.js';
import { PluginStore } from './PluginStore.js';

function templateText(value) {
  if (value == null) return '';
  if (typeof value === 'object') { try { return JSON.stringify(value); } catch { return ''; } }
  return String(value);
}

function splitTemplateArguments(source) {
  const parts = [];
  let quote = '';
  let escaped = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quote) { escaped = true; continue; }
    if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
    if (char === ',' && !quote) { parts.push(source.slice(start, index).trim()); start = index + 1; }
  }
  if (quote) return null;
  const last = source.slice(start).trim();
  if (last || parts.length) parts.push(last);
  return parts;
}

function splitTemplatePipeline(source) {
  const parts = [];
  let quote = '';
  let escaped = false;
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quote) { escaped = true; continue; }
    if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
    if (!quote && char === '(') depth += 1;
    else if (!quote && char === ')') depth = Math.max(0, depth - 1);
    else if (!quote && depth === 0 && char === '|') { parts.push(source.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function findTemplateOperator(source, operators) {
  let quote = '';
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quote) { escaped = true; continue; }
    if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
    if (quote) continue;
    if (char === '(') { depth += 1; continue; }
    if (char === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    const operator = operators.find((item) => source.startsWith(item, index));
    if (operator) return { index, operator };
  }
  return null;
}

function parseTemplateLiteral(source) {
  const value = source.trim();
  if (/^"(?:\\.|[^"\\])*"$/.test(value)) { try { return JSON.parse(value); } catch { return undefined; } }
  if (/^'(?:\\.|[^'\\])*'$/.test(value)) return value.slice(1, -1).replace(/\\(['\\])/g, '$1');
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;
  return undefined;
}

function resolveTemplatePath(source, resolveSlot) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)(.*)$/.exec(source.trim());
  if (!match) return { found: false, value: undefined };
  let value = resolveSlot?.(match[1], `{{${match[1]}}}`);
  if (value === undefined) return { found: false, value };
  const path = match[2].replace(/\.\s*\[(\d+)\]/g, '[$1]');
  const tokens = [];
  const tokenPattern = /\.([A-Za-z_$][A-Za-z0-9_$]*)|\[(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\d+))\]/g;
  let cursor = 0;
  for (const part of path.matchAll(tokenPattern)) {
    if (part.index !== cursor) return { found: false, value: undefined };
    tokens.push(part[1] ?? part[2] ?? part[3] ?? Number(part[4]));
    cursor += part[0].length;
  }
  if (cursor !== path.length) return { found: false, value: undefined };
  for (const key of tokens) {
    if (['__proto__', 'prototype', 'constructor'].includes(String(key)) || value == null || (typeof value !== 'object' && typeof value !== 'string')) return { found: false, value: undefined };
    if (!Object.prototype.hasOwnProperty.call(Object(value), key)) return { found: false, value: undefined };
    value = value[key];
  }
  return { found: true, value };
}

function evaluateTemplateExpression(source, resolveSlot) {
  const expression = source.trim();
  const question = findTemplateOperator(expression, ['?']);
  if (question) {
    const remainder = expression.slice(question.index + 1);
    const colon = findTemplateOperator(remainder, [':']);
    if (!colon) return { found: false, value: undefined };
    const condition = expression.slice(0, question.index).trim();
    const comparison = findTemplateOperator(condition, ['!==', '===', '!=', '==', '>=', '<=', '>', '<']);
    let truth;
    if (comparison) {
      const leftSource = condition.slice(0, comparison.index).trim();
      const rightSource = condition.slice(comparison.index + comparison.operator.length).trim();
      const resolveValue = (item) => {
        const literal = parseTemplateLiteral(item);
        if (literal !== undefined || item === 'undefined') return literal;
        return resolveTemplatePath(item, resolveSlot).value;
      };
      const left = resolveValue(leftSource); const right = resolveValue(rightSource);
      switch (comparison.operator) {
        case '==': case '===': truth = left === right; break;
        case '!=': case '!==': truth = left !== right; break;
        case '>': truth = left > right; break;
        case '>=': truth = left >= right; break;
        case '<': truth = left < right; break;
        case '<=': truth = left <= right; break;
        default: truth = false;
      }
    } else {
      const negate = condition.startsWith('!');
      const valueSource = negate ? condition.slice(1).trim() : condition;
      const literal = parseTemplateLiteral(valueSource);
      const value = literal !== undefined || valueSource === 'undefined' ? literal
        : resolveTemplatePath(valueSource, resolveSlot).value;
      truth = Boolean(value);
      if (negate) truth = !truth;
    }
    const selected = truth ? remainder.slice(0, colon.index) : remainder.slice(colon.index + 1);
    return evaluateTemplateExpression(selected, resolveSlot);
  }
  const literal = parseTemplateLiteral(expression);
  if (literal !== undefined || expression === 'undefined') return { found: true, value: literal };
  return resolveTemplatePath(expression, resolveSlot);
}

function parseTemplateArgument(source) {
  if (/^"(?:\\.|[^"\\])*"$/.test(source)) { try { return JSON.parse(source); } catch { return undefined; } }
  if (/^'(?:\\.|[^'\\])*'$/.test(source)) return source.slice(1, -1).replace(/\\(['\\])/g, '$1');
  if (/^-?\d+(?:\.\d+)?$/.test(source)) return Number(source);
  if (source === 'true') return true;
  if (source === 'false') return false;
  if (source === 'null') return null;
  return undefined;
}

function applyTemplateTransforms(value, transforms) {
  let result = value;
  for (const transform of transforms) {
    const match = /^([A-Za-z][A-Za-z0-9]*)(?:\((.*)\))?$/.exec(transform.trim());
    if (!match) continue;
    const name = match[1].toLowerCase();
    const rawArgs = splitTemplateArguments(match[2] || '');
    if (!rawArgs) continue;
    const args = rawArgs.map(parseTemplateArgument);
    if (args.some((arg, index) => arg === undefined && rawArgs[index] !== '')) continue;
    const text = () => templateText(result);
    if (['lower', 'lowercase', 'tolowercase'].includes(name)) result = text().toLocaleLowerCase();
    else if (['upper', 'uppercase', 'touppercase'].includes(name)) result = text().toLocaleUpperCase();
    else if (['trim'].includes(name)) result = text().trim();
    else if (name === 'trimstart') result = text().trimStart();
    else if (name === 'trimend') result = text().trimEnd();
    else if (['title', 'titlecase'].includes(name)) result = text().toLocaleLowerCase().replace(/(^|[\s\p{P}\p{S}])([\p{L}\p{N}])/gu, (_all, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`);
    else if (name === 'capitalize') result = text().replace(/^\s*\p{L}/u, (letter) => letter.toLocaleUpperCase());
    else if (name === 'replace' && args.length >= 2 && String(args[0]) !== '') result = text().split(String(args[0])).join(String(args[1]));
    else if (name === 'replacefirst' && args.length >= 2 && String(args[0]) !== '') result = text().replace(String(args[0]), String(args[1]));
    else if (name === 'join' && result != null && typeof result[Symbol.iterator] === 'function' && typeof result !== 'string') result = Array.from(result, templateText).join(args.length ? String(args[0]) : ', ');
    else if (name === 'slice') {
      const source = Array.isArray(result) ? result : text();
      const start = Number.isFinite(Number(args[0])) ? Number(args[0]) : 0;
      const end = args.length > 1 && Number.isFinite(Number(args[1])) ? Number(args[1]) : undefined;
      result = source.slice(start, end);
    } else if (name === 'length') result = result != null && Number.isFinite(result.length) ? result.length : text().length;
    else if (name === 'json') result = JSON.stringify(result) ?? '';
    else if (name === 'default' && (result == null || result === '')) result = args.length ? args[0] : '';
  }
  return templateText(result);
}

function renderTextTemplate(template, resolveSlot, appEmojis = []) {
  const pattern = /(\\)?(\{\{\s*([^{}]+?)\s*\}\})/g;
  return String(template ?? '').replace(pattern, (_match, escaped, token, expression) => {
    if (escaped) return `\\${token}`;
    const parts = splitTemplatePipeline(expression);
    const base = parts[0];
    const name = /^([A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/.exec(base)?.[1];
    if (name?.toLowerCase().startsWith('e_')) {
      const emojiName = name.slice(2).toLowerCase();
      const emoji = appEmojis instanceof Map ? appEmojis.get(emojiName) : appEmojis.find?.((item) => item?.name?.toLowerCase() === emojiName);
      if (emoji?.id && emoji.name) return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
    }
    const evaluated = evaluateTemplateExpression(base, resolveSlot);
    let value = evaluated.value;
    const transforms = parts.slice(1).filter(Boolean);
    if (!evaluated.found && !transforms.some((item) => /^default\s*\(/i.test(item))) return token;
    return applyTemplateTransforms(value, transforms);
  });
}

function buildDiscordComponents(rows = [], renderText = (value) => value) {
  const styles = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
  const selectTypes = { string_select: 3, user_select: 5, role_select: 6, mentionable_select: 7, channel_select: 8 };
  return (Array.isArray(rows) ? rows : []).filter((row) => Array.isArray(row.components) && row.components.length).slice(0, 5).map((row) => ({
    type: 1,
    components: row.components.slice(0, 5).map((component) => selectTypes[component.type] ? {
      type: selectTypes[component.type],
      custom_id: String(renderText(String(component.customId || ''))).slice(0, 100),
      ...(component.placeholder ? { placeholder: String(renderText(String(component.placeholder))).slice(0, 150) } : {}),
      min_values: Math.max(0, Math.min(25, Number(component.minValues) || 0)),
      max_values: Math.max(1, Math.min(25, Number(component.maxValues) || 1)),
      ...(component.type === 'string_select' ? { options: (Array.isArray(component.options) ? component.options : []).slice(0, 25).map((option) => ({
        label: String(renderText(String(option.label || ''))).slice(0, 100), value: String(renderText(String(option.value || ''))).slice(0, 100),
        ...(option.description ? { description: String(renderText(String(option.description))).slice(0, 100) } : {}),
        ...(option.emoji ? { emoji: parseEmoji(option.emoji) } : {})
      })) } : {}),
      ...(component.type === 'channel_select' && Array.isArray(component.channelTypes) && component.channelTypes.length ? { channel_types: component.channelTypes.slice(0, 8).map(Number).filter(Number.isInteger) } : {})
    } : {
      type: 2, style: styles[component.style] || 1,
      label: String(renderText(String(component.label || ''))).slice(0, 80),
      ...(component.emoji ? { emoji: parseEmoji(component.emoji) } : {}),
      ...(component.style === 'link' ? { url: String(renderText(String(component.url || ''))).slice(0, 512) } : { custom_id: String(renderText(String(component.customId || ''))).slice(0, 100) }),
      disabled: component.style === 'link' ? false : Boolean(component.disabled)
    })
  }));
}

function buildDiscordModal(config, renderText = (value) => value) {
  const modal = config && typeof config === 'object' ? config : {};
  const customId = String(renderText(String(modal.customId || ''))).trim();
  const title = String(renderText(String(modal.title || ''))).trim();
  const fields = Array.isArray(modal.components) ? modal.components : [];
  if (!customId || customId.length > 100) throw new Error('Popup Modal needs a custom ID from 1 to 100 characters.');
  if (!title || title.length > 45) throw new Error('Popup Modal title must be from 1 to 45 characters.');
  if (fields.length < 1 || fields.length > 5) throw new Error('Popup Modal must have 1–5 fields.');
  const ids = new Set();
  const optionsFor = (field, max) => {
    const options = Array.isArray(field.options) ? field.options : [];
    if (options.length < 1 || options.length > max) throw new Error(`${field.type === 'string_select' ? 'String select' : 'Checkbox or radio group'} needs 1–${max} options.`);
    const values = new Set();
    return options.map((option) => {
      const label = String(renderText(String(option.label || ''))).trim();
      const value = String(renderText(String(option.value || ''))).trim();
      if (!label || label.length > 100 || !value || value.length > 100 || values.has(value)) throw new Error('Modal option labels and values must be unique, non-empty, and at most 100 characters.');
      values.add(value);
      return { label, value, ...(option.description ? { description: String(renderText(String(option.description))).slice(0, 100) } : {}) };
    });
  };
  const components = fields.map((field) => {
    const fieldId = String(renderText(String(field.customId || ''))).trim();
    const label = String(renderText(String(field.label || ''))).trim();
    const description = field.description ? String(renderText(String(field.description))).trim() : '';
    if (!fieldId || fieldId.length > 100 || ids.has(fieldId)) throw new Error('Each modal field needs a unique custom ID from 1 to 100 characters.');
    ids.add(fieldId);
    if (!label || label.length > 45) throw new Error('Modal field labels must be from 1 to 45 characters.');
    if (description.length > 100) throw new Error('Modal field descriptions can be at most 100 characters.');
    const type = field.type || 'text';
    let component;
    if (type === 'text') {
      const maxLength = Number(field.maxLength ?? 4000);
      const minLength = Number(field.minLength ?? 0);
      if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 4000 || !Number.isInteger(minLength) || minLength < 0 || minLength > maxLength) throw new Error('Text input length must be between 0 and 4,000 characters.');
      component = { type: 4, custom_id: fieldId, style: Number(field.style) === 2 ? 2 : 1, min_length: minLength, max_length: maxLength, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 100) } : {}),
        ...(field.value != null && field.value !== '' ? { value: String(renderText(String(field.value))).slice(0, maxLength) } : {}) };
    } else if (type === 'string_select') {
      const options = optionsFor(field, 25);
      const maxValues = Math.max(1, Math.min(options.length, Number(field.maxValues) || 1));
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: 3, custom_id: fieldId, options, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 150) } : {}) };
    } else if (['user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(type)) {
      const componentType = { user_select: 5, role_select: 6, mentionable_select: 7, channel_select: 8 }[type];
      const maxValues = Math.max(1, Math.min(25, Number(field.maxValues) || 1));
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: componentType, custom_id: fieldId, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 150) } : {}),
        ...(type === 'channel_select' && Array.isArray(field.channelTypes) ? { channel_types: field.channelTypes.slice(0, 8).map(Number).filter(Number.isInteger) } : {}) };
    } else if (type === 'checkbox') {
      component = { type: 23, custom_id: fieldId, ...(field.defaultChecked ? { default: true } : {}) };
    } else if (type === 'file_upload') {
      const maxValues = Math.max(1, Math.min(10, Number(field.maxValues) || 1));
      const requestedFileTypes = Array.isArray(field.fileTypes) ? [...new Set(field.fileTypes.map((item) => String(item).trim().toLowerCase()).filter(Boolean))] : [];
      if (requestedFileTypes.length > 10 || requestedFileTypes.some((item) => !/^(image|video|audio|\.[a-z0-9]{1,16})$/.test(item))) throw new Error('File type filters must be image, video, audio, or a file extension such as .pdf (up to 10).');
      const fileTypes = requestedFileTypes;
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: 19, custom_id: fieldId, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false, ...(fileTypes.length ? { file_types: fileTypes } : {}) };
    } else if (type === 'checkbox_group' || type === 'radio_group') {
      const options = optionsFor(field, 10);
      if (type === 'radio_group' && options.length < 2) throw new Error('Radio groups need at least two options.');
      const maxValues = Math.max(1, Math.min(options.length, Number(field.maxValues) || options.length));
      component = { type: type === 'checkbox_group' ? 22 : 21, custom_id: fieldId, options, required: field.required !== false,
        ...(type === 'checkbox_group' ? { min_values: Math.min(maxValues, field.required === false ? Math.max(0, Number(field.minValues) || 0) : Math.max(1, Number(field.minValues) || 0)), max_values: maxValues } : {}) };
    } else throw new Error(`Unsupported modal field type: ${type}`);
    return { type: 18, label, ...(description ? { description } : {}), component };
  });
  return { custom_id: customId, title, components };
}

function findModalSubmittedValue(components, customId) {
  const visit = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      const component = item?.component || item;
      if (component?.custom_id === customId) return { found: true, value: component.values ?? component.value ?? null };
      const nested = visit(item?.components || component?.components || []);
      if (nested.found) return nested;
    }
    return { found: false, value: null };
  };
  return visit(components);
}

function getNodeArgumentPins(node, connections = []) {
  const baseInputs = NodeDefinitions[node?.type]?.inputs || [];
  if (!node || node.type.startsWith('event_') || ['function_input', 'function_return', 'function_call', 'variable_get', 'data_permission_overwrites'].includes(node.type)) return [];
  if (NodeDefinitions[node.type]?.pluginAdapter) return [];
  if (!['build_embed', 'build_modal', 'format_text'].includes(node.type) && !baseInputs.some((pin) => pin.type === 'string')) return [];
  const highestConnectedArgument = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const match = /^arg_(\d+)$/.exec(connection.targetPinId);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const count = Math.min(50, Math.max(1, highestConnectedArgument + 1));
  return Array.from({ length: count }, (_, index) => ({ id: `arg_${index + 1}`, label: `arg${index + 1}`, type: 'arg', defaultValue: '' }));
}

function getPermissionOverwritePins(node, connections = []) {
  const highestConnectedTarget = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node?.id) return highest;
    const match = /^target_id_(\d+)$/.exec(connection.targetPinId);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const existingTargetCount = Object.keys(node?.data || {}).reduce((highest, key) => Math.max(highest, Number(/^target_id_(\d+)$/.exec(key)?.[1]) || 0), 0);
  const count = Math.min(100, Math.max(1, Number(node?.data?.overwriteCount) || 0, existingTargetCount, highestConnectedTarget + 1));
  return Array.from({ length: count }, (_, index) => ({ id: `target_id_${index + 1}`, label: `Target ID ${index + 1}`, type: 'string', defaultValue: '' }));
}

function getNodeInputs(node, connections = []) {
  if (node?.type === 'math_sum' || node?.type === 'math_average') {
    const pinIds = ['a', 'b', 'c', 'd'];
    const highest = connections.reduce((value, wire) => {
      if (wire.targetNodeId !== node.id) return value;
      const index = pinIds.indexOf(wire.targetPinId);
      const extra = /^value_(\d+)$/.exec(wire.targetPinId);
      return Math.max(value, index >= 0 ? index + 1 : extra ? Number(extra[1]) : 0);
    }, 0);
    return Array.from({ length: Math.min(50, Math.max(2, highest + 1)) }, (_, index) => ({ id: pinIds[index] || `value_${index + 1}`, label: index < 4 ? String.fromCharCode(65 + index) : `Value ${index + 1}`, type: 'number', defaultValue: 0 }));
  }
  if (node?.type === 'data_array_create') {
    const highest = connections.reduce((value, wire) => {
      if (wire.targetNodeId !== node.id) return value;
      return Math.max(value, Number(/^item_(\d+)$/.exec(wire.targetPinId)?.[1]) || 0);
    }, 0);
    const stored = Object.keys(node.data || {}).reduce((value, key) => Math.max(value, Number(/^item_(\d+)$/.exec(key)?.[1]) || 0), 0);
    return Array.from({ length: Math.min(50, Math.max(1, highest + 1, stored)) }, (_, index) => ({ id: `item_${index + 1}`, label: `Item ${index + 1}`, type: 'arg', defaultValue: null }));
  }
  if (node?.type === 'data_array_append') {
    const highest = connections.reduce((value, wire) => {
      if (wire.targetNodeId !== node.id) return value;
      return Math.max(value, Number(/^item_(\d+)$/.exec(wire.targetPinId)?.[1]) || 0);
    }, 0);
    const stored = Object.keys(node.data || {}).reduce((value, key) => Math.max(value, Number(/^item_(\d+)$/.exec(key)?.[1]) || 0), 0);
    const pins = Array.from({ length: Math.min(50, Math.max(1, highest + 1, stored)) }, (_, index) => ({ id: `item_${index + 1}`, label: `Item ${index + 1}`, type: 'arg', defaultValue: undefined }));
    if (connections.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'value')) pins.push({ id: 'value', label: 'Item', type: 'arg', defaultValue: undefined });
    return [NodeDefinitions.data_array_append.inputs[0], ...pins];
  }
  if (node?.type === 'data_array_concat') {
    const highest = connections.reduce((value, wire) => {
      if (wire.targetNodeId !== node.id) return value;
      return Math.max(value, Number(/^array_(\d+)$/.exec(wire.targetPinId)?.[1]) || 0);
    }, 0);
    const pins = Array.from({ length: Math.min(50, Math.max(2, highest + 1)) }, (_, index) => ({ id: `array_${index + 1}`, label: `Array ${index + 1}`, type: 'object', defaultValue: [] }));
    if (connections.some((wire) => wire.targetNodeId === node.id && ['array_a', 'array_b'].includes(wire.targetPinId))) {
      pins.push({ id: 'array_a', label: 'Array A', type: 'object', defaultValue: [] }, { id: 'array_b', label: 'Array B', type: 'object', defaultValue: [] });
    }
    return pins;
  }
  if (node?.type === 'data_permission_overwrites') return getPermissionOverwritePins(node, connections);
  if (node?.type === 'utility_wire_extender') {
    const highest = connections.reduce((value, wire) => {
      const match = wire.targetNodeId === node.id
        ? /^value_in_(\d+)$/.exec(wire.targetPinId)
        : wire.sourceNodeId === node.id ? /^value_out_(\d+)$/.exec(wire.sourcePinId) : null;
      const legacy = (wire.targetNodeId === node.id && wire.targetPinId === 'value_in') || (wire.sourceNodeId === node.id && wire.sourcePinId === 'value_out');
      return match ? Math.max(value, Number(match[1])) : legacy ? Math.max(value, 1) : value;
    }, 0);
    const legacyFirst = connections.some((wire) => (wire.targetNodeId === node.id && wire.targetPinId === 'value_in') || (wire.sourceNodeId === node.id && wire.sourcePinId === 'value_out'));
    return Array.from({ length: Math.min(7, Math.max(1, highest + 1)) }, (_, index) => ({ id: legacyFirst && index === 0 ? 'value_in' : `value_in_${index + 1}`, label: `Any Value ${index + 1}`, type: 'any' }));
  }
  return NodeDefinitions[node?.type]?.inputs || [];
}

function getNodeOutputs(node, connections = []) {
  if (node?.type === 'event_slash_command') {
    const options = (Array.isArray(node.data?.options) ? node.data.options : []).filter((option) => /^[a-z0-9_-]{1,32}$/.test(String(option.name || '')));
    return [...(NodeDefinitions[node.type]?.outputs || []), ...options.map((option) => ({ id: `option_${option.name}`, label: option.name, type: ({ 4: 'number', 10: 'number', 5: 'boolean' })[Number(option.type)] || 'string' }))];
  }
  if (node?.type === 'data_string_split' || node?.type === 'data_parse_prefix_command') {
    const prefix = node.type === 'data_string_split' ? 'part_' : 'argument_';
    const pattern = node.type === 'data_string_split' ? /^part_(\d+)$/ : /^argument_(\d+)$/;
    const highest = connections.reduce((value, wire) => {
      if (wire.sourceNodeId !== node.id) return value;
      return Math.max(value, Number(pattern.exec(wire.sourcePinId)?.[1]) || 0);
    }, 0);
    const itemCount = Math.min(50, Math.max(1, highest + 1));
    const itemPins = Array.from({ length: itemCount }, (_, index) => ({
      id: `${prefix}${index + 1}`,
      label: node.type === 'data_string_split' ? `Part ${index + 1}` : `Argument ${index + 1}`,
      type: 'string'
    }));
    return [...(NodeDefinitions[node.type]?.outputs || []), ...itemPins];
  }
  if (node?.type !== 'utility_wire_extender') return NodeDefinitions[node?.type]?.outputs || [];
  const highest = connections.reduce((value, wire) => {
    const match = wire.sourceNodeId === node.id
      ? /^value_out_(\d+)$/.exec(wire.sourcePinId)
      : wire.targetNodeId === node.id ? /^value_in_(\d+)$/.exec(wire.targetPinId) : null;
    const legacy = (wire.sourceNodeId === node.id && wire.sourcePinId === 'value_out') || (wire.targetNodeId === node.id && wire.targetPinId === 'value_in');
    return match ? Math.max(value, Number(match[1])) : legacy ? Math.max(value, 1) : value;
  }, 0);
  const legacyFirst = connections.some((wire) => (wire.sourceNodeId === node.id && wire.sourcePinId === 'value_out') || (wire.targetNodeId === node.id && wire.targetPinId === 'value_in'));
  return [...(NodeDefinitions[node.type]?.outputs || []).filter((pin) => pin.type === 'exec'), ...Array.from({ length: Math.min(7, Math.max(1, highest + 1)) }, (_, index) => ({ id: legacyFirst && index === 0 ? 'value_out' : `value_out_${index + 1}`, label: `Any Value ${index + 1}`, type: 'any' }))];
}

export class GraphRunner {
  /**
   * Execute a graph for a specific Discord event
   * @param {object} graph - { nodes: [], connections: [] }
   * @param {string} eventName - e.g. 'MESSAGE_CREATE'
   * @param {object} eventPayload - event data
   * @param {object} context - { rest, client, log }
   * @returns {Promise<{ executedNodeIds: string[], traces: string[], error: any }>}
   */
  static async execute(graph, eventName, eventPayload, context) {
    const { nodes = [], connections = [] } = graph;
    const interactionState = context.interactionState || {
      applicationId: eventPayload?.application_id || '',
      acknowledged: false,
      deferred: false,
      pending: null
    };
    const executedNodeIds = [];
    const traces = [];
    const debugSteps = [];
    const repeatLoopStack = [];
    const recordExecutedNode = (nodeId) => {
      executedNodeIds.push(nodeId);
      if (executedNodeIds.length > 500) executedNodeIds.shift();
    };
    const dataCache = new Map(); // `${nodeId}:${pinId}` -> value
    const graphVariables = Array.isArray(graph.variables) ? graph.variables.filter((variable) => variable && typeof variable.id === 'string') : [];
    const projectVariables = Array.isArray(context.projectVariables) ? context.projectVariables.filter((variable) => variable && typeof variable.id === 'string') : [];
    const localVariableDefinitions = new Map(graphVariables.map((variable) => [variable.id, variable]));
    const projectVariableDefinitions = new Map(projectVariables.map((variable) => [variable.id, variable]));
    const persistentVariableValues = context.variablesState instanceof Map ? context.variablesState : new Map();
    const runVariableValues = new Map();
    const projectVariableValues = context.projectVariablesState instanceof Map ? context.projectVariablesState : new Map();
    const initializeVariableValues = (definitions, values, runValues = null) => {
      for (const variable of definitions.values()) {
        if (runValues && variable.persist === false) {
          const initialValue = coerceVariableValue(variable.initialValue, variable.valueType || variable.type, variable.initialValue);
          runValues.set(variable.id, initialValue);
          values.set(variable.id, initialValue);
          continue;
        }
        const current = values.has(variable.id) ? values.get(variable.id) : variable.initialValue;
        values.set(variable.id, coerceVariableValue(current, variable.valueType || variable.type, variable.initialValue));
      }
      for (const variableId of values.keys()) if (!definitions.has(variableId)) values.delete(variableId);
    };
    initializeVariableValues(localVariableDefinitions, persistentVariableValues, runVariableValues);
    initializeVariableValues(projectVariableDefinitions, projectVariableValues);
    const getVariableValue = (variableId, scope = 'graph') => {
      if (scope === 'project') return projectVariableValues.get(variableId);
      const definition = localVariableDefinitions.get(variableId);
      return (definition?.persist === false ? runVariableValues : persistentVariableValues).get(variableId);
    };
    const setVariableValue = (variableId, scope, value, definition) => {
      const values = scope === 'project' ? projectVariableValues : definition?.persist === false ? runVariableValues : persistentVariableValues;
      const fallback = values.get(variableId);
      values.set(variableId, coerceVariableValue(value, definition?.valueType || definition?.type, fallback ?? definition?.initialValue));
      return values.get(variableId);
    };

    const log = (msg) => {
      const loop = repeatLoopStack.at(-1);
      if (loop && loop.iteration > 1) {
        const now = Date.now();
        if (now - loop.lastLogAt < 30_000) return;
        loop.lastLogAt = now;
      } else if (loop) {
        loop.lastLogAt = Date.now();
      }
      traces.push(msg);
      if (traces.length > 2000) traces.shift();
      if (context.log) context.log(msg);
    };

    const debugValue = (value, pinId = '') => {
      if (/(token|secret|passphrase|password|ciphertext|headers|response_body|^body$|^json$|^url$)/i.test(pinId)) return '[redacted]';
      if (typeof value === 'string') return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
      if (value === null || ['number', 'boolean'].includes(typeof value)) return value;
      try {
        const encoded = JSON.stringify(value);
        return encoded.length > 4000 ? `${encoded.slice(0, 4000)}…` : JSON.parse(encoded);
      } catch { return '[unavailable]'; }
    };
    const recordDebugStep = async (node, inputs = [], status = 'completed', error = '') => {
      if (!context.debug) return;
      const outputs = getNodeOutputs(node, connections).filter((pin) => pin.type !== 'exec').flatMap((pin) => {
        const key = `${node.id}:${pin.id}`;
        const resolved = dataCache.has(key) ? dataCache.get(key) : resolveOutput(node, pin.id);
        return resolved !== undefined ? [{ pinId: pin.id, label: pin.label || pin.id, value: debugValue(resolved, pin.id) }] : [];
      });
      const step = { nodeId: node.id, type: node.type, label: node.label || NodeDefinitions[node.type]?.label || node.type, status, inputs, outputs, ...(error ? { error } : {}) };
      debugSteps.push(step);
      if (debugSteps.length > 500) debugSteps.shift();
      await context.onDebugStep?.(step);
    };

    const findInputConnection = (nodeId, pinId) => {
      return connections.find((c) => c.targetNodeId === nodeId && c.targetPinId === pinId);
    };

    const resolveMessageFiles = (node, connectedFiles) => {
      const embedWire = findInputConnection(node.id, 'embed');
      const embedNode = embedWire && nodes.find((item) => item.id === embedWire.sourceNodeId);
      const files = [...(Array.isArray(connectedFiles) ? connectedFiles : []), ...(Array.isArray(node.data?.attachments) ? node.data.attachments : []), ...(Array.isArray(embedNode?.data?.attachments) ? embedNode.data.attachments : [])];
      const unique = new Map();
      for (const file of files) if (file?.filename && file?.data) unique.set(String(file.filename).toLowerCase(), file);
      return [...unique.values()];
    };

    const findExecOutputs = (nodeId, pinId = 'exec') => {
      return connections.filter((c) => c.sourceNodeId === nodeId && c.sourcePinId === pinId);
    };

    const invalidateDataDependencies = (nodeId, pinId, seen = new Set()) => {
      const key = `${nodeId}:${pinId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const source = nodes.find((item) => item.id === nodeId);
      if (!source) return;
      if (['variable_get', 'function_call', 'format_text', 'build_embed', 'build_modal', 'data_get_modal_value', 'modify_embed'].includes(source.type)
        || source.type.startsWith('math_') || source.type.startsWith('logic_') || source.type.startsWith('data_') || source.type.startsWith('value_') || source.type === 'compare_text') {
        for (const cacheKey of dataCache.keys()) if (cacheKey.startsWith(`${source.id}:`)) dataCache.delete(cacheKey);
      }
      for (const wire of connections.filter((item) => item.targetNodeId === source.id)) invalidateDataDependencies(wire.sourceNodeId, wire.sourcePinId, seen);
    };

    const resolveOutput = (sourceNode, pinId, seen = new Set()) => {
      if (!sourceNode) return undefined;
      if (sourceNode.type === 'utility_wire_extender' && (/^value_out_\d+$/.test(pinId) || pinId === 'value_out')) {
        const slot = pinId.match(/\d+$/)?.[0] || '1';
        const cacheKey = `${sourceNode.id}:${pinId}`;
        if (dataCache.has(cacheKey)) return dataCache.get(cacheKey);
        if (seen.has(cacheKey)) return undefined;
        seen.add(cacheKey);
        const value = resolveDataInput(sourceNode, slot === '1' && getNodeInputs(sourceNode, connections).some((pin) => pin.id === 'value_in') ? 'value_in' : `value_in_${slot}`, undefined, seen);
        dataCache.set(cacheKey, value);
        return value;
      }
      if (sourceNode.type === 'loop_count' && pinId === 'index') return dataCache.get(`${sourceNode.id}:index`);
      if (sourceNode.type === 'repeat_while' && pinId === 'iteration') return dataCache.get(`${sourceNode.id}:iteration`);
      if (sourceNode.type === 'variable_get') {
        return getVariableValue(sourceNode.data?.variableId, sourceNode.data?.scope);
      }
      if (sourceNode.type === 'function_input') {
        return sourceNode.data?.defaultValue ?? defaultValueForType(sourceNode.data?.valueType);
      }
      if (sourceNode.type === 'build_modal' && pinId === 'modal') {
        const modal = buildDiscordModal(sourceNode.data?.modal, (value) => renderNodeTemplate(sourceNode, value));
        dataCache.set(`${sourceNode.id}:modal`, modal);
        return modal;
      }
      if (sourceNode.type === 'data_get_modal_value') {
        const submitted = resolveDataInput(sourceNode, 'submitted_values', [], seen);
        const customId = String(resolveDataInput(sourceNode, 'custom_id', '', seen));
        const result = findModalSubmittedValue(submitted, customId);
        dataCache.set(`${sourceNode.id}:found`, result.found);
        dataCache.set(`${sourceNode.id}:value`, result.value);
        return result[pinId];
      }
      const cacheKey = `${sourceNode.id}:${pinId}`;
      if (dataCache.has(cacheKey)) return dataCache.get(cacheKey);
      if (seen.has(cacheKey)) return undefined;
      seen.add(cacheKey);

      if (sourceNode.type.startsWith('data_')) {
        const definition = NodeDefinitions[sourceNode.type];
        const inputs = Object.fromEntries(getNodeInputs(sourceNode, connections).map((pin) => [pin.id, resolveDataInput(sourceNode, pin.id, pin.defaultValue, seen)]));
        const result = evaluateDataNode(sourceNode.type, inputs, sourceNode.data || {});
        for (const [id, value] of Object.entries(result)) dataCache.set(`${sourceNode.id}:${id}`, value);
        return result[pinId];
      }

      if (sourceNode.type.startsWith('value_')) {
        const defaultValue = NodeDefinitions[sourceNode.type]?.inputs?.find((pin) => pin.id === 'value')?.defaultValue;
        const value = resolveDataInput(sourceNode, 'value', sourceNode.data?.value ?? defaultValue, seen);
        dataCache.set(cacheKey, value);
        return value;
      }
      if (sourceNode.type === 'compare_text') {
        const textA = String(resolveDataInput(sourceNode, 'text_a', sourceNode.data?.text_a || '', seen));
        const textB = String(resolveDataInput(sourceNode, 'text_b', sourceNode.data?.text_b || '', seen));
        const operator = sourceNode.data?.operator || 'equals';
        const comparisons = {
          equals: () => textA === textB,
          contains: () => textA.includes(textB),
          startsWith: () => textA.startsWith(textB),
          endsWith: () => textA.endsWith(textB)
        };
        const result = comparisons[operator]?.() || false;
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type === 'function_math') {
        const a = Number(resolveDataInput(sourceNode, 'a', 0, seen));
        const b = Number(resolveDataInput(sourceNode, 'b', 0, seen));
        const operation = sourceNode.data?.operation || 'add';
        const result = operation === 'subtract' ? a - b
          : operation === 'multiply' ? a * b
            : operation === 'divide' ? (b === 0 ? 0 : a / b)
              : operation === 'modulo' ? (b === 0 ? 0 : a % b) : a + b;
        const finite = Number.isFinite(result) ? result : 0;
        dataCache.set(cacheKey, finite);
        return finite;
      }
      if (sourceNode.type.startsWith('logic_')) {
        const definition = NodeDefinitions[sourceNode.type];
        const values = Object.fromEntries((definition?.inputs || []).map((pin) => [pin.id, Boolean(resolveDataInput(sourceNode, pin.id, pin.defaultValue, seen))]));
        const result = sourceNode.type === 'logic_xor_many' ? Object.entries(values).filter(([id, value]) => /^input_\d+$/.test(id) && value).length % 2 === 1
          : sourceNode.type === 'logic_and' ? values.a && values.b
          : sourceNode.type === 'logic_or' ? values.a || values.b
            : sourceNode.type === 'logic_xor' ? values.a !== values.b : !values.value;
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type.startsWith('math_')) {
        const inputs = Object.fromEntries((NodeDefinitions[sourceNode.type]?.inputs || []).map((pin) => [
          pin.id,
          resolveDataInput(sourceNode, pin.id, pin.defaultValue, seen)
        ]));
        const result = evaluateMathNode(sourceNode.type, inputs, sourceNode.data || {});
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type === 'function_call') {
        const targetGraph = context.resolveFunctionGraph?.(sourceNode.data?.graphId);
        if (!targetGraph) return undefined;
        const parameters = targetGraph.nodes.filter((node) => node.type === 'function_input');
        const missingParameter = parameters.find((parameter) => parameter.data?.optional === false
          && !connections.some((wire) => wire.targetNodeId === sourceNode.id && wire.targetPinId === `arg_${parameter.data?.paramId || parameter.id}`));
        if (missingParameter) throw new Error(`${targetGraph.name || 'Function'} requires an input for “${missingParameter.data?.name || 'Input'}”.`);
        const argumentValues = new Map(parameters.map((parameter) => {
          const parameterId = parameter.data?.paramId || parameter.id;
          const value = resolveDataInput(sourceNode, `arg_${parameterId}`, parameter.data?.defaultValue ?? defaultValueForType(parameter.data?.valueType), seen);
          return [parameterId, value];
        }));
        const result = evaluateFunctionGraph(targetGraph, argumentValues, {
          ...context,
          resolveFunctionVariable: (variableId, scope, functionGraph) => {
            if (scope === 'project') return getVariableValue(variableId, 'project');
            const definitions = new Map((functionGraph.variables || []).map((variable) => [variable.id, variable]));
            const state = context.getGraphVariableState?.(functionGraph) || (functionGraph.id === graph.id ? persistentVariableValues : new Map());
            initializeVariableValues(definitions, state);
            const variable = definitions.get(variableId);
            return variable?.persist === false
              ? coerceVariableValue(variable.initialValue, variable.valueType || variable.type, variable.initialValue)
              : state.get(variableId);
          }
        }, []);
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type === 'format_text') {
        const template = String(sourceNode.data?.template ?? '');
        const rendered = renderTextTemplate(template, (name) => {
          const argumentMatch = /^arg(\d+)$/i.exec(name);
          if (argumentMatch && Number(argumentMatch[1]) >= 1 && Number(argumentMatch[1]) <= 50 && findInputConnection(sourceNode.id, `arg_${Number(argumentMatch[1])}`)) return resolveDataInput(sourceNode, `arg_${Number(argumentMatch[1])}`, undefined, seen);
          const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase()) || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
          if (variable) return getVariableValue(variable.id, graphVariables.includes(variable) ? 'graph' : 'project');
          if (argumentMatch && Number(argumentMatch[1]) >= 1 && Number(argumentMatch[1]) <= 50) return resolveDataInput(sourceNode, `arg_${Number(argumentMatch[1])}`, undefined, seen);
          return resolveDataInput(sourceNode, `slot_${name}`, undefined, seen);
        }, context.appEmojis);
        dataCache.set(cacheKey, rendered);
        return rendered;
      }
      if (sourceNode.type === 'build_embed') {
        if (pinId === 'components') {
          const components = buildDiscordComponents(sourceNode.data?.components, (value) => renderNodeTemplate(sourceNode, value));
          dataCache.set(cacheKey, components);
          return components;
        }
        const embed = buildEmbedFromNode(sourceNode, seen);
        dataCache.set(cacheKey, embed);
        return embed;
      }
      if (sourceNode.type === 'modify_embed') {
        const baseEmbed = resolveDataInput(sourceNode, 'embed', null, seen) || {};
        let embed = {};
        try {
          embed = typeof baseEmbed === 'string' ? JSON.parse(baseEmbed) : JSON.parse(JSON.stringify(baseEmbed));
        } catch {
          embed = {};
        }
        if (typeof embed !== 'object' || embed === null) embed = {};

        const title = resolveDataInput(sourceNode, 'title', sourceNode.data?.title, seen);
        const description = resolveDataInput(sourceNode, 'description', sourceNode.data?.description, seen);
        const color = resolveDataInput(sourceNode, 'color', sourceNode.data?.color, seen);
        const imageUrl = resolveDataInput(sourceNode, 'image_url', sourceNode.data?.image_url, seen);
        const thumbnailUrl = resolveDataInput(sourceNode, 'thumbnail_url', sourceNode.data?.thumbnail_url, seen);
        const footerText = resolveDataInput(sourceNode, 'footer_text', sourceNode.data?.footer_text, seen);
        const authorName = resolveDataInput(sourceNode, 'author_name', sourceNode.data?.author_name, seen);
        const fieldName = resolveDataInput(sourceNode, 'field_name', sourceNode.data?.field_name, seen);
        const fieldValue = resolveDataInput(sourceNode, 'field_value', sourceNode.data?.field_value, seen);

        if (title !== undefined && title !== '') embed.title = String(title).slice(0, 256);
        if (description !== undefined && description !== '') embed.description = String(description).slice(0, 4096);
        if (color !== undefined && color !== '') {
          const num = typeof color === 'number' ? color : parseInt(String(color).replace('#', ''), 16);
          if (Number.isFinite(num)) embed.color = num;
        }
        if (imageUrl) embed.image = { url: String(imageUrl) };
        if (thumbnailUrl) embed.thumbnail = { url: String(thumbnailUrl) };
        if (footerText) embed.footer = { text: String(footerText).slice(0, 2048) };
        if (authorName) embed.author = { name: String(authorName).slice(0, 256) };
        if (fieldName && fieldValue) {
          if (!Array.isArray(embed.fields)) embed.fields = [];
          const existing = embed.fields.find((f) => f.name === fieldName);
          if (existing) {
            existing.value = String(fieldValue).slice(0, 1024);
          } else {
            embed.fields.push({ name: String(fieldName).slice(0, 256), value: String(fieldValue).slice(0, 1024), inline: Boolean(sourceNode.data?.field_inline) });
          }
        }
        dataCache.set(cacheKey, embed);
        return embed;
      }
      if (sourceNode.type === 'modify_components') {
        const raw = resolveDataInput(sourceNode, 'components', sourceNode.data?.components, seen);
        let rows = [];
        try {
          rows = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : []);
        } catch {
          rows = [];
        }
        const targetCustomId = String(resolveDataInput(sourceNode, 'custom_id', sourceNode.data?.custom_id ?? '', seen)).trim();
        const disabledVal = resolveDataInput(sourceNode, 'disabled', sourceNode.data?.disabled, seen);
        const newLabel = resolveDataInput(sourceNode, 'label', sourceNode.data?.label, seen);
        const newStyle = resolveDataInput(sourceNode, 'style', sourceNode.data?.style, seen);
        const newEmoji = resolveDataInput(sourceNode, 'emoji', sourceNode.data?.emoji, seen);

        for (const row of rows) {
          const comps = row.components || [];
          for (const comp of comps) {
            const currentId = comp.custom_id || comp.customId;
            const matchesId = !targetCustomId || targetCustomId.toLowerCase() === 'all' || currentId === targetCustomId;
            if (matchesId) {
              if (disabledVal !== undefined && disabledVal !== '') {
                if (comp.style !== 5 && comp.style !== 'link') {
                  comp.disabled = Boolean(disabledVal);
                }
              }
              if (newLabel !== undefined && newLabel !== '') {
                comp.label = String(newLabel).slice(0, 80);
              }
              if (newEmoji !== undefined && newEmoji !== '') {
                comp.emoji = parseEmoji(newEmoji);
              }
              if (newStyle !== undefined && newStyle !== '') {
                const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
                if (typeof comp.style === 'number') {
                  comp.style = styleMap[newStyle] || Number(newStyle) || comp.style;
                } else {
                  comp.style = newStyle;
                }
              }
            }
          }
        }
        const result = buildDiscordComponents(rows);
        dataCache.set(cacheKey, result);
        return result;
      }
      return undefined;
    };

    function resolveDataInput(node, pinId, defaultValue, seen = new Set()) {
      const conn = findInputConnection(node.id, pinId);
      let value;
      if (conn) {
        const upstreamNode = nodes.find((n) => n.id === conn.sourceNodeId);
        value = resolveOutput(upstreamNode, conn.sourcePinId, seen);
        if (value !== undefined) return value;
      }
      value = node.data?.[pinId] ?? defaultValue;
      if (typeof value !== 'string' || /^arg_\d+$/.test(pinId)) return value;
      return renderTextTemplate(value, (name) => {
        const argumentMatch = /^arg(\d+)$/i.exec(name);
        if (argumentMatch) {
          const argumentIndex = Number(argumentMatch[1]);
          if (argumentIndex < 1 || argumentIndex > 50) return undefined;
          const key = `${node.id}:arg_${argumentIndex}`;
          if (findInputConnection(node.id, `arg_${argumentIndex}`)) {
            if (seen.has(key)) return undefined;
            return resolveDataInput(node, `arg_${argumentIndex}`, undefined, new Set(seen).add(key));
          }
        }
        const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase())
          || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
        if (variable) return getVariableValue(variable.id, graphVariables.includes(variable) ? 'graph' : 'project');
        if (argumentMatch) {
          const argumentIndex = Number(argumentMatch[1]);
          if (argumentIndex < 1 || argumentIndex > 50) return undefined;
          const key = `${node.id}:arg_${argumentIndex}`;
          if (seen.has(key)) return undefined;
          return resolveDataInput(node, `arg_${argumentIndex}`, undefined, new Set(seen).add(key));
        }
        return undefined;
      }, context.appEmojis);
    }

    function renderNodeTemplate(node, value) {
      return renderTextTemplate(value, (name) => {
        const argumentMatch = /^arg(\d+)$/i.exec(name);
        if (argumentMatch) return resolveDataInput(node, `arg_${Number(argumentMatch[1])}`, undefined);
        const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase())
          || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
        if (variable) return getVariableValue(variable.id, graphVariables.includes(variable) ? 'graph' : 'project');
        return resolveDataInput(node, `slot_${name}`, undefined);
      }, context.appEmojis);
    }

    function resolveMessageComponents(node) {
      if (!findInputConnection(node.id, 'components')) return buildDiscordComponents(node.data?.components, (value) => renderNodeTemplate(node, value));
      const renderNested = (value) => typeof value === 'string' ? renderNodeTemplate(node, value)
        : Array.isArray(value) ? value.map(renderNested)
          : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, renderNested(nested)])) : value;
      return renderNested(resolveDataInput(node, 'components', []));
    }

    function buildEmbedFromNode(embedNode, seen = new Set()) {
      if (Array.isArray(embedNode.data?.blocks)) {
        const builder = new EmbedBuilder();
        const embedBlocks = embedNode.data.blocks.filter((block) => block && typeof block.id === 'string');
        const hasFooterBlock = embedBlocks.some((block) => block.type === 'footer');
        const hasColorBlock = embedBlocks.some((block) => block.type === 'color');
        if (!hasColorBlock) builder.setColor('#5865F2');
        const readBlock = (block, key) => resolveDataInput(embedNode, `block_${block.id}_${key}`, block[key] || '', seen);
        for (const block of embedBlocks) {
          if (block.type === 'title') {
            const value = String(readBlock(block, 'value') ?? '');
            if (value) builder.setTitle(value);
          } else if (block.type === 'description') {
            const value = String(readBlock(block, 'value') ?? '');
            if (value) builder.setDescription(value);
          } else if (block.type === 'url') {
            const url = safeEmbedUrl(readBlock(block, 'url'));
            if (url) builder.setURL(url);
          } else if (block.type === 'timestamp' && hasFooterBlock) {
            const timestamp = block.now ? new Date() : readBlock(block, 'value');
            if (timestamp) {
              const date = new Date(timestamp);
              if (!Number.isNaN(date.getTime())) builder.setTimestamp(date);
            }
          } else if (block.type === 'color') {
            const color = readBlock(block, 'value');
            if (/^#?[0-9a-f]{6}$/i.test(String(color))) builder.setColor(color);
          } else if (block.type === 'author') {
            const name = String(readBlock(block, 'name') ?? '');
            if (name) builder.setAuthor({ name, url: safeEmbedUrl(readBlock(block, 'url')) || undefined, iconURL: safeEmbedUrl(readBlock(block, 'icon')) || undefined });
          } else if (block.type === 'footer') {
            const text = String(readBlock(block, 'text') ?? '');
            if (text) builder.setFooter({ text, iconURL: safeEmbedUrl(readBlock(block, 'icon')) || undefined });
          } else if (block.type === 'thumbnail' || block.type === 'image') {
            const url = safeEmbedUrl(readBlock(block, 'url'), true);
            if (url) block.type === 'image' ? builder.setImage(url) : builder.setThumbnail(url);
          } else if (block.type === 'field' && (builder.toJSON().fields || []).length < 25) {
            const name = String(readBlock(block, 'name') ?? '');
            const value = String(readBlock(block, 'value') ?? '');
            if (name || value) builder.addField(String(name || '\u200b').slice(0, 256), String(value || '\u200b').slice(0, 1024), Boolean(block.inline));
          }
        }
        return limitEmbedText(builder.toJSON());
      }
      const input = (pinId, fallback = '') => resolveDataInput(embedNode, pinId, embedNode.data?.[pinId] ?? fallback, seen);
      const title = input('title');
      const description = input('description');
      const url = input('url');
      const color = input('color', '#5865F2');
      const authorName = input('author_name');
      const authorUrl = input('author_url');
      const authorIcon = input('author_icon');
      const footer = input('footer_text');
      const footerIcon = input('footer_icon');
      const thumbnailUrl = input('thumbnail_url');
      const imageUrl = input('image_url');

      const builder = new EmbedBuilder();
      if (title) builder.setTitle(title);
      if (description) builder.setDescription(description);
      if (url) builder.setURL(url);
      if (/^#?[0-9a-f]{6}$/i.test(String(color))) builder.setColor(color);
      if (authorName) builder.setAuthor({ name: authorName, url: authorUrl || undefined, iconURL: authorIcon || undefined });
      if (footer) builder.setFooter({ text: footer, iconURL: footerIcon || undefined });
      const safeThumbnailUrl = safeEmbedUrl(thumbnailUrl, true);
      const safeImageUrl = safeEmbedUrl(imageUrl, true);
      if (safeThumbnailUrl) builder.setThumbnail(safeThumbnailUrl);
      if (safeImageUrl) builder.setImage(safeImageUrl);
      const fields = Array.isArray(embedNode.data?.fields) ? embedNode.data.fields.filter((field) => field && typeof field.id === 'string') : [];
      for (const field of fields.slice(0, 25)) {
        const name = input(`field_${field.id}_name`, field.name || '');
        const value = input(`field_${field.id}_value`, field.value || '');
        if (name || value) builder.addField(name || '\u200b', value || '\u200b', field.inline);
      }
      return limitEmbedText(builder.toJSON());
    }

    const normalizedEvent = ['SLASH_COMMAND', 'BUTTON_CLICK', 'SELECT_MENU', 'MODAL_SUBMIT'].includes(eventName) ? 'INTERACTION_CREATE' : eventName;
    const startNode = nodes.find((node) => {
      const definition = NodeDefinitions[node.type];
      if (definition?.gatewayEvent !== normalizedEvent) return false;
      if (node.type === 'event_cron' && eventPayload?.cronNodeId && node.id !== eventPayload.cronNodeId) return false;
      if (definition.gatewayInteractionType && Number(eventPayload.type) !== definition.gatewayInteractionType) return false;
      if (definition.gatewayCommandType && Number(eventPayload.data?.type || 1) !== definition.gatewayCommandType) return false;
      if (definition.gatewayComponentTypes && !definition.gatewayComponentTypes.includes(Number(eventPayload.data?.component_type))) return false;
      return true;
    });
    const eventNodeType = startNode?.type;
    if (!startNode) {
      log(`[Graph] No active event node found for event "${eventName}". Skipping.`);
      return { executedNodeIds, traces, error: null };
    }
    if (eventNodeType === 'event_slash_command') {
      const expectedCommand = String(startNode.data?.commandName || '').trim().toLowerCase();
      const receivedCommand = String(eventPayload.data?.name || '').trim().toLowerCase();
      if (expectedCommand && expectedCommand !== receivedCommand) {
        log(`[Graph] Command /${receivedCommand} does not match /${expectedCommand}. Skipping.`);
        return { executedNodeIds, traces, error: null };
      }
    }

    recordExecutedNode(startNode.id);
    log(`[Graph] Triggered event node: ${startNode.label || startNode.type} (${startNode.id})`);

    if (eventNodeType === 'event_message_create') {
      dataCache.set(`${startNode.id}:content`, eventPayload.content || '');
      dataCache.set(`${startNode.id}:author_id`, eventPayload.author?.id || '');
      dataCache.set(`${startNode.id}:author_name`, eventPayload.author?.username || '');
      dataCache.set(`${startNode.id}:channel_id`, eventPayload.channel_id || '');
      dataCache.set(`${startNode.id}:is_bot`, Boolean(eventPayload.author?.bot));
      dataCache.set(`${startNode.id}:has_mentions`, Array.isArray(eventPayload.mentions) && eventPayload.mentions.length > 0);
      dataCache.set(`${startNode.id}:is_reply`, Boolean(eventPayload.message_reference?.message_id));
    } else if (eventNodeType === 'event_slash_command') {
      const cmdName = eventPayload.data?.name || '';
      const userId = eventPayload.member?.user?.id || eventPayload.user?.id || '';
      const channelId = eventPayload.channel_id || '';
      dataCache.set(`${startNode.id}:command_name`, cmdName);
      dataCache.set(`${startNode.id}:user_id`, userId);
      dataCache.set(`${startNode.id}:username`, eventPayload.member?.user?.global_name || eventPayload.member?.user?.username || eventPayload.user?.global_name || eventPayload.user?.username || '');
      dataCache.set(`${startNode.id}:channel_id`, channelId);
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
      const commandOptions = {};
      const flattenOptions = (options = []) => {
        for (const option of options) {
          if (Array.isArray(option.options)) flattenOptions(option.options);
          else if (option.name) commandOptions[option.name] = option.value ?? option.user ?? option.channel ?? option.role ?? option.attachment ?? null;
        }
      };
      flattenOptions(eventPayload.data?.options || []);
      dataCache.set(`${startNode.id}:options`, commandOptions);
      for (const [name, value] of Object.entries(commandOptions)) dataCache.set(`${startNode.id}:option_${name}`, value);
    } else if (eventNodeType === 'event_slash_autocomplete') {
      const commandOptions = {};
      let focused = null;
      const flattenOptions = (options = []) => {
        for (const option of options) {
          if (option.focused) focused = option;
          if (Array.isArray(option.options)) flattenOptions(option.options);
          else if (option.name && !option.focused) commandOptions[option.name] = option.value ?? option.user ?? option.channel ?? option.role ?? option.attachment ?? null;
        }
      };
      flattenOptions(eventPayload.data?.options || []);
      dataCache.set(`${startNode.id}:command_name`, eventPayload.data?.name || '');
      dataCache.set(`${startNode.id}:focused_option`, focused?.name || '');
      dataCache.set(`${startNode.id}:query`, String(focused?.value ?? '').slice(0, 100));
      dataCache.set(`${startNode.id}:options`, commandOptions);
      dataCache.set(`${startNode.id}:user_id`, eventPayload.member?.user?.id || eventPayload.user?.id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_button_click') {
      dataCache.set(`${startNode.id}:custom_id`, eventPayload.data?.custom_id || '');
      dataCache.set(`${startNode.id}:user_id`, eventPayload.member?.user?.id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_modal_submit') {
      dataCache.set(`${startNode.id}:custom_id`, eventPayload.data?.custom_id || '');
      dataCache.set(`${startNode.id}:submitted_values`, eventPayload.data?.components || []);
      dataCache.set(`${startNode.id}:user_id`, eventPayload.member?.user?.id || eventPayload.user?.id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_member_join') {
      dataCache.set(`${startNode.id}:user_id`, eventPayload.user?.id || '');
      dataCache.set(`${startNode.id}:username`, eventPayload.user?.username || '');
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || '');
    }
    const eventDefinition = NodeDefinitions[eventNodeType];
    for (const pin of eventDefinition?.outputs || []) {
      if (pin.type === 'exec' || !pin.eventPath) continue;
      let value = String(pin.eventPath).split('.').reduce((current, key) => current?.[key], eventPayload);
      if (pin.type === 'string' && value && typeof value === 'object') {
        try { value = JSON.stringify(value); } catch { value = ''; }
      }
      dataCache.set(`${startNode.id}:${pin.id}`, value ?? (pin.type === 'number' ? 0 : pin.type === 'boolean' ? false : ''));
    }
    await recordDebugStep(startNode, [], 'triggered');

    let flowStepCount = 0;
    const runExecWires = async (currentExecWires, inParallelBranch = false, parallelDepth = 0) => {
      if (parallelDepth > 16) return { error: 'Parallel graph nesting exceeded 16 levels.' };
      while (currentExecWires.length > 0) {
      if (++flowStepCount > 10000) return { error: 'Graph execution stopped after reaching the 10,000 step safety limit.' };
      const wire = currentExecWires.shift();
      const targetNode = nodes.find((n) => n.id === wire.targetNodeId);
      if (!targetNode) continue;
      if (targetNode.type === 'parallel_join' && inParallelBranch) return { joinId: targetNode.id };
          if (targetNode.type === 'parallel_join' && !wire.__releasedJoin) return { error: 'Join synchronizes branches started by a Parallel node. For If/Else paths, connect each path directly to the same action node.' };

      recordExecutedNode(targetNode.id);
      if (repeatLoopStack.length) {
        try { context.onNodeExecution?.({ graphId: graph.id, nodeId: targetNode.id }); } catch {}
      }
      log(`[Graph] Executing node: ${targetNode.label || targetNode.type} (${targetNode.id})`);

      try {
        const debugInputs = context.debug ? [...getNodeInputs(targetNode, connections), ...getNodeArgumentPins(targetNode, connections)].filter((pin) => pin.type !== 'exec').map((pin) => ({
          pinId: pin.id,
          label: pin.label || pin.id,
          value: debugValue(resolveDataInput(targetNode, pin.id, targetNode.data?.[pin.id] ?? pin.defaultValue), pin.id)
        })) : [];
        if (targetNode.type === 'utility_wire_extender') {
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec_out'));
        } else if (targetNode.type === 'variable_set') {
          const variableId = targetNode.data?.variableId;
          const variableScope = targetNode.data?.scope === 'project' ? 'project' : 'graph';
          const definition = (variableScope === 'project' ? projectVariableDefinitions : localVariableDefinitions).get(variableId);
          if (!definition) {
            log('[Variable] Set skipped: no variable is selected');
          } else {
            const fallback = getVariableValue(variableId, variableScope);
            const value = resolveDataInput(targetNode, 'value', fallback);
            setVariableValue(variableId, variableScope, value, definition);
            log(`[Variable] Set ${definition.name}`);
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'branch_if') {
          const conditionVal = resolveDataInput(targetNode, 'condition', false);
          log(`[Branch] Condition evaluated to: ${Boolean(conditionVal)}`);
          const branchPin = conditionVal ? 'true_exec' : 'false_exec';
          const nextWires = findExecOutputs(targetNode.id, branchPin);
          currentExecWires.push(...nextWires);
        } else if (targetNode.type === 'compare_text') {
          const textA = String(resolveDataInput(targetNode, 'text_a', targetNode.data?.text_a || ''));
          const textB = String(resolveDataInput(targetNode, 'text_b', targetNode.data?.text_b || ''));
          const op = targetNode.data?.operator || 'equals';

          let result = false;
          if (op === 'equals') result = textA === textB;
          else if (op === 'contains') result = textA.includes(textB);
          else if (op === 'startsWith') result = textA.startsWith(textB);
          else if (op === 'endsWith') result = textA.endsWith(textB);

          dataCache.set(`${targetNode.id}:result`, result);
          log(`[Compare Text] "${textA}" ${op} "${textB}" => ${result}`);
        } else if (targetNode.type === 'delay') {
          const ms = Number(resolveDataInput(targetNode, 'ms', targetNode.data?.ms ?? 1000));
          if (!Number.isFinite(ms) || ms < 0 || ms > 604_800_000) throw new Error('Wait duration must be between 0 ms and 7 days.');
          log(`[Delay] Sleeping for ${ms}ms...`);
          await waitFor(ms, context.signal);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'loop_count') {
          const rawCount = Number(resolveDataInput(targetNode, 'count', targetNode.data?.count ?? 1));
          if (!Number.isFinite(rawCount) || rawCount < 0) throw new Error('For Count needs a finite count of zero or more.');
          const count = Math.trunc(rawCount);
          if (count > 1000) throw new Error('For Count is limited to 1,000 iterations per run.');
          const bodyWires = findExecOutputs(targetNode.id, 'body_exec');
          const completedWires = findExecOutputs(targetNode.id, 'completed_exec');
          if (count > 0 && bodyWires.length === 0) throw new Error('For Count needs at least one wire connected to its Body output.');
          if (bodyWires.length && count > 0) {
            for (let index = 0; index < count; index += 1) {
              dataCache.set(`${targetNode.id}:index`, index);
              log(`[For Count] Iteration ${index + 1} of ${count}.`);
              for (const wire of bodyWires) invalidateDataDependencies(wire.targetNodeId, wire.targetPinId);
              const result = await runExecWires([...bodyWires], inParallelBranch, parallelDepth);
              if (result?.error) throw Object.assign(new Error(result.error), context.signal?.aborted ? { name: 'AbortError' } : {});
              if (result?.joinId) throw new Error('For Count cannot cross a Parallel Join boundary. Put the loop inside the parallel branch instead.');
            }
          }
          currentExecWires.push(...completedWires);
        } else if (targetNode.type === 'repeat_while') {
          const intervalMs = Number(resolveDataInput(targetNode, 'interval_ms', targetNode.data?.interval_ms ?? 500));
          if (!Number.isFinite(intervalMs) || intervalMs < 100 || intervalMs > 604_800_000) throw new Error('Repeat While interval must be between 100 ms and 7 days.');
          const bodyWires = findExecOutputs(targetNode.id, 'body_exec');
          const completedWires = findExecOutputs(targetNode.id, 'completed_exec');
          const conditionWire = findInputConnection(targetNode.id, 'condition');
          const loopState = { iteration: 0, lastLogAt: 0 };
          const currentStepBaseline = flowStepCount;
          const getCondition = () => {
            if (conditionWire) invalidateDataDependencies(conditionWire.sourceNodeId, conditionWire.sourcePinId);
            return Boolean(resolveDataInput(targetNode, 'condition', true));
          };
          if (getCondition() && !bodyWires.length) throw new Error('Repeat While needs at least one wire connected to its Body output.');
          repeatLoopStack.push(loopState);
          try {
            while (getCondition()) {
              if (loopState.iteration === 0 || Date.now() - loopState.lastLogAt >= 30_000) {
                log(`[Repeat While] Waiting ${intervalMs} ms before iteration ${loopState.iteration + 1}.`);
              }
              await waitFor(intervalMs, context.signal);
              if (!getCondition()) break;
              loopState.iteration += 1;
              dataCache.set(`${targetNode.id}:iteration`, loopState.iteration);
              for (const wire of bodyWires) invalidateDataDependencies(wire.targetNodeId, wire.targetPinId);
              const bodyResult = await runExecWires([...bodyWires], inParallelBranch, parallelDepth);
              if (bodyResult?.error) throw Object.assign(new Error(bodyResult.error), context.signal?.aborted ? { name: 'AbortError' } : {});
              if (bodyResult?.joinId) throw new Error('Repeat While cannot cross a Parallel Join boundary. Put the loop inside the parallel branch instead.');
              flowStepCount = currentStepBaseline;
            }
          } finally {
            repeatLoopStack.pop();
            flowStepCount = currentStepBaseline;
          }
          currentExecWires.push(...completedWires);
        } else if (targetNode.type === 'wait_until_condition') {
          const timeoutMs = Number(resolveDataInput(targetNode, 'timeout_ms', targetNode.data?.timeout_ms ?? 30000));
          const intervalMs = Number(resolveDataInput(targetNode, 'interval_ms', targetNode.data?.interval_ms ?? 250));
          if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 86_400_000) throw new Error('Wait Until Condition timeout must be between 1 ms and 24 hours.');
          if (!Number.isFinite(intervalMs) || intervalMs < 50 || intervalMs > 10_000) throw new Error('Wait Until Condition check interval must be between 50 and 10,000 ms.');
          const conditionWire = findInputConnection(targetNode.id, 'condition');
          const deadline = Date.now() + timeoutMs;
          let ready = Boolean(resolveDataInput(targetNode, 'condition', false));
          while (!ready && Date.now() < deadline) {
            await waitFor(Math.min(intervalMs, Math.max(1, deadline - Date.now())), context.signal);
            if (conditionWire) invalidateDataDependencies(conditionWire.sourceNodeId, conditionWire.sourcePinId);
            ready = Boolean(resolveDataInput(targetNode, 'condition', false));
          }
          const branch = ready ? 'ready_exec' : 'timeout_exec';
          log(ready ? '[Wait Until Condition] Condition became true.' : '[Wait Until Condition] Timed out.');
          currentExecWires.push(...findExecOutputs(targetNode.id, branch));
        } else if (targetNode.type === 'wait_until_time') {
          const rawTime = String(resolveDataInput(targetNode, 'time', targetNode.data?.time || '')).trim();
          const targetTime = /^-?\d+(?:\.\d+)?$/.test(rawTime) ? Number(rawTime) : Date.parse(rawTime);
          if (!rawTime || !Number.isFinite(targetTime)) throw new Error('Wait Until Time needs a valid ISO date/time or Unix timestamp in milliseconds.');
          const waitMs = targetTime - Date.now();
          if (waitMs > 7 * 24 * 60 * 60 * 1000) throw new Error('Wait Until Time cannot wait more than 7 days.');
          if (waitMs > 0) {
            log(`[Wait Until Time] Waiting until ${new Date(targetTime).toISOString()}.`);
            await waitFor(waitMs, context.signal);
          } else {
            log('[Wait Until Time] The specified time has already passed, continuing now.');
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'execute_graph') {
          const targetGraph = context.resolveFunctionGraph?.(targetNode.data?.graphId);
          if (!targetGraph || targetGraph.graphType === 'function') throw new Error('Run Event Graph needs a saved event graph selected.');
          const callStack = Array.isArray(context.graphCallStack) ? context.graphCallStack : [graph.id];
          if (callStack.includes(targetGraph.id)) throw new Error('Graph call cycle detected. Event graphs cannot run themselves or call each other in a loop.');
          if (callStack.length >= 16) throw new Error('Event graph call nesting exceeded 16 levels.');
          log(`[Run Event Graph] Running ${targetGraph.name || targetGraph.id} for ${eventName}.`);
          const nestedResult = await GraphRunner.execute(targetGraph, eventName, eventPayload, {
            ...context,
            graphCallStack: [...callStack, targetGraph.id],
            variablesState: context.getGraphVariableState?.(targetGraph) || context.variablesState
          });
          if (nestedResult.error) throw Object.assign(new Error(nestedResult.error), context.signal?.aborted ? { name: 'AbortError' } : {});
          if (!nestedResult.executedNodeIds.length) throw new Error(`“${targetGraph.name || 'Target graph'}” has no trigger matching ${eventName}.`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'parallel') {
          const branchPins = ['branch_a_exec', 'branch_b_exec'];
          const branches = branchPins.map((pinId) => findExecOutputs(targetNode.id, pinId));
          if (branches.some((branch) => branch.length !== 1)) throw new Error('Parallel needs exactly one wire connected to each branch output.');
          log('[Parallel] Running both branches concurrently. Connect both branches to the same Join node.');
          const results = await Promise.all(branches.map((branch) => runExecWires(branch, true, parallelDepth + 1)));
          const failed = results.find((result) => result?.error);
          if (failed) throw Object.assign(new Error(failed.error), context.signal?.aborted ? { name: 'AbortError' } : {});
          const joinIds = new Set(results.map((result) => result?.joinId).filter(Boolean));
          if (joinIds.size !== 1 || results.some((result) => !result?.joinId)) throw new Error('Both Parallel branches must reach the same Join node.');
          const joinId = [...joinIds][0];
          log('[Parallel] Both branches completed. Continuing after Join.');
          currentExecWires.push({ sourceNodeId: targetNode.id, sourcePinId: 'exec', targetNodeId: joinId, __releasedJoin: true });
        } else if (targetNode.type === 'parallel_join') {
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (NodeDefinitions[targetNode.type]?.pluginAdapter) {
          const definition = NodeDefinitions[targetNode.type];
          if (context.mock && definition.hostAdapter) throw new Error(`${definition.category} nodes are disabled in Offline Simulator to prevent live database changes.`);
          const inputs = Object.fromEntries(definition.inputs.filter((pin) => pin.type !== 'exec').map((pin) => [
            pin.id,
            resolveDataInput(targetNode, pin.id, pin.defaultValue)
          ]));
          const outputs = await PluginStore.executeAdapter(targetNode.type, inputs, { projectDir: context.projectDir });
          for (const [pinId, value] of Object.entries(outputs)) dataCache.set(`${targetNode.id}:${pinId}`, value);
          log(`[Plugin Adapter] ${definition.label} completed in its isolated WebAssembly worker.`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_send_message') {
          const channelId = String(resolveDataInput(targetNode, 'channel_id', targetNode.data?.channel_id || ''));
          const content = String(resolveDataInput(targetNode, 'content', targetNode.data?.content || '')).slice(0, 2000);
          const embed = resolveDataInput(targetNode, 'embed', null) || (Array.isArray(targetNode.data?.blocks) ? buildEmbedFromNode(targetNode) : null);
          const components = resolveMessageComponents(targetNode);
          const files = resolveMessageFiles(targetNode, resolveDataInput(targetNode, 'files', targetNode.data?.files || []));
          const fileData = String(resolveDataInput(targetNode, 'file_data', targetNode.data?.file_data || ''));
          const fileName = String(resolveDataInput(targetNode, 'file_name', targetNode.data?.file_name || 'image.png'));
          const replyToMessageId = String(resolveDataInput(targetNode, 'reply_to_message_id', targetNode.data?.reply_to_message_id || '')).trim();
          const mentionRepliedUser = Boolean(resolveDataInput(targetNode, 'mention_replied_user', targetNode.data?.mention_replied_user || false));

          if (!channelId) {
            log(`[Action Send Message] Error: Missing Channel ID`);
          } else {
            const payload = {};
            if (content) payload.content = content;
            if (embed) payload.embeds = [embed];
            if (Array.isArray(components) && components.length) payload.components = components;
            if (files?.length) payload.files = files;
            if (replyToMessageId) {
              payload.message_reference = { message_id: replyToMessageId };
              payload.allowed_mentions = { replied_user: mentionRepliedUser };
            }
            if (fileData) {
              payload.file_data = fileData;
              payload.file_name = fileName || 'image.png';
            }

            log(`[Action Send Message] Sending to channel ${channelId}: "${content}"`);
            const sentMsg = await context.rest.createMessage(channelId, payload);
            if (sentMsg?.id) {
              dataCache.set(`${targetNode.id}:message_id`, sentMsg.id);
            }
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_edit_message') {
          const channelId = String(resolveDataInput(targetNode, 'channel_id', targetNode.data?.channel_id || ''));
          const messageId = String(resolveDataInput(targetNode, 'message_id', targetNode.data?.message_id || ''));
          const content = resolveDataInput(targetNode, 'content', targetNode.data?.content);
          const embed = resolveDataInput(targetNode, 'embed', null) || (Array.isArray(targetNode.data?.blocks) ? buildEmbedFromNode(targetNode) : null);
          const components = resolveMessageComponents(targetNode);
          const files = resolveMessageFiles(targetNode, resolveDataInput(targetNode, 'files', targetNode.data?.files || []));

          if (!channelId || !messageId) {
            log(`[Action Edit Message] Error: Missing Channel ID or Message ID`);
          } else {
            const payload = {};
            if (content !== undefined && content !== null && String(content).length > 0) payload.content = String(content).slice(0, 2000);
            if (embed) payload.embeds = [embed];
            if (Array.isArray(components) && components.length) payload.components = components;
            if (files?.length) payload.files = files;

            log(`[Action Edit Message] Editing message ${messageId} in channel ${channelId}`);
            const editedMsg = await context.rest.editMessage(channelId, messageId, payload);
            if (editedMsg?.id) {
              dataCache.set(`${targetNode.id}:message_id`, editedMsg.id);
            }
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_deploy_slash_commands') {
          if (typeof context.deploySlashCommands !== 'function') throw new Error('Slash command deployment is available while the bot is connected, not in simulation or exported runtime.');
          const interactionToken = String(eventPayload?.token || '');
          const interactionId = String(eventPayload?.id || '');
          const canDeploy = context.canDeploySlashCommands?.() !== false;
          let deployment = null;
          let deploymentError = '';
          if (!canDeploy) {
            deploymentError = 'Only server managers with Manage Server or Administrator can deploy slash commands.';
            if (interactionToken && !interactionState.acknowledged) {
              interactionState.acknowledged = true;
              await context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 4, data: { content: deploymentError, flags: 64 } });
            }
          } else {
            if (interactionToken && !interactionState.acknowledged) {
              interactionState.acknowledged = true;
              interactionState.deferred = true;
              interactionState.pending = context.rest.deferInteractionReply?.(interactionId || 'mock', interactionToken, { ephemeral: true })
                || context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 5, data: { flags: 64 } });
              try { await interactionState.pending; }
              catch (error) { interactionState.acknowledged = false; interactionState.deferred = false; throw error; }
              finally { interactionState.pending = null; }
            }
            try {
              deployment = await context.deploySlashCommands();
              const count = Number(deployment?.deployed ?? deployment?.commands ?? 0);
              if (interactionToken && context.rest.editOriginalInteractionResponse) await context.rest.editOriginalInteractionResponse(interactionState.applicationId || eventPayload?.application_id, interactionToken, { content: `Deployed ${count} slash command${count === 1 ? '' : 's'}.` });
            } catch (error) {
              deploymentError = error?.message || String(error);
              if (interactionToken && interactionState.deferred && context.rest.editOriginalInteractionResponse) {
                try { await context.rest.editOriginalInteractionResponse(interactionState.applicationId || eventPayload?.application_id, interactionToken, { content: `Slash command deployment failed: ${deploymentError.slice(0, 1800)}` }); } catch {}
              }
            }
          }
          const deployedCount = Number(deployment?.deployed ?? deployment?.commands ?? 0);
          dataCache.set(`${targetNode.id}:deployed_count`, deployedCount);
          dataCache.set(`${targetNode.id}:success`, !deploymentError);
          dataCache.set(`${targetNode.id}:error`, deploymentError);
          if (deploymentError) log(`[Deploy Slash Commands] ${deploymentError}`);
          else log(`[Deploy Slash Commands] Deployed ${deployedCount} command(s).`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_show_modal') {
          if (interactionState.pending) await interactionState.pending;
          const interactionId = String(resolveDataInput(targetNode, 'interaction_id', targetNode.data?.interaction_id || ''));
          const interactionToken = String(resolveDataInput(targetNode, 'interaction_token', targetNode.data?.interaction_token || ''));
          const modal = resolveDataInput(targetNode, 'modal', targetNode.data?.modal || null);
          if (!interactionToken) throw new Error('Show Popup Modal needs the Interaction Token from its event node.');
          if (!modal || typeof modal !== 'object' || !modal.custom_id || !modal.title || !Array.isArray(modal.components) || modal.components.length < 1 || modal.components.length > 5 || modal.components.some((item) => item?.type !== 18 || !item.component?.custom_id)) throw new Error('Connect a valid Popup Modal Builder output (1–5 labeled fields).');
          if (interactionState.acknowledged) throw new Error('This interaction has already been acknowledged. Show a modal as the initial response, before any reply or defer node.');
          interactionState.acknowledged = true;
          interactionState.deferred = false;
          interactionState.pending = context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 9, data: modal });
          try { await interactionState.pending; }
          catch (error) { interactionState.acknowledged = false; throw error; }
          finally { interactionState.pending = null; }
          log('[Show Popup Modal] Modal opened.');
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_respond_autocomplete') {
          if (Number(eventPayload?.type) !== 4) throw new Error('Respond to Autocomplete can only run for an autocomplete interaction.');
          const interactionId = String(resolveDataInput(targetNode, 'interaction_id', eventPayload?.id || ''));
          const interactionToken = String(resolveDataInput(targetNode, 'interaction_token', eventPayload?.token || ''));
          const findFocusedOption = (options = []) => {
            for (const option of options) {
              if (option.focused) return option;
              const nested = findFocusedOption(option.options || []);
              if (nested) return nested;
            }
            return null;
          };
          const focused = findFocusedOption(eventPayload?.data?.options || []);
          const slashCommandNode = nodes.find((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === String(eventPayload?.data?.name || '').toLowerCase());
          const autocompleteOption = slashCommandNode?.data?.options?.find((option) => option.name === focused?.name);
          if (!focused || !autocompleteOption?.autocomplete || !autocompleteOption.dynamicAutocomplete) throw new Error('This option is not configured for graph-generated autocomplete.');
          const type = Number(focused?.type || 3);
          const query = String(focused?.value ?? '').toLocaleLowerCase();
          const rawChoices = resolveDataInput(targetNode, 'choices', targetNode.data?.choices || []);
          const choices = (Array.isArray(rawChoices) ? rawChoices : []).slice(0, 500).flatMap((choice) => {
            if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return [];
            const name = String(choice.name ?? '').trim().slice(0, 100);
            const rawValue = choice.value;
            if (!name || rawValue === undefined || rawValue === null || !['string', 'number'].includes(typeof rawValue) || typeof rawValue === 'string' && !rawValue.trim()) return [];
            let value;
            if (type === 4) {
              value = Number(rawValue);
              if (!Number.isSafeInteger(value)) return [];
            } else if (type === 10) {
              value = Number(rawValue);
              if (!Number.isFinite(value)) return [];
            } else {
              value = String(rawValue).slice(0, 100);
              if (!value) return [];
            }
            if (query && !name.toLocaleLowerCase().includes(query) && !String(value).toLocaleLowerCase().includes(query)) return [];
            return [{ name, value }];
          }).slice(0, 25);
          if (!interactionToken) throw new Error('Autocomplete response is missing the interaction token.');
          if (interactionState.acknowledged) throw new Error('This autocomplete interaction has already been answered.');
          interactionState.acknowledged = true;
          interactionState.pending = context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 8, data: { choices } });
          try { await interactionState.pending; }
          catch (error) { interactionState.acknowledged = false; throw error; }
          finally { interactionState.pending = null; }
          dataCache.set(`${targetNode.id}:choice_count`, choices.length);
          log(`[Autocomplete] Sent ${choices.length} suggestion${choices.length === 1 ? '' : 's'}.`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_reply_interaction') {
          if (interactionState.pending) await interactionState.pending;
          const applicationId = String(resolveDataInput(targetNode, 'application_id', targetNode.data?.application_id || interactionState.applicationId || ''));
          const interactionId = String(resolveDataInput(targetNode, 'interaction_id', targetNode.data?.interaction_id || ''));
          const interactionToken = String(resolveDataInput(targetNode, 'interaction_token', targetNode.data?.interaction_token || ''));
          const content = String(resolveDataInput(targetNode, 'content', targetNode.data?.content || '')).slice(0, 2000);
          const embed = resolveDataInput(targetNode, 'embed', null) || (Array.isArray(targetNode.data?.blocks) ? buildEmbedFromNode(targetNode) : null);
          const components = resolveMessageComponents(targetNode);
          const files = resolveMessageFiles(targetNode, resolveDataInput(targetNode, 'files', targetNode.data?.files || []));
          const ephemeral = Boolean(resolveDataInput(targetNode, 'ephemeral', targetNode.data?.ephemeral || false));

          if (!interactionToken) {
            log(`[Action Reply] Error: Missing interaction token`);
          } else {
            log(`[Action Reply] Replying: "${content}" (ephemeral: ${ephemeral})`);
            const responseData = {
              ...(content ? { content } : {}),
              ...(embed ? { embeds: [embed] } : {}),
              ...(Array.isArray(components) && components.length ? { components } : {}),
              ...(files?.length ? { files } : {}),
              flags: ephemeral ? 64 : 0
            };
            if (interactionState.deferred) {
              if (!applicationId) throw new Error('Replying after a defer needs the Application ID output from the event node.');
              if (typeof context.rest.editOriginalInteractionResponse !== 'function') throw new Error('This REST connection cannot edit a deferred interaction response.');
              await context.rest.editOriginalInteractionResponse(applicationId, interactionToken, responseData);
            } else {
              if (interactionState.acknowledged) throw new Error('This interaction has already been acknowledged. Use only one initial reply or defer node for each interaction.');
              interactionState.acknowledged = true;
              interactionState.deferred = false;
              interactionState.pending = context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, {
                type: 4,
                data: responseData
              });
              try { await interactionState.pending; }
              catch (error) {
                interactionState.acknowledged = false;
                throw error;
              } finally { interactionState.pending = null; }
            }
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_defer_reply' || targetNode.type === 'action_defer_update') {
          if (interactionState.pending) await interactionState.pending;
          const interactionId = String(resolveDataInput(targetNode, 'interaction_id', targetNode.data?.interaction_id || ''));
          const interactionToken = String(resolveDataInput(targetNode, 'interaction_token', targetNode.data?.interaction_token || ''));
          const isUpdate = targetNode.type === 'action_defer_update';
          const ephemeral = Boolean(resolveDataInput(targetNode, 'ephemeral', targetNode.data?.ephemeral || false));
          if (!interactionToken) throw new Error(`${isUpdate ? 'Defer Update' : 'Defer Reply'} needs an interaction token.`);
          if (interactionState.acknowledged) throw new Error('This interaction has already been acknowledged. Use only one initial reply or defer node for each interaction.');
          interactionState.acknowledged = true;
          interactionState.deferred = true;
          interactionState.pending = isUpdate
            ? (context.rest.deferInteractionUpdate?.(interactionId || 'mock', interactionToken)
              || context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 6 }))
            : (context.rest.deferInteractionReply?.(interactionId || 'mock', interactionToken, { ephemeral })
              || context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 5, ...(ephemeral ? { data: { flags: 64 } } : {}) }));
          try {
            await interactionState.pending;
            dataCache.set(`${targetNode.id}:interaction_token`, interactionToken);
            log(`[${isUpdate ? 'Defer Update' : 'Defer Reply'}] Interaction acknowledged; continue with Reply to Interaction when ready.`);
          } catch (error) {
            interactionState.acknowledged = false;
            interactionState.deferred = false;
            throw error;
          } finally { interactionState.pending = null; }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_edit_interaction_reply') {
          if (interactionState.pending) await interactionState.pending;
          const applicationId = String(resolveDataInput(targetNode, 'application_id', targetNode.data?.application_id || interactionState.applicationId || '')).trim();
          const interactionToken = String(resolveDataInput(targetNode, 'interaction_token', targetNode.data?.interaction_token || '')).trim();
          const content = String(resolveDataInput(targetNode, 'content', targetNode.data?.content || '')).slice(0, 2000);
          const embed = resolveDataInput(targetNode, 'embed', null) || (Array.isArray(targetNode.data?.blocks) ? buildEmbedFromNode(targetNode) : null);
          const components = resolveMessageComponents(targetNode);

          if (!applicationId) {
            log(`[Edit Interaction Reply] Error: Missing Application ID`);
          } else if (!interactionToken) {
            log(`[Edit Interaction Reply] Error: Missing interaction token`);
          } else {
            log(`[Edit Interaction Reply] Editing original response: "${content}"`);
            const payload = {
              ...(content ? { content } : {}),
              ...(embed ? { embeds: [embed] } : {}),
              ...(Array.isArray(components) && components.length ? { components } : {})
            };
            if (typeof context.rest.editOriginalInteractionResponse !== 'function') throw new Error('This REST connection cannot edit interaction responses.');
            await context.rest.editOriginalInteractionResponse(applicationId, interactionToken, payload);
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_set_presence') {
          const status = resolveDataInput(targetNode, 'status', targetNode.data?.status || 'online');
          const activityText = resolveDataInput(targetNode, 'activity_text', targetNode.data?.activity_text || 'Arc Bot');
          log(`[Action Presence] Updating status: ${status}, Activity: ${activityText}`);
          if (context.client && typeof context.client.setPresence === 'function') {
            context.client.setPresence({
              status,
              activities: [{ name: activityText, type: 0 }]
            });
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_create_channel') {
          const guildId = String(resolveDataInput(targetNode, 'guild_id', targetNode.data?.guild_id || '')).trim();
          const name = String(resolveDataInput(targetNode, 'name', targetNode.data?.name || '')).trim().slice(0, 100);
          const channelType = String(resolveDataInput(targetNode, 'channel_type', targetNode.data?.channel_type || 'text')).toLowerCase();
          const types = { text: 0, voice: 2, category: 4, announcement: 5, stage: 13 };
          const body = { name, type: types[channelType] ?? 0 };
          const parentId = String(resolveDataInput(targetNode, 'parent_id', targetNode.data?.parent_id || '')).trim();
          const overwriteSource = resolveDataInput(targetNode, 'permission_overwrites', targetNode.data?.permission_overwrites || []);
          const topic = String(resolveDataInput(targetNode, 'topic', targetNode.data?.topic || '')).slice(0, 1024);
          if (parentId) body.parent_id = parentId;
          if (overwriteSource?.length) {
            let overwrites = overwriteSource;
            if (typeof overwrites === 'string') {
              try { overwrites = JSON.parse(overwrites); } catch { throw new Error('Permission overwrites must be an array.'); }
            }
            if (!Array.isArray(overwrites) || overwrites.length > 100) throw new Error('Permission overwrites must be an array with at most 100 entries.');
            body.permission_overwrites = overwrites;
          }
          if (topic && [0, 5].includes(body.type)) body.topic = topic;
          if (!guildId || !name) throw new Error('Create Channel needs a server ID and channel name.');
          const result = await context.rest.createGuildChannel(guildId, body, resolveDataInput(targetNode, 'reason', targetNode.data?.reason || ''));
          dataCache.set(`${targetNode.id}:channel_id`, result?.id || '');
          log(`[Create Channel] Created #${name}${result?.id ? ` (${result.id})` : ''}`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_edit_channel') {
          const channelId = String(resolveDataInput(targetNode, 'channel_id', targetNode.data?.channel_id || '')).trim();
          const body = {};
          const name = String(resolveDataInput(targetNode, 'name', targetNode.data?.name || '')).trim();
          const topic = String(resolveDataInput(targetNode, 'topic', targetNode.data?.topic || ''));
          const parentId = String(resolveDataInput(targetNode, 'parent_id', targetNode.data?.parent_id || '')).trim();
          if (name) body.name = name.slice(0, 100);
          if (topic) body.topic = topic.slice(0, 1024);
          if (parentId) body.parent_id = parentId;
          const overwriteSource = resolveDataInput(targetNode, 'permission_overwrites', targetNode.data?.permission_overwrites || []);
          if (overwriteSource?.length) {
            let overwrites = overwriteSource;
            if (typeof overwrites === 'string') {
              try { overwrites = JSON.parse(overwrites); } catch { throw new Error('Permission overwrites must be an array.'); }
            }
            if (!Array.isArray(overwrites) || overwrites.length > 100) throw new Error('Permission overwrites must be an array with at most 100 entries.');
            body.permission_overwrites = overwrites;
          } else if (Number(targetNode.data?.overwriteCount) > 0) {
            const targetInputs = Object.fromEntries(Object.keys(targetNode.data || {}).filter((key) => /^target_id_\d+$/.test(key)).map((key) => [key, resolveDataInput(targetNode, key, targetNode.data[key])]));
            body.permission_overwrites = evaluateDataNode('data_permission_overwrites', targetInputs, targetNode.data).overwrites;
          }
          const setOptionalChannelField = (key, transform = (value) => value) => {
            if (Object.prototype.hasOwnProperty.call(targetNode.data || {}, key) || findInputConnection(targetNode.id, key)) body[key] = transform(resolveDataInput(targetNode, key, targetNode.data?.[key]));
          };
          setOptionalChannelField('rate_limit_per_user', (value) => Math.max(0, Math.min(21600, Math.trunc(Number(value) || 0))));
          setOptionalChannelField('nsfw', Boolean);
          setOptionalChannelField('bitrate', (value) => Math.max(8000, Math.min(384000, Math.trunc(Number(value) || 8000))));
          setOptionalChannelField('user_limit', (value) => Math.max(0, Math.min(99, Math.trunc(Number(value) || 0))));
          setOptionalChannelField('rtc_region', (value) => value === '' ? null : String(value).slice(0, 100));
          setOptionalChannelField('video_quality_mode', (value) => Number(value) === 2 ? 2 : 1);
          setOptionalChannelField('default_auto_archive_duration', (value) => [60, 1440, 4320, 10080].includes(Number(value)) ? Number(value) : 1440);
          if (!channelId) throw new Error('Edit Channel needs a channel ID.');
          if (!Object.keys(body).length) throw new Error('Connect or enter at least one channel field to change.');
          const result = await context.rest.modifyChannel(channelId, body, resolveDataInput(targetNode, 'reason', targetNode.data?.reason || ''));
          dataCache.set(`${targetNode.id}:channel_id_out`, result?.id || channelId);
          log(`[Edit Channel] Updated channel ${channelId}`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_delete_channel') {
          const channelId = String(resolveDataInput(targetNode, 'channel_id', targetNode.data?.channel_id || '')).trim();
          if (!channelId) throw new Error('Delete Channel needs a channel ID.');
          await context.rest.deleteChannel(channelId, resolveDataInput(targetNode, 'reason', targetNode.data?.reason || ''));
          dataCache.set(`${targetNode.id}:deleted_channel_id`, channelId);
          log(`[Delete Channel] Deleted channel ${channelId}`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_create_role') {
          const guildId = String(resolveDataInput(targetNode, 'guild_id', targetNode.data?.guild_id || '')).trim();
          const name = String(resolveDataInput(targetNode, 'name', targetNode.data?.name || 'new role')).trim().slice(0, 100);
          const color = Math.max(0, Math.min(0xffffff, Math.trunc(Number(resolveDataInput(targetNode, 'color', targetNode.data?.color || 0)) || 0)));
          const permissions = String(resolveDataInput(targetNode, 'permissions', targetNode.data?.permissions || '0')).trim();
          if (!/^\d{1,20}$/.test(permissions)) throw new Error('Role permissions must be a decimal permission bitfield string.');
          const hoist = Boolean(resolveDataInput(targetNode, 'hoist', targetNode.data?.hoist || false));
          const mentionable = Boolean(resolveDataInput(targetNode, 'mentionable', targetNode.data?.mentionable || false));
          if (!guildId || !name) throw new Error('Create Role needs a server ID and role name.');
          const role = await context.rest.createGuildRole(guildId, { name, color, permissions, hoist, mentionable }, resolveDataInput(targetNode, 'reason', targetNode.data?.reason || ''));
          dataCache.set(`${targetNode.id}:role_id`, role?.id || '');
          log(`[Create Role] Created ${name}${role?.id ? ` (${role.id})` : ''}`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_member_role') {
          const guildId = String(resolveDataInput(targetNode, 'guild_id', targetNode.data?.guild_id || '')).trim();
          const userId = String(resolveDataInput(targetNode, 'user_id', targetNode.data?.user_id || '')).trim();
          const roleId = String(resolveDataInput(targetNode, 'role_id', targetNode.data?.role_id || '')).trim();
          const operation = String(resolveDataInput(targetNode, 'operation', targetNode.data?.operation || 'add')).toLowerCase();
          const reason = resolveDataInput(targetNode, 'reason', targetNode.data?.reason || '');
          if (!guildId || !userId || !roleId) throw new Error('Set Member Role needs server, user, and role IDs.');
          if (operation === 'remove') await context.rest.removeGuildMemberRole(guildId, userId, roleId, reason);
          else await context.rest.addGuildMemberRole(guildId, userId, roleId, reason);
          log(`[Member Role] ${operation === 'remove' ? 'Removed' : 'Added'} role ${roleId} for ${userId}`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_moderate_member') {
          let success = false;
          let errorMessage = '';
          const guildId = String(resolveDataInput(targetNode, 'guild_id', targetNode.data?.guild_id || '')).trim();
          const userId = String(resolveDataInput(targetNode, 'user_id', targetNode.data?.user_id || '')).trim();
          const operation = String(resolveDataInput(targetNode, 'operation', targetNode.data?.operation || 'timeout')).trim().toLowerCase();
          const reason = String(resolveDataInput(targetNode, 'reason', targetNode.data?.reason || '')).trim().slice(0, 512);
          try {
            if (!guildId || !/^\d{15,22}$/.test(userId)) throw new TypeError('Choose a server and a valid member ID.');
            if (operation === 'timeout') {
              const durationMinutes = Math.trunc(Number(resolveDataInput(targetNode, 'duration_minutes', targetNode.data?.duration_minutes ?? 10)));
              if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 40320) throw new RangeError('Timeout duration must be from 1 minute to 28 days.');
              const disabledUntil = new Date(Date.now() + durationMinutes * 60_000).toISOString();
              await context.rest.modifyGuildMember(guildId, userId, { communication_disabled_until: disabledUntil }, reason);
            } else if (operation === 'kick') {
              await context.rest.removeGuildMember(guildId, userId, reason);
            } else if (operation === 'ban') {
              const deleteMessageSeconds = Math.trunc(Number(resolveDataInput(targetNode, 'delete_message_seconds', targetNode.data?.delete_message_seconds ?? 0)));
              if (!Number.isInteger(deleteMessageSeconds) || deleteMessageSeconds < 0 || deleteMessageSeconds > 604800) throw new RangeError('Ban message deletion must be from 0 seconds to 7 days.');
              await context.rest.banGuildMember(guildId, userId, { deleteMessageSeconds }, reason);
            } else if (operation === 'unban') {
              await context.rest.unbanGuildMember(guildId, userId, reason);
            } else {
              throw new TypeError('Choose timeout, kick, ban, or unban.');
            }
            success = true;
          } catch (error) {
            errorMessage = String(error?.message || 'Discord rejected the moderation request.').slice(0, 500);
          }
          dataCache.set(`${targetNode.id}:success`, success);
          dataCache.set(`${targetNode.id}:error`, errorMessage);
          log(success
            ? `[Moderation] ${operation} succeeded for ${userId}`
            : `[Moderation] ${operation} failed for ${userId}: ${errorMessage}`);
          currentExecWires.push(...findExecOutputs(targetNode.id, success ? 'exec' : 'failure_exec'));
        } else if (targetNode.type === 'action_voice_channel_status') {
          const channelId = String(resolveDataInput(targetNode, 'channel_id', targetNode.data?.channel_id || '')).trim();
          const status = String(resolveDataInput(targetNode, 'status', targetNode.data?.status || '')).slice(0, 500);
          if (!channelId) throw new Error('Set Voice Channel Status needs a channel ID.');
          await context.rest.setVoiceChannelStatus(channelId, status || null, resolveDataInput(targetNode, 'reason', targetNode.data?.reason || ''));
          log(`[Voice Channel Status] ${status ? `Set status to “${status}”` : 'Cleared status'} for ${channelId}`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_voice_state') {
          const guildId = String(resolveDataInput(targetNode, 'guild_id', targetNode.data?.guild_id || '')).trim();
          const channelId = String(resolveDataInput(targetNode, 'channel_id', targetNode.data?.channel_id || '')).trim();
          if (!guildId) throw new Error('Voice join or leave needs a server ID.');
          if (!context.client || typeof context.client.setVoiceChannel !== 'function') throw new Error('Voice state changes require a live Gateway connection.');
          context.client.setVoiceChannel(guildId, channelId || null, {
            selfMute: resolveDataInput(targetNode, 'self_mute', targetNode.data?.self_mute || false),
            selfDeaf: resolveDataInput(targetNode, 'self_deaf', targetNode.data?.self_deaf || false)
          });
          log(channelId ? `[Voice] Requested join to channel ${channelId}. Audio transport is not enabled.` : `[Voice] Requested leave from server ${guildId}.`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_crypto_hash') {
          const data = String(resolveDataInput(targetNode, 'data', targetNode.data?.data || ''));
          const algorithm = String(resolveDataInput(targetNode, 'algorithm', targetNode.data?.algorithm || 'sha256')).toLowerCase();
          const hash = CryptoEngine.hash(data, algorithm);
          dataCache.set(`${targetNode.id}:hash`, hash);
          log(`[Crypto Hash] Computed ${algorithm.toUpperCase()} hash for ${data.length} bytes: ${hash.slice(0, 16)}...`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_crypto_hmac') {
          const data = String(resolveDataInput(targetNode, 'data', targetNode.data?.data || ''));
          const secret = String(resolveDataInput(targetNode, 'secret', targetNode.data?.secret || ''));
          const algorithm = String(resolveDataInput(targetNode, 'algorithm', targetNode.data?.algorithm || 'sha256')).toLowerCase();
          const signature = CryptoEngine.hmac(data, secret, algorithm);
          dataCache.set(`${targetNode.id}:signature`, signature);
          log(`[Crypto HMAC] Signed payload with ${algorithm.toUpperCase()}: ${signature.slice(0, 16)}...`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_crypto_verify_hmac') {
          const data = String(resolveDataInput(targetNode, 'data', targetNode.data?.data || ''));
          const secret = String(resolveDataInput(targetNode, 'secret', targetNode.data?.secret || ''));
          const signature = String(resolveDataInput(targetNode, 'signature', targetNode.data?.signature || ''));
          const isValid = CryptoEngine.verifyHmac(data, secret, signature);
          dataCache.set(`${targetNode.id}:isValid`, isValid);
          log(`[Crypto Verify HMAC] Verification: ${isValid ? 'VALID' : 'INVALID'}`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_crypto_encrypt') {
          const plaintext = String(resolveDataInput(targetNode, 'plaintext', targetNode.data?.plaintext || ''));
          const customPass = resolveDataInput(targetNode, 'passphrase', targetNode.data?.passphrase || '') || null;
          const ciphertext = CryptoEngine.encrypt(plaintext, customPass);
          dataCache.set(`${targetNode.id}:ciphertext`, ciphertext);
          log(`[Crypto Encrypt] Encrypted ${plaintext.length} chars to AES-256-GCM envelope`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_crypto_decrypt') {
          const ciphertext = String(resolveDataInput(targetNode, 'ciphertext', targetNode.data?.ciphertext || ''));
          const customPass = resolveDataInput(targetNode, 'passphrase', targetNode.data?.passphrase || '') || null;
          try {
            const plaintext = CryptoEngine.decrypt(ciphertext, customPass);
            dataCache.set(`${targetNode.id}:plaintext`, plaintext);
            log(`[Crypto Decrypt] Successfully decrypted AES-256-GCM envelope`);
          } catch (decErr) {
            log(`[Crypto Decrypt] Failed: ${decErr.message}`);
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_crypto_random') {
          const type = String(resolveDataInput(targetNode, 'type', targetNode.data?.type || 'hex')).toLowerCase();
          let token = '';
          if (type === 'pin') {
            token = CryptoEngine.randomPin(6);
          } else if (type === 'base64url') {
            token = CryptoEngine.randomToken(32, 'base64url');
          } else {
            token = CryptoEngine.randomToken(32, 'hex');
          }
          dataCache.set(`${targetNode.id}:token`, token);
          log(`[Crypto Random] Generated secure token (${type}): ${token.slice(0, 10)}...`);
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        } else if (targetNode.type === 'action_web_fetch' || targetNode.type === 'action_web_retry') {
          const retryEnabled = targetNode.type === 'action_web_retry';
          const method = String(resolveDataInput(targetNode, 'method', 'GET')).toUpperCase();
          if (context.mock) {
            dataCache.set(`${targetNode.id}:status`, 0);
            dataCache.set(`${targetNode.id}:ok`, false);
            dataCache.set(`${targetNode.id}:body`, '');
            dataCache.set(`${targetNode.id}:headers`, '{}');
            dataCache.set(`${targetNode.id}:json`, null);
            if (retryEnabled) dataCache.set(`${targetNode.id}:attempts`, 0);
            dataCache.set(`${targetNode.id}:error`, 'HTTP requests are disabled in the Offline Simulator.');
            log('[HTTP Request] Skipped in Offline Simulator.');
            currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
            await recordDebugStep(targetNode, debugInputs);
            continue;
          }
          let attempts = 0;
          try {
            const maxAttempts = retryEnabled ? Math.max(1, Math.min(5, Math.trunc(Number(resolveDataInput(targetNode, 'max_attempts', 3)) || 3))) : 1;
            const retryUnsafeMethods = retryEnabled && Boolean(resolveDataInput(targetNode, 'retry_non_idempotent', false));
            const mayRetry = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method) || retryUnsafeMethods;
            const baseDelayMs = retryEnabled ? Math.max(100, Math.min(10000, Number(resolveDataInput(targetNode, 'retry_delay_ms', 500)) || 500)) : 0;
            let response = null;
            let requestError = null;
            while (attempts < maxAttempts) {
              attempts += 1;
              requestError = null;
              try {
                response = await performSafeHttpRequest({
                  url: resolveDataInput(targetNode, 'url', ''),
                  method,
                  headers: resolveDataInput(targetNode, 'headers', '{}'),
                  body: resolveDataInput(targetNode, 'body', ''),
                  timeoutMs: resolveDataInput(targetNode, 'timeout_ms', 10000),
                  maxBytes: resolveDataInput(targetNode, 'max_bytes', 1048576)
                });
              } catch (error) { requestError = error; }
              const retryableStatus = response && [408, 425, 429].includes(response.status) || response && response.status >= 500;
              if (attempts >= maxAttempts || !mayRetry || !(requestError || retryableStatus)) break;
              let waitMs = Math.min(30000, baseDelayMs * (2 ** (attempts - 1)));
              const retryAfterHeader = String(response?.headers?.['retry-after'] || '').trim();
              const retryAfterSeconds = Number(retryAfterHeader);
              const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
                ? retryAfterSeconds * 1000
                : Number.isFinite(Date.parse(retryAfterHeader)) ? Date.parse(retryAfterHeader) - Date.now() : 0;
              if (retryAfterMs > 0) waitMs = Math.min(30000, Math.max(waitMs, retryAfterMs));
              log(`[HTTP Retry] Attempt ${attempts} failed${response ? ` with status ${response.status}` : ''}; retrying in ${waitMs}ms.`);
              await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
            if (requestError) throw requestError;
            if (!response) throw new Error('HTTP request did not return a response.');
            dataCache.set(`${targetNode.id}:status`, response.status);
            dataCache.set(`${targetNode.id}:ok`, response.ok);
            dataCache.set(`${targetNode.id}:body`, response.body);
            dataCache.set(`${targetNode.id}:headers`, JSON.stringify(response.headers));
            dataCache.set(`${targetNode.id}:json`, response.json);
            if (retryEnabled) dataCache.set(`${targetNode.id}:attempts`, attempts);
            const responseError = response.error || (!response.ok ? `HTTP ${response.status}` : '');
            dataCache.set(`${targetNode.id}:error`, responseError);
            log(`[HTTP Request] ${method} completed with status ${response.status}${responseError ? ` (${responseError})` : ''}${retryEnabled ? ` after ${attempts} attempt${attempts === 1 ? '' : 's'}` : ''}`);
          } catch (requestError) {
            dataCache.set(`${targetNode.id}:status`, 0);
            dataCache.set(`${targetNode.id}:ok`, false);
            dataCache.set(`${targetNode.id}:body`, '');
            dataCache.set(`${targetNode.id}:headers`, '{}');
            dataCache.set(`${targetNode.id}:json`, null);
            if (retryEnabled) dataCache.set(`${targetNode.id}:attempts`, attempts || 1);
            dataCache.set(`${targetNode.id}:error`, requestError.message || 'HTTP request failed.');
            log(`[HTTP Request] ${method} failed: ${requestError.message || 'HTTP request failed.'}`);
          }
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
        }
        await recordDebugStep(targetNode, debugInputs);
      } catch (nodeErr) {
        if (nodeErr?.name === 'AbortError') return { error: nodeErr.message };
        log(`[Node Error] Failed on node ${targetNode.id}: ${nodeErr.message}`);
        try {
          context.onNodeError?.({ graphId: graph.id, graphName: graph.name || graph.id, nodeId: targetNode.id, nodeLabel: targetNode.label || NodeDefinitions[targetNode.type]?.label || targetNode.type, error: nodeErr.message || String(nodeErr) });
        } catch {}
        if (context.debug) await recordDebugStep(targetNode, [], 'error', nodeErr.message);
        return { error: nodeErr.message };
      }
    }
      return null;
    };

    const executionError = await runExecWires(findExecOutputs(startNode.id, 'exec'));

    return { executedNodeIds, traces, debugSteps, error: executionError?.error || null };
  }
}

function evaluateFunctionGraph(graph, argumentValues, context, callStack) {
  if (!graph || callStack.length >= 24 || callStack.includes(graph.id)) return undefined;
  const nodes = graph.nodes || [];
  const connections = graph.connections || [];
  const nextStack = [...callStack, graph.id];
  const cache = new Map();
  const findNode = (id) => nodes.find((node) => node.id === id);
  const inputWire = (nodeId, pinId) => connections.find((wire) => wire.targetNodeId === nodeId && wire.targetPinId === pinId);

  const resolveOutput = (node, pinId) => {
    if (!node) return undefined;
    const key = `${node.id}:${pinId}`;
    if (cache.has(key)) return cache.get(key);
    let result;
    if (node.type === 'function_input' && pinId === 'value') {
      const parameterId = node.data?.paramId || node.id;
      result = argumentValues.has(parameterId) ? argumentValues.get(parameterId) : node.data?.defaultValue ?? defaultValueForType(node.data?.valueType);
    } else if (node.type === 'variable_get') {
      result = context.resolveFunctionVariable?.(node.data?.variableId, node.data?.scope, graph);
    } else if (node.type.startsWith('data_')) {
      const inputs = Object.fromEntries(getNodeInputs(node, connections).map((pin) => [pin.id, resolveInput(node, pin.id, pin.defaultValue)]));
      const values = evaluateDataNode(node.type, inputs, node.data || {});
      for (const [id, value] of Object.entries(values)) cache.set(`${node.id}:${id}`, value);
      result = values[pinId];
    } else if (node.type.startsWith('value_')) {
      result = resolveInput(node, 'value', node.data?.value ?? defaultValueForType(node.type.slice(6)));
    } else if (node.type === 'function_math') {
      const a = Number(resolveInput(node, 'a', 0));
      const b = Number(resolveInput(node, 'b', 0));
      const operation = node.data?.operation || 'add';
      result = operation === 'subtract' ? a - b
        : operation === 'multiply' ? a * b
          : operation === 'divide' ? (b === 0 ? 0 : a / b)
            : operation === 'modulo' ? (b === 0 ? 0 : a % b) : a + b;
      if (!Number.isFinite(result)) result = 0;
    } else if (node.type.startsWith('math_')) {
      const inputs = Object.fromEntries((NodeDefinitions[node.type]?.inputs || []).map((pin) => [pin.id, resolveInput(node, pin.id, pin.defaultValue)]));
      result = evaluateMathNode(node.type, inputs, node.data || {});
    } else if (node.type.startsWith('logic_')) {
      const inputs = Object.fromEntries((NodeDefinitions[node.type]?.inputs || []).map((pin) => [pin.id, Boolean(resolveInput(node, pin.id, pin.defaultValue))]));
        result = node.type === 'logic_xor_many' ? Object.entries(inputs).filter(([id, value]) => /^input_\d+$/.test(id) && value).length % 2 === 1
          : node.type === 'logic_and' ? inputs.a && inputs.b
        : node.type === 'logic_or' ? inputs.a || inputs.b
          : node.type === 'logic_xor' ? inputs.a !== inputs.b : !inputs.value;
    } else if (node.type === 'compare_text') {
      const left = String(resolveInput(node, 'text_a', node.data?.text_a || ''));
      const right = String(resolveInput(node, 'text_b', node.data?.text_b || ''));
      const operation = node.data?.operator || 'equals';
      result = operation === 'contains' ? left.includes(right)
        : operation === 'startsWith' ? left.startsWith(right)
          : operation === 'endsWith' ? left.endsWith(right) : left === right;
    } else if (node.type === 'format_text') {
      result = renderTextTemplate(node.data?.template, (name) => {
        const argumentMatch = /^arg(\d+)$/i.exec(name);
        if (argumentMatch && Number(argumentMatch[1]) >= 1 && Number(argumentMatch[1]) <= 50) return resolveInput(node, `arg_${Number(argumentMatch[1])}`, undefined);
        const argumentNode = nodes.find((item) => item.type === 'function_input' && item.data?.name?.toLowerCase() === name.toLowerCase());
        const fallback = argumentNode ? resolveOutput(argumentNode, 'value') : undefined;
        const value = resolveInput(node, `slot_${name}`, fallback);
        return value;
      }, context.appEmojis);
    } else if (node.type === 'function_call') {
      const nestedGraph = context.resolveFunctionGraph?.(node.data?.graphId);
      if (nestedGraph) {
        const nestedParams = nestedGraph.nodes.filter((item) => item.type === 'function_input');
        const missingParameter = nestedParams.find((parameter) => parameter.data?.optional === false
          && !inputWire(node.id, `arg_${parameter.data?.paramId || parameter.id}`));
        if (missingParameter) throw new Error(`${nestedGraph.name || 'Function'} requires an input for “${missingParameter.data?.name || 'Input'}”.`);
        const nestedValues = new Map(nestedParams.map((parameter) => {
          const parameterId = parameter.data?.paramId || parameter.id;
          return [parameterId, resolveInput(node, `arg_${parameterId}`, parameter.data?.defaultValue ?? defaultValueForType(parameter.data?.valueType))];
        }));
        result = evaluateFunctionGraph(nestedGraph, nestedValues, context, nextStack);
      }
    }
    cache.set(key, result);
    return result;
  };

  function resolveInput(node, pinId, fallback) {
    const wire = inputWire(node.id, pinId);
    if (wire) {
      const value = resolveOutput(findNode(wire.sourceNodeId), wire.sourcePinId);
      if (value !== undefined) return value;
    }
    return node.data?.[pinId] ?? fallback;
  }

  const returnNode = nodes.find((node) => node.type === 'function_return');
  return returnNode ? resolveInput(returnNode, 'value', defaultValueForType(returnNode.data?.valueType)) : undefined;
}

function defaultValueForType(type) {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return '';
}

function coerceVariableValue(value, type = 'string', fallback) {
  if (type === 'number') {
    if (typeof value === 'string' && /^\d{16,22}$/.test(value) && BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) return value;
    const number = Number(value);
    return Number.isFinite(number) ? number : Number(fallback) || 0;
  }
  if (type === 'boolean') {
    if (typeof value === 'string') return !['', 'false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
    return Boolean(value);
  }
  if (type === 'array' || type === 'object') {
    const valid = type === 'array' ? Array.isArray(value) : value && typeof value === 'object' && !Array.isArray(value);
    if (!valid) return fallback ?? defaultValueForType(type);
    try {
      const serialized = JSON.stringify(value);
      return serialized.length <= 10000 ? JSON.parse(serialized) : fallback ?? defaultValueForType(type);
    } catch { return fallback ?? defaultValueForType(type); }
  }
  return value == null ? '' : String(value);
}

function safeEmbedUrl(value, allowAttachment = false) {
  const text = String(value || '').trim();
  if (allowAttachment && /^attachment:\/\/[^?#\r\n]{1,100}$/.test(text)) return text;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? text : '';
  } catch {
    return '';
  }
}

function limitEmbedText(embed) {
  const result = { ...embed };
  let remaining = 6000;
  const shorten = (value) => {
    if (typeof value !== 'string') return value;
    const next = value.slice(0, Math.max(0, remaining));
    remaining -= next.length;
    return next;
  };
  if (result.title) result.title = shorten(result.title);
  if (result.description) result.description = shorten(result.description);
  if (result.author?.name) result.author = { ...result.author, name: shorten(result.author.name) };
  if (result.footer?.text) result.footer = { ...result.footer, text: shorten(result.footer.text) };
  if (Array.isArray(result.fields)) {
    result.fields = result.fields
      .map((field) => ({ ...field, name: shorten(field.name), value: shorten(field.value) }))
      .filter((field) => field.name && field.value);
  }
  if (!result.title) delete result.title;
  if (!result.description) delete result.description;
  if (result.author && !result.author.name) delete result.author;
  if (result.footer && !result.footer.text) delete result.footer;
  return result;
}
