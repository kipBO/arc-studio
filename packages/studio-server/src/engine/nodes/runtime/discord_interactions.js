const INTERACTION_NODE_TYPES = new Set([
  'action_reply_interaction',
  'action_defer_reply',
  'action_defer_update',
  'action_edit_interaction_reply',
  'action_show_modal',
  'action_respond_autocomplete'
]);
//
export function isDiscordInteractionNodeType(type) {
  return INTERACTION_NODE_TYPES.has(type);
}

function findFocusedOption(options = []) {
  for (const option of options) {
    if (option.focused) return option;
    const nested = findFocusedOption(option.options || []);
    if (nested) return nested;
  }
  return null;
}

function buildMessagePayload(content, embed, components, files) {
  return {
    ...(content ? { content } : {}),
    ...(embed ? { embeds: [embed] } : {}),
    ...(Array.isArray(components) && components.length ? { components } : {}),
    ...(files?.length ? { files } : {})
  };
}

export async function executeDiscordInteractionNode(node, {
  resolveInput,
  resolveComponents,
  resolveFiles,
  buildEmbed,
  rest,
  log,
  state,
  eventPayload,
  nodes,
  setOutput
}) {
  if (!isDiscordInteractionNodeType(node?.type)) return false;

  if (state.pending) await state.pending;

  if (node.type === 'action_show_modal') {
    const interactionId = String(resolveInput('interaction_id', node.data?.interaction_id || ''));
    const interactionToken = String(resolveInput('interaction_token', node.data?.interaction_token || ''));
    const modal = resolveInput('modal', node.data?.modal || null);
    if (!interactionToken) throw new Error('Show Popup Modal needs the Interaction Token from its event node.');
    if (!modal || typeof modal !== 'object' || !modal.custom_id || !modal.title || !Array.isArray(modal.components) || modal.components.length < 1 || modal.components.length > 5 || modal.components.some((item) => item?.type !== 18 || !item.component?.custom_id)) throw new Error('Connect a valid Popup Modal Builder output (1–5 labeled fields).');
    if (state.acknowledged) throw new Error('This interaction has already been acknowledged. Show a modal as the initial response, before any reply or defer node.');
    state.acknowledged = true;
    state.deferred = false;
    state.pending = rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 9, data: modal });
    try { await state.pending; }
    catch (error) { state.acknowledged = false; throw error; }
    finally { state.pending = null; }
    log('[Show Popup Modal] Modal opened.');
    return true;
  }

  if (node.type === 'action_respond_autocomplete') {
    if (Number(eventPayload?.type) !== 4) throw new Error('Respond to Autocomplete can only run for an autocomplete interaction.');
    const interactionId = String(resolveInput('interaction_id', eventPayload?.id || ''));
    const interactionToken = String(resolveInput('interaction_token', eventPayload?.token || ''));
    const focused = findFocusedOption(eventPayload?.data?.options || []);
    const slashCommandNode = nodes.find((candidate) => candidate.type === 'event_slash_command' && String(candidate.data?.commandName || '').toLowerCase() === String(eventPayload?.data?.name || '').toLowerCase());
    const autocompleteOption = slashCommandNode?.data?.options?.find((option) => option.name === focused?.name);
    if (!focused || !autocompleteOption?.autocomplete || !autocompleteOption.dynamicAutocomplete) throw new Error('This option is not configured for graph-generated autocomplete.');
    const type = Number(focused?.type || 3);
    const query = String(focused?.value ?? '').toLocaleLowerCase();
    const rawChoices = resolveInput('choices', node.data?.choices || []);
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
    if (state.acknowledged) throw new Error('This autocomplete interaction has already been answered.');
    state.acknowledged = true;
    state.pending = rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 8, data: { choices } });
    try { await state.pending; }
    catch (error) { state.acknowledged = false; throw error; }
    finally { state.pending = null; }
    setOutput('choice_count', choices.length);
    log(`[Autocomplete] Sent ${choices.length} suggestion${choices.length === 1 ? '' : 's'}.`);
    return true;
  }

  if (node.type === 'action_reply_interaction') {
    const applicationId = String(resolveInput('application_id', node.data?.application_id || state.applicationId || ''));
    const interactionId = String(resolveInput('interaction_id', node.data?.interaction_id || ''));
    const interactionToken = String(resolveInput('interaction_token', node.data?.interaction_token || ''));
    const content = String(resolveInput('content', node.data?.content || '')).slice(0, 2000);
    const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
    const components = resolveComponents();
    const files = resolveFiles(resolveInput('files', node.data?.files || []));
    const ephemeral = Boolean(resolveInput('ephemeral', node.data?.ephemeral || false));

    if (!interactionToken) {
      log('[Action Reply] Error: Missing interaction token');
    } else {
      log(`[Action Reply] Sending interaction response (ephemeral: ${ephemeral}).`);
      const responseData = { ...buildMessagePayload(content, embed, components, files), flags: ephemeral ? 64 : 0 };
      if (state.deferred) {
        if (!applicationId) throw new Error('Replying after a defer needs the Application ID output from the event node.');
        if (typeof rest.editOriginalInteractionResponse !== 'function') throw new Error('This REST connection cannot edit a deferred interaction response.');
        await rest.editOriginalInteractionResponse(applicationId, interactionToken, responseData);
      } else {
        if (state.acknowledged) throw new Error('This interaction has already been acknowledged. Use only one initial reply or defer node for each interaction.');
        state.acknowledged = true;
        state.deferred = false;
        state.pending = rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 4, data: responseData });
        try { await state.pending; }
        catch (error) { state.acknowledged = false; throw error; }
        finally { state.pending = null; }
      }
    }
    return true;
  }

  if (node.type === 'action_defer_reply' || node.type === 'action_defer_update') {
    const interactionId = String(resolveInput('interaction_id', node.data?.interaction_id || ''));
    const interactionToken = String(resolveInput('interaction_token', node.data?.interaction_token || ''));
    const isUpdate = node.type === 'action_defer_update';
    const ephemeral = Boolean(resolveInput('ephemeral', node.data?.ephemeral || false));
    if (!interactionToken) throw new Error(`${isUpdate ? 'Defer Update' : 'Defer Reply'} needs an interaction token.`);
    if (state.acknowledged) throw new Error('This interaction has already been acknowledged. Use only one initial reply or defer node for each interaction.');
    state.acknowledged = true;
    state.deferred = true;
    state.pending = isUpdate
      ? (rest.deferInteractionUpdate?.(interactionId || 'mock', interactionToken) || rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 6 }))
      : (rest.deferInteractionReply?.(interactionId || 'mock', interactionToken, { ephemeral }) || rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 5, ...(ephemeral ? { data: { flags: 64 } } : {}) }));
    try {
      await state.pending;
      setOutput('interaction_token', interactionToken);
      log(`[${isUpdate ? 'Defer Update' : 'Defer Reply'}] Interaction acknowledged; continue with Reply to Interaction when ready.`);
    } catch (error) {
      state.acknowledged = false;
      state.deferred = false;
      throw error;
    } finally { state.pending = null; }
    return true;
  }

  const applicationId = String(resolveInput('application_id', node.data?.application_id || state.applicationId || '')).trim();
  const interactionToken = String(resolveInput('interaction_token', node.data?.interaction_token || '')).trim();
  const content = String(resolveInput('content', node.data?.content || '')).slice(0, 2000);
  const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
  const components = resolveComponents();
  const files = resolveFiles(resolveInput('files', node.data?.files || []));

  if (!applicationId) {
    log('[Edit Interaction Reply] Error: Missing Application ID');
  } else if (!interactionToken) {
    log('[Edit Interaction Reply] Error: Missing interaction token');
  } else {
    log('[Edit Interaction Reply] Editing original interaction response.');
    const payload = buildMessagePayload(content, embed, components, files);
    if (typeof rest.editOriginalInteractionResponse !== 'function') throw new Error('This REST connection cannot edit interaction responses.');
    await rest.editOriginalInteractionResponse(applicationId, interactionToken, payload);
  }
  return true;
}
