const slash = (id, name, commandName, description, replyText) => ({
  id, name, description, graphType: 'event', variables: [],
  nodes: [
    { id: `${id}_event`, type: 'event_slash_command', x: 80, y: 120, data: { commandName, description } },
    { id: `${id}_reply`, type: 'action_reply_interaction', x: 440, y: 120, data: { content: replyText, ephemeral: true } }
  ],
  connections: [
    { id: `${id}_exec`, sourceNodeId: `${id}_event`, sourcePinId: 'exec', targetNodeId: `${id}_reply`, targetPinId: 'exec' },
    { id: `${id}_app`, sourceNodeId: `${id}_event`, sourcePinId: 'application_id', targetNodeId: `${id}_reply`, targetPinId: 'application_id' },
    { id: `${id}_interaction`, sourceNodeId: `${id}_event`, sourcePinId: 'interaction_id', targetNodeId: `${id}_reply`, targetPinId: 'interaction_id' },
    { id: `${id}_token`, sourceNodeId: `${id}_event`, sourcePinId: 'interaction_token', targetNodeId: `${id}_reply`, targetPinId: 'interaction_token' }
  ]
});

const addEmbedReply = (graph, title, description, color = '#5865F2') => {
  const reply = graph.nodes.find((node) => node.type === 'action_reply_interaction');
  if (!reply) return graph;
  const embedId = `${graph.id}_embed`;
  graph.nodes.push({ id: embedId, type: 'build_embed', x: 80, y: 390, data: { blocks: [
    { id: `${embedId}_title`, type: 'title', value: title },
    { id: `${embedId}_description`, type: 'description', value: description },
    { id: `${embedId}_color`, type: 'color', value: color }
  ], components: [] } });
  graph.connections.push({ id: `${embedId}_reply`, sourceNodeId: embedId, sourcePinId: 'embed', targetNodeId: reply.id, targetPinId: 'embed' });
  addTagGroups(graph, [[`${title} response`, color, graph.nodes.map((node) => node.id)]]);
  return graph;
};

const addTagGroups = (graph, groups) => {
  graph.tagGroups = groups.map(([name, color, nodeIds]) => ({ id: `${graph.id}_group_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, name, color, nodeIds }));
  return graph;
};

const ping = {
  id: 'starter_ping', name: 'Message: !ping', description: 'Replies when someone types !ping.', graphType: 'event', variables: [],
  nodes: [
    { id: 'starter_ping_event', type: 'event_message_create', x: 80, y: 120, data: {} },
    { id: 'starter_ping_compare', type: 'compare_text', x: 400, y: 210, data: { text_b: '!ping', operator: 'equals' } },
    { id: 'starter_ping_branch', type: 'branch_if', x: 680, y: 120, data: {} },
    { id: 'starter_ping_send', type: 'action_send_message', x: 960, y: 120, data: { content: 'Pong!' } }
  ],
  connections: [
    { id: 'starter_ping_exec', sourceNodeId: 'starter_ping_event', sourcePinId: 'exec', targetNodeId: 'starter_ping_branch', targetPinId: 'exec' },
    { id: 'starter_ping_content', sourceNodeId: 'starter_ping_event', sourcePinId: 'content', targetNodeId: 'starter_ping_compare', targetPinId: 'text_a' },
    { id: 'starter_ping_condition', sourceNodeId: 'starter_ping_compare', sourcePinId: 'result', targetNodeId: 'starter_ping_branch', targetPinId: 'condition' },
    { id: 'starter_ping_match', sourceNodeId: 'starter_ping_branch', sourcePinId: 'true_exec', targetNodeId: 'starter_ping_send', targetPinId: 'exec' },
    { id: 'starter_ping_channel', sourceNodeId: 'starter_ping_event', sourcePinId: 'channel_id', targetNodeId: 'starter_ping_send', targetPinId: 'channel_id' }
  ]
};

const xpCounter = {
  id: 'starter_xp_message', name: 'Message XP Counter', description: 'Adds one point to a shared server counter for each message.', graphType: 'event',
  variables: [],
  nodes: [
    { id: 'starter_xp_event', type: 'event_message_create', x: 80, y: 120, data: {} },
    { id: 'starter_xp_not_bot', type: 'logic_not', x: 360, y: 110, data: {} },
    { id: 'starter_xp_branch', type: 'branch_if', x: 650, y: 100, data: {} },
    { id: 'starter_xp_get', type: 'variable_get', x: 360, y: 280, data: { variableId: 'starter_xp_total', scope: 'project' } },
    { id: 'starter_xp_one', type: 'value_number', x: 360, y: 430, data: { value: 1 } },
    { id: 'starter_xp_add', type: 'math_add', x: 650, y: 300, data: {} },
    { id: 'starter_xp_set', type: 'variable_set', x: 970, y: 120, data: { variableId: 'starter_xp_total', scope: 'project' } }
  ],
  connections: [
    { id: 'starter_xp_exec', sourceNodeId: 'starter_xp_event', sourcePinId: 'exec', targetNodeId: 'starter_xp_branch', targetPinId: 'exec' },
    { id: 'starter_xp_bot_flag', sourceNodeId: 'starter_xp_event', sourcePinId: 'is_bot', targetNodeId: 'starter_xp_not_bot', targetPinId: 'value' },
    { id: 'starter_xp_human', sourceNodeId: 'starter_xp_not_bot', sourcePinId: 'result', targetNodeId: 'starter_xp_branch', targetPinId: 'condition' },
    { id: 'starter_xp_count', sourceNodeId: 'starter_xp_branch', sourcePinId: 'true_exec', targetNodeId: 'starter_xp_set', targetPinId: 'exec' },
    { id: 'starter_xp_current', sourceNodeId: 'starter_xp_get', sourcePinId: 'value', targetNodeId: 'starter_xp_add', targetPinId: 'a' },
    { id: 'starter_xp_increment', sourceNodeId: 'starter_xp_one', sourcePinId: 'value', targetNodeId: 'starter_xp_add', targetPinId: 'b' },
    { id: 'starter_xp_store', sourceNodeId: 'starter_xp_add', sourcePinId: 'result', targetNodeId: 'starter_xp_set', targetPinId: 'value' }
  ]
};

const rankCommand = () => {
  const graph = slash('starter_rank', 'Slash: /rank', 'rank', 'Show the server XP total.', '');
  graph.nodes.push(
    { id: 'starter_rank_get', type: 'variable_get', x: 360, y: 330, data: { variableId: 'starter_xp_total', scope: 'project' } },
    { id: 'starter_rank_format', type: 'format_text', x: 670, y: 290, data: { template: 'The server has earned {{arg1}} XP so far.' } }
  );
  graph.connections.push(
    { id: 'starter_rank_value', sourceNodeId: 'starter_rank_get', sourcePinId: 'value', targetNodeId: 'starter_rank_format', targetPinId: 'arg_1' },
    { id: 'starter_rank_reply', sourceNodeId: 'starter_rank_format', sourcePinId: 'text', targetNodeId: 'starter_rank_reply', targetPinId: 'content' }
  );
  return graph;
};

const rollCommand = () => {
  const graph = slash('starter_roll', 'Slash: /roll', 'roll', 'Roll a number from 1 to 100.', '');
  graph.nodes.push(
    { id: 'starter_roll_min', type: 'value_number', x: 360, y: 340, data: { value: 1 } },
    { id: 'starter_roll_max', type: 'value_number', x: 360, y: 470, data: { value: 100 } },
    { id: 'starter_roll_random', type: 'math_random', x: 650, y: 390, data: {} },
    { id: 'starter_roll_format', type: 'format_text', x: 930, y: 390, data: { template: 'You rolled **{{arg1}}**.' } }
  );
  graph.connections.push(
    { id: 'starter_roll_minimum', sourceNodeId: 'starter_roll_min', sourcePinId: 'value', targetNodeId: 'starter_roll_random', targetPinId: 'min' },
    { id: 'starter_roll_maximum', sourceNodeId: 'starter_roll_max', sourcePinId: 'value', targetNodeId: 'starter_roll_random', targetPinId: 'max' },
    { id: 'starter_roll_value', sourceNodeId: 'starter_roll_random', sourcePinId: 'result', targetNodeId: 'starter_roll_format', targetPinId: 'arg_1' },
    { id: 'starter_roll_reply', sourceNodeId: 'starter_roll_format', sourcePinId: 'text', targetNodeId: 'starter_roll_reply', targetPinId: 'content' }
  );
  return graph;
};

const ticketOpen = {
  id: 'starter_ticket', name: 'Slash: /ticket', description: 'Creates a private ticket channel for the command user.', graphType: 'event', variables: [],
  nodes: [
    { id: 'ticket_event', type: 'event_slash_command', x: 70, y: 130, data: { commandName: 'ticket', description: 'Open a private support ticket.' } },
    { id: 'ticket_defer', type: 'action_defer_reply', x: 340, y: 80, data: { ephemeral: true } },
    { id: 'ticket_name', type: 'format_text', x: 340, y: 300, data: { template: 'ticket-{{arg1}}' } },
    { id: 'ticket_permissions', type: 'data_permission_overwrites', x: 340, y: 500, data: { overwriteCount: 3, target_id_1: '', target_type_1: 0, deny_1: ['ViewChannel'], target_id_2: '', target_type_2: 1, allow_2: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'], target_id_3: '', target_type_3: 0, allow_3: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] } },
    { id: 'ticket_create', type: 'action_create_channel', x: 700, y: 140, data: { channel_type: 'text', topic: 'Private support ticket' } },
    { id: 'ticket_reply_text', type: 'format_text', x: 990, y: 390, data: { template: 'Your private ticket channel <#{{arg1}}> is ready.' } },
    { id: 'ticket_embed', type: 'build_embed', x: 990, y: 580, data: { blocks: [
      { id: 'ticket_embed_title', type: 'title', value: 'Ticket created' },
      { id: 'ticket_embed_description', type: 'description', value: 'Your private support channel is ready.' },
      { id: 'ticket_embed_color', type: 'color', value: '#16A085' }
    ], components: [] } },
    { id: 'ticket_edit', type: 'action_edit_interaction_reply', x: 1280, y: 140, data: {} }
  ],
  connections: [
    { id: 'ticket_e_d', sourceNodeId: 'ticket_event', sourcePinId: 'exec', targetNodeId: 'ticket_defer', targetPinId: 'exec' },
    { id: 'ticket_i_d', sourceNodeId: 'ticket_event', sourcePinId: 'interaction_id', targetNodeId: 'ticket_defer', targetPinId: 'interaction_id' },
    { id: 'ticket_t_d', sourceNodeId: 'ticket_event', sourcePinId: 'interaction_token', targetNodeId: 'ticket_defer', targetPinId: 'interaction_token' },
    { id: 'ticket_d_c', sourceNodeId: 'ticket_defer', sourcePinId: 'exec', targetNodeId: 'ticket_create', targetPinId: 'exec' },
    { id: 'ticket_g_c', sourceNodeId: 'ticket_event', sourcePinId: 'guild_id', targetNodeId: 'ticket_create', targetPinId: 'guild_id' },
    { id: 'ticket_u_n', sourceNodeId: 'ticket_event', sourcePinId: 'user_id', targetNodeId: 'ticket_name', targetPinId: 'arg_1' },
    { id: 'ticket_n_c', sourceNodeId: 'ticket_name', sourcePinId: 'text', targetNodeId: 'ticket_create', targetPinId: 'name' },
    { id: 'ticket_g_p', sourceNodeId: 'ticket_event', sourcePinId: 'guild_id', targetNodeId: 'ticket_permissions', targetPinId: 'target_id_1' },
    { id: 'ticket_u_p', sourceNodeId: 'ticket_event', sourcePinId: 'user_id', targetNodeId: 'ticket_permissions', targetPinId: 'target_id_2' },
    { id: 'ticket_p_c', sourceNodeId: 'ticket_permissions', sourcePinId: 'overwrites', targetNodeId: 'ticket_create', targetPinId: 'permission_overwrites' },
    { id: 'ticket_c_e', sourceNodeId: 'ticket_create', sourcePinId: 'exec', targetNodeId: 'ticket_edit', targetPinId: 'exec' },
    { id: 'ticket_app_e', sourceNodeId: 'ticket_event', sourcePinId: 'application_id', targetNodeId: 'ticket_edit', targetPinId: 'application_id' },
    { id: 'ticket_token_e', sourceNodeId: 'ticket_defer', sourcePinId: 'interaction_token', targetNodeId: 'ticket_edit', targetPinId: 'interaction_token' },
    { id: 'ticket_channel_r', sourceNodeId: 'ticket_create', sourcePinId: 'channel_id', targetNodeId: 'ticket_reply_text', targetPinId: 'arg_1' },
    { id: 'ticket_text_e', sourceNodeId: 'ticket_reply_text', sourcePinId: 'text', targetNodeId: 'ticket_edit', targetPinId: 'content' },
    { id: 'ticket_embed_e', sourceNodeId: 'ticket_embed', sourcePinId: 'embed', targetNodeId: 'ticket_edit', targetPinId: 'embed' }
  ],
  tagGroups: [
    { id: 'ticket_access_group', name: 'Private access', color: '#16a085', nodeIds: ['ticket_event', 'ticket_permissions', 'ticket_create'] },
    { id: 'ticket_reply_group', name: 'Ticket response', color: '#5865F2', nodeIds: ['ticket_reply_text', 'ticket_edit'] }
  ]
};

const ticketClose = {
  id: 'starter_close', name: 'Slash: /close', description: 'Deletes the channel where /close is run.', graphType: 'event', variables: [],
  nodes: [
    { id: 'close_event', type: 'event_slash_command', x: 70, y: 130, data: { commandName: 'close', description: 'Close this ticket channel.', defaultMemberPermissions: '16' } },
    { id: 'close_defer', type: 'action_defer_reply', x: 340, y: 80, data: { ephemeral: true } },
    { id: 'close_channel', type: 'action_delete_channel', x: 670, y: 140, data: { reason: 'Ticket closed by its opener.' } },
    { id: 'close_reply', type: 'action_edit_interaction_reply', x: 980, y: 140, data: { content: 'Ticket closed.' } }
  ],
  connections: [
    { id: 'close_e_d', sourceNodeId: 'close_event', sourcePinId: 'exec', targetNodeId: 'close_defer', targetPinId: 'exec' },
    { id: 'close_i_d', sourceNodeId: 'close_event', sourcePinId: 'interaction_id', targetNodeId: 'close_defer', targetPinId: 'interaction_id' },
    { id: 'close_t_d', sourceNodeId: 'close_event', sourcePinId: 'interaction_token', targetNodeId: 'close_defer', targetPinId: 'interaction_token' },
    { id: 'close_d_c', sourceNodeId: 'close_defer', sourcePinId: 'exec', targetNodeId: 'close_channel', targetPinId: 'exec' },
    { id: 'close_ch_c', sourceNodeId: 'close_event', sourcePinId: 'channel_id', targetNodeId: 'close_channel', targetPinId: 'channel_id' },
    { id: 'close_c_r', sourceNodeId: 'close_channel', sourcePinId: 'exec', targetNodeId: 'close_reply', targetPinId: 'exec' },
    { id: 'close_app_r', sourceNodeId: 'close_event', sourcePinId: 'application_id', targetNodeId: 'close_reply', targetPinId: 'application_id' },
    { id: 'close_token_r', sourceNodeId: 'close_defer', sourcePinId: 'interaction_token', targetNodeId: 'close_reply', targetPinId: 'interaction_token' }
  ]
};

const ticketHelp = addEmbedReply(slash('starter_ticket_help', 'Slash: /ticket-help', 'ticket-help', 'Explain how to use this ticket starter.', 'Use /ticket to open a private support channel. Use /close inside that channel when the conversation is finished.'), 'Ticket commands', 'Use **/ticket** to open a private support channel. Use **/close** inside that channel to remove it. Set the staff role in the Private channel access node before inviting your bot.');
addTagGroups(ticketClose, [['Close flow', '#e67e22', ['close_event', 'close_defer', 'close_channel', 'close_reply']]]);
addTagGroups(ticketHelp, [['Ticket help', '#5865F2', ticketHelp.nodes.map((node) => node.id)]]);

const basicHelp = addEmbedReply(slash('starter_help', 'Slash: /help', 'help', 'Show bot help.', 'Use /ping or read the server rules.'), 'Bot help', 'Try **/ping** for a quick response. Add your bot commands and instructions here.');
const moderationRules = addEmbedReply(slash('starter_rules', 'Slash: /rules', 'rules', 'Show the server rules.', 'Add your server rules to this reply.'), 'Server rules', 'Replace this text with your server rules before deploying the bot.');
const utilityAbout = addEmbedReply(slash('starter_about', 'Slash: /about', 'about', 'Show information about this bot.', 'A community utility bot built with ARC Studio.'), 'About this bot', 'A community utility bot built with ARC Studio.');
const extraCommandGraphs = (prefix, entries) => entries.map(([command, description, title, body]) => addEmbedReply(
  slash(`${prefix}_${command.replace(/-/g, '_')}`, `Slash: /${command}`, command, description, body), title, body
));

const feedbackModal = {
  id: 'starter_feedback_modal', name: 'Slash: /feedback · Popup Modal', description: 'Opens a popup modal with a text field and checkbox choices.', graphType: 'event', variables: [],
  nodes: [
    { id: 'feedback_event', type: 'event_slash_command', x: 80, y: 130, data: { commandName: 'feedback', description: 'Send private feedback to the bot team.' } },
    { id: 'feedback_modal', type: 'build_modal', x: 390, y: 350, data: { modal: { customId: 'feedback_form', title: 'Send feedback', components: [
      { type: 'text', customId: 'feedback_topic', label: 'What is this about?', style: 1, required: true, maxLength: 100, placeholder: 'A short topic' },
      { type: 'checkbox_group', customId: 'feedback_area', label: 'Choose any areas', description: 'Select all that apply.', required: false, maxValues: 3, options: [{ label: 'Community', value: 'community' }, { label: 'Commands', value: 'commands' }, { label: 'Other', value: 'other' }] }
    ] } } },
    { id: 'feedback_show', type: 'action_show_modal', x: 710, y: 130, data: {} }
  ],
  connections: [
    { id: 'feedback_exec', sourceNodeId: 'feedback_event', sourcePinId: 'exec', targetNodeId: 'feedback_show', targetPinId: 'exec' },
    { id: 'feedback_id', sourceNodeId: 'feedback_event', sourcePinId: 'interaction_id', targetNodeId: 'feedback_show', targetPinId: 'interaction_id' },
    { id: 'feedback_token', sourceNodeId: 'feedback_event', sourcePinId: 'interaction_token', targetNodeId: 'feedback_show', targetPinId: 'interaction_token' },
    { id: 'feedback_payload', sourceNodeId: 'feedback_modal', sourcePinId: 'modal', targetNodeId: 'feedback_show', targetPinId: 'modal' }
  ]
};
const feedbackSubmitted = {
  id: 'starter_feedback_submitted', name: 'On Modal Submitted · Feedback', description: 'Reads the feedback modal topic by custom ID.', graphType: 'event', variables: [],
  nodes: [
    { id: 'feedback_submitted_event', type: 'event_modal_submit', x: 80, y: 130, data: {} },
    { id: 'feedback_topic_value', type: 'data_get_modal_value', x: 390, y: 330, data: { custom_id: 'feedback_topic' } },
    { id: 'feedback_thanks', type: 'format_text', x: 690, y: 320, data: { template: 'Thanks for your feedback about **{{arg1}}**.' } },
    { id: 'feedback_reply', type: 'action_reply_interaction', x: 990, y: 130, data: { ephemeral: true } }
  ],
  connections: [
    { id: 'feedback_values', sourceNodeId: 'feedback_submitted_event', sourcePinId: 'submitted_values', targetNodeId: 'feedback_topic_value', targetPinId: 'submitted_values' },
    { id: 'feedback_text', sourceNodeId: 'feedback_topic_value', sourcePinId: 'value', targetNodeId: 'feedback_thanks', targetPinId: 'arg_1' },
    { id: 'feedback_flow', sourceNodeId: 'feedback_submitted_event', sourcePinId: 'exec', targetNodeId: 'feedback_reply', targetPinId: 'exec' },
    { id: 'feedback_reply_app', sourceNodeId: 'feedback_submitted_event', sourcePinId: 'application_id', targetNodeId: 'feedback_reply', targetPinId: 'application_id' },
    { id: 'feedback_reply_id', sourceNodeId: 'feedback_submitted_event', sourcePinId: 'interaction_id', targetNodeId: 'feedback_reply', targetPinId: 'interaction_id' },
    { id: 'feedback_reply_token', sourceNodeId: 'feedback_submitted_event', sourcePinId: 'interaction_token', targetNodeId: 'feedback_reply', targetPinId: 'interaction_token' },
    { id: 'feedback_reply_text', sourceNodeId: 'feedback_thanks', sourcePinId: 'text', targetNodeId: 'feedback_reply', targetPinId: 'content' }
  ]
};
const welcomeCommand = addEmbedReply(slash('starter_welcome', 'Slash: /welcome', 'welcome', 'Show the community welcome card.', 'Welcome! Use the button below to continue.'), 'Welcome', 'Welcome to the community. Use the button below to continue.');
const welcomeEmbed = welcomeCommand.nodes.find((node) => node.type === 'build_embed');
welcomeEmbed.data.components = [{ components: [{ type: 'button', style: 'primary', label: 'Continue', customId: 'welcome_continue' }] }];
const welcomeButton = {
  id: 'starter_welcome_button', name: 'On Button Click · Welcome', description: 'Acknowledges the welcome card button.', graphType: 'event', variables: [],
  nodes: [
    { id: 'welcome_button_event', type: 'event_button_click', x: 80, y: 130, data: {} },
    { id: 'welcome_button_reply', type: 'action_reply_interaction', x: 410, y: 130, data: { content: 'You are all set. Welcome!', ephemeral: true } }
  ],
  connections: [
    { id: 'welcome_button_exec', sourceNodeId: 'welcome_button_event', sourcePinId: 'exec', targetNodeId: 'welcome_button_reply', targetPinId: 'exec' },
    { id: 'welcome_button_app', sourceNodeId: 'welcome_button_event', sourcePinId: 'application_id', targetNodeId: 'welcome_button_reply', targetPinId: 'application_id' },
    { id: 'welcome_button_id', sourceNodeId: 'welcome_button_event', sourcePinId: 'interaction_id', targetNodeId: 'welcome_button_reply', targetPinId: 'interaction_id' },
    { id: 'welcome_button_token', sourceNodeId: 'welcome_button_event', sourcePinId: 'interaction_token', targetNodeId: 'welcome_button_reply', targetPinId: 'interaction_token' }
  ]
};
const rank = addTagGroups(rankCommand(), [['XP summary', '#16a085', ['starter_rank_event', 'starter_rank_get', 'starter_rank_format', 'starter_rank_reply']]]);
addTagGroups(ticketOpen, [['Command & setup', '#5865F2', ['ticket_event', 'ticket_defer', 'ticket_name', 'ticket_permissions']], ['Create & reply', '#16a085', ['ticket_create', 'ticket_reply_text', 'ticket_embed', 'ticket_edit']]]);
addTagGroups(xpCounter, [['Track message XP', '#16a085', xpCounter.nodes.map((node) => node.id)]]);
addTagGroups(moderationRules, [['Rules reply', '#5865F2', moderationRules.nodes.map((node) => node.id)]]);
addTagGroups(utilityAbout, [['About reply', '#5865F2', utilityAbout.nodes.map((node) => node.id)]]);

export const StarterProjects = Object.freeze([
  { id: 'blank', name: 'Start Blank', description: 'An empty project, ready for your first graph.', graphs: [] },
  { id: 'ticket', name: 'Ticket Bot', description: 'Ticket workflows, 10 slash command examples, and an interactive feedback modal.', graphs: [ticketOpen, ticketClose, ticketHelp, feedbackModal, feedbackSubmitted, ping, ...extraCommandGraphs('ticket', [
    ['ticket-status', 'Show the current ticket status.', 'Ticket status', 'This channel is ready for support. Add ticket state tracking to show open, waiting, or closed status.'],
    ['ticket-faq', 'Show common support answers.', 'Support FAQ', 'Add your most common support answers here.'],
    ['ticket-staff', 'Explain how to reach the support team.', 'Support team', 'Set staff access in the Private channel access node before using the ticket workflow.'],
    ['ticket-guide', 'Show the support workflow.', 'Ticket guide', 'Open with /ticket, explain the issue, and use /close when finished.'],
    ['ticket-hours', 'Show support hours.', 'Support hours', 'Add the hours when your staff team is available.'],
    ['ticket-feedback-help', 'Explain how to send feedback.', 'Feedback', 'Use /feedback to send private feedback through a popup form.']
  ])] },
  { id: 'leveling', name: 'Leveling Bot', description: 'Message XP tracking with 10 slash command examples for rank, progress, and community stats.', projectVariables: [{ id: 'starter_xp_total', name: 'serverXp', type: 'number', initialValue: 0 }], graphs: [xpCounter, rank, addEmbedReply(slash('starter_leaderboard', 'Slash: /leaderboard', 'leaderboard', 'Show the XP leaderboard.', 'This starter tracks one shared server total. Add per-member storage to build a leaderboard.'), 'Leaderboard', 'This starter tracks one shared server total. Add per-member storage to build a leaderboard.'), ...extraCommandGraphs('level', [
    ['progress', 'Show how leveling works.', 'Level progress', 'This starter counts server XP. Extend it with per-user storage to track individual progress.'],
    ['level-info', 'Explain the level system.', 'Level system', 'Members earn XP when they send messages. Tune the counter graph to suit your server.'],
    ['top-members', 'Show the top members.', 'Top members', 'Connect a database or project array to store XP per member.'],
    ['xp-rules', 'Show XP earning rules.', 'XP rules', 'Add your message cooldown and anti-spam rules here.'],
    ['daily-xp', 'Explain daily XP rewards.', 'Daily reward', 'Add a scheduled graph and persistent per-user storage to implement this reward.'],
    ['profile', 'Show profile command guidance.', 'Member profile', 'Connect a user ID to persistent member data to build profiles.'],
    ['streak', 'Explain activity streaks.', 'Activity streak', 'Add date and per-member storage to calculate activity streaks.'],
    ['level-help', 'List the leveling examples.', 'Leveling help', 'Try /rank and /leaderboard, then extend the project with per-user XP storage.']
  ])] },
  { id: 'moderation', name: 'Basic Moderation', description: 'Rules, reports, message triggers, and 10 slash command starter examples.', graphs: [moderationRules, addEmbedReply(slash('starter_report', 'Slash: /report', 'report', 'Report a server issue.', 'Connect this command to a staff channel workflow and add your report fields.'), 'Report an issue', 'Connect this command to a staff channel workflow and add report fields before using it.'), slash('starter_clear_help', 'Slash: /mod-help', 'mod-help', 'Show moderation commands.', 'Use /rules to review server rules and /report to contact staff.'), ping, ...extraCommandGraphs('mod', [
    ['warn', 'Explain how staff warnings work.', 'Warn member', 'Connect a member option to a moderation log and permission check before taking action.'],
    ['timeout', 'Explain how timeouts work.', 'Timeout member', 'Add a member option, duration, and moderator permission check before applying a timeout.'],
    ['kick', 'Explain the kick workflow.', 'Kick member', 'Add a member option and confirm permissions before performing moderation actions.'],
    ['ban', 'Explain the ban workflow.', 'Ban member', 'Add a member option, reason, and permission review before performing moderation actions.'],
    ['purge-help', 'Show message cleanup guidance.', 'Message cleanup', 'Use a bounded message count and confirm Manage Messages permission before cleanup.'],
    ['appeal', 'Explain how to appeal moderation.', 'Appeals', 'Add your appeal instructions and moderation contact channel.'],
    ['mod-log', 'Explain moderation logging.', 'Moderation log', 'Configure a private log channel and record the moderator, target, reason, and time.']
  ])] },
  { id: 'basic', name: 'Basic Bot', description: 'A working !ping reply, welcome button, feedback modal, and 10 slash commands.', graphs: [ping, basicHelp, welcomeCommand, welcomeButton, feedbackModal, feedbackSubmitted, ...extraCommandGraphs('basic', [
    ['hello', 'Say hello to the user.', 'Hello', 'Hello! Your bot is connected and ready.'],
    ['server', 'Show server information guidance.', 'Server info', 'Connect server properties to this reply to show live server details.'],
    ['profile', 'Show profile guidance.', 'Your profile', 'Connect the invoking user to profile data you store for your community.'],
    ['rules', 'Show where to find server rules.', 'Server rules', 'Add your rules and link your rules channel here.'],
    ['support', 'Show how to contact support.', 'Support', 'Use /feedback to send a private note through the sample popup modal.'],
    ['about', 'Show bot information.', 'About this bot', 'A starter bot built with ARC Studio.'],
    ['commands', 'List the included examples.', 'Commands', 'Try /help, /welcome, /feedback, or !ping.']
  ])] },
  { id: 'utility', name: 'Utility Bot', description: 'Rolls, server information, rules, and 10 slash command examples.', graphs: [rollCommand(), utilityAbout, moderationRules, slash('starter_time_help', 'Slash: /commands', 'commands', 'List the included utility commands.', 'Try /roll, /about, /rules, or !ping.'), ping, ...extraCommandGraphs('utility', [
    ['choose', 'Explain how to choose from options.', 'Choose an option', 'Connect an array of choices to a random index to build a picker.'],
    ['coinflip', 'Flip a coin.', 'Coin flip', 'Heads or tails? Add a random boolean node to make this response dynamic.'],
    ['remind', 'Explain reminder setup.', 'Reminder', 'Add a delay node and persistent reminder storage to implement reminders.'],
    ['poll-help', 'Explain how to create a poll.', 'Polls', 'Use message components with button IDs and an interaction event to build a poll.'],
    ['server-info', 'Show server information guidance.', 'Server info', 'Wire server fields into an embed to display live information.'],
    ['utility-help', 'Show utility command guidance.', 'Utility commands', 'Try /roll, /about, /rules, and /commands.']
  ])] }
]);
//
export function getStarterProject(id) { return StarterProjects.find((item) => item.id === id); }
