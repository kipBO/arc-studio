const MESSAGE_NODE_TYPES = new Set(['action_send_message', 'action_edit_message']);
//
export function isDiscordMessageNodeType(type) {
  return MESSAGE_NODE_TYPES.has(type);
}

export async function executeDiscordMessageNode(node, {
  resolveInput,
  resolveComponents,
  resolveFiles,
  buildEmbed,
  rest,
  setOutput,
  log
}) {
  if (!isDiscordMessageNodeType(node?.type)) return false;

  if (node.type === 'action_send_message') {
    const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
    const threadId = String(resolveInput('thread_id', node.data?.thread_id || '')).trim();
    const destinationId = threadId || channelId;
    const content = String(resolveInput('content', node.data?.content || '')).slice(0, 2000);
    const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
    const components = resolveComponents();
    const files = resolveFiles(resolveInput('files', node.data?.files || []));
    const fileData = String(resolveInput('file_data', node.data?.file_data || ''));
    const fileName = String(resolveInput('file_name', node.data?.file_name || 'image.png'));
    const replyToMessageId = String(resolveInput('reply_to_message_id', node.data?.reply_to_message_id || '')).trim();
    const mentionRepliedUser = Boolean(resolveInput('mention_replied_user', node.data?.mention_replied_user ?? Boolean(replyToMessageId)));

    if (!destinationId) {
      log('[Action Send Message] Error: Missing Channel ID or Thread ID');
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

      log(`[Action Send Message] Sending message to ${threadId ? `thread ${threadId}` : `channel ${channelId}`}.`);
      const sentMessage = await rest.createMessage(destinationId, payload);
      if (sentMessage?.id) setOutput('message_id', sentMessage.id);
    }
    return true;
  }

  const channelId = String(resolveInput('channel_id', node.data?.channel_id || ''));
  const messageId = String(resolveInput('message_id', node.data?.message_id || ''));
  const content = resolveInput('content', node.data?.content);
  const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
  const components = resolveComponents();
  const files = resolveFiles(resolveInput('files', node.data?.files || []));

  if (!channelId || !messageId) {
    log('[Action Edit Message] Error: Missing Channel ID or Message ID');
  } else {
    const payload = {};
    if (content !== undefined && content !== null && String(content).length > 0) payload.content = String(content).slice(0, 2000);
    if (embed) payload.embeds = [embed];
    if (Array.isArray(components) && components.length) payload.components = components;
    if (files?.length) payload.files = files;

    log(`[Action Edit Message] Editing message ${messageId} in channel ${channelId}`);
    const editedMessage = await rest.editMessage(channelId, messageId, payload);
    if (editedMessage?.id) setOutput('message_id', editedMessage.id);
  }
  return true;
}
