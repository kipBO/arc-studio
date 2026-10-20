import { EmbedBuilder } from 'chezcord';
//
export const NodeCategories = Object.freeze({
  EVENTS: 'Events',
  ACTIONS: 'Discord Actions',
  LOGIC: 'Logic & Flow',
  VARIABLES: 'Variables',
  VALUES: 'Values & Data',
  FUNCTIONS: 'Functions',
  CRYPTO: 'Cryptography & Security',
  MATH: 'Math',
  NETWORK: 'Web & Network'
});

export const PinTypes = Object.freeze({
  EXEC: 'exec',
  VARIABLE: 'variable',
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  ARG: 'arg',
  EMBED: 'embed'
});

const gatewayEventDefinition = (type, label, gatewayEvent, gatewayIntents, fields) => ({
  type,
  category: NodeCategories.EVENTS,
  label,
  color: '#5865F2',
  gatewayEvent,
  gatewayIntents,
  ...(type === 'event_select_menu' ? { gatewayInteractionType: 3, gatewayComponentTypes: [3, 5, 6, 7, 8] } : {}),
  ...(type === 'event_modal_submit' ? { gatewayInteractionType: 5 } : {}),
  inputs: [],
  outputs: [
    { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
    ...fields.map(([id, pinLabel, pinType, eventPath]) => ({ id, label: pinLabel, type: PinTypes[pinType.toUpperCase()], eventPath }))
  ]
});

export const NodeDefinitions = {
  // EVENTS
  event_message_create: {
    type: 'event_message_create',
    category: NodeCategories.EVENTS,
    label: 'On Message Create',
    color: '#5865F2',
    gatewayEvent: 'MESSAGE_CREATE',
    gatewayIntents: ['GUILDS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES', 'MESSAGE_CONTENT'],
    inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'message_id', label: 'Message ID', type: PinTypes.STRING, eventPath: 'id' },
      { id: 'content', label: 'Message Content', type: PinTypes.STRING },
      { id: 'author_id', label: 'Author ID', type: PinTypes.STRING },
      { id: 'author_name', label: 'Author Name', type: PinTypes.STRING },
      { id: 'channel_id', label: 'Channel ID', type: PinTypes.STRING },
      { id: 'is_bot', label: 'Is Bot', type: PinTypes.BOOLEAN },
      { id: 'has_mentions', label: 'Has Mentions', type: PinTypes.BOOLEAN },
      { id: 'mentions', label: 'Mentioned Users', type: PinTypes.OBJECT, eventPath: 'mentions' },
      { id: 'mention_roles', label: 'Mentioned Roles', type: PinTypes.OBJECT, eventPath: 'mention_roles' },
      { id: 'mention_everyone', label: 'Mentions Everyone', type: PinTypes.BOOLEAN, eventPath: 'mention_everyone' },
      { id: 'is_reply', label: 'Is Reply', type: PinTypes.BOOLEAN },
      { id: 'referenced_message_id', label: 'Replied Message ID', type: PinTypes.STRING, eventPath: 'message_reference.message_id' },
      { id: 'reply_author_id', label: 'Replied Author ID', type: PinTypes.STRING, eventPath: 'referenced_message.author.id' }
    ]
  },

  event_slash_command: {
    type: 'event_slash_command',
    category: NodeCategories.EVENTS,
    label: 'On Slash Command',
    color: '#5865F2',
    gatewayEvent: 'INTERACTION_CREATE',
    gatewayInteractionType: 2,
    gatewayCommandType: 1,
    inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'command_name', label: 'Command Name', type: PinTypes.STRING },
      { id: 'user_id', label: 'User ID', type: PinTypes.STRING },
      { id: 'username', label: 'Username', type: PinTypes.STRING },
      { id: 'channel_id', label: 'Channel ID', type: PinTypes.STRING },
      { id: 'guild_id', label: 'Server ID', type: PinTypes.STRING },
      { id: 'application_id', label: 'Application ID', type: PinTypes.STRING },
      { id: 'interaction_id', label: 'Interaction ID', type: PinTypes.STRING },
      { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING },
      { id: 'options', label: 'Command Arguments', type: PinTypes.OBJECT }
    ]
  },

  event_slash_autocomplete: {
    type: 'event_slash_autocomplete', category: NodeCategories.EVENTS, label: 'On Command Autocomplete', color: '#5865F2',
    gatewayEvent: 'INTERACTION_CREATE', gatewayInteractionType: 4, gatewayCommandType: 1, inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'command_name', label: 'Command Name', type: PinTypes.STRING },
      { id: 'focused_option', label: 'Focused Option', type: PinTypes.STRING },
      { id: 'query', label: 'Typed Text', type: PinTypes.STRING },
      { id: 'options', label: 'Other Arguments', type: PinTypes.OBJECT },
      { id: 'user_id', label: 'User ID', type: PinTypes.STRING },
      { id: 'interaction_id', label: 'Interaction ID', type: PinTypes.STRING },
      { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING }
    ]
  },

  event_button_click: {
    type: 'event_button_click',
    category: NodeCategories.EVENTS,
    label: 'On Button Click',
    color: '#5865F2',
    gatewayEvent: 'INTERACTION_CREATE',
    gatewayInteractionType: 3,
    gatewayComponentTypes: [2],
    inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'custom_id', label: 'Custom ID', type: PinTypes.STRING },
      { id: 'user_id', label: 'User ID', type: PinTypes.STRING },
      { id: 'guild_id', label: 'Server ID', type: PinTypes.STRING, eventPath: 'guild_id' },
      { id: 'channel_id', label: 'Channel ID', type: PinTypes.STRING, eventPath: 'channel_id' },
      { id: 'application_id', label: 'Application ID', type: PinTypes.STRING },
      { id: 'interaction_id', label: 'Interaction ID', type: PinTypes.STRING },
      { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING }
    ]
  },

  event_member_join: {
    type: 'event_member_join',
    category: NodeCategories.EVENTS,
    label: 'On Member Joined',
    color: '#5865F2',
    gatewayEvent: 'GUILD_MEMBER_ADD',
    gatewayIntents: ['GUILD_MEMBERS'],
    inputs: [],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'user_id', label: 'User ID', type: PinTypes.STRING },
      { id: 'username', label: 'Username', type: PinTypes.STRING },
      { id: 'guild_id', label: 'Guild ID', type: PinTypes.STRING }
    ]
  },

  ...Object.fromEntries([
    gatewayEventDefinition('event_message_update', 'On Message Updated', 'MESSAGE_UPDATE', ['GUILD_MESSAGES', 'DIRECT_MESSAGES', 'MESSAGE_CONTENT'], [
      ['message_id', 'Message ID', 'string', 'id'], ['channel_id', 'Channel ID', 'string', 'channel_id'], ['guild_id', 'Server ID', 'string', 'guild_id'],
      ['author_id', 'Author ID', 'string', 'author.id'], ['content', 'Content', 'string', 'content'], ['edited_timestamp', 'Edited At', 'string', 'edited_timestamp']
    ]),
    gatewayEventDefinition('event_message_delete', 'On Message Deleted', 'MESSAGE_DELETE', ['GUILD_MESSAGES', 'DIRECT_MESSAGES'], [
      ['message_id', 'Message ID', 'string', 'id'], ['channel_id', 'Channel ID', 'string', 'channel_id'], ['guild_id', 'Server ID', 'string', 'guild_id']
    ]),
    gatewayEventDefinition('event_reaction_add', 'On Reaction Added', 'MESSAGE_REACTION_ADD', ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS'], [
      ['user_id', 'User ID', 'string', 'user_id'], ['message_id', 'Message ID', 'string', 'message_id'], ['channel_id', 'Channel ID', 'string', 'channel_id'],
      ['guild_id', 'Server ID', 'string', 'guild_id'], ['emoji_id', 'Emoji ID', 'string', 'emoji.id'], ['emoji_name', 'Emoji Name', 'string', 'emoji.name']
    ]),
    gatewayEventDefinition('event_reaction_remove', 'On Reaction Removed', 'MESSAGE_REACTION_REMOVE', ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS'], [
      ['user_id', 'User ID', 'string', 'user_id'], ['message_id', 'Message ID', 'string', 'message_id'], ['channel_id', 'Channel ID', 'string', 'channel_id'],
      ['guild_id', 'Server ID', 'string', 'guild_id'], ['emoji_id', 'Emoji ID', 'string', 'emoji.id'], ['emoji_name', 'Emoji Name', 'string', 'emoji.name']
    ]),
    gatewayEventDefinition('event_channel_create', 'On Channel Created', 'CHANNEL_CREATE', ['GUILDS'], [
      ['channel_id', 'Channel ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['name', 'Name', 'string', 'name'], ['channel_type', 'Channel Type', 'number', 'type'], ['parent_id', 'Category ID', 'string', 'parent_id']
    ]),
    gatewayEventDefinition('event_channel_update', 'On Channel Updated', 'CHANNEL_UPDATE', ['GUILDS'], [
      ['channel_id', 'Channel ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['name', 'Name', 'string', 'name'], ['channel_type', 'Channel Type', 'number', 'type'], ['parent_id', 'Category ID', 'string', 'parent_id']
    ]),
    gatewayEventDefinition('event_channel_delete', 'On Channel Deleted', 'CHANNEL_DELETE', ['GUILDS'], [
      ['channel_id', 'Channel ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['name', 'Name', 'string', 'name'], ['channel_type', 'Channel Type', 'number', 'type'], ['parent_id', 'Category ID', 'string', 'parent_id']
    ]),
    gatewayEventDefinition('event_guild_create', 'On Server Available', 'GUILD_CREATE', ['GUILDS'], [
      ['guild_id', 'Server ID', 'string', 'id'], ['name', 'Name', 'string', 'name'], ['member_count', 'Member Count', 'number', 'member_count']
    ]),
    gatewayEventDefinition('event_guild_update', 'On Server Updated', 'GUILD_UPDATE', ['GUILDS'], [
      ['guild_id', 'Server ID', 'string', 'id'], ['name', 'Name', 'string', 'name'], ['owner_id', 'Owner ID', 'string', 'owner_id']
    ]),
    gatewayEventDefinition('event_guild_delete', 'On Server Unavailable', 'GUILD_DELETE', ['GUILDS'], [
      ['guild_id', 'Server ID', 'string', 'id'], ['unavailable', 'Unavailable', 'boolean', 'unavailable']
    ]),
    gatewayEventDefinition('event_role_create', 'On Role Created', 'GUILD_ROLE_CREATE', ['GUILDS'], [
      ['role_id', 'Role ID', 'string', 'role.id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['name', 'Name', 'string', 'role.name'], ['color', 'Color', 'number', 'role.color']
    ]),
    gatewayEventDefinition('event_role_update', 'On Role Updated', 'GUILD_ROLE_UPDATE', ['GUILDS'], [
      ['role_id', 'Role ID', 'string', 'role.id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['name', 'Name', 'string', 'role.name'], ['color', 'Color', 'number', 'role.color']
    ]),
    gatewayEventDefinition('event_role_delete', 'On Role Deleted', 'GUILD_ROLE_DELETE', ['GUILDS'], [
      ['role_id', 'Role ID', 'string', 'role_id'], ['guild_id', 'Server ID', 'string', 'guild_id']
    ]),
    gatewayEventDefinition('event_thread_create', 'On Thread Created', 'THREAD_CREATE', ['GUILD_MESSAGES'], [
      ['thread_id', 'Thread ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['parent_id', 'Parent Channel ID', 'string', 'parent_id'], ['name', 'Name', 'string', 'name']
    ]),
    gatewayEventDefinition('event_thread_update', 'On Thread Updated', 'THREAD_UPDATE', ['GUILD_MESSAGES'], [
      ['thread_id', 'Thread ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['parent_id', 'Parent Channel ID', 'string', 'parent_id'], ['name', 'Name', 'string', 'name']
    ]),
    gatewayEventDefinition('event_thread_delete', 'On Thread Deleted', 'THREAD_DELETE', ['GUILD_MESSAGES'], [
      ['thread_id', 'Thread ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['parent_id', 'Parent Channel ID', 'string', 'parent_id']
    ]),
    gatewayEventDefinition('event_typing_start', 'On Typing Started', 'TYPING_START', ['GUILD_MESSAGE_TYPING'], [
      ['user_id', 'User ID', 'string', 'user_id'], ['channel_id', 'Channel ID', 'string', 'channel_id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['timestamp', 'Timestamp', 'number', 'timestamp']
    ]),
    gatewayEventDefinition('event_channel_pins_update', 'On Pins Updated', 'CHANNEL_PINS_UPDATE', ['GUILD_MESSAGES'], [
      ['channel_id', 'Channel ID', 'string', 'channel_id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['last_pin_timestamp', 'Last Pin At', 'string', 'last_pin_timestamp']
    ]),
    gatewayEventDefinition('event_message_reaction_remove_all', 'On All Reactions Removed', 'MESSAGE_REACTION_REMOVE_ALL', ['GUILD_MESSAGE_REACTIONS'], [
      ['message_id', 'Message ID', 'string', 'message_id'], ['channel_id', 'Channel ID', 'string', 'channel_id'], ['guild_id', 'Server ID', 'string', 'guild_id']
    ]),
    gatewayEventDefinition('event_select_menu', 'On Select Menu Used', 'INTERACTION_CREATE', [], [
      ['custom_id', 'Custom ID', 'string', 'data.custom_id'], ['selected_values', 'Selected Values', 'string', 'data.values'], ['user_id', 'User ID', 'string', 'member.user.id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['channel_id', 'Channel ID', 'string', 'channel_id'], ['application_id', 'Application ID', 'string', 'application_id'], ['interaction_id', 'Interaction ID', 'string', 'id'], ['interaction_token', 'Interaction Token', 'string', 'token']
    ]),
    gatewayEventDefinition('event_modal_submit', 'On Modal Submitted', 'INTERACTION_CREATE', [], [
      ['custom_id', 'Custom ID', 'string', 'data.custom_id'], ['submitted_values', 'Submitted Values', 'object', 'data.components'], ['user_id', 'User ID', 'string', 'member.user.id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['channel_id', 'Channel ID', 'string', 'channel_id'], ['application_id', 'Application ID', 'string', 'application_id'], ['interaction_id', 'Interaction ID', 'string', 'id'], ['interaction_token', 'Interaction Token', 'string', 'token']
    ]),
    gatewayEventDefinition('event_member_remove', 'On Member Left', 'GUILD_MEMBER_REMOVE', ['GUILD_MEMBERS'], [
      ['user_id', 'User ID', 'string', 'user.id'], ['guild_id', 'Server ID', 'string', 'guild_id']
    ]),
    gatewayEventDefinition('event_voice_state_update', 'On Voice State Changed', 'VOICE_STATE_UPDATE', ['GUILD_VOICE_STATES'], [
      ['user_id', 'User ID', 'string', 'user_id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['channel_id', 'Channel ID', 'string', 'channel_id'],
      ['session_id', 'Session ID', 'string', 'session_id'], ['self_muted', 'Self Muted', 'boolean', 'self_mute'], ['self_deafened', 'Self Deafened', 'boolean', 'self_deaf']
    ]),
    gatewayEventDefinition('event_presence_update', 'On Presence Updated', 'PRESENCE_UPDATE', ['GUILD_PRESENCES'], [
      ['user_id', 'User ID', 'string', 'user.id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['status', 'Status', 'string', 'status']
    ]),
    gatewayEventDefinition('event_guild_ban_add', 'On User Banned', 'GUILD_BAN_ADD', ['GUILD_MODERATION'], [
      ['user_id', 'User ID', 'string', 'user.id'], ['guild_id', 'Server ID', 'string', 'guild_id']
    ]),
    gatewayEventDefinition('event_guild_ban_remove', 'On User Unbanned', 'GUILD_BAN_REMOVE', ['GUILD_MODERATION'], [
      ['user_id', 'User ID', 'string', 'user.id'], ['guild_id', 'Server ID', 'string', 'guild_id']
    ]),
    gatewayEventDefinition('event_scheduled_event_create', 'On Scheduled Event Created', 'GUILD_SCHEDULED_EVENT_CREATE', ['GUILD_SCHEDULED_EVENTS'], [
      ['event_id', 'Event ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['name', 'Name', 'string', 'name'], ['status', 'Status', 'number', 'status']
    ]),
    gatewayEventDefinition('event_scheduled_event_update', 'On Scheduled Event Updated', 'GUILD_SCHEDULED_EVENT_UPDATE', ['GUILD_SCHEDULED_EVENTS'], [
      ['event_id', 'Event ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['name', 'Name', 'string', 'name'], ['status', 'Status', 'number', 'status']
    ]),
    gatewayEventDefinition('event_scheduled_event_delete', 'On Scheduled Event Deleted', 'GUILD_SCHEDULED_EVENT_DELETE', ['GUILD_SCHEDULED_EVENTS'], [
      ['event_id', 'Event ID', 'string', 'id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['name', 'Name', 'string', 'name'], ['status', 'Status', 'number', 'status']
    ]),
    gatewayEventDefinition('event_automod_action', 'On AutoMod Action', 'AUTO_MODERATION_ACTION_EXECUTION', ['AUTO_MODERATION_EXECUTION'], [
      ['rule_id', 'Rule ID', 'string', 'rule_id'], ['user_id', 'User ID', 'string', 'user_id'], ['guild_id', 'Server ID', 'string', 'guild_id'],
      ['channel_id', 'Channel ID', 'string', 'channel_id'], ['action_type', 'Action Type', 'number', 'action.type'], ['keyword', 'Matched Keyword', 'string', 'matched_keyword']
    ]),
    gatewayEventDefinition('event_invite_create', 'On Invite Created', 'INVITE_CREATE', ['GUILD_INVITES'], [
      ['code', 'Invite Code', 'string', 'code'], ['channel_id', 'Channel ID', 'string', 'channel_id'], ['guild_id', 'Server ID', 'string', 'guild_id'], ['inviter_id', 'Inviter ID', 'string', 'inviter.id']
    ]),
    gatewayEventDefinition('event_invite_delete', 'On Invite Deleted', 'INVITE_DELETE', ['GUILD_INVITES'], [
      ['code', 'Invite Code', 'string', 'code'], ['channel_id', 'Channel ID', 'string', 'channel_id'], ['guild_id', 'Server ID', 'string', 'guild_id']
    ]),
    gatewayEventDefinition('event_bot_ready', 'On Bot Ready', 'READY', [], []),
    gatewayEventDefinition('event_cron', 'On Schedule', 'CRON_TICK', [], [
      ['scheduled_at', 'Scheduled At', 'string', 'scheduledAt'], ['time_zone', 'Time Zone', 'string', 'timeZone']
    ])
  ].map((definition) => [definition.type, definition])),

  // VARIABLE
  logic_and: {
    type: 'logic_and', category: NodeCategories.LOGIC, label: 'Boolean AND', color: '#f59e0b', introducedAt: '2026-10-16T00:00:00.000Z',
    description: 'True when both inputs are true', inputs: [{ id: 'a', label: 'A', type: PinTypes.BOOLEAN, defaultValue: false }, { id: 'b', label: 'B', type: PinTypes.BOOLEAN, defaultValue: false }], outputs: [{ id: 'result', label: 'Result', type: PinTypes.BOOLEAN }]
  },
  logic_or: {
    type: 'logic_or', category: NodeCategories.LOGIC, label: 'Boolean OR', color: '#f59e0b', introducedAt: '2026-10-16T00:00:00.000Z',
    description: 'True when either input is true', inputs: [{ id: 'a', label: 'A', type: PinTypes.BOOLEAN, defaultValue: false }, { id: 'b', label: 'B', type: PinTypes.BOOLEAN, defaultValue: false }], outputs: [{ id: 'result', label: 'Result', type: PinTypes.BOOLEAN }]
  },
  logic_xor: {
    type: 'logic_xor', category: NodeCategories.LOGIC, label: 'Boolean XOR', color: '#f59e0b', introducedAt: '2026-10-16T00:00:00.000Z',
    description: 'True when exactly one input is true', inputs: [{ id: 'a', label: 'A', type: PinTypes.BOOLEAN, defaultValue: false }, { id: 'b', label: 'B', type: PinTypes.BOOLEAN, defaultValue: false }], outputs: [{ id: 'result', label: 'Result', type: PinTypes.BOOLEAN }]
  },
  logic_xor_many: {
    type: 'logic_xor_many', category: NodeCategories.LOGIC, label: 'Boolean XOR (Multi-input)', color: '#f59e0b', introducedAt: '2026-10-19T00:00:00.000Z',
    description: 'True when an odd number of inputs are true. Supports up to 25 inputs.',
    inputs: Array.from({ length: 25 }, (_, index) => ({ id: `input_${index + 1}`, label: `Input ${index + 1}`, type: PinTypes.BOOLEAN, defaultValue: false })),
    outputs: [{ id: 'result', label: 'Result', type: PinTypes.BOOLEAN }]
  },
  logic_not: {
    type: 'logic_not', category: NodeCategories.LOGIC, label: 'Boolean NOT', color: '#f59e0b', introducedAt: '2026-10-16T00:00:00.000Z',
    description: 'Inverts a boolean value', inputs: [{ id: 'value', label: 'Value', type: PinTypes.BOOLEAN, defaultValue: false }], outputs: [{ id: 'result', label: 'Result', type: PinTypes.BOOLEAN }]
  },
  variable_get: {
    type: 'variable_get',
    category: NodeCategories.VARIABLES,
    label: 'Get Variable',
    color: '#38bdf8',
    inputs: [{ id: 'variable', label: 'Variable', type: PinTypes.VARIABLE }],
    outputs: [{ id: 'variable', label: 'Variable', type: PinTypes.VARIABLE }, { id: 'value', label: 'Value', type: PinTypes.STRING }]
  },

  variable_create: {
    type: 'variable_create',
    category: NodeCategories.VARIABLES,
    label: 'Create Variable',
    color: '#38bdf8',
    description: 'Creates or updates a graph variable. Its value type follows the connected value; otherwise choose a type and fallback value.',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'value', label: 'Value', type: PinTypes.ARG, defaultValue: '' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'variable', label: 'Variable', type: PinTypes.VARIABLE },
      { id: 'value', label: 'Value', type: PinTypes.ARG }
    ]
  },

  variable_set: {
    type: 'variable_set',
    category: NodeCategories.VARIABLES,
    label: 'Set Variable',
    color: '#38bdf8',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'variable', label: 'Variable', type: PinTypes.VARIABLE },
      { id: 'value', label: 'Value', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'variable', label: 'Variable', type: PinTypes.VARIABLE }]
  },

  function_input: {
    type: 'function_input',
    category: NodeCategories.FUNCTIONS,
    label: 'Function Input',
    color: '#a78bfa',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: PinTypes.NUMBER }]
  },

  function_return: {
    type: 'function_return',
    category: NodeCategories.FUNCTIONS,
    label: 'Return Value',
    color: '#a78bfa',
    inputs: [{ id: 'value', label: 'Value', type: PinTypes.NUMBER, defaultValue: 0 }],
    outputs: []
  },

  function_call: {
    type: 'function_call',
    category: NodeCategories.FUNCTIONS,
    label: 'Call Function',
    color: '#a78bfa',
    inputs: [],
    outputs: [{ id: 'result', label: 'Result', type: PinTypes.NUMBER }]
  },

  execute_graph: {
    type: 'execute_graph', category: NodeCategories.LOGIC, label: 'Run Event Graph', color: '#8b5cf6',
    description: 'Runs another event graph for the same Discord event. The target must have a matching event node; graph cycles are rejected.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }]
  },

  function_math: {
    type: 'function_math',
    category: NodeCategories.FUNCTIONS,
    label: 'Calculate',
    color: '#a78bfa',
    inputs: [
      { id: 'a', label: 'A', type: PinTypes.NUMBER, defaultValue: 0 },
      { id: 'b', label: 'B', type: PinTypes.NUMBER, defaultValue: 0 }
    ],
    outputs: [{ id: 'result', label: 'Result', type: PinTypes.NUMBER }]
  },

  ...Object.fromEntries([
    ['math_add', 'Add (+)', 'Adds two numbers', ['a', 'b'], 'number'], ['math_subtract', 'Subtract (−)', 'Subtracts B from A', ['a', 'b'], 'number'],
    ['math_multiply', 'Multiply (×)', 'Multiplies two numbers', ['a', 'b'], 'number'], ['math_divide', 'Divide (÷)', 'Divides A by B; division by zero returns 0', ['a', 'b'], 'number'],
    ['math_modulo', 'Remainder (mod)', 'Returns the remainder after division', ['a', 'b'], 'number'], ['math_power', 'Power (^)', 'Raises A to the power of B', ['a', 'b'], 'number'],
    ['math_min', 'Minimum (min)', 'Returns the smaller number', ['a', 'b'], 'number'], ['math_max', 'Maximum (max)', 'Returns the larger number', ['a', 'b'], 'number'],
    ['math_abs', 'Absolute (abs)', 'Returns the distance from zero', ['value'], 'number'], ['math_sqrt', 'Square Root (√)', 'Negative input returns 0', ['value'], 'number'],
    ['math_round', 'Round', 'Rounds to selected decimal places', ['value'], 'number'], ['math_floor', 'Floor', 'Rounds down to an integer', ['value'], 'number'],
    ['math_ceil', 'Ceiling', 'Rounds up to an integer', ['value'], 'number'], ['math_sin', 'Sine', 'Angle in radians', ['value'], 'number'],
    ['math_cos', 'Cosine', 'Angle in radians', ['value'], 'number'], ['math_tan', 'Tangent', 'Angle in radians', ['value'], 'number'],
    ['math_asin', 'Arcsine', 'Inverse sine', ['value'], 'number'], ['math_acos', 'Arccosine', 'Inverse cosine', ['value'], 'number'],
    ['math_atan', 'Arctangent', 'Inverse tangent', ['value'], 'number'], ['math_log', 'Natural Log', 'Non-positive input returns 0', ['value'], 'number'],
    ['math_log10', 'Log Base 10', 'Non-positive input returns 0', ['value'], 'number'], ['math_exp', 'Exponential', 'Euler constant power', ['value'], 'number'],
    ['math_sign', 'Sign', 'Returns negative one, zero, or one', ['value'], 'number'], ['math_clamp', 'Clamp', 'Restricts a value to a range', ['value', 'min', 'max'], 'number'],
    ['math_sum', 'Sum', 'Adds up to 50 values; connect the last input to reveal another', ['a', 'b'], 'number'], ['math_average', 'Average', 'Averages up to 50 values; connect the last input to reveal another', ['a', 'b'], 'number'],
    ['math_lerp', 'Interpolate', 'Interpolates between values', ['a', 'b', 't'], 'number'], ['math_constant', 'Math Constant', 'Provides a standard constant', [], 'number'],
    ['math_compare', 'Compare Numbers', 'Compares two numbers', ['a', 'b'], 'boolean'],
    ['math_random', 'Random Number', 'Returns a random number between the minimum and maximum', ['min', 'max'], 'number']
  ].map(([type, label, description, inputIds, outputType]) => [type, {
    type, category: NodeCategories.MATH, label, color: '#38bdf8', description,
    inputs: inputIds.map((id) => ({ id, label: ({ a: 'A', b: 'B', c: 'C', d: 'D', t: 'Factor', value: 'Value', min: 'Minimum', max: 'Maximum' })[id], type: PinTypes.NUMBER, defaultValue: id === 'max' || type === 'math_lerp' && id === 'b' ? 1 : id === 't' ? 0.5 : 0 })),
    outputs: [{ id: 'result', label: outputType === 'boolean' ? 'Result' : 'Result', type: outputType === 'boolean' ? PinTypes.BOOLEAN : PinTypes.NUMBER }]
  }])),

  // LOGIC
  branch_if: {
    type: 'branch_if',
    category: NodeCategories.LOGIC,
    label: 'Branch (If / Else)',
    color: '#8b5cf6',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'condition', label: 'Condition', type: PinTypes.BOOLEAN, defaultValue: false }
    ],
    outputs: [
      { id: 'true_exec', label: 'True', type: PinTypes.EXEC },
      { id: 'false_exec', label: 'False', type: PinTypes.EXEC }
    ]
  },

  branch_switch: {
    type: 'branch_switch', category: NodeCategories.LOGIC, label: 'Switch / Case', color: '#8b5cf6', createdAt: '2026-10-20T16:53:56.000Z',
    description: 'Compares one value with up to 50 cases and runs the first matching branch, or Default when none match.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'value', label: 'Value', type: PinTypes.ARG, defaultValue: '' }, ...Array.from({ length: 2 }, (_, index) => ({ id: `case_${index + 1}`, label: `Case ${index + 1}`, type: PinTypes.STRING, defaultValue: '' }))],
    outputs: [...Array.from({ length: 2 }, (_, index) => ({ id: `case_${index + 1}_exec`, label: `Case ${index + 1}`, type: PinTypes.EXEC })), { id: 'default_exec', label: 'Default', type: PinTypes.EXEC }]
  },

  compare_text: {
    type: 'compare_text',
    category: NodeCategories.LOGIC,
    label: 'Compare Text',
    color: '#8b5cf6',
    inputs: [
      { id: 'text_a', label: 'Text A', type: PinTypes.STRING, defaultValue: '' },
      { id: 'text_b', label: 'Text B', type: PinTypes.STRING, defaultValue: '' },
      { id: 'operator', label: 'Operator', type: PinTypes.STRING, defaultValue: 'equals' }
    ],
    outputs: [
      { id: 'result', label: 'Result', type: PinTypes.BOOLEAN }
    ]
  },

  delay: {
    type: 'delay',
    category: NodeCategories.LOGIC,
    label: 'Wait (Async)',
    color: '#8b5cf6',
    description: 'Awaits a short timer for this run. Other Discord events and graph runs continue while it waits.',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'ms', label: 'Duration (ms)', type: PinTypes.NUMBER, defaultValue: 1000 }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC }
    ]
  },

  loop_count: {
    type: 'loop_count', category: NodeCategories.LOGIC, label: 'For Count', color: '#8b5cf6',
    description: 'Runs the Body branch once per iteration, then continues from Completed. Iterations are capped at 1,000 per run.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'count', label: 'Count', type: PinTypes.NUMBER, defaultValue: 1 }],
    outputs: [{ id: 'body_exec', label: 'Body', type: PinTypes.EXEC }, { id: 'completed_exec', label: 'Completed', type: PinTypes.EXEC }, { id: 'index', label: 'Index (0-based)', type: PinTypes.NUMBER }]
  },

  repeat_while: {
    type: 'repeat_while', category: NodeCategories.LOGIC, label: 'Repeat While', color: '#8b5cf6', introducedAt: '2026-10-17T00:00:00.000Z',
    description: 'While Condition is true, waits at least 100 ms, runs Body once, and checks again. It can run indefinitely. Route changes through shared graph variables or other live inputs to stop it.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'condition', label: 'Condition', type: PinTypes.BOOLEAN, defaultValue: true }, { id: 'interval_ms', label: 'Interval (ms)', type: PinTypes.NUMBER, defaultValue: 500 }],
    outputs: [{ id: 'body_exec', label: 'Body', type: PinTypes.EXEC }, { id: 'completed_exec', label: 'Completed', type: PinTypes.EXEC }, { id: 'iteration', label: 'Iteration', type: PinTypes.NUMBER }]
  },

  wait_until_condition: {
    type: 'wait_until_condition', category: NodeCategories.LOGIC, label: 'Wait Until Condition', color: '#8b5cf6',
    description: 'Checks a boolean condition until it becomes true. Times out through the Timed Out branch; polling is bounded.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'condition', label: 'Condition', type: PinTypes.BOOLEAN, defaultValue: false }, { id: 'timeout_ms', label: 'Timeout (ms)', type: PinTypes.NUMBER, defaultValue: 30000 }, { id: 'interval_ms', label: 'Check Every (ms)', type: PinTypes.NUMBER, defaultValue: 250 }],
    outputs: [{ id: 'ready_exec', label: 'Ready', type: PinTypes.EXEC }, { id: 'timeout_exec', label: 'Timed Out', type: PinTypes.EXEC }]
  },

  wait_until_time: {
    type: 'wait_until_time', category: NodeCategories.LOGIC, label: 'Wait Until Time', color: '#8b5cf6',
    description: 'Waits until an ISO date/time or Unix timestamp in milliseconds. Maximum wait is 7 days.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'time', label: 'Time (ISO or ms)', type: PinTypes.STRING, defaultValue: '' }],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }]
  },

  parallel: {
    type: 'parallel',
    category: NodeCategories.LOGIC,
    label: 'Parallel',
    color: '#8b5cf6',
    description: 'Runs two execution branches concurrently. Both branches must connect to the same Join node before execution continues.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }],
    outputs: [
      { id: 'branch_a_exec', label: 'Branch A', type: PinTypes.EXEC },
      { id: 'branch_b_exec', label: 'Branch B', type: PinTypes.EXEC }
    ]
  },

  parallel_join: {
    type: 'parallel_join',
    category: NodeCategories.LOGIC,
    label: 'Join',
    color: '#8b5cf6',
    description: 'Waits for both branches from one Parallel node, then continues once. For mutually exclusive If/Else paths, connect their exec wires directly to the same action node.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC, description: 'Synchronization input · connect both branches from one Parallel node. Ordinary converging paths do not wait here.' }],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }]
  },
  utility_wire_extender: {
    type: 'utility_wire_extender',
    category: NodeCategories.LOGIC,
    label: 'Wire Extender',
    color: '#a78bfa',
    introducedAt: '2026-10-16T00:00:00.000Z',
    description: 'Passes execution or any typed data value straight through. Use it to route wires neatly around a busy canvas.',
    inputs: [{ id: 'exec_in', label: 'Exec In', type: 'exec' }, { id: 'value_in_1', label: 'Any Value 1', type: 'any' }],
    outputs: [{ id: 'exec_out', label: 'Exec Out', type: 'exec' }, { id: 'value_out_1', label: 'Any Value 1', type: 'any' }]
  },

  // DISCORD ACTIONS
  action_send_message: {
    type: 'action_send_message',
    category: NodeCategories.ACTIONS,
    label: 'Send Message',
    color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'channel_id', label: 'Channel ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'content', label: 'Content', type: PinTypes.STRING, defaultValue: '' },
      { id: 'embed', label: 'Embed (Optional)', type: PinTypes.EMBED },
      { id: 'components', label: 'Components (Optional)', type: PinTypes.OBJECT },
      { id: 'files', label: 'Files (optional)', type: PinTypes.OBJECT, defaultValue: [] },
      { id: 'file_data', label: 'File Data URL / Base64', type: PinTypes.STRING, defaultValue: '' },
      { id: 'file_name', label: 'File Name', type: PinTypes.STRING, defaultValue: 'image.png' },
      { id: 'reply_to_message_id', label: 'Reply to Message ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'mention_replied_user', label: 'Mention Replied User', type: PinTypes.BOOLEAN, defaultValue: false }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'message_id', label: 'Message ID', type: PinTypes.STRING }
    ]
  },

  action_edit_message: {
    type: 'action_edit_message',
    category: NodeCategories.ACTIONS,
    label: 'Edit Message',
    color: '#10b981',
    description: 'Edits the content, embed, or components of an existing Discord message',
    requiredIntents: [],
    inferredPermissions: ['View Channels', 'Send Messages'],
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'channel_id', label: 'Channel ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'message_id', label: 'Message ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'content', label: 'Content', type: PinTypes.STRING, defaultValue: '' },
      { id: 'embed', label: 'Embed (Optional)', type: PinTypes.EMBED },
      { id: 'components', label: 'Components (Optional)', type: PinTypes.OBJECT },
      { id: 'files', label: 'Files (optional)', type: PinTypes.OBJECT, defaultValue: [] }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'message_id', label: 'Message ID', type: PinTypes.STRING }
    ]
  },

  action_reply_interaction: {
    type: 'action_reply_interaction',
    category: NodeCategories.ACTIONS,
    label: 'Reply to Interaction',
    color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'application_id', label: 'Application ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'interaction_id', label: 'Interaction ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING, defaultValue: '' },
      { id: 'content', label: 'Reply Content', type: PinTypes.STRING, defaultValue: '' },
      { id: 'embed', label: 'Embed (Optional)', type: PinTypes.EMBED },
      { id: 'components', label: 'Components (Optional)', type: PinTypes.OBJECT },
      { id: 'files', label: 'Files (optional)', type: PinTypes.OBJECT, defaultValue: [] },
      { id: 'ephemeral', label: 'Ephemeral (Hidden)', type: PinTypes.BOOLEAN, defaultValue: false }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC }
    ]
  },

  action_respond_autocomplete: {
    type: 'action_respond_autocomplete', category: NodeCategories.ACTIONS, label: 'Respond to Autocomplete', color: '#10b981',
    description: 'Returns up to 25 suggestions from an array of name and value objects.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'interaction_id', label: 'Interaction ID', type: PinTypes.STRING, defaultValue: '' }, { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING, defaultValue: '' }, { id: 'choices', label: 'Suggestions', type: PinTypes.OBJECT, defaultValue: [] }],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'choice_count', label: 'Suggestions Sent', type: PinTypes.NUMBER }]
  },

  action_show_modal: {
    type: 'action_show_modal', category: NodeCategories.ACTIONS, label: 'Show Popup Modal', color: '#10b981',
    description: 'Opens a configured Discord modal as the initial response to an interaction.',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'interaction_id', label: 'Interaction ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING, defaultValue: '' },
      { id: 'modal', label: 'Modal', type: PinTypes.OBJECT }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }]
  },

  action_deploy_slash_commands: {
    type: 'action_deploy_slash_commands', category: NodeCategories.ACTIONS, label: 'Deploy Slash Commands', color: '#10b981',
    description: 'Deploys workspace slash commands when triggered by a server manager with Manage Server or Administrator.',
    inputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'deployed_count', label: 'Commands Deployed', type: PinTypes.NUMBER }, { id: 'success', label: 'Succeeded', type: PinTypes.BOOLEAN }, { id: 'error', label: 'Error', type: PinTypes.STRING }]
  },

  action_defer_reply: {
    type: 'action_defer_reply',
    category: NodeCategories.ACTIONS,
    label: 'Defer Reply',
    color: '#10b981',
    description: 'Acknowledge a slash command now and send its reply later. Connect Reply to Interaction after this node.',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'interaction_id', label: 'Interaction ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING, defaultValue: '' },
      { id: 'ephemeral', label: 'Ephemeral (Hidden)', type: PinTypes.BOOLEAN, defaultValue: false }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING }]
  },

  action_defer_update: {
    type: 'action_defer_update',
    category: NodeCategories.ACTIONS,
    label: 'Defer Update',
    color: '#10b981',
    description: 'Acknowledge a button or select interaction now and update its message later. Connect Reply to Interaction after this node.',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'interaction_id', label: 'Interaction ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING }]
  },

  action_edit_interaction_reply: {
    type: 'action_edit_interaction_reply',
    category: NodeCategories.ACTIONS,
    label: 'Edit Interaction Reply',
    color: '#f59e0b',
    description: 'Edits the original reply to a slash command, button, or select menu interaction after it has already been sent',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'application_id', label: 'Application ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'interaction_token', label: 'Interaction Token', type: PinTypes.STRING, defaultValue: '' },
      { id: 'content', label: 'New Content (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'embed', label: 'Embed (Optional)', type: PinTypes.EMBED },
      { id: 'components', label: 'Components (Optional)', type: PinTypes.OBJECT },
      { id: 'files', label: 'Files (optional)', type: PinTypes.OBJECT, defaultValue: [] }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC }
    ]
  },

  action_set_presence: {
    type: 'action_set_presence',
    category: NodeCategories.ACTIONS,
    label: 'Set Bot Presence',
    color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'status', label: 'Status (online/dnd/idle)', type: PinTypes.STRING, defaultValue: 'online' },
      { id: 'activity_text', label: 'Activity Text', type: PinTypes.STRING, defaultValue: 'ARC Studio' },
      { id: 'activity_type', label: 'Activity Type', type: PinTypes.NUMBER, defaultValue: 0 }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC }
    ]
  },

  action_create_channel: {
    type: 'action_create_channel', category: NodeCategories.ACTIONS, label: 'Create Channel', color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'guild_id', label: 'Server ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'name', label: 'Name', type: PinTypes.STRING, defaultValue: '' },
      { id: 'channel_type', label: 'Type', type: PinTypes.STRING, defaultValue: 'text' },
      { id: 'parent_id', label: 'Category ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'permission_overwrites', label: 'Permission Overwrites', type: PinTypes.OBJECT, defaultValue: [] },
      { id: 'topic', label: 'Topic', type: PinTypes.STRING, defaultValue: '' },
      { id: 'reason', label: 'Audit Log Reason', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'channel_id', label: 'Channel ID', type: PinTypes.STRING }]
  },
  action_edit_channel: {
    type: 'action_edit_channel', category: NodeCategories.ACTIONS, label: 'Edit Channel', color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'channel_id', label: 'Channel ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'name', label: 'Name', type: PinTypes.STRING, defaultValue: '' },
      { id: 'topic', label: 'Topic', type: PinTypes.STRING, defaultValue: '' },
      { id: 'parent_id', label: 'Category ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'permission_overwrites', label: 'Permission Overwrites', type: PinTypes.OBJECT, defaultValue: [] },
      { id: 'rate_limit_per_user', label: 'Slowmode (seconds)', type: PinTypes.NUMBER, defaultValue: 0 },
      { id: 'nsfw', label: 'Age restricted', type: PinTypes.BOOLEAN, defaultValue: false },
      { id: 'bitrate', label: 'Voice bitrate', type: PinTypes.NUMBER, defaultValue: 64000 },
      { id: 'user_limit', label: 'Voice user limit', type: PinTypes.NUMBER, defaultValue: 0 },
      { id: 'rtc_region', label: 'Voice region', type: PinTypes.STRING, defaultValue: '' },
      { id: 'video_quality_mode', label: 'Voice video quality mode', type: PinTypes.NUMBER, defaultValue: '' },
      { id: 'default_auto_archive_duration', label: 'Thread auto archive (minutes)', type: PinTypes.NUMBER, defaultValue: '' },
      { id: 'reason', label: 'Audit Log Reason', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'channel_id_out', label: 'Channel ID', type: PinTypes.STRING }]
  },
  action_delete_channel: {
    type: 'action_delete_channel', category: NodeCategories.ACTIONS, label: 'Delete Channel', color: '#ef4444',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'channel_id', label: 'Channel ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'reason', label: 'Audit Log Reason', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'deleted_channel_id', label: 'Deleted Channel ID', type: PinTypes.STRING }]
  },
  action_create_role: {
    type: 'action_create_role', category: NodeCategories.ACTIONS, label: 'Create Role', color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'guild_id', label: 'Server ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'name', label: 'Name', type: PinTypes.STRING, defaultValue: 'new role' },
      { id: 'color', label: 'Color (RGB number)', type: PinTypes.NUMBER, defaultValue: 0 },
      { id: 'permissions', label: 'Permissions Bitfield', type: PinTypes.STRING, defaultValue: '0' },
      { id: 'hoist', label: 'Show separately', type: PinTypes.BOOLEAN, defaultValue: false },
      { id: 'mentionable', label: 'Mentionable', type: PinTypes.BOOLEAN, defaultValue: false },
      { id: 'reason', label: 'Audit Log Reason', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }, { id: 'role_id', label: 'Role ID', type: PinTypes.STRING }]
  },
  action_member_role: {
    type: 'action_member_role', category: NodeCategories.ACTIONS, label: 'Set Member Role', color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'guild_id', label: 'Server ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'user_id', label: 'User ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'role_id', label: 'Role ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'operation', label: 'Operation', type: PinTypes.STRING, defaultValue: 'add' },
      { id: 'reason', label: 'Audit Log Reason', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }]
  },
  action_moderate_member: {
    type: 'action_moderate_member', category: NodeCategories.ACTIONS, label: 'Moderate Member', color: '#ef4444',
    description: 'Times out, kicks, bans, or unbans a member. Each Discord command should also require the matching moderator permission.',
    inferredPermissions: ['Moderate Members', 'Kick Members', 'Ban Members'],
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'guild_id', label: 'Server ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'user_id', label: 'User ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'operation', label: 'Action', type: PinTypes.STRING, defaultValue: 'timeout' },
      { id: 'duration_minutes', label: 'Timeout (minutes)', type: PinTypes.NUMBER, defaultValue: 10 },
      { id: 'delete_message_seconds', label: 'Ban message deletion (seconds)', type: PinTypes.NUMBER, defaultValue: 0 },
      { id: 'reason', label: 'Reason', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [
      { id: 'exec', label: 'Succeeded', type: PinTypes.EXEC },
      { id: 'failure_exec', label: 'Failed', type: PinTypes.EXEC },
      { id: 'success', label: 'Success', type: PinTypes.BOOLEAN },
      { id: 'error', label: 'Error', type: PinTypes.STRING }
    ]
  },
  action_voice_channel_status: {
    type: 'action_voice_channel_status', category: NodeCategories.ACTIONS, label: 'Set Voice Channel Status', color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'channel_id', label: 'Voice Channel ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'status', label: 'Status (blank clears)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'reason', label: 'Audit Log Reason', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }]
  },
  action_voice_state: {
    type: 'action_voice_state', category: NodeCategories.ACTIONS, label: 'Request Voice Join / Leave', color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'guild_id', label: 'Server ID', type: PinTypes.STRING, defaultValue: '' },
      { id: 'channel_id', label: 'Voice Channel ID (blank leaves)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'self_mute', label: 'Self Mute', type: PinTypes.BOOLEAN, defaultValue: false },
      { id: 'self_deaf', label: 'Self Deafen', type: PinTypes.BOOLEAN, defaultValue: false }
    ],
    outputs: [{ id: 'exec', label: 'Exec', type: PinTypes.EXEC }]
  },

  // VALUES & BUILDERS
  value_text: {
    type: 'value_text',
    hidden: true,
    category: NodeCategories.VALUES,
    label: 'Text String',
    color: '#f59e0b',
    inputs: [
      { id: 'value', label: 'Value', type: PinTypes.STRING, defaultValue: 'Hello World' }
    ],
    outputs: [
      { id: 'value', label: 'Text', type: PinTypes.STRING }
    ]
  },

  value_number: {
    type: 'value_number',
    category: NodeCategories.VALUES,
    label: 'Number',
    color: '#06b6d4',
    inputs: [
      { id: 'value', label: 'Value', type: PinTypes.NUMBER, defaultValue: 0 }
    ],
    outputs: [
      { id: 'value', label: 'Number', type: PinTypes.NUMBER }
    ]
  },

  value_boolean: {
    type: 'value_boolean',
    category: NodeCategories.VALUES,
    label: 'Boolean',
    color: '#ef4444',
    inputs: [
      { id: 'value', label: 'Value', type: PinTypes.BOOLEAN, defaultValue: true }
    ],
    outputs: [
      { id: 'value', label: 'Boolean', type: PinTypes.BOOLEAN }
    ]
  },

  data_to_json: {
    type: 'data_to_json', category: NodeCategories.VALUES, label: 'To JSON', color: '#06b6d4',
    inputs: [{ id: 'value', label: 'Value', type: PinTypes.OBJECT, defaultValue: null }],
    outputs: [{ id: 'json', label: 'JSON', type: PinTypes.STRING }, { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN }]
  },
  data_parse_json: {
    type: 'data_parse_json', category: NodeCategories.VALUES, label: 'Parse JSON', color: '#06b6d4',
    inputs: [{ id: 'json', label: 'JSON', type: PinTypes.STRING, defaultValue: '' }],
    outputs: [{ id: 'value', label: 'Value', type: PinTypes.OBJECT }, { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN }]
  },
  data_to_number: {
    type: 'data_to_number', category: NodeCategories.VALUES, label: 'Text to Number', color: '#06b6d4',
    inputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING, defaultValue: '' }],
    outputs: [{ id: 'number', label: 'Number', type: PinTypes.NUMBER }, { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN }]
  },
  data_check_value: {
    type: 'data_check_value', category: NodeCategories.VALUES, label: 'Check Value', color: '#06b6d4', createdAt: '2026-10-20T16:53:56.000Z',
    description: 'Distinguishes missing, null, empty text, and real values. The Value output uses the fallback unless a real value is present.',
    inputs: [{ id: 'value', label: 'Value', type: PinTypes.ARG, defaultValue: undefined }, { id: 'fallback', label: 'Fallback', type: PinTypes.ARG, defaultValue: '' }],
    outputs: [{ id: 'value', label: 'Value or fallback', type: PinTypes.ARG }, { id: 'state', label: 'State', type: PinTypes.STRING }, { id: 'is_missing', label: 'Missing', type: PinTypes.BOOLEAN }, { id: 'is_null', label: 'Null', type: PinTypes.BOOLEAN }, { id: 'is_empty', label: 'Empty text', type: PinTypes.BOOLEAN }, { id: 'has_value', label: 'Has value', type: PinTypes.BOOLEAN }]
  },
  data_get_value_by_path: {
    type: 'data_get_value_by_path', category: NodeCategories.VALUES, label: 'Get Value by Path', color: '#06b6d4', createdAt: '2026-10-20T16:53:56.000Z',
    description: 'Safely reads a nested object or array path such as user.profile.name or items[0].id. Check Exists when the path may be missing.',
    inputs: [{ id: 'value', label: 'Object / Array', type: PinTypes.OBJECT, defaultValue: {} }, { id: 'path', label: 'Path', type: PinTypes.STRING, defaultValue: '' }, { id: 'fallback', label: 'Fallback', type: PinTypes.ARG, defaultValue: '' }],
    outputs: [{ id: 'value', label: 'Value or fallback', type: PinTypes.ARG }, { id: 'exists', label: 'Exists', type: PinTypes.BOOLEAN }]
  },
  data_find_array_item: {
    type: 'data_find_array_item', category: NodeCategories.VALUES, label: 'Find Array Item', color: '#06b6d4', createdAt: '2026-10-20T16:53:56.000Z',
    description: 'Finds the first item equal to Value. Set Path to compare a nested property, such as id or user.name.',
    inputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT, defaultValue: [] }, { id: 'path', label: 'Property path', type: PinTypes.STRING, defaultValue: '' }, { id: 'value', label: 'Match value', type: PinTypes.ARG, defaultValue: '' }],
    outputs: [{ id: 'item', label: 'Item', type: PinTypes.ARG }, { id: 'index', label: 'Index', type: PinTypes.NUMBER }, { id: 'found', label: 'Found', type: PinTypes.BOOLEAN }]
  },
  data_filter_array: {
    type: 'data_filter_array', category: NodeCategories.VALUES, label: 'Filter Array', color: '#06b6d4', createdAt: '2026-10-20T16:53:56.000Z',
    description: 'Keeps items whose value (or selected property path) matches the chosen comparison.',
    inputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT, defaultValue: [] }, { id: 'path', label: 'Property path', type: PinTypes.STRING, defaultValue: '' }, { id: 'operator', label: 'Comparison', type: PinTypes.STRING, defaultValue: 'equals' }, { id: 'value', label: 'Match value', type: PinTypes.ARG, defaultValue: '' }],
    outputs: [{ id: 'array', label: 'Filtered items', type: PinTypes.OBJECT }, { id: 'count', label: 'Count', type: PinTypes.NUMBER }]
  },
  data_format_number: {
    type: 'data_format_number', category: NodeCategories.VALUES, label: 'Format Number', color: '#06b6d4', createdAt: '2026-10-20T16:53:56.000Z',
    description: 'Formats a finite number with locale grouping, decimal, percent, or currency style. Percent style scales the number by 100.',
    inputs: [{ id: 'value', label: 'Value', type: PinTypes.NUMBER, defaultValue: 0 }, { id: 'locale', label: 'Locale', type: PinTypes.STRING, defaultValue: 'en-US' }, { id: 'style', label: 'Style', type: PinTypes.STRING, defaultValue: 'decimal' }, { id: 'currency', label: 'Currency', type: PinTypes.STRING, defaultValue: 'USD' }, { id: 'minimum_fraction_digits', label: 'Minimum decimals', type: PinTypes.NUMBER, defaultValue: 0 }, { id: 'maximum_fraction_digits', label: 'Maximum decimals', type: PinTypes.NUMBER, defaultValue: 2 }],
    outputs: [{ id: 'text', label: 'Formatted', type: PinTypes.STRING }, { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN }]
  },
  data_to_text: {
    type: 'data_to_text', category: NodeCategories.VALUES, label: 'To Text', color: '#06b6d4',
    inputs: [{ id: 'value', label: 'Value', type: PinTypes.ARG, defaultValue: '' }],
    outputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING }, { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN }]
  },
  data_to_boolean: {
    type: 'data_to_boolean', category: NodeCategories.VALUES, label: 'To Boolean', color: '#06b6d4',
    inputs: [{ id: 'value', label: 'Value', type: PinTypes.ARG, defaultValue: false }],
    outputs: [{ id: 'boolean', label: 'Boolean', type: PinTypes.BOOLEAN }, { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN }]
  },
  data_regex: {
    type: 'data_regex', category: NodeCategories.VALUES, label: 'Regular Expression', color: '#06b6d4',
    description: 'Tests, extracts, or replaces text with a JavaScript regular expression. Pattern and text sizes are limited, and risky regex structures are rejected.',
    inputs: [
      { id: 'text', label: 'Text', type: PinTypes.STRING, defaultValue: '' },
      { id: 'pattern', label: 'Pattern', type: PinTypes.STRING, defaultValue: '' },
      { id: 'flags', label: 'Flags', type: PinTypes.STRING, defaultValue: '' },
      { id: 'replacement', label: 'Replacement', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [
      { id: 'text', label: 'Text', type: PinTypes.STRING },
      { id: 'matched', label: 'Matched', type: PinTypes.BOOLEAN },
      { id: 'match', label: 'First Match', type: PinTypes.STRING },
      { id: 'matches', label: 'All Matches', type: PinTypes.OBJECT },
      { id: 'captures', label: 'Capture Groups', type: PinTypes.OBJECT },
      { id: 'index', label: 'Index', type: PinTypes.NUMBER },
      { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN },
      { id: 'error', label: 'Error', type: PinTypes.STRING }
    ]
  },
  data_array_create: {
    type: 'data_array_create', category: NodeCategories.VALUES, label: 'Create Array', color: '#06b6d4',
    inputs: [{ id: 'item_1', label: 'Item 1', type: PinTypes.ARG, defaultValue: null }],
    outputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT }, { id: 'length', label: 'Length', type: PinTypes.NUMBER }]
  },
  data_array_concat: {
    type: 'data_array_concat', category: NodeCategories.VALUES, label: 'Combine Arrays', color: '#06b6d4',
    inputs: [{ id: 'array_1', label: 'Array 1', type: PinTypes.OBJECT, defaultValue: [] }, { id: 'array_2', label: 'Array 2', type: PinTypes.OBJECT, defaultValue: [] }],
    outputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT }, { id: 'length', label: 'Length', type: PinTypes.NUMBER }]
  },
  data_array_length: {
    type: 'data_array_length', category: NodeCategories.VALUES, label: 'Array Length', color: '#06b6d4',
    inputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT, defaultValue: [] }],
    outputs: [{ id: 'length', label: 'Length', type: PinTypes.NUMBER }, { id: 'empty', label: 'Is Empty', type: PinTypes.BOOLEAN }]
  },
  data_array_get: {
    type: 'data_array_get', category: NodeCategories.VALUES, label: 'Get Array Item', color: '#06b6d4',
    inputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT, defaultValue: [] }, { id: 'index', label: 'Index', type: PinTypes.NUMBER, defaultValue: 0 }],
    outputs: [{ id: 'value', label: 'Item', type: PinTypes.ARG }, { id: 'found', label: 'Found', type: PinTypes.BOOLEAN }]
  },
  data_array_set: {
    type: 'data_array_set', category: NodeCategories.VALUES, label: 'Edit Array Item', color: '#06b6d4',
    inputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT, defaultValue: [] }, { id: 'index', label: 'Index', type: PinTypes.NUMBER, defaultValue: 0 }, { id: 'value', label: 'New Item', type: PinTypes.ARG, defaultValue: null }],
    outputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT }, { id: 'updated', label: 'Updated', type: PinTypes.BOOLEAN }]
  },
  data_array_append: {
    type: 'data_array_append', category: NodeCategories.VALUES, label: 'Append Array Items', color: '#06b6d4',
    inputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT, defaultValue: [] }, { id: 'item_1', label: 'Item 1', type: PinTypes.ARG, defaultValue: undefined }],
    outputs: [{ id: 'array', label: 'Array', type: PinTypes.OBJECT }, { id: 'length', label: 'Length', type: PinTypes.NUMBER }]
  },
  data_object_get: {
    type: 'data_object_get', category: NodeCategories.VALUES, label: 'Get Object Property', color: '#06b6d4',
    inputs: [{ id: 'object', label: 'Object', type: PinTypes.OBJECT, defaultValue: {} }, { id: 'key', label: 'Property', type: PinTypes.STRING, defaultValue: '' }],
    outputs: [{ id: 'value', label: 'Value', type: PinTypes.ARG }, { id: 'exists', label: 'Exists', type: PinTypes.BOOLEAN }]
  },
  data_object_set: {
    type: 'data_object_set', category: NodeCategories.VALUES, label: 'Set Object Property', color: '#06b6d4',
    inputs: [{ id: 'object', label: 'Object', type: PinTypes.OBJECT, defaultValue: {} }, { id: 'key', label: 'Property', type: PinTypes.STRING, defaultValue: '' }, { id: 'value', label: 'Value', type: PinTypes.ARG, defaultValue: '' }],
    outputs: [{ id: 'object', label: 'Object', type: PinTypes.OBJECT }]
  },
  data_object_keys: {
    type: 'data_object_keys', category: NodeCategories.VALUES, label: 'Object Keys', color: '#06b6d4',
    inputs: [{ id: 'object', label: 'Object', type: PinTypes.OBJECT, defaultValue: {} }],
    outputs: [{ id: 'keys', label: 'Keys', type: PinTypes.OBJECT }, { id: 'length', label: 'Length', type: PinTypes.NUMBER }]
  },
  data_string_split: {
    type: 'data_string_split', category: NodeCategories.VALUES, label: 'Split Text', color: '#06b6d4',
    description: 'Splits text at each exact separator string. It does not parse command prefixes or quoted arguments.',
    inputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING, defaultValue: '' }, { id: 'separator', label: 'Separator', type: PinTypes.STRING, defaultValue: ',' }],
    outputs: [{ id: 'array', label: 'Parts', type: PinTypes.OBJECT }, { id: 'length', label: 'Count', type: PinTypes.NUMBER }]
  },
  data_parse_prefix_command: {
    type: 'data_parse_prefix_command', category: NodeCategories.VALUES, label: 'Parse Prefix Command', color: '#06b6d4',
    description: 'Checks for a prefix, extracts the command, and parses whitespace-separated arguments. Quoted arguments can contain spaces.',
    inputs: [{ id: 'content', label: 'Message Content', type: PinTypes.STRING, defaultValue: '' }, { id: 'prefix', label: 'Prefix', type: PinTypes.STRING, defaultValue: '!' }],
    outputs: [
      { id: 'recognized', label: 'Recognized', type: PinTypes.BOOLEAN },
      { id: 'command', label: 'Command', type: PinTypes.STRING },
      { id: 'arguments', label: 'Arguments', type: PinTypes.OBJECT },
      { id: 'argument_count', label: 'Argument Count', type: PinTypes.NUMBER }
    ]
  },
  data_string_join: {
    type: 'data_string_join', category: NodeCategories.VALUES, label: 'Join Text', color: '#06b6d4',
    inputs: [{ id: 'array', label: 'Items', type: PinTypes.OBJECT, defaultValue: [] }, { id: 'separator', label: 'Separator', type: PinTypes.STRING, defaultValue: ', ' }],
    outputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING }]
  },
  data_text_replace: {
    type: 'data_text_replace', category: NodeCategories.VALUES, label: 'Replace Text', color: '#06b6d4',
    inputs: [
      { id: 'text', label: 'Text', type: PinTypes.STRING, defaultValue: '' },
      { id: 'search', label: 'Find', type: PinTypes.STRING, defaultValue: '' },
      { id: 'replacement', label: 'Replace with', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING }, { id: 'replacements', label: 'Replacements', type: PinTypes.NUMBER }]
  },
  data_text_uppercase: { type: 'data_text_uppercase', category: NodeCategories.VALUES, label: 'Uppercase Text', color: '#06b6d4', inputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING, defaultValue: '' }], outputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING }] },
  data_text_lowercase: { type: 'data_text_lowercase', category: NodeCategories.VALUES, label: 'Lowercase Text', color: '#06b6d4', inputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING, defaultValue: '' }], outputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING }] },
  data_text_titlecase: { type: 'data_text_titlecase', category: NodeCategories.VALUES, label: 'Title Case Text', color: '#06b6d4', inputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING, defaultValue: '' }], outputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING }] },
  data_text_trim: { type: 'data_text_trim', category: NodeCategories.VALUES, label: 'Trim Text', color: '#06b6d4', inputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING, defaultValue: '' }], outputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING }] },
  data_format_time: {
    type: 'data_format_time', category: NodeCategories.VALUES, label: 'Format Date & Time', color: '#06b6d4',
    inputs: [
      { id: 'value', label: 'Date / timestamp', type: PinTypes.STRING, defaultValue: '' },
      { id: 'locale', label: 'Locale', type: PinTypes.STRING, defaultValue: 'en-US' },
      { id: 'timeZone', label: 'Time zone', type: PinTypes.STRING, defaultValue: 'UTC' },
      { id: 'dateStyle', label: 'Date style', type: PinTypes.STRING, defaultValue: 'medium' },
      { id: 'timeStyle', label: 'Time style', type: PinTypes.STRING, defaultValue: 'short' }
    ],
    outputs: [{ id: 'text', label: 'Formatted time', type: PinTypes.STRING }, { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN }]
  },
  data_to_iso_time: {
    type: 'data_to_iso_time', category: NodeCategories.VALUES, label: 'To ISO Date', color: '#06b6d4',
    inputs: [{ id: 'value', label: 'Date / timestamp', type: PinTypes.STRING, defaultValue: '' }],
    outputs: [{ id: 'text', label: 'ISO date', type: PinTypes.STRING }, { id: 'valid', label: 'Valid', type: PinTypes.BOOLEAN }]
  },
  data_permission_overwrites: {
    type: 'data_permission_overwrites', category: NodeCategories.VALUES, label: 'Channel Permission Overwrites', color: '#06b6d4',
    inputs: [{ id: 'target_id_1', label: 'Target ID 1', type: PinTypes.STRING, defaultValue: '' }],
    outputs: [{ id: 'overwrites', label: 'Overwrites', type: PinTypes.OBJECT }]
  },

  format_text: {
    type: 'format_text',
    category: NodeCategories.VALUES,
    label: 'Text Builder',
    color: '#06b6d4',
    inputs: [],
    outputs: [{ id: 'text', label: 'Text', type: PinTypes.STRING }]
  },

  build_embed: {
    type: 'build_embed',
    category: NodeCategories.VALUES,
    label: 'Embed Builder',
    color: '#ec4899',
    inputs: [
      { id: 'title', label: 'Title', type: PinTypes.STRING, defaultValue: '' },
      { id: 'description', label: 'Description', type: PinTypes.STRING, defaultValue: '' },
      { id: 'url', label: 'URL', type: PinTypes.STRING, defaultValue: '' },
      { id: 'color', label: 'Hex Color (#)', type: PinTypes.STRING, defaultValue: '#5865F2' },
      { id: 'author_name', label: 'Author', type: PinTypes.STRING, defaultValue: '' },
      { id: 'author_url', label: 'Author URL', type: PinTypes.STRING, defaultValue: '' },
      { id: 'author_icon', label: 'Author Icon URL', type: PinTypes.STRING, defaultValue: '' },
      { id: 'footer_text', label: 'Footer Text', type: PinTypes.STRING, defaultValue: '' },
      { id: 'footer_icon', label: 'Footer Icon URL', type: PinTypes.STRING, defaultValue: '' },
      { id: 'thumbnail_url', label: 'Thumbnail URL', type: PinTypes.STRING, defaultValue: '' },
      { id: 'image_url', label: 'Image URL', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [
      { id: 'embed', label: 'Embed', type: PinTypes.EMBED },
      { id: 'components', label: 'Components', type: PinTypes.OBJECT }
    ]
  },

  build_modal: {
    type: 'build_modal', category: NodeCategories.VALUES, label: 'Popup Modal Builder', color: '#06b6d4',
    description: 'Builds a Discord modal with 1–5 labeled inputs, selects, or checkbox groups.',
    inputs: [], outputs: [{ id: 'modal', label: 'Modal', type: PinTypes.OBJECT }]
  },

  data_get_modal_value: {
    type: 'data_get_modal_value', category: NodeCategories.VALUES, label: 'Get Modal Value', color: '#06b6d4',
    description: 'Reads a submitted modal field by its custom ID; multi-select fields return arrays.',
    inputs: [
      { id: 'submitted_values', label: 'Submitted Values', type: PinTypes.OBJECT, defaultValue: [] },
      { id: 'custom_id', label: 'Field Custom ID', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [{ id: 'value', label: 'Value', type: PinTypes.OBJECT }, { id: 'found', label: 'Found', type: PinTypes.BOOLEAN }]
  },

  modify_embed: {
    type: 'modify_embed',
    category: NodeCategories.VALUES,
    label: 'Modify Embed',
    color: '#ec4899',
    description: 'Updates specific fields on an existing embed without rebuilding it',
    inputs: [
      { id: 'embed', label: 'Base Embed', type: PinTypes.EMBED },
      { id: 'title', label: 'Title (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'description', label: 'Description (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'color', label: 'Hex Color (#, optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'image_url', label: 'Image URL (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'thumbnail_url', label: 'Thumbnail URL (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'footer_text', label: 'Footer Text (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'author_name', label: 'Author Name (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'field_name', label: 'Field Name (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'field_value', label: 'Field Value (Optional)', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [
      { id: 'embed', label: 'Embed', type: PinTypes.EMBED }
    ]
  },

  modify_components: {
    type: 'modify_components',
    category: NodeCategories.VALUES,
    label: 'Modify Components',
    color: '#f59e0b',
    description: 'Enables, disables, or updates buttons/select menus in an action row',
    inputs: [
      { id: 'components', label: 'Components', type: PinTypes.OBJECT },
      { id: 'custom_id', label: 'Target Custom ID ("all" for all)', type: PinTypes.STRING, defaultValue: 'all' },
      { id: 'disabled', label: 'Disabled', type: PinTypes.BOOLEAN, defaultValue: true },
      { id: 'label', label: 'New Label (Optional)', type: PinTypes.STRING, defaultValue: '' },
      { id: 'style', label: 'New Style (Optional)', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [
      { id: 'components', label: 'Components', type: PinTypes.OBJECT }
    ]
  },

  // CRYPTOGRAPHY & SECURITY
  action_crypto_hash: {
    type: 'action_crypto_hash',
    category: NodeCategories.CRYPTO,
    label: 'Cryptographic Hash',
    color: '#10b981',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'data', label: 'Input Data', type: PinTypes.STRING, defaultValue: '' },
      { id: 'algorithm', label: 'Algorithm', type: PinTypes.STRING, defaultValue: 'sha256' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'hash', label: 'Hash Digest', type: PinTypes.STRING }
    ]
  },

  action_crypto_hmac: {
    type: 'action_crypto_hmac',
    category: NodeCategories.CRYPTO,
    label: 'HMAC Sign',
    color: '#059669',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'data', label: 'Payload', type: PinTypes.STRING, defaultValue: '' },
      { id: 'secret', label: 'Secret Key', type: PinTypes.STRING, defaultValue: '' },
      { id: 'algorithm', label: 'Algorithm', type: PinTypes.STRING, defaultValue: 'sha256' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'signature', label: 'Signature', type: PinTypes.STRING }
    ]
  },

  action_crypto_verify_hmac: {
    type: 'action_crypto_verify_hmac',
    category: NodeCategories.CRYPTO,
    label: 'Verify HMAC',
    color: '#047857',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'data', label: 'Payload', type: PinTypes.STRING, defaultValue: '' },
      { id: 'secret', label: 'Secret Key', type: PinTypes.STRING, defaultValue: '' },
      { id: 'signature', label: 'Expected Signature', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'isValid', label: 'Is Valid', type: PinTypes.BOOLEAN }
    ]
  },

  action_crypto_encrypt: {
    type: 'action_crypto_encrypt',
    category: NodeCategories.CRYPTO,
    label: 'AES-256-GCM Encrypt',
    color: '#0d9488',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'plaintext', label: 'Plaintext', type: PinTypes.STRING, defaultValue: '' },
      { id: 'passphrase', label: 'Passphrase (Optional)', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'ciphertext', label: 'Encrypted Envelope', type: PinTypes.STRING }
    ]
  },

  action_crypto_decrypt: {
    type: 'action_crypto_decrypt',
    category: NodeCategories.CRYPTO,
    label: 'AES-256-GCM Decrypt',
    color: '#0f766e',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'ciphertext', label: 'Encrypted Envelope', type: PinTypes.STRING, defaultValue: '' },
      { id: 'passphrase', label: 'Passphrase (Optional)', type: PinTypes.STRING, defaultValue: '' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'plaintext', label: 'Plaintext', type: PinTypes.STRING }
    ]
  },

  action_crypto_random: {
    type: 'action_crypto_random',
    category: NodeCategories.CRYPTO,
    label: 'Generate Crypto Token',
    color: '#14b8a6',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'type', label: 'Format (hex/base64url/pin)', type: PinTypes.STRING, defaultValue: 'hex' }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'token', label: 'Token / PIN', type: PinTypes.STRING }
    ]
  },

  action_web_fetch: {
    type: 'action_web_fetch',
    category: NodeCategories.NETWORK,
    label: 'HTTP Request',
    color: '#0ea5e9',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'url', label: 'URL', type: PinTypes.STRING, defaultValue: '' },
      { id: 'method', label: 'Method', type: PinTypes.STRING, defaultValue: 'GET' },
      { id: 'headers', label: 'Headers (JSON)', type: PinTypes.STRING, defaultValue: '{}' },
      { id: 'user_agent', label: 'User-Agent', type: PinTypes.STRING, defaultValue: '' },
      { id: 'body', label: 'Body', type: PinTypes.STRING, defaultValue: '' },
      { id: 'timeout_ms', label: 'Timeout (ms)', type: PinTypes.NUMBER, defaultValue: 10000 },
      { id: 'max_bytes', label: 'Max response bytes', type: PinTypes.NUMBER, defaultValue: 1048576 }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'status', label: 'Status', type: PinTypes.NUMBER },
      { id: 'ok', label: '2xx', type: PinTypes.BOOLEAN },
      { id: 'body', label: 'Response Body', type: PinTypes.STRING },
      { id: 'headers', label: 'Response Headers (JSON)', type: PinTypes.STRING },
      { id: 'json', label: 'JSON', type: PinTypes.OBJECT },
      { id: 'error', label: 'Error', type: PinTypes.STRING }
    ]
  },

  action_http_download: {
    type: 'action_http_download',
    category: NodeCategories.NETWORK,
    label: 'HTTP Download File',
    color: '#0ea5e9',
    description: 'Downloads a public file over HTTP or HTTPS as a bounded binary attachment. Connect File to a message or interaction reply Files input.',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'url', label: 'URL', type: PinTypes.STRING, defaultValue: '' },
      { id: 'user_agent', label: 'User-Agent', type: PinTypes.STRING, defaultValue: '' },
      { id: 'timeout_ms', label: 'Timeout (ms)', type: PinTypes.NUMBER, defaultValue: 20000 },
      { id: 'max_bytes', label: 'Max file bytes', type: PinTypes.NUMBER, defaultValue: 20971520 }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'file', label: 'File', type: PinTypes.OBJECT },
      { id: 'filename', label: 'File Name', type: PinTypes.STRING },
      { id: 'content_type', label: 'Content Type', type: PinTypes.STRING },
      { id: 'byte_size', label: 'Bytes', type: PinTypes.NUMBER },
      { id: 'error', label: 'Error', type: PinTypes.STRING }
    ]
  },

  action_web_retry: {
    type: 'action_web_retry',
    category: NodeCategories.NETWORK,
    label: 'HTTP Request (Retry)',
    color: '#0284c7',
    description: 'Retries temporary network errors and HTTP 408, 425, 429, and 5xx responses with bounded backoff. Non-idempotent methods are not retried unless explicitly enabled.',
    inputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'url', label: 'URL', type: PinTypes.STRING, defaultValue: '' },
      { id: 'method', label: 'Method', type: PinTypes.STRING, defaultValue: 'GET' },
      { id: 'headers', label: 'Headers (JSON)', type: PinTypes.STRING, defaultValue: '{}' },
      { id: 'user_agent', label: 'User-Agent', type: PinTypes.STRING, defaultValue: '' },
      { id: 'body', label: 'Body', type: PinTypes.STRING, defaultValue: '' },
      { id: 'timeout_ms', label: 'Timeout (ms)', type: PinTypes.NUMBER, defaultValue: 10000 },
      { id: 'max_bytes', label: 'Max response bytes', type: PinTypes.NUMBER, defaultValue: 1048576 },
      { id: 'max_attempts', label: 'Max attempts', type: PinTypes.NUMBER, defaultValue: 3 },
      { id: 'retry_delay_ms', label: 'Base retry delay (ms)', type: PinTypes.NUMBER, defaultValue: 500 },
      { id: 'retry_non_idempotent', label: 'Retry POST/other methods', type: PinTypes.BOOLEAN, defaultValue: false }
    ],
    outputs: [
      { id: 'exec', label: 'Exec', type: PinTypes.EXEC },
      { id: 'status', label: 'Status', type: PinTypes.NUMBER },
      { id: 'ok', label: '2xx', type: PinTypes.BOOLEAN },
      { id: 'body', label: 'Response Body', type: PinTypes.STRING },
      { id: 'headers', label: 'Response Headers (JSON)', type: PinTypes.STRING },
      { id: 'json', label: 'JSON', type: PinTypes.OBJECT },
      { id: 'attempts', label: 'Attempts', type: PinTypes.NUMBER },
      { id: 'error', label: 'Error', type: PinTypes.STRING }
    ]
  }
};

const adapterNodeTypes = new Set();

export function registerAdapterNodeDefinitions(definitions = []) {
  for (const type of adapterNodeTypes) delete NodeDefinitions[type];
  adapterNodeTypes.clear();
  for (const definition of definitions) {
    if (!definition || typeof definition.type !== 'string') continue;
    const normalized = {
      ...definition,
      pluginAdapter: true,
      inputs: Array.isArray(definition.inputs) ? definition.inputs : [],
      outputs: Array.isArray(definition.outputs) ? definition.outputs : []
    };
    NodeDefinitions[normalized.type] = normalized;
    adapterNodeTypes.add(normalized.type);
  }
}
