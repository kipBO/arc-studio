export const NodeCategories = {
  EVENTS: 'Events',
  ACTIONS: 'Discord Actions',
  LOGIC: 'Logic & Flow',
  VARIABLES: 'Variables',
  VALUES: 'Values & Data',
  FUNCTIONS: 'Functions',
  CRYPTO: 'Cryptography & Security',
  MATH: 'Math',
  NETWORK: 'Web & Network'
};
//
const binaryMathNodes = [
  ['math_add', 'Add', 'Adds two numbers', '+'], ['math_subtract', 'Subtract', 'Subtracts B from A', '−'],
  ['math_multiply', 'Multiply', 'Multiplies two numbers', '×'], ['math_divide', 'Divide', 'Divides A by B; division by zero returns 0', '÷'],
  ['math_modulo', 'Remainder', 'Returns the remainder after division', 'mod'], ['math_power', 'Power', 'Raises A to the power of B', '^'],
  ['math_min', 'Minimum', 'Returns the smaller number', 'min'], ['math_max', 'Maximum', 'Returns the larger number', 'max']
].map(([type, label, description, symbol]) => ({
  type, category: NodeCategories.MATH, label: `${label} (${symbol})`, color: '#38bdf8', description,
  inputs: [{ id: 'a', label: 'A', type: 'number', defaultValue: 0 }, { id: 'b', label: 'B', type: 'number', defaultValue: 0 }],
  outputs: [{ id: 'result', label: 'Result', type: 'number' }]
}));
const unaryMathNodes = [
  ['math_abs', 'Absolute', 'Returns the distance from zero', 'abs'], ['math_sqrt', 'Square Root', 'Returns the non-negative square root; negative input returns 0', '√'],
  ['math_round', 'Round', 'Rounds to the selected decimal places', 'round'], ['math_floor', 'Floor', 'Rounds down to an integer', 'floor'],
  ['math_ceil', 'Ceiling', 'Rounds up to an integer', 'ceil'], ['math_sin', 'Sine', 'Sine of an angle in radians', 'sin'],
  ['math_cos', 'Cosine', 'Cosine of an angle in radians', 'cos'], ['math_tan', 'Tangent', 'Tangent of an angle in radians', 'tan'],
  ['math_asin', 'Arcsine', 'Inverse sine, returned in radians', 'asin'], ['math_acos', 'Arccosine', 'Inverse cosine, returned in radians', 'acos'],
  ['math_atan', 'Arctangent', 'Inverse tangent, returned in radians', 'atan'], ['math_log', 'Natural Log', 'Natural logarithm; non-positive input returns 0', 'ln'],
  ['math_log10', 'Log Base 10', 'Base 10 logarithm; non-positive input returns 0', 'log₁₀'], ['math_exp', 'Exponential', 'Raises Euler’s number to the input power', 'exp'],
  ['math_sign', 'Sign', 'Returns -1, 0, or 1 for the input sign', 'sign']
].map(([type, label, description, symbol]) => ({
  type, category: NodeCategories.MATH, label: `${label} (${symbol})`, color: '#38bdf8', description,
  inputs: [{ id: 'value', label: 'Value', type: 'number', defaultValue: 0 }],
  outputs: [{ id: 'result', label: 'Result', type: 'number' }]
}));
const mathExtraNodes = [
  { type: 'math_clamp', category: NodeCategories.MATH, label: 'Clamp', color: '#38bdf8', description: 'Restricts a value between a minimum and maximum', inputs: [{ id: 'value', label: 'Value', type: 'number', defaultValue: 0 }, { id: 'min', label: 'Minimum', type: 'number', defaultValue: 0 }, { id: 'max', label: 'Maximum', type: 'number', defaultValue: 1 }], outputs: [{ id: 'result', label: 'Result', type: 'number' }] },
  { type: 'math_sum', category: NodeCategories.MATH, label: 'Sum', color: '#38bdf8', description: 'Adds up to 50 values. Connect the last input to reveal another.', inputs: ['a', 'b'].map((id, index) => ({ id, label: String.fromCharCode(65 + index), type: 'number', defaultValue: 0 })), outputs: [{ id: 'result', label: 'Total', type: 'number' }] },
  { type: 'math_average', category: NodeCategories.MATH, label: 'Average', color: '#38bdf8', description: 'Averages up to 50 values. Connect the last input to reveal another.', inputs: ['a', 'b'].map((id, index) => ({ id, label: String.fromCharCode(65 + index), type: 'number', defaultValue: 0 })), outputs: [{ id: 'result', label: 'Average', type: 'number' }] },
  { type: 'math_lerp', category: NodeCategories.MATH, label: 'Interpolate', color: '#38bdf8', description: 'Linearly interpolates between A and B using a factor from 0 to 1', inputs: [{ id: 'a', label: 'A', type: 'number', defaultValue: 0 }, { id: 'b', label: 'B', type: 'number', defaultValue: 1 }, { id: 't', label: 'Factor', type: 'number', defaultValue: 0.5 }], outputs: [{ id: 'result', label: 'Result', type: 'number' }] },
  { type: 'math_constant', category: NodeCategories.MATH, label: 'Math Constant', color: '#38bdf8', description: 'Provides a standard mathematical constant', inputs: [], outputs: [{ id: 'result', label: 'Value', type: 'number' }] },
  { type: 'math_compare', category: NodeCategories.MATH, label: 'Compare Numbers', color: '#38bdf8', description: 'Compares two numbers and returns true or false', inputs: [{ id: 'a', label: 'A', type: 'number', defaultValue: 0 }, { id: 'b', label: 'B', type: 'number', defaultValue: 0 }], outputs: [{ id: 'result', label: 'Result', type: 'boolean' }] },
  { type: 'math_random', category: NodeCategories.MATH, label: 'Random Number', color: '#38bdf8', description: 'Returns a random number between the connected minimum and maximum', inputs: [{ id: 'min', label: 'Minimum', type: 'number', defaultValue: 0 }, { id: 'max', label: 'Maximum', type: 'number', defaultValue: 1 }], outputs: [{ id: 'result', label: 'Result', type: 'number' }] }
];
const booleanLogicNodes = [
  { type: 'logic_and', label: 'Boolean AND', description: 'True when both inputs are true', inputs: [{ id: 'a', label: 'A', type: 'boolean', defaultValue: false }, { id: 'b', label: 'B', type: 'boolean', defaultValue: false }] },
  { type: 'logic_or', label: 'Boolean OR', description: 'True when either input is true', inputs: [{ id: 'a', label: 'A', type: 'boolean', defaultValue: false }, { id: 'b', label: 'B', type: 'boolean', defaultValue: false }] },
  { type: 'logic_xor', label: 'Boolean XOR', description: 'True when exactly one input is true', inputs: [{ id: 'a', label: 'A', type: 'boolean', defaultValue: false }, { id: 'b', label: 'B', type: 'boolean', defaultValue: false }] },
  { type: 'logic_xor_many', label: 'Boolean XOR (Multi-input)', description: 'True when an odd number of inputs are true. Add inputs by connecting them, up to 25.', inputs: [{ id: 'input_1', label: 'Input 1', type: 'boolean', defaultValue: false }, { id: 'input_2', label: 'Input 2', type: 'boolean', defaultValue: false }] },
  { type: 'logic_not', label: 'Boolean NOT', description: 'Inverts a boolean value', inputs: [{ id: 'value', label: 'Value', type: 'boolean', defaultValue: false }] }
].map((node) => ({ ...node, category: NodeCategories.LOGIC, color: '#f59e0b', introducedAt: '2026-10-16T00:00:00.000Z', outputs: [{ id: 'result', label: 'Result', type: 'boolean' }] }));

const gatewayEventNodes = [
  ['event_message_update', 'On Message Updated', 'A message is edited', [['message_id', 'Message ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['author_id', 'Author ID', 'string'], ['content', 'Content', 'string'], ['edited_timestamp', 'Edited At', 'string']]],
  ['event_message_delete', 'On Message Deleted', 'A message is deleted', [['message_id', 'Message ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string']]],
  ['event_reaction_add', 'On Reaction Added', 'A user adds a reaction', [['user_id', 'User ID', 'string'], ['message_id', 'Message ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['emoji_id', 'Emoji ID', 'string'], ['emoji_name', 'Emoji Name', 'string']]],
  ['event_reaction_remove', 'On Reaction Removed', 'A user removes a reaction', [['user_id', 'User ID', 'string'], ['message_id', 'Message ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['emoji_id', 'Emoji ID', 'string'], ['emoji_name', 'Emoji Name', 'string']]],
  ['event_channel_create', 'On Channel Created', 'A channel is created', [['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['channel_type', 'Channel Type', 'number'], ['parent_id', 'Category ID', 'string']]],
  ['event_channel_update', 'On Channel Updated', 'A channel is updated', [['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['channel_type', 'Channel Type', 'number'], ['parent_id', 'Category ID', 'string']]],
  ['event_channel_delete', 'On Channel Deleted', 'A channel is deleted', [['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['channel_type', 'Channel Type', 'number'], ['parent_id', 'Category ID', 'string']]],
  ['event_guild_create', 'On Server Available', 'The app becomes available in a server', [['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['member_count', 'Member Count', 'number']]],
  ['event_guild_update', 'On Server Updated', 'A server is updated', [['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['owner_id', 'Owner ID', 'string']]],
  ['event_guild_delete', 'On Server Unavailable', 'A server becomes unavailable', [['guild_id', 'Server ID', 'string'], ['unavailable', 'Unavailable', 'boolean']]],
  ['event_role_create', 'On Role Created', 'A role is created', [['role_id', 'Role ID', 'string'], ['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['color', 'Color', 'number']]],
  ['event_role_update', 'On Role Updated', 'A role is updated', [['role_id', 'Role ID', 'string'], ['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['color', 'Color', 'number']]],
  ['event_role_delete', 'On Role Deleted', 'A role is deleted', [['role_id', 'Role ID', 'string'], ['guild_id', 'Server ID', 'string']]],
  ['event_thread_create', 'On Thread Created', 'A thread is created', [['thread_id', 'Thread ID', 'string'], ['guild_id', 'Server ID', 'string'], ['parent_id', 'Parent Channel ID', 'string'], ['name', 'Name', 'string']]],
  ['event_thread_update', 'On Thread Updated', 'A thread is updated', [['thread_id', 'Thread ID', 'string'], ['guild_id', 'Server ID', 'string'], ['parent_id', 'Parent Channel ID', 'string'], ['name', 'Name', 'string']]],
  ['event_thread_delete', 'On Thread Deleted', 'A thread is deleted', [['thread_id', 'Thread ID', 'string'], ['guild_id', 'Server ID', 'string'], ['parent_id', 'Parent Channel ID', 'string']]],
  ['event_typing_start', 'On Typing Started', 'A user starts typing', [['user_id', 'User ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['timestamp', 'Timestamp', 'number']]],
  ['event_channel_pins_update', 'On Pins Updated', 'Channel pins are updated', [['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['last_pin_timestamp', 'Last Pin At', 'string']]],
  ['event_message_reaction_remove_all', 'On All Reactions Removed', 'All reactions are removed from a message', [['message_id', 'Message ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string']]],
  ['event_select_menu', 'On Select Menu Used', 'A select menu is submitted', [['custom_id', 'Custom ID', 'string'], ['selected_values', 'Selected Values', 'string'], ['user_id', 'User ID', 'string'], ['guild_id', 'Server ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['application_id', 'Application ID', 'string'], ['interaction_id', 'Interaction ID', 'string'], ['interaction_token', 'Interaction Token', 'string']]],
  ['event_modal_submit', 'On Modal Submitted', 'A modal is submitted', [['custom_id', 'Custom ID', 'string'], ['submitted_values', 'Submitted Values', 'object'], ['user_id', 'User ID', 'string'], ['guild_id', 'Server ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['application_id', 'Application ID', 'string'], ['interaction_id', 'Interaction ID', 'string'], ['interaction_token', 'Interaction Token', 'string']]],
  ['event_member_remove', 'On Member Left', 'A user leaves a server', [['user_id', 'User ID', 'string'], ['guild_id', 'Server ID', 'string']]],
  ['event_voice_state_update', 'On Voice State Changed', 'A member joins, leaves, or changes voice state', [['user_id', 'User ID', 'string'], ['guild_id', 'Server ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['session_id', 'Session ID', 'string'], ['self_muted', 'Self Muted', 'boolean'], ['self_deafened', 'Self Deafened', 'boolean']]],
  ['event_presence_update', 'On Presence Updated', 'A member presence or status changes', [['user_id', 'User ID', 'string'], ['guild_id', 'Server ID', 'string'], ['status', 'Status', 'string']]],
  ['event_guild_ban_add', 'On User Banned', 'A user is banned from a server', [['user_id', 'User ID', 'string'], ['guild_id', 'Server ID', 'string']]],
  ['event_guild_ban_remove', 'On User Unbanned', 'A user is unbanned from a server', [['user_id', 'User ID', 'string'], ['guild_id', 'Server ID', 'string']]],
  ['event_scheduled_event_create', 'On Scheduled Event Created', 'A scheduled event is created', [['event_id', 'Event ID', 'string'], ['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['status', 'Status', 'number']]],
  ['event_scheduled_event_update', 'On Scheduled Event Updated', 'A scheduled event is updated', [['event_id', 'Event ID', 'string'], ['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['status', 'Status', 'number']]],
  ['event_scheduled_event_delete', 'On Scheduled Event Deleted', 'A scheduled event is deleted', [['event_id', 'Event ID', 'string'], ['guild_id', 'Server ID', 'string'], ['name', 'Name', 'string'], ['status', 'Status', 'number']]],
  ['event_automod_action', 'On AutoMod Action', 'AutoMod takes action on content', [['rule_id', 'Rule ID', 'string'], ['user_id', 'User ID', 'string'], ['guild_id', 'Server ID', 'string'], ['channel_id', 'Channel ID', 'string'], ['action_type', 'Action Type', 'number'], ['keyword', 'Matched Keyword', 'string']]],
  ['event_invite_create', 'On Invite Created', 'An invite is created', [['code', 'Invite Code', 'string'], ['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string'], ['inviter_id', 'Inviter ID', 'string']]],
  ['event_invite_delete', 'On Invite Deleted', 'An invite is deleted', [['code', 'Invite Code', 'string'], ['channel_id', 'Channel ID', 'string'], ['guild_id', 'Server ID', 'string']]],
  ['event_cron', 'On Schedule', 'Runs on a cron schedule', [['scheduled_at', 'Scheduled At', 'string'], ['time_zone', 'Time Zone', 'string']]]
].map(([type, label, description, fields]) => ({
  type, category: NodeCategories.EVENTS, label, color: '#5865F2', description, inputs: [],
  ...(type === 'event_cron' ? { gatewayEvent: 'CRON_TICK' } : {}),
  gatewayIntents: ({
    event_message_update: ['GUILD_MESSAGES', 'DIRECT_MESSAGES', 'MESSAGE_CONTENT'], event_message_delete: ['GUILD_MESSAGES', 'DIRECT_MESSAGES'],
    event_message_reaction_remove_all: ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS'],
    event_reaction_add: ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS'],
    event_reaction_remove: ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS'], event_member_remove: ['GUILD_MEMBERS'],
    event_voice_state_update: ['GUILD_VOICE_STATES'], event_presence_update: ['GUILD_PRESENCES'],
    event_thread_create: ['GUILD_MESSAGES'], event_thread_update: ['GUILD_MESSAGES'], event_thread_delete: ['GUILD_MESSAGES'],
    event_typing_start: ['GUILD_MESSAGE_TYPING'], event_channel_pins_update: ['GUILD_MESSAGES'],
    event_invite_create: ['GUILD_INVITES'], event_invite_delete: ['GUILD_INVITES'],
    event_guild_ban_add: ['GUILD_MODERATION'], event_guild_ban_remove: ['GUILD_MODERATION'],
    event_scheduled_event_create: ['GUILD_SCHEDULED_EVENTS'], event_scheduled_event_update: ['GUILD_SCHEDULED_EVENTS'],
    event_scheduled_event_delete: ['GUILD_SCHEDULED_EVENTS'], event_automod_action: ['AUTO_MODERATION_EXECUTION']
  })[type] || ['GUILDS'],
  outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, ...fields.map(([id, fieldLabel, fieldType]) => ({ id, label: fieldLabel, type: fieldType }))]
}));

export const PinColors = {
  exec: 'var(--wire-exec)',
  arg: '#9299a6',
  string: '#c084fc',
  number: '#38bdf8',
  boolean: '#f87171',
  object: '#fbbf24',
  embed: '#f472b6'
};

export const MAX_NODE_ARGUMENTS = 50;

export function getNodeArgumentPins(node, baseInputs = [], connections = []) {
  const excluded = ['function_input', 'function_return', 'function_call', 'variable_get'];
  if (!node || node.type.startsWith('event_') || excluded.includes(node.type) || node.type === 'data_permission_overwrites') return [];
  if (BuiltInNodeDefinitions.some((definition) => definition.type === node.type && definition.pluginAdapter)) return [];
  if (!['build_embed', 'build_modal', 'format_text'].includes(node.type) && !baseInputs.some((pin) => pin.type === 'string')) return [];
  const highestConnectedArgument = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const match = /^arg_(\d+)$/.exec(connection.targetPinId);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const count = Math.min(MAX_NODE_ARGUMENTS, Math.max(1, highestConnectedArgument + 1));
  return Array.from({ length: count }, (_, index) => ({ id: `arg_${index + 1}`, label: `arg${index + 1}`, type: 'arg', defaultValue: '' }));
}

export function getArrayCreatePins(node, connections = []) {
  if (node?.type !== 'data_array_create') return [];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const match = /^item_(\d+)$/.exec(connection.targetPinId);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const stored = Object.keys(node.data || {}).reduce((highest, key) => Math.max(highest, Number(/^item_(\d+)$/.exec(key)?.[1]) || 0), 0);
  const count = Math.min(50, Math.max(1, highestConnected + 1, stored));
  return Array.from({ length: count }, (_, index) => ({ id: `item_${index + 1}`, label: `Item ${index + 1}`, type: 'arg', defaultValue: null }));
}

export function getArrayCombinePins(node, connections = []) {
  if (node?.type !== 'data_array_concat') return [];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    return Math.max(highest, Number(/^array_(\d+)$/.exec(connection.targetPinId)?.[1]) || 0);
  }, 0);
  const count = Math.min(50, Math.max(2, highestConnected + 1));
  const pins = Array.from({ length: count }, (_, index) => ({ id: `array_${index + 1}`, label: `Array ${index + 1}`, type: 'object', defaultValue: [] }));
  if (connections.some((connection) => connection.targetNodeId === node.id && ['array_a', 'array_b'].includes(connection.targetPinId))) {
    pins.push({ id: 'array_a', label: 'Array A', type: 'object', defaultValue: [] }, { id: 'array_b', label: 'Array B', type: 'object', defaultValue: [] });
  }
  return pins;
}

export function getArrayAppendPins(node, connections = []) {
  if (node?.type !== 'data_array_append') return [];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    return Math.max(highest, Number(/^item_(\d+)$/.exec(connection.targetPinId)?.[1]) || 0);
  }, 0);
  const stored = Object.keys(node.data || {}).reduce((highest, key) => Math.max(highest, Number(/^item_(\d+)$/.exec(key)?.[1]) || 0), 0);
  const pins = Array.from({ length: Math.min(MAX_NODE_ARGUMENTS, Math.max(1, highestConnected + 1, stored)) }, (_, index) => ({ id: `item_${index + 1}`, label: `Item ${index + 1}`, type: 'arg', defaultValue: undefined }));
  if (connections.some((connection) => connection.targetNodeId === node.id && connection.targetPinId === 'value')) {
    pins.push({ id: 'value', label: 'Item', type: 'arg', defaultValue: undefined });
  }
  return pins;
}

export function getMathListPins(node, connections = []) {
  if (!['math_sum', 'math_average'].includes(node?.type)) return [];
  const pinIds = ['a', 'b', 'c', 'd'];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const index = pinIds.indexOf(connection.targetPinId);
    const extra = /^value_(\d+)$/.exec(connection.targetPinId);
    return Math.max(highest, index >= 0 ? index + 1 : extra ? Number(extra[1]) : 0);
  }, 0);
  const count = Math.min(50, Math.max(2, highestConnected + 1));
  return Array.from({ length: count }, (_, index) => ({ id: pinIds[index] || `value_${index + 1}`, label: index < 4 ? String.fromCharCode(65 + index) : `Value ${index + 1}`, type: 'number', defaultValue: 0 }));
}

export function getPermissionOverwritePins(node, connections = []) {
  if (node?.type !== 'data_permission_overwrites') return [];
  const highestConnectedTarget = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    const match = /^target_id_(\d+)$/.exec(connection.targetPinId);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const existingTargetCount = Object.keys(node.data || {}).reduce((highest, key) => Math.max(highest, Number(/^target_id_(\d+)$/.exec(key)?.[1]) || 0), 0);
  const count = Math.min(100, Math.max(1, Number(node.data?.overwriteCount) || 0, existingTargetCount, highestConnectedTarget + 1));
  return Array.from({ length: count }, (_, index) => ({ id: `target_id_${index + 1}`, label: `Target ID ${index + 1}`, type: 'string', defaultValue: '' }));
}

export function getTextTemplateSlots(template) {
  const slots = new Set();
  const pattern = /(\\)?(\{\{\s*([^{}]+?)\s*\}\})/g;
  for (const match of String(template ?? '').matchAll(pattern)) {
    if (match[1]) continue;
    const base = match[3].split('|')[0].trim();
    const withoutStrings = base.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
    for (const name of withoutStrings.match(/[A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || []) {
      if (!['true', 'false', 'null', 'undefined'].includes(name.toLowerCase()) && !name.toLowerCase().startsWith('e_')) slots.add(name);
    }
  }
  return [...slots];
}

function splitTemplateExpression(source, delimiter) {
  let quote = ''; let escaped = false; let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quote) { escaped = true; continue; }
    if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
    if (quote) continue;
    if (char === '(') { depth += 1; continue; }
    if (char === ')') { depth = Math.max(0, depth - 1); continue; }
    if (!depth && source.startsWith(delimiter, index)) return index;
  }
  return -1;
}

function splitTemplatePipeline(source) {
  const parts = [];
  let quote = ''; let escaped = false; let depth = 0; let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quote) { escaped = true; continue; }
    if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
    if (quote) continue;
    if (char === '(') { depth += 1; continue; }
    if (char === ')') { depth = Math.max(0, depth - 1); continue; }
    if (!depth && char === '|') { parts.push(source.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function templateLiteral(source) {
  const value = source.trim();
  if (/^"(?:\\.|[^"\\])*"$/.test(value)) { try { return JSON.parse(value); } catch { return undefined; } }
  if (/^'(?:\\.|[^'\\])*'$/.test(value)) return value.slice(1, -1).replace(/\\(['\\])/g, '$1');
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === 'undefined') return null;
  return undefined;
}

function evaluateTemplateExpression(source, resolveSlot) {
  const expression = source.trim();
  const question = splitTemplateExpression(expression, '?');
  if (question >= 0) {
    const remainder = expression.slice(question + 1);
    const colon = splitTemplateExpression(remainder, ':');
    if (colon < 0) return { found: false, value: undefined };
    const condition = expression.slice(0, question).trim();
    let conditionValue;
    let operatorIndex = -1; let operator = '';
    for (const candidate of ['!==', '===', '!=', '==', '>=', '<=', '>', '<']) {
      operatorIndex = splitTemplateExpression(condition, candidate);
      if (operatorIndex >= 0) { operator = candidate; break; }
    }
    const read = (part) => {
      const literal = templateLiteral(part);
      if (literal !== undefined || part.trim() === 'undefined') return literal;
      if (/^(?:[A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/.test(part.trim())) return resolveSlot?.(part.trim(), `{{${part.trim()}}}`);
      return undefined;
    };
    if (operator) {
      const left = read(condition.slice(0, operatorIndex)); const right = read(condition.slice(operatorIndex + operator.length));
      if (operator === '==' || operator === '===') conditionValue = left === right;
      else if (operator === '!=' || operator === '!==') conditionValue = left !== right;
      else if (operator === '>') conditionValue = left > right;
      else if (operator === '>=') conditionValue = left >= right;
      else if (operator === '<') conditionValue = left < right;
      else conditionValue = left <= right;
    } else {
      const negate = condition.startsWith('!');
      conditionValue = Boolean(read(negate ? condition.slice(1) : condition));
      if (negate) conditionValue = !conditionValue;
    }
    return evaluateTemplateExpression(conditionValue ? remainder.slice(0, colon) : remainder.slice(colon + 1), resolveSlot);
  }
  const literal = templateLiteral(expression);
  if (literal !== undefined || expression === 'undefined') return { found: true, value: literal };
  if (/^(?:[A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/.test(expression)) {
    const value = resolveSlot?.(expression, `{{${expression}}}`);
    return { found: value !== undefined, value };
  }
  return { found: false, value: undefined };
}

export function renderTextTemplate(template, resolveSlot, appEmojis = []) {
  const pattern = /(\\)?(\{\{\s*([^{}]+?)\s*\}\})/g;
  return String(template ?? '').replace(pattern, (_match, escaped, token, expression) => {
    if (escaped) return `\\${token}`;
    const parts = splitTemplatePipeline(expression);
    const name = /^([A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/.exec(parts[0])?.[1];
    if (name?.toLowerCase().startsWith('e_')) {
      const emojiName = name.slice(2).toLowerCase();
      const emoji = appEmojis.find?.((item) => item?.name?.toLowerCase() === emojiName);
      if (emoji?.id && emoji.name) return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
    }
    const resolved = evaluateTemplateExpression(parts[0], resolveSlot);
    let value = resolved.value;
    const transforms = parts.slice(1);
    const text = () => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    for (const transform of transforms) {
      const match = /^([A-Za-z][A-Za-z0-9]*)(?:\((.*)\))?$/.exec(transform);
      if (!match) continue;
      const filter = match[1].toLowerCase();
      const args = match[2] === undefined ? [] : match[2].split(',').map((part) => { const parsed = templateLiteral(part); return parsed === undefined ? part.trim().replace(/^['"]|['"]$/g, '') : parsed; });
      if (['lower', 'lowercase', 'tolowercase'].includes(filter)) value = text().toLocaleLowerCase();
      else if (['upper', 'uppercase', 'touppercase'].includes(filter)) value = text().toLocaleUpperCase();
      else if (filter === 'trim') value = text().trim();
      else if (filter === 'trimstart') value = text().trimStart();
      else if (filter === 'trimend') value = text().trimEnd();
      else if (filter === 'title' || filter === 'titlecase') value = text().toLocaleLowerCase().replace(/(^|[\s\p{P}\p{S}])([\p{L}\p{N}])/gu, (_all, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`);
      else if (filter === 'capitalize') value = text().replace(/^\s*\p{L}/u, (letter) => letter.toLocaleUpperCase());
      else if (filter === 'replace' && args.length > 1 && String(args[0])) value = text().split(String(args[0])).join(String(args[1]));
      else if (filter === 'replacefirst' && args.length > 1 && String(args[0])) value = text().replace(String(args[0]), String(args[1]));
      else if (filter === 'join' && Array.isArray(value)) value = value.map((item) => item == null ? '' : String(item)).join(args[0] ?? ', ');
      else if (filter === 'slice') value = value?.slice?.(Number(args[0]) || 0, args[1] === undefined ? undefined : Number(args[1]));
      else if (filter === 'length') value = value?.length ?? text().length;
      else if (filter === 'json') value = JSON.stringify(value) ?? '';
      else if (filter === 'default' && (value == null || value === '')) value = args[0] ?? '';
    }
    if (!resolved.found && !transforms.some((filter) => /^default\s*\(/i.test(filter))) return token;
    return text();
  });
}

export function createDefaultNodeData(type) {
  if (type === 'repeat_while') return { condition: true, interval_ms: 500 };
  if (type === 'event_cron') return { cronExpression: '*/5 * * * *', timeZone: 'UTC' };
  if (type === 'function_input') return { paramId: `param_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, name: 'Input', valueType: 'number', optional: false, defaultValue: 0 };
  if (type === 'function_return') return { valueType: 'number' };
  if (type === 'math_round') return { precision: 0 };
  if (type === 'math_compare') return { operation: 'less_than' };
  if (type === 'math_constant') return { constant: 'pi' };
  if (type === 'function_math') return { operation: 'add' };
  if (type === 'build_embed') return { blocks: [], components: [] };
  if (type === 'build_modal') return { modal: { customId: 'arc_modal', title: 'Tell us more', components: [{ type: 'text', customId: 'details', label: 'Details', style: 2, required: true, minLength: 1, maxLength: 1000 }] } };
  if (type === 'data_permission_overwrites') return {
    overwriteCount: 1,
    target_id_1: '', target_type_1: 0, allow_1: [], deny_1: []
  };
  const pluginDefinition = BuiltInNodeDefinitions?.find((definition) => definition.type === type && definition.pluginAdapter);
  if (pluginDefinition) return Object.fromEntries(pluginDefinition.inputs.filter((pin) => pin.type !== 'exec' && pin.defaultValue !== undefined).map((pin) => [pin.id, pin.defaultValue]));
  return {};
}

export const BuiltInNodeDefinitions = [
  {
    type: 'data_permission_overwrites',
    category: NodeCategories.VALUES,
    label: 'Channel Permission Overwrites',
    color: '#06b6d4',
    description: 'Builds structured channel access rules. Choose a role or member, then select which channel permissions it can allow or deny.',
    inputs: [{ id: 'target_id_1', label: 'Target ID 1', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'overwrites', label: 'Overwrites', type: 'object' }]
  },
  // EVENTS
  {
    type: 'event_message_create',
    category: NodeCategories.EVENTS,
    label: 'On Message Create',
    color: '#5865F2',
    description: 'Fires for every new message. Use Split Text or Parse Prefix Command to process message content.',
    gatewayIntents: ['GUILDS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES', 'MESSAGE_CONTENT'],
    inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'message_id', label: 'Message ID', type: 'string' },
      { id: 'content', label: 'Message Content', type: 'string' },
      { id: 'author_id', label: 'Author ID', type: 'string' },
      { id: 'author_name', label: 'Author Name', type: 'string' },
      { id: 'channel_id', label: 'Channel ID', type: 'string' },
      { id: 'is_bot', label: 'Is Bot', type: 'boolean' },
      { id: 'has_mentions', label: 'Has Mentions', type: 'boolean' },
      { id: 'mentions', label: 'Mentioned Users', type: 'object' },
      { id: 'mention_roles', label: 'Mentioned Roles', type: 'object' },
      { id: 'mention_everyone', label: 'Mentions Everyone', type: 'boolean' },
      { id: 'is_reply', label: 'Is Reply', type: 'boolean' },
      { id: 'referenced_message_id', label: 'Replied Message ID', type: 'string' },
      { id: 'reply_author_id', label: 'Replied Author ID', type: 'string' }
    ]
  },
  {
    type: 'event_slash_command',
    category: NodeCategories.EVENTS,
    label: 'On Slash Command',
    color: '#5865F2',
    description: 'Fires when an application slash command is invoked',
    gatewayIntents: [],
    inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'command_name', label: 'Command Name', type: 'string' },
      { id: 'user_id', label: 'User ID', type: 'string' },
      { id: 'username', label: 'Username', type: 'string' },
      { id: 'channel_id', label: 'Channel ID', type: 'string' },
      { id: 'guild_id', label: 'Server ID', type: 'string' },
      { id: 'application_id', label: 'Application ID', type: 'string' },
      { id: 'interaction_id', label: 'Interaction ID', type: 'string' },
      { id: 'interaction_token', label: 'Interaction Token', type: 'string' },
      { id: 'options', label: 'Command Arguments', type: 'object' }
    ]
  },
  {
    type: 'event_button_click',
    category: NodeCategories.EVENTS,
    label: 'On Button Click',
    color: '#5865F2',
    description: 'Fires when a message component button is pressed',
    gatewayIntents: [],
    inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'custom_id', label: 'Custom ID', type: 'string' },
      { id: 'user_id', label: 'User ID', type: 'string' },
      { id: 'application_id', label: 'Application ID', type: 'string' },
      { id: 'interaction_id', label: 'Interaction ID', type: 'string' },
      { id: 'interaction_token', label: 'Interaction Token', type: 'string' }
    ]
  },
  {
    type: 'event_member_join',
    category: NodeCategories.EVENTS,
    label: 'On Member Joined',
    color: '#5865F2',
    description: 'Fires when a new user joins a guild',
    gatewayIntents: ['GUILD_MEMBERS'],
    inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'user_id', label: 'User ID', type: 'string' },
      { id: 'username', label: 'Username', type: 'string' },
      { id: 'guild_id', label: 'Guild ID', type: 'string' }
    ]
  },
  ...gatewayEventNodes,

  // LOGIC
  {
    type: 'variable_get',
    category: NodeCategories.VARIABLES,
    label: 'Get Variable',
    color: '#38bdf8',
    description: 'Reads a graph variable as typed data',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: 'string' }]
  },
  {
    type: 'variable_set',
    category: NodeCategories.VARIABLES,
    label: 'Set Variable',
    color: '#38bdf8',
    description: 'Updates a graph variable during execution',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'value', label: 'Value', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
  },
  {
    type: 'function_input',
    category: NodeCategories.FUNCTIONS,
    label: 'Function Input',
    color: '#a78bfa',
    description: 'Defines a typed argument for a reusable function graph',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }]
  },
  {
    type: 'function_return',
    category: NodeCategories.FUNCTIONS,
    label: 'Return Value',
    color: '#a78bfa',
    description: 'Returns the connected value from this function graph',
    inputs: [{ id: 'value', label: 'Value', type: 'number', defaultValue: 0 }],
    outputs: []
  },
  {
    type: 'function_call',
    category: NodeCategories.FUNCTIONS,
    label: 'Call Function',
    color: '#a78bfa',
    description: 'Runs a reusable function graph and returns its result',
    inputs: [],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }]
  },
  {
    type: 'execute_graph',
    category: NodeCategories.LOGIC,
    label: 'Run Event Graph',
    color: '#8b5cf6',
    description: 'Runs another event graph for the same Discord event. The target must have a matching event node; graph cycles are rejected.',
    inputs: [{ id: 'exec', label: 'Exec', type: 'exec' }],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
  },
  {
    type: 'function_math',
    category: NodeCategories.FUNCTIONS,
    label: 'Calculate',
    color: '#a78bfa',
    description: 'Legacy arithmetic node. Use the Math nodes for new graphs.',
    hidden: true,
    inputs: [
      { id: 'a', label: 'A', type: 'number', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', defaultValue: 0 }
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }]
  },
  ...binaryMathNodes,
  ...unaryMathNodes,
  ...mathExtraNodes,
  ...booleanLogicNodes,
  {
    type: 'branch_if',
    category: NodeCategories.LOGIC,
    label: 'Branch (If / Else)',
    color: '#8b5cf6',
    description: 'Splits execution flow based on a boolean condition',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'condition', label: 'Condition', type: 'boolean', defaultValue: false }
    ],
    outputs: [
      { id: 'true_exec', label: 'True', type: 'exec' },
      { id: 'false_exec', label: 'False', type: 'exec' }
    ]
  },
  {
    type: 'compare_text',
    category: NodeCategories.LOGIC,
    label: 'Compare Text',
    color: '#8b5cf6',
    description: 'Compares two text strings (equals, contains, startsWith)',
    inputs: [
      { id: 'text_a', label: 'Text A', type: 'string', defaultValue: '' },
      { id: 'text_b', label: 'Text B', type: 'string', defaultValue: '' },
      { id: 'operator', label: 'Operator', type: 'string', defaultValue: 'equals' }
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean' }
    ]
  },
  {
    type: 'delay',
    category: NodeCategories.LOGIC,
    label: 'Wait (Async)',
    color: '#8b5cf6',
    description: 'Awaits a short timer for this run. Other Discord events and graph runs continue while it waits.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'ms', label: 'Duration (ms)', type: 'number', defaultValue: 1000 }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' }
    ]
  },
  {
    type: 'loop_count',
    category: NodeCategories.LOGIC,
    label: 'For Count',
    color: '#8b5cf6',
    description: 'Runs the Body branch once per iteration, then continues from Completed. Iterations are capped at 1,000 per run.',
    inputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'count', label: 'Count', type: 'number', defaultValue: 1 }],
    outputs: [{ id: 'body_exec', label: 'Body', type: 'exec' }, { id: 'completed_exec', label: 'Completed', type: 'exec' }, { id: 'index', label: 'Index (0-based)', type: 'number' }]
  },
  {
    type: 'repeat_while',
    category: NodeCategories.LOGIC,
    label: 'Repeat While',
    color: '#8b5cf6',
    introducedAt: '2026-10-17T00:00:00.000Z',
    description: 'While Condition is true, waits at least 100 ms, runs Body once, and checks again. It can run indefinitely. Route changes through shared graph variables or other live inputs to stop it.',
    inputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'condition', label: 'Condition', type: 'boolean', defaultValue: true }, { id: 'interval_ms', label: 'Interval (ms)', type: 'number', defaultValue: 500 }],
    outputs: [{ id: 'body_exec', label: 'Body', type: 'exec' }, { id: 'completed_exec', label: 'Completed', type: 'exec' }, { id: 'iteration', label: 'Iteration', type: 'number' }]
  },
  {
    type: 'wait_until_condition',
    category: NodeCategories.LOGIC,
    label: 'Wait Until Condition',
    color: '#8b5cf6',
    description: 'Checks a boolean condition until it becomes true. Times out through the Timed Out branch; polling is bounded.',
    inputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'condition', label: 'Condition', type: 'boolean', defaultValue: false }, { id: 'timeout_ms', label: 'Timeout (ms)', type: 'number', defaultValue: 30000 }, { id: 'interval_ms', label: 'Check Every (ms)', type: 'number', defaultValue: 250 }],
    outputs: [{ id: 'ready_exec', label: 'Ready', type: 'exec' }, { id: 'timeout_exec', label: 'Timed Out', type: 'exec' }]
  },
  {
    type: 'wait_until_time',
    category: NodeCategories.LOGIC,
    label: 'Wait Until Time',
    color: '#8b5cf6',
    description: 'Waits until an ISO date/time or Unix timestamp in milliseconds. Maximum wait is 7 days.',
    inputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'time', label: 'Time (ISO or ms)', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
  },
  {
    type: 'parallel',
    category: NodeCategories.LOGIC,
    label: 'Parallel',
    color: '#8b5cf6',
    description: 'Runs two execution branches concurrently. Both branches must connect to the same Join node before execution continues.',
    inputs: [{ id: 'exec', label: 'Exec', type: 'exec' }],
    outputs: [
      { id: 'branch_a_exec', label: 'Branch A', type: 'exec' },
      { id: 'branch_b_exec', label: 'Branch B', type: 'exec' }
    ]
  },
  {
    type: 'parallel_join',
    category: NodeCategories.LOGIC,
    label: 'Join',
    color: '#8b5cf6',
    description: 'Waits for both branches from one Parallel node, then continues once. For mutually exclusive If/Else paths, connect their exec wires directly to the same action node.',
    inputs: [{ id: 'exec', label: 'Exec', type: 'exec', description: 'Synchronization input · connect both branches from one Parallel node. Ordinary converging paths do not wait here.' }],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
  },
  {
    type: 'utility_wire_extender',
    category: NodeCategories.LOGIC,
    label: 'Wire Extender',
    color: '#a78bfa',
    introducedAt: '2026-10-16T00:00:00.000Z',
    description: 'Passes execution or any typed data value straight through. Use it to route wires neatly around a busy canvas.',
    inputs: [{ id: 'exec_in', label: 'Exec In', type: 'exec' }, { id: 'value_in_1', label: 'Any Value 1', type: 'any' }],
    outputs: [{ id: 'exec_out', label: 'Exec Out', type: 'exec' }, { id: 'value_out_1', label: 'Any Value 1', type: 'any' }]
  },

  // --- ACTIONS ---
  {
    type: 'action_send_message',
    category: NodeCategories.ACTIONS,
    label: 'Send Message',
    color: '#10b981',
    description: 'Sends message text, embeds, attachments, and interactive components to a Discord channel',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
      { id: 'content', label: 'Content', type: 'string', defaultValue: '' },
      { id: 'embed', label: 'Embed (Optional)', type: 'embed' },
      { id: 'components', label: 'Components (Optional)', type: 'object' },
      { id: 'files', label: 'Files (JSON, optional)', type: 'string', defaultValue: '[]' },
      { id: 'file_data', label: 'File Data URL / Base64', type: 'string', defaultValue: '' },
      { id: 'file_name', label: 'File Name', type: 'string', defaultValue: 'image.png' },
      { id: 'reply_to_message_id', label: 'Reply to Message ID', type: 'string', defaultValue: '' },
      { id: 'mention_replied_user', label: 'Mention Replied User', type: 'boolean', defaultValue: false }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'message_id', label: 'Message ID', type: 'string' }
    ]
  },
  {
    type: 'action_edit_message',
    category: NodeCategories.ACTIONS,
    label: 'Edit Message',
    color: '#10b981',
    description: 'Edits the content, embed, or components of an existing Discord message',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
      { id: 'message_id', label: 'Message ID', type: 'string', defaultValue: '' },
      { id: 'content', label: 'Content (Optional)', type: 'string', defaultValue: '' },
      { id: 'embed', label: 'Embed (Optional)', type: 'embed' },
      { id: 'components', label: 'Components (Optional)', type: 'object' },
      { id: 'files', label: 'Files (JSON, optional)', type: 'string', defaultValue: '[]' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'message_id', label: 'Message ID', type: 'string' }
    ]
  },
  {
    type: 'action_reply_interaction',
    category: NodeCategories.ACTIONS,
    label: 'Reply to Interaction',
    color: '#10b981',
    description: 'Responds to a slash command or component interaction with text, embeds, attachments, and interactive components',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'application_id', label: 'Application ID', type: 'string', defaultValue: '' },
      { id: 'interaction_id', label: 'Interaction ID', type: 'string', defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: 'string', defaultValue: '' },
      { id: 'content', label: 'Reply Content', type: 'string', defaultValue: '' },
      { id: 'embed', label: 'Embed (Optional)', type: 'embed' },
      { id: 'components', label: 'Components (Optional)', type: 'object' },
      { id: 'files', label: 'Files (JSON, optional)', type: 'string', defaultValue: '[]' },
      { id: 'ephemeral', label: 'Ephemeral (Hidden)', type: 'boolean', defaultValue: false }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' }
    ]
  },
  {
    type: 'action_show_modal', category: NodeCategories.ACTIONS, label: 'Show Popup Modal', color: '#10b981',
    description: 'Opens a configured Discord modal as the initial response to an interaction.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'interaction_id', label: 'Interaction ID', type: 'string', defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: 'string', defaultValue: '' },
      { id: 'modal', label: 'Modal', type: 'object' }
    ], outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
  },
  {
    type: 'action_deploy_slash_commands', category: NodeCategories.ACTIONS, label: 'Deploy Slash Commands', color: '#10b981',
    description: 'Deploys workspace slash commands when triggered by a server manager with Manage Server or Administrator.',
    inputs: [{ id: 'exec', label: 'Exec', type: 'exec' }],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'deployed_count', label: 'Commands Deployed', type: 'number' }, { id: 'success', label: 'Succeeded', type: 'boolean' }, { id: 'error', label: 'Error', type: 'string' }]
  },
  {
    type: 'action_defer_reply',
    category: NodeCategories.ACTIONS,
    label: 'Defer Reply',
    color: '#10b981',
    description: 'Acknowledge a slash command now and send its reply later. Connect Reply to Interaction after this node.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'interaction_id', label: 'Interaction ID', type: 'string', defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: 'string', defaultValue: '' },
      { id: 'ephemeral', label: 'Ephemeral (Hidden)', type: 'boolean', defaultValue: false }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'interaction_token', label: 'Interaction Token', type: 'string' }]
  },
  {
    type: 'action_defer_update',
    category: NodeCategories.ACTIONS,
    label: 'Defer Update',
    color: '#10b981',
    description: 'Acknowledge a button or select interaction now and update its message later. Connect Reply to Interaction after this node.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'interaction_id', label: 'Interaction ID', type: 'string', defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'interaction_token', label: 'Interaction Token', type: 'string' }]
  },
  {
    type: 'action_edit_interaction_reply',
    category: NodeCategories.ACTIONS,
    label: 'Edit Interaction Reply',
    color: '#f59e0b',
    description: 'Edits the original reply to a slash command, button, or select menu interaction after it has already been sent',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'application_id', label: 'Application ID', type: 'string', defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: 'string', defaultValue: '' },
      { id: 'content', label: 'New Content (Optional)', type: 'string', defaultValue: '' },
      { id: 'embed', label: 'Embed (Optional)', type: 'embed' },
      { id: 'components', label: 'Components (Optional)', type: 'object' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' }
    ]
  },
  {
    type: 'action_set_presence',
    category: NodeCategories.ACTIONS,
    label: 'Set App Presence',
    color: '#10b981',
    description: 'Updates live app status and activity message',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'status', label: 'Status', type: 'string', defaultValue: 'online' },
      { id: 'activity_text', label: 'Activity Text', type: 'string', defaultValue: 'Arc App' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' }
    ]
  },
  {
    type: 'action_create_channel', category: NodeCategories.ACTIONS, label: 'Create Channel', color: '#10b981',
    description: 'Creates a text, voice, category, announcement, or stage channel. Requires Manage Channels.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
      { id: 'name', label: 'Name', type: 'string', defaultValue: '' },
      { id: 'channel_type', label: 'Type', type: 'string', defaultValue: 'text' },
      { id: 'parent_id', label: 'Category ID', type: 'string', defaultValue: '' },
      { id: 'permission_overwrites', label: 'Permission Overwrites', type: 'object', defaultValue: [] },
      { id: 'topic', label: 'Topic', type: 'string', defaultValue: '' },
      { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'channel_id', label: 'Channel ID', type: 'string' }]
  },
  {
    type: 'action_edit_channel', category: NodeCategories.ACTIONS, label: 'Edit Channel', color: '#10b981',
    description: 'Changes a channel name, topic, or category. Requires Manage Channels.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
      { id: 'name', label: 'Name', type: 'string', defaultValue: '' },
      { id: 'topic', label: 'Topic', type: 'string', defaultValue: '' },
      { id: 'parent_id', label: 'Category ID', type: 'string', defaultValue: '' },
      { id: 'permission_overwrites', label: 'Permission Overwrites', type: 'object', defaultValue: [] },
      { id: 'rate_limit_per_user', label: 'Slowmode (seconds)', type: 'number', defaultValue: 0 },
      { id: 'nsfw', label: 'Age restricted', type: 'boolean', defaultValue: false },
      { id: 'bitrate', label: 'Voice bitrate', type: 'number', defaultValue: 64000 },
      { id: 'user_limit', label: 'Voice user limit', type: 'number', defaultValue: 0 },
      { id: 'rtc_region', label: 'Voice region', type: 'string', defaultValue: '' },
      { id: 'video_quality_mode', label: 'Voice video quality mode', type: 'number', defaultValue: 1 },
      { id: 'default_auto_archive_duration', label: 'Thread auto archive (minutes)', type: 'number', defaultValue: 1440 },
      { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'channel_id_out', label: 'Channel ID', type: 'string' }]
  },
  {
    type: 'action_delete_channel', category: NodeCategories.ACTIONS, label: 'Delete Channel', color: '#ef4444',
    description: 'Permanently deletes a channel. This cannot be undone. Requires Manage Channels.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
      { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'deleted_channel_id', label: 'Deleted Channel ID', type: 'string' }]
  },
  {
    type: 'action_create_role', category: NodeCategories.ACTIONS, label: 'Create Role', color: '#10b981',
    description: 'Creates a role with a name, RGB color number, and mentionable setting. Requires Manage Roles.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
      { id: 'name', label: 'Name', type: 'string', defaultValue: 'new role' },
      { id: 'color', label: 'Color (RGB number)', type: 'number', defaultValue: 0 },
      { id: 'permissions', label: 'Permissions Bitfield', type: 'string', defaultValue: '0' },
      { id: 'hoist', label: 'Show separately', type: 'boolean', defaultValue: false },
      { id: 'mentionable', label: 'Mentionable', type: 'boolean', defaultValue: false },
      { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }, { id: 'role_id', label: 'Role ID', type: 'string' }]
  },
  {
    type: 'action_member_role', category: NodeCategories.ACTIONS, label: 'Set Member Role', color: '#10b981',
    description: 'Adds or removes a role from a guild member. Requires Manage Roles.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
      { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '' },
      { id: 'role_id', label: 'Role ID', type: 'string', defaultValue: '' },
      { id: 'operation', label: 'Operation', type: 'string', defaultValue: 'add' },
      { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
  },
  {
    type: 'action_voice_channel_status', category: NodeCategories.ACTIONS, label: 'Set Voice Channel Status', color: '#10b981',
    description: 'Sets or clears a voice channel status. Requires Set Voice Channel Status; Manage Channels may also be required.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'channel_id', label: 'Voice Channel ID', type: 'string', defaultValue: '' },
      { id: 'status', label: 'Status (blank clears)', type: 'string', defaultValue: '' },
      { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
  },
  {
    type: 'action_voice_state', category: NodeCategories.ACTIONS, label: 'Request Voice Join / Leave', color: '#10b981',
    description: 'Requests a Gateway voice-state change. Joining does not create an audio connection or play audio.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
      { id: 'channel_id', label: 'Voice Channel ID (blank leaves)', type: 'string', defaultValue: '' },
      { id: 'self_mute', label: 'Self Mute', type: 'boolean', defaultValue: false },
      { id: 'self_deaf', label: 'Self Deafen', type: 'boolean', defaultValue: false }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
  },

  // VALUES & BUILDERS
  {
    type: 'value_text',
    category: NodeCategories.VALUES,
    label: 'Text String',
    color: '#f59e0b',
    description: 'Provides a static or dynamic text string',
    hidden: true,
    inputs: [
      { id: 'value', label: 'Value', type: 'string', defaultValue: 'Hello World' }
    ],
    outputs: [
      { id: 'value', label: 'Text', type: 'string' }
    ]
  },
  {
    type: 'value_number',
    category: NodeCategories.VALUES,
    label: 'Number',
    color: '#06b6d4',
    description: 'Provides a numeric constant',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', defaultValue: 0 }
    ],
    outputs: [
      { id: 'value', label: 'Number', type: 'number' }
    ]
  },
  {
    type: 'value_boolean',
    category: NodeCategories.VALUES,
    label: 'Boolean',
    color: '#ef4444',
    description: 'Provides a true or false constant',
    inputs: [{ id: 'value', label: 'Value', type: 'boolean', defaultValue: true }],
    outputs: [{ id: 'value', label: 'Boolean', type: 'boolean' }]
  },
  {
    type: 'data_to_json', category: NodeCategories.VALUES, label: 'To JSON', color: '#06b6d4',
    description: 'Serializes a value to compact JSON. Cyclic or unsupported values return an empty string and valid=false.',
    inputs: [{ id: 'value', label: 'Value', type: 'object', defaultValue: null }],
    outputs: [{ id: 'json', label: 'JSON', type: 'string' }, { id: 'valid', label: 'Valid', type: 'boolean' }]
  },
  {
    type: 'data_parse_json', category: NodeCategories.VALUES, label: 'Parse JSON', color: '#06b6d4',
    description: 'Parses JSON text into a value. Check Valid before using the parsed output.',
    inputs: [{ id: 'json', label: 'JSON', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'value', label: 'Value', type: 'object' }, { id: 'valid', label: 'Valid', type: 'boolean' }]
  },
  {
    type: 'data_array_create', category: NodeCategories.VALUES, label: 'Create Array', color: '#06b6d4',
    description: 'Collects connected values in order. One extra socket appears as you use each socket, up to 50 items; use Combine Arrays to combine arrays.',
    inputs: [{ id: 'item_1', label: 'Item 1', type: 'arg', defaultValue: null }],
    outputs: [{ id: 'array', label: 'Array', type: 'object' }, { id: 'length', label: 'Length', type: 'number' }]
  },
  {
    type: 'data_array_length', category: NodeCategories.VALUES, label: 'Array Length', color: '#06b6d4',
    description: 'Returns the number of items in an array and whether it is empty.',
    inputs: [{ id: 'array', label: 'Array', type: 'object', defaultValue: [] }],
    outputs: [{ id: 'length', label: 'Length', type: 'number' }, { id: 'empty', label: 'Is Empty', type: 'boolean' }]
  },
  {
    type: 'data_array_get', category: NodeCategories.VALUES, label: 'Get Array Item', color: '#06b6d4',
    description: 'Reads an item by its zero-based index. Check Found before using the result.',
    inputs: [{ id: 'array', label: 'Array', type: 'object', defaultValue: [] }, { id: 'index', label: 'Index', type: 'number', defaultValue: 0 }],
    outputs: [{ id: 'value', label: 'Item', type: 'arg' }, { id: 'found', label: 'Found', type: 'boolean' }]
  },
  {
    type: 'data_array_set', category: NodeCategories.VALUES, label: 'Edit Array Item', color: '#06b6d4',
    description: 'Returns a copy of the array with an existing zero-based index replaced. The source array is unchanged.',
    inputs: [{ id: 'array', label: 'Array', type: 'object', defaultValue: [] }, { id: 'index', label: 'Index', type: 'number', defaultValue: 0 }, { id: 'value', label: 'New Item', type: 'arg', defaultValue: null }],
    outputs: [{ id: 'array', label: 'Array', type: 'object' }, { id: 'updated', label: 'Updated', type: 'boolean' }]
  },
  {
    type: 'data_array_append', category: NodeCategories.VALUES, label: 'Append Array Items', color: '#06b6d4',
    description: 'Returns a copy with connected items appended in socket order. Connect an item to reveal another socket, up to 50; chain another Append Array Items node for more.',
    inputs: [{ id: 'array', label: 'Array', type: 'object', defaultValue: [] }, { id: 'item_1', label: 'Item 1', type: 'arg', defaultValue: undefined }],
    outputs: [{ id: 'array', label: 'Array', type: 'object' }, { id: 'length', label: 'Length', type: 'number' }]
  },
  {
    type: 'data_object_get', category: NodeCategories.VALUES, label: 'Get Object Property', color: '#06b6d4',
    description: 'Reads a property by key. Check Exists to distinguish a missing property from an empty value.',
    inputs: [{ id: 'object', label: 'Object', type: 'object', defaultValue: {} }, { id: 'key', label: 'Property', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'value', label: 'Value', type: 'arg' }, { id: 'exists', label: 'Exists', type: 'boolean' }]
  },
  {
    type: 'data_object_set', category: NodeCategories.VALUES, label: 'Set Object Property', color: '#06b6d4',
    description: 'Returns a copy of an object with the selected property added or replaced.',
    inputs: [{ id: 'object', label: 'Object', type: 'object', defaultValue: {} }, { id: 'key', label: 'Property', type: 'string', defaultValue: '' }, { id: 'value', label: 'Value', type: 'arg', defaultValue: '' }],
    outputs: [{ id: 'object', label: 'Object', type: 'object' }]
  },
  {
    type: 'data_object_keys', category: NodeCategories.VALUES, label: 'Object Keys', color: '#06b6d4',
    description: 'Returns the enumerable property names of an object as an array.',
    inputs: [{ id: 'object', label: 'Object', type: 'object', defaultValue: {} }],
    outputs: [{ id: 'keys', label: 'Keys', type: 'object' }, { id: 'length', label: 'Length', type: 'number' }]
  },
  {
    type: 'data_string_split', category: NodeCategories.VALUES, label: 'Split Text', color: '#06b6d4',
    description: 'Splits text at each exact separator string. Connect Part 1, Part 2, and more as needed; each used output reveals the next socket. It does not parse command prefixes or quoted arguments.',
    inputs: [{ id: 'text', label: 'Text', type: 'string', defaultValue: '' }, { id: 'separator', label: 'Separator', type: 'string', defaultValue: ',' }],
    outputs: [{ id: 'array', label: 'Parts', type: 'object' }, { id: 'length', label: 'Count', type: 'number' }]
  },
  {
    type: 'data_parse_prefix_command', category: NodeCategories.VALUES, label: 'Parse Prefix Command', color: '#06b6d4',
    description: 'Checks for a prefix, extracts the command, and parses whitespace-separated arguments. Quoted arguments can contain spaces.',
    inputs: [{ id: 'content', label: 'Message Content', type: 'string', defaultValue: '' }, { id: 'prefix', label: 'Prefix', type: 'string', defaultValue: '!' }],
    outputs: [
      { id: 'recognized', label: 'Recognized', type: 'boolean' },
      { id: 'command', label: 'Command', type: 'string' },
      { id: 'arguments', label: 'Arguments', type: 'object' },
      { id: 'argument_count', label: 'Argument Count', type: 'number' }
    ]
  },
  {
    type: 'data_string_join', category: NodeCategories.VALUES, label: 'Join Text', color: '#06b6d4',
    description: 'Joins array values into one string using the separator.',
    inputs: [{ id: 'array', label: 'Items', type: 'object', defaultValue: [] }, { id: 'separator', label: 'Separator', type: 'string', defaultValue: ', ' }],
    outputs: [{ id: 'text', label: 'Text', type: 'string' }]
  },
  {
    type: 'data_text_replace', category: NodeCategories.VALUES, label: 'Replace Text', color: '#06b6d4',
    description: 'Replaces every literal occurrence of a search string and reports how many replacements were made.',
    inputs: [
      { id: 'text', label: 'Text', type: 'string', defaultValue: '' },
      { id: 'search', label: 'Find', type: 'string', defaultValue: '' },
      { id: 'replacement', label: 'Replace with', type: 'string', defaultValue: '' }
    ],
    outputs: [{ id: 'text', label: 'Text', type: 'string' }, { id: 'replacements', label: 'Replacements', type: 'number' }]
  },
  {
    type: 'data_array_concat', category: NodeCategories.VALUES, label: 'Combine Arrays', color: '#06b6d4',
    description: 'Concatenates connected arrays in input order into a new array. Use another Create Array node for more than 50 individual items.',
    inputs: [{ id: 'array_1', label: 'Array 1', type: 'object', defaultValue: [] }, { id: 'array_2', label: 'Array 2', type: 'object', defaultValue: [] }],
    outputs: [{ id: 'array', label: 'Array', type: 'object' }, { id: 'length', label: 'Length', type: 'number' }]
  },
  ...[
    ['data_text_uppercase', 'Uppercase Text', 'Converts text to uppercase.'],
    ['data_text_lowercase', 'Lowercase Text', 'Converts text to lowercase.'],
    ['data_text_titlecase', 'Title Case Text', 'Capitalizes the first letter of each word.'],
    ['data_text_trim', 'Trim Text', 'Removes whitespace from the start and end of text.']
  ].map(([type, label, description]) => ({ type, category: NodeCategories.VALUES, label, color: '#06b6d4', description, inputs: [{ id: 'text', label: 'Text', type: 'string', defaultValue: '' }], outputs: [{ id: 'text', label: 'Text', type: 'string' }] })),
  {
    type: 'data_format_time', category: NodeCategories.VALUES, label: 'Format Date & Time', color: '#06b6d4',
    description: 'Formats an ISO date or Unix millisecond timestamp using a locale, time zone, and date/time styles.',
    inputs: [
      { id: 'value', label: 'Date / timestamp', type: 'string', defaultValue: '' },
      { id: 'locale', label: 'Locale', type: 'string', defaultValue: 'en-US' },
      { id: 'timeZone', label: 'Time zone', type: 'string', defaultValue: 'UTC' },
      { id: 'dateStyle', label: 'Date style', type: 'string', defaultValue: 'medium' },
      { id: 'timeStyle', label: 'Time style', type: 'string', defaultValue: 'short' }
    ],
    outputs: [{ id: 'text', label: 'Formatted time', type: 'string' }, { id: 'valid', label: 'Valid', type: 'boolean' }]
  },
  {
    type: 'data_to_iso_time', category: NodeCategories.VALUES, label: 'To ISO Date', color: '#06b6d4',
    description: 'Converts an ISO date or Unix millisecond timestamp to a UTC ISO 8601 string.',
    inputs: [{ id: 'value', label: 'Date / timestamp', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'text', label: 'ISO date', type: 'string' }, { id: 'valid', label: 'Valid', type: 'boolean' }]
  },
  {
    type: 'format_text',
    category: NodeCategories.VALUES,
    label: 'Text Builder',
    color: '#06b6d4',
    description: 'Combines text and graph variables using {{name}} slots',
    inputs: [],
    outputs: [{ id: 'text', label: 'Text', type: 'string' }]
  },
  {
    type: 'build_embed',
    category: NodeCategories.VALUES,
    label: 'Embed Builder',
    color: '#ec4899',
    description: 'Constructs a rich Discord embed object',
    inputs: [
      { id: 'title', label: 'Title', type: 'string', defaultValue: '' },
      { id: 'description', label: 'Description', type: 'string', defaultValue: '' },
      { id: 'url', label: 'URL', type: 'string', defaultValue: '' },
      { id: 'color', label: 'Hex Color (#)', type: 'string', defaultValue: '#5865F2' },
      { id: 'author_name', label: 'Author', type: 'string', defaultValue: '' },
      { id: 'author_url', label: 'Author URL', type: 'string', defaultValue: '' },
      { id: 'author_icon', label: 'Author Icon URL', type: 'string', defaultValue: '' },
      { id: 'footer_text', label: 'Footer Text', type: 'string', defaultValue: '' },
      { id: 'footer_icon', label: 'Footer Icon URL', type: 'string', defaultValue: '' },
      { id: 'thumbnail_url', label: 'Thumbnail URL', type: 'string', defaultValue: '' },
      { id: 'image_url', label: 'Image URL', type: 'string', defaultValue: '' }
    ],
    outputs: [
      { id: 'embed', label: 'Embed', type: 'embed' },
      { id: 'components', label: 'Components', type: 'object' }
    ]
  },
  {
    type: 'build_modal', category: NodeCategories.VALUES, label: 'Popup Modal Builder', color: '#06b6d4',
    description: 'Builds a Discord modal with 1–5 labeled inputs, selects, or checkbox groups.',
    inputs: [], outputs: [{ id: 'modal', label: 'Modal', type: 'object' }]
  },
  {
    type: 'data_get_modal_value', category: NodeCategories.VALUES, label: 'Get Modal Value', color: '#06b6d4',
    description: 'Reads a submitted modal field by custom ID; multi-select fields return arrays.',
    inputs: [
      { id: 'submitted_values', label: 'Submitted Values', type: 'object', defaultValue: [] },
      { id: 'custom_id', label: 'Field Custom ID', type: 'string', defaultValue: '' }
    ], outputs: [{ id: 'value', label: 'Value', type: 'object' }, { id: 'found', label: 'Found', type: 'boolean' }]
  },
  {
    type: 'modify_embed',
    category: NodeCategories.VALUES,
    label: 'Modify Embed',
    color: '#ec4899',
    description: 'Updates specific fields on an existing embed without rebuilding it',
    inputs: [
      { id: 'embed', label: 'Base Embed', type: 'embed' },
      { id: 'title', label: 'Title (Optional)', type: 'string', defaultValue: '' },
      { id: 'description', label: 'Description (Optional)', type: 'string', defaultValue: '' },
      { id: 'color', label: 'Hex Color (#, optional)', type: 'string', defaultValue: '' },
      { id: 'image_url', label: 'Image URL (Optional)', type: 'string', defaultValue: '' },
      { id: 'thumbnail_url', label: 'Thumbnail URL (Optional)', type: 'string', defaultValue: '' },
      { id: 'footer_text', label: 'Footer Text (Optional)', type: 'string', defaultValue: '' },
      { id: 'author_name', label: 'Author Name (Optional)', type: 'string', defaultValue: '' },
      { id: 'field_name', label: 'Field Name (Optional)', type: 'string', defaultValue: '' },
      { id: 'field_value', label: 'Field Value (Optional)', type: 'string', defaultValue: '' }
    ],
    outputs: [
      { id: 'embed', label: 'Embed', type: 'embed' }
    ]
  },
  {
    type: 'modify_components',
    category: NodeCategories.VALUES,
    label: 'Modify Components',
    color: '#f59e0b',
    description: 'Enables, disables, or updates buttons/select menus in an action row',
    inputs: [
      { id: 'components', label: 'Components', type: 'object' },
      { id: 'custom_id', label: 'Target Custom ID ("all" for all)', type: 'string', defaultValue: 'all' },
      { id: 'disabled', label: 'Disabled', type: 'boolean', defaultValue: true },
      { id: 'label', label: 'New Label (Optional)', type: 'string', defaultValue: '' },
      { id: 'style', label: 'New Style (Optional)', type: 'string', defaultValue: '' }
    ],
    outputs: [
      { id: 'components', label: 'Components', type: 'object' }
    ]
  },
  // CRYPTOGRAPHY & SECURITY
  {
    type: 'action_crypto_hash',
    category: NodeCategories.CRYPTO,
    label: 'Cryptographic Hash',
    color: '#10b981',
    description: 'Computes SHA-256 or SHA-512 cryptographic hash digests',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'data', label: 'Input Data', type: 'string', defaultValue: '' },
      { id: 'algorithm', label: 'Algorithm', type: 'string', defaultValue: 'sha256' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'hash', label: 'Hash Digest', type: 'string' }
    ]
  },
  {
    type: 'action_crypto_hmac',
    category: NodeCategories.CRYPTO,
    label: 'HMAC Sign',
    color: '#059669',
    description: 'Generates HMAC signatures for API & webhook verification',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'data', label: 'Payload', type: 'string', defaultValue: '' },
      { id: 'secret', label: 'Secret Key', type: 'string', defaultValue: '' },
      { id: 'algorithm', label: 'Algorithm', type: 'string', defaultValue: 'sha256' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'signature', label: 'Signature', type: 'string' }
    ]
  },
  {
    type: 'action_crypto_verify_hmac',
    category: NodeCategories.CRYPTO,
    label: 'Verify HMAC',
    color: '#047857',
    description: 'Constant-time verification of HMAC signatures',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'data', label: 'Payload', type: 'string', defaultValue: '' },
      { id: 'secret', label: 'Secret Key', type: 'string', defaultValue: '' },
      { id: 'signature', label: 'Expected Signature', type: 'string', defaultValue: '' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'isValid', label: 'Is Valid', type: 'boolean' }
    ]
  },
  {
    type: 'action_crypto_encrypt',
    category: NodeCategories.CRYPTO,
    label: 'AES-256-GCM Encrypt',
    color: '#0d9488',
    description: 'Encrypts data using authenticated AES-256-GCM with PBKDF2',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'plaintext', label: 'Plaintext', type: 'string', defaultValue: '' },
      { id: 'passphrase', label: 'Passphrase (Optional)', type: 'string', defaultValue: '' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'ciphertext', label: 'Encrypted Envelope', type: 'string' }
    ]
  },
  {
    type: 'action_crypto_decrypt',
    category: NodeCategories.CRYPTO,
    label: 'AES-256-GCM Decrypt',
    color: '#0f766e',
    description: 'Decrypts and verifies AES-256-GCM authenticated envelopes',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'ciphertext', label: 'Encrypted Envelope', type: 'string', defaultValue: '' },
      { id: 'passphrase', label: 'Passphrase (Optional)', type: 'string', defaultValue: '' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'plaintext', label: 'Plaintext', type: 'string' }
    ]
  },
  {
    type: 'action_crypto_random',
    category: NodeCategories.CRYPTO,
    label: 'Generate Crypto Token',
    color: '#14b8a6',
    description: 'Generates secure cryptographic random hex, base64url tokens or numeric PINs',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'type', label: 'Format (hex/base64url/pin)', type: 'string', defaultValue: 'hex' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'token', label: 'Token / PIN', type: 'string' }
    ]
  },
  {
    type: 'action_web_fetch',
    category: NodeCategories.NETWORK,
    label: 'HTTP Request',
    color: '#0ea5e9',
    description: 'Make a bounded HTTP request with headers and an optional body. Local/private network destinations and redirects are blocked.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'url', label: 'URL', type: 'string', defaultValue: '' },
      { id: 'method', label: 'Method', type: 'string', defaultValue: 'GET' },
      { id: 'headers', label: 'Headers (JSON)', type: 'string', defaultValue: '{}' },
      { id: 'body', label: 'Body', type: 'string', defaultValue: '' },
      { id: 'timeout_ms', label: 'Timeout (ms)', type: 'number', defaultValue: 10000 },
      { id: 'max_bytes', label: 'Max response bytes', type: 'number', defaultValue: 1048576 }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'status', label: 'Status', type: 'number' },
      { id: 'ok', label: '2xx', type: 'boolean' },
      { id: 'body', label: 'Response Body', type: 'string' },
      { id: 'headers', label: 'Response Headers (JSON)', type: 'string' },
      { id: 'json', label: 'JSON', type: 'object' },
      { id: 'error', label: 'Error', type: 'string' }
    ]
  },
  {
    type: 'action_web_retry',
    category: NodeCategories.NETWORK,
    label: 'HTTP Request (Retry)',
    color: '#0284c7',
    description: 'Retries temporary network errors and HTTP 408, 425, 429, and 5xx responses with bounded backoff. Non-idempotent methods are not retried unless explicitly enabled.',
    inputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'url', label: 'URL', type: 'string', defaultValue: '' },
      { id: 'method', label: 'Method', type: 'string', defaultValue: 'GET' },
      { id: 'headers', label: 'Headers (JSON)', type: 'string', defaultValue: '{}' },
      { id: 'body', label: 'Body', type: 'string', defaultValue: '' },
      { id: 'timeout_ms', label: 'Timeout (ms)', type: 'number', defaultValue: 10000 },
      { id: 'max_bytes', label: 'Max response bytes', type: 'number', defaultValue: 1048576 },
      { id: 'max_attempts', label: 'Max attempts', type: 'number', defaultValue: 3 },
      { id: 'retry_delay_ms', label: 'Base retry delay (ms)', type: 'number', defaultValue: 500 },
      { id: 'retry_non_idempotent', label: 'Retry POST/other methods', type: 'boolean', defaultValue: false }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: 'exec' },
      { id: 'status', label: 'Status', type: 'number' },
      { id: 'ok', label: '2xx', type: 'boolean' },
      { id: 'body', label: 'Response Body', type: 'string' },
      { id: 'headers', label: 'Response Headers (JSON)', type: 'string' },
      { id: 'json', label: 'JSON', type: 'object' },
      { id: 'attempts', label: 'Attempts', type: 'number' },
      { id: 'error', label: 'Error', type: 'string' }
    ]
  }
];
//
export function isNodeDefinitionNew(definition, now = Date.now()) {
  const createdAt = Date.parse(definition?.introducedAt || definition?.createdAt || '');
  const age = now - createdAt;
  return Number.isFinite(createdAt) && age >= 0 && age < 14 * 24 * 60 * 60 * 1000;
}

const adapterNodeTypes = new Set();
export function registerPluginNodeDefinitions(plugins = []) {
  for (let index = BuiltInNodeDefinitions.length - 1; index >= 0; index -= 1) {
    if (adapterNodeTypes.has(BuiltInNodeDefinitions[index].type)) BuiltInNodeDefinitions.splice(index, 1);
  }
  adapterNodeTypes.clear();
  for (const plugin of plugins) {
    if (!['wasm-adapter', 'host-adapter'].includes(plugin?.kind) || !Array.isArray(plugin.nodes)) continue;
    for (const node of plugin.nodes) {
      if (!node?.pluginAdapter || typeof node.type !== 'string' || !node.type.startsWith(`${plugin.id}.`)) continue;
      BuiltInNodeDefinitions.push({ ...node, pluginId: plugin.id, pluginName: plugin.name || plugin.id });
      adapterNodeTypes.add(node.type);
    }
  }
}
