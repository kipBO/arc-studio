import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileCode2, Plus, X } from 'lucide-react';
import { PinColors } from './nodeDefinitions.js';
import { bitfieldToPermissions, DISCORD_PERMISSIONS } from './permissionCatalog.js';
import { AnimatedCheckbox, AnimatedDropdown } from '../ui/CustomControls.jsx';
import { CharacterLimit } from '../ui/Inputs.jsx';
import { EmbedNodeBuilder } from './EmbedNodeBuilder.jsx';
import { JsonSchemaEditor } from './JsonSchemaEditor.jsx';
import { DiscordTextField } from '../ui/DiscordTextField.jsx';
import { TemplateVariableHints } from '../ui/TemplateVariableHints.jsx';
import { DiscordLongTextField, LONG_TEXT_THRESHOLD } from '../ui/DiscordLongTextField.jsx';
import { apiUrl } from '../../core/api.js';
import { onPageBlur } from '../../core/pageFocus.js';
//
const slashCommandNamePattern = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;
const defaultValueForType = (type) => type === 'number' ? 0 : type === 'boolean' ? false : type === 'array' ? [] : type === 'object' ? {} : '';
const eventSocketHints = {
  application_id: 'Discord application (bot) ID associated with this interaction',
  channel_id: 'Discord channel ID where this event or interaction occurred',
  command_name: 'Name of the slash command that was invoked, without the leading slash',
  content: 'Text content of the Discord message or event payload',
  custom_id: 'Developer-defined ID used to identify the submitted component or modal',
  guild_id: 'Discord server ID where this event occurred; empty for direct messages',
  interaction_token: 'Short-lived token used to respond to this interaction; treat it as a secret',
  interaction_id: 'Unique ID for this Discord interaction',
  message_id: 'ID of the Discord message involved in this event',
  options: 'Object containing the command options submitted with this interaction',
  selected_values: 'Array of values chosen in the submitted select menu',
  submitted_values: 'Object of modal field values, keyed by each field’s custom ID',
  user_id: 'Discord user ID of the person who triggered this event or interaction',
  username: 'Discord username of the person who invoked this command'
};
function VariableJSONFallback({ type, value, onChange }) {
  const [draft, setDraft] = React.useState(null);
  const text = draft ?? JSON.stringify(value ?? defaultValueForType(type), null, 2);
  let valid = false;
  try {
    const parsed = JSON.parse(text);
    valid = type === 'array' ? Array.isArray(parsed) : Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
  } catch {}
  return <div className="node-config-stack">
    <textarea rows={3} value={text} onChange={(event) => {
      const nextText = event.target.value;
      setDraft(nextText);
      try {
        const parsed = JSON.parse(nextText);
        const rightShape = type === 'array' ? Array.isArray(parsed) : parsed && typeof parsed === 'object' && !Array.isArray(parsed);
        if (rightShape) onChange(parsed);
      } catch {}
    }} onBlur={() => { if (valid) setDraft(null); }} onPointerDown={(event) => event.stopPropagation()} placeholder={type === 'array' ? '[]' : '{}'} aria-label="Variable fallback JSON value" />
    {!valid && <small className="node-config-hint">Enter a valid JSON {type === 'array' ? 'array' : 'object'}.</small>}
  </div>;
}
function variableValuePaths(value, root, depth = 0, output = []) {
  if (depth >= 4 || value == null || typeof value !== 'object') return output;
  const entries = Array.isArray(value) ? value.slice(0, 10).map((_item, index) => [index, value[index]]) : Object.entries(value).slice(0, 40).filter(([key]) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key));
  for (const [key, child] of entries) {
    const path = Array.isArray(value) ? `${root}[${key}]` : `${root}.${key}`;
    output.push({ path, label: path });
    variableValuePaths(child, path, depth + 1, output);
  }
  return output;
}

function getSlashCommandNameIssue(value) {
  const name = String(value ?? '');
  if (!name) return 'Enter a command name.';
  if (!slashCommandNamePattern.test(name)) return 'Use 1–32 lowercase letters, numbers, hyphens, underscores, or apostrophes. Do not include the leading /.';
  if (name !== name.toLowerCase()) return 'Command names must be lowercase.';
  return '';
}

function getSlashCommandDescriptionIssue(value) {
  const description = String(value ?? '').trim();
  if (!description) return 'Add a description for this slash command.';
  if (Array.from(description).length > 100) return 'Descriptions must be 100 characters or fewer.';
  return '';
}

function NodeNumberInput({ value, onChange, allowEmpty = false, className = '', ...props }) {
  const onBlur = props.onBlur;
  const inputProps = { ...props };
  delete inputProps.onBlur;
  const [draft, setDraft] = React.useState(value == null ? '' : String(value));
  React.useEffect(() => setDraft(value == null ? '' : String(value)), [value]);
  const emptyIsInvalid = draft === '' && !allowEmpty;
  return <input {...inputProps} type="number" value={draft} className={`${className} ${emptyIsInvalid ? 'is-empty-number' : ''}`.trim()} aria-invalid={emptyIsInvalid || props['aria-invalid'] || undefined} onChange={(event) => {
    let next = event.target.value;
    const maximum = Number(props.max);
    if (next !== '' && Number.isFinite(maximum) && Number(next) > maximum) {
      next = String(maximum);
      event.target.value = next;
    }
    setDraft(next);
    if (next !== '' || allowEmpty) onChange?.(event);
  }} onBlur={(event) => {
    if (draft !== '') {
      const minimum = Number(props.min);
      const maximum = Number(props.max);
      const number = Number(draft);
      const bounded = Math.max(Number.isFinite(minimum) ? minimum : -Infinity, Math.min(Number.isFinite(maximum) ? maximum : Infinity, number));
      if (Number.isFinite(bounded) && String(bounded) !== draft) {
        const normalized = String(bounded);
        setDraft(normalized);
        onChange?.({ target: { value: normalized } });
      }
    }
    onBlur?.(event);
  }} />;
}

export function CanvasNode({
  node, definition, authToken = '', connectedInputIds = new Set(), graphVariables = [], templatePreviewValues = {}, functionGraphs = [], callableGraphs = functionGraphs, selected = false, illuminated = false, isLocked = false,
  snappedPin = null, appEmojis = [], modalFieldOptions = [], onSelect, onDelete, onNodeDataChange, onPinStartConnect, onPinDoubleClick, onOpenVariables, onOpenEmbedStudio, onOpenTextStudio, onOpenPermissionStudio, onOpenSlashCommandStudio, onOpenModalStudio, onOpenFunctionGraph
}) {
  const nodeDef = definition || { label: node.label || node.type, color: '#778196', category: 'Node', inputs: [], outputs: [] };
  const execFirst = (pins = []) => [...pins].sort((left, right) => Number(right.type === 'exec') - Number(left.type === 'exec'));
  const inputs = execFirst(nodeDef.inputs);
  const outputs = execFirst(nodeDef.outputs);
  const rows = Math.max(inputs.length, outputs.length);
  const update = (key, value, label) => onNodeDataChange?.(node.id, typeof key === 'object' ? key : { [key]: value }, label);
  const selectedVariable = graphVariables.find((variable) => variable.id === node.data?.variableId && (variable.scope || 'graph') === (node.data?.scope || 'graph'));
  const configureTextFields = (element) => {
    if (!element) return;
    element.querySelectorAll('input:not([type="number"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]), textarea').forEach((field) => {
      field.setAttribute('autocapitalize', 'off');
      field.setAttribute('autocorrect', 'off');
      field.setAttribute('spellcheck', 'false');
    });
  };

  const renderPin = (pin, direction, index) => {
    const displayType = pin.colorType || pin.type;
    const pinColor = PinColors[displayType] || '#c7cedb';
    const isSnapped = snappedPin?.nodeId === node.id && snappedPin?.pinId === pin.id && snappedPin?.direction === direction;
    const socketHint = direction === 'output' && nodeDef.type?.startsWith('event_') ? eventSocketHints[pin.id] : '';
    const description = pin.description || (pin.type === 'exec'
      ? direction === 'input'
        ? 'Execution input · accepts multiple incoming paths · runs once for each active path'
        : 'Execution output · each connected path runs in order'
      : socketHint
        ? socketHint
        : direction === 'input'
          ? `Input socket for ${pin.label} · accepts a compatible ${displayType} wire · without one, the configured fallback is used`
          : `Output socket for ${pin.label} · carries a ${displayType} value to connected inputs`);
    return (
      <div
        key={`${direction}-${pin.id}`}
        className={`node-pin-row ${direction === 'output' ? 'is-output' : 'is-input'} ${pin.type === 'exec' ? 'is-exec' : ''} ${isSnapped ? 'is-wire-target' : ''}`}
        data-node-id={node.id}
        data-pin-id={pin.id}
        data-pin-index={index}
        data-direction={direction}
        data-pin-type={pin.type}
        data-tooltip={`${pin.label} · ${displayType}`}
        data-pin-description={`${pin.label} · ${description} · ${displayType}`}
        onPointerDown={(event) => {
          if (direction !== 'output') { event.stopPropagation(); return; }
          onPinStartConnect?.(event, node.id, pin.id, direction, pin.type, index);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onPinDoubleClick?.(event, node.id, pin.id, direction, pin.type, index);
        }}
      >
        {direction === 'input' && <span className="pin-socket" style={{ '--pin-color': pinColor }} />}
        <span className="pin-label">{pin.label}</span>
        {direction === 'output' && <span className="pin-socket" style={{ '--pin-color': pinColor }} />}
      </div>
    );
  };

  return (
    <article
      className={`canvas-node ${selected ? 'is-selected' : ''} ${illuminated ? 'is-illuminated' : ''} ${isLocked ? 'is-locked' : ''}`}
      data-node-card-id={node.id}
      tabIndex={-1}
      style={{ '--node-accent': nodeDef.color, '--node-rows': rows, transform: `translate3d(${node.x}px, ${node.y}px, 0)` }}
      ref={configureTextFields}
      onClick={(event) => { event.stopPropagation(); onSelect?.(node.id, event); }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (node.type !== 'function_call' || event.target.closest('button, input, textarea, select, [role="combobox"], .node-pin-row')) return;
        const target = callableGraphs.find((graph) => graph.id === node.data?.graphId && graph.graphType === 'function');
        if (target) onOpenFunctionGraph?.(target);
      }}
      data-tooltip={node.type === 'function_call' && callableGraphs.some((graph) => graph.id === node.data?.graphId && graph.graphType === 'function') ? 'Double-click to open this function graph' : undefined}
      aria-label={`${node.label || nodeDef.label} node`}
    >
      <header className="node-header">
        <span className="node-type-mark"><span /></span>
        <span className="node-category">{nodeDef.category}</span>
        {!isLocked && <button className="node-delete" onClick={(event) => { event.stopPropagation(); onDelete?.(node.id); }} title="Delete node" aria-label="Delete node" tabIndex={selected ? 0 : -1}><X size={13} /></button>}
      </header>
      <div className="node-title" data-tooltip={node.label && node.label !== nodeDef.label ? `Node type: ${nodeDef.label}` : undefined}>{node.label || nodeDef.label}</div>
      <div className="node-pins">
        <div className="node-pin-column node-pin-inputs">{inputs.map((pin, index) => renderPin(pin, 'input', index))}</div>
        <div className="node-pin-column node-pin-outputs">{outputs.map((pin, index) => renderPin(pin, 'output', index))}</div>
      </div>
      {renderNodeConfig(node, nodeDef, update, graphVariables, callableGraphs, selectedVariable, onOpenVariables, onOpenEmbedStudio, onOpenTextStudio, onOpenPermissionStudio, onOpenSlashCommandStudio, onOpenModalStudio, connectedInputIds, appEmojis, authToken, modalFieldOptions, templatePreviewValues)}
    </article>
  );
}

function renderNodeConfig(node, nodeDef, update, graphVariables, callableGraphs, selectedVariable, onOpenVariables, onOpenEmbedStudio, onOpenTextStudio, onOpenPermissionStudio, onOpenSlashCommandStudio, onOpenModalStudio, connectedInputIds, appEmojis, authToken, modalFieldOptions, templatePreviewValues) {
  const isConnected = (pinId) => connectedInputIds.has(pinId);
  if (node.type === 'branch_switch') {
    return <div className="node-config node-config-stack">
      {!isConnected('value') && <FallbackField label="Value"><input value={node.data?.value ?? ''} onChange={(event) => update('value', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Value to match" aria-label="Switch value" /></FallbackField>}
      {Array.from({ length: 5 }, (_, index) => `case_${index + 1}`).filter((pin) => !isConnected(pin)).map((pin, index) => <FallbackField key={pin} label={`Case ${index + 1}`}><input value={node.data?.[pin] ?? ''} onChange={(event) => update(pin, event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Leave blank to skip" aria-label={`Switch case ${index + 1}`} /></FallbackField>)}
      <span className="node-config-hint">First matching non-empty case runs. Values are compared as text.</span>
    </div>;
  }
  const textEditor = (id, label, maxLength = 2000, placeholder = '', autocomplete = true) => {
    const value = String(node.data?.[id] ?? '');
    const openTextEditor = () => onOpenTextStudio?.(node, id, label, value, maxLength);
    const valuePaths = graphVariables.flatMap((variable) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name || '') ? variableValuePaths(variable.initialValue, variable.name) : []);
    const templateSuggestions = nodeDef.inputs.filter((pin) => /^arg_\d+$/.test(pin.id)).map((pin) => ({ name: pin.id.replace(/^arg_/, 'arg'), label: pin.label }));
    if (value.length > LONG_TEXT_THRESHOLD) return <DiscordLongTextField value={value} onOpenEditor={openTextEditor} label={label} maxLength={maxLength} />;
    return <CharacterLimit value={value} maxLength={maxLength}><DiscordTextField onOpenTextEditor={openTextEditor} discordAutocomplete={autocomplete} templateAutocomplete templateValuePaths={valuePaths} templateSuggestions={templateSuggestions} graphVariables={graphVariables} as="textarea" rows={2} maxLength={maxLength} value={value} appEmojis={appEmojis} onChange={(event) => update(id, event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder={placeholder} aria-label={label} /></CharacterLimit>;
  };
  const valueTypes = [{ value: 'number', label: 'Number' }, { value: 'string', label: 'Text' }, { value: 'boolean', label: 'Boolean' }, { value: 'object', label: 'Object / Array' }];
  if (node.type === 'data_get_modal_value') {
    const fieldId = String(node.data?.custom_id ?? '');
    const fieldOptions = [...new Map(modalFieldOptions.map((item) => [item.value, item])).values()];
    return <div className="node-config node-config-stack">
      {!isConnected('submitted_values') && <span className="node-config-warning" role="status"><AlertTriangle size={12} /><span>Connect submitted values.</span></span>}
      {!isConnected('custom_id') && <>
        {fieldOptions.length > 0 && <FallbackField label="Modal field"><AnimatedDropdown value={fieldId} options={fieldOptions} onChange={(value) => update('custom_id', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Popup modal field" placeholder="Choose a field" className="node-select" /></FallbackField>}
        <FallbackField label="Field Custom ID"><input value={fieldId} onChange={(event) => update('custom_id', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Enter the field's custom ID" aria-label="Field Custom ID" /></FallbackField>
      </>}
      <span className="node-config-hint">Returns the matching field value. Multi-select fields return an array; use <code>Get Modal Value → Value</code> for one field at a time.</span>
    </div>;
  }
  if (node.type === 'event_message_create') {
    return <div className="node-config node-config-stack">
      <span className="node-config-hint">Use Split Text on Message Content to get parts as separate outputs.</span>
    </div>;
  }
  if (node.type === 'event_slash_command') {
    const commandNameIssue = getSlashCommandNameIssue(node.data?.commandName);
    const commandDescriptionIssue = getSlashCommandDescriptionIssue(node.data?.description);
    const commandPermissionBits = String(node.data?.defaultMemberPermissions ?? '').trim();
    const selectedCommandPermissions = bitfieldToPermissions(commandPermissionBits).map((key) => DISCORD_PERMISSIONS.find((permission) => permission.key === key)?.label || key);
    const commandPermissionSummary = commandPermissionBits === '0'
      ? 'Administrators only'
      : selectedCommandPermissions.length === 1
        ? selectedCommandPermissions[0]
        : selectedCommandPermissions.length > 1
          ? `${selectedCommandPermissions.length} permissions`
        : 'Everyone';
    const usesAppDefaults = !Array.isArray(node.data?.integrationTypes) && !Array.isArray(node.data?.contexts);
    const integrationTypes = Array.isArray(node.data?.integrationTypes) ? node.data.integrationTypes : [];
    const commandContexts = Array.isArray(node.data?.contexts) ? node.data.contexts : [];
    const toggleSelection = (key, current, value) => {
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      if (next.length) update(key, next);
    };
    const warning = (message) => message && <button type="button" className="slash-command-warning" data-tooltip={message} aria-label={message} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}><AlertTriangle size={11} /></button>;
    const options = Array.isArray(node.data?.options) ? node.data.options : [];
    return <div className="node-config node-config-stack slash-command-config">
      <label><span className="slash-command-field-label"><span>Command</span>{warning(commandNameIssue, 'Command name issue')}</span><CharacterLimit className="is-flex" value={node.data?.commandName ?? ''} maxLength={32}><div><b>/</b><input value={node.data?.commandName ?? ''} maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => update('commandName', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="help" aria-label="Slash command name" /></div></CharacterLimit></label>
      <label><span className="slash-command-field-label"><span>Description</span>{warning(commandDescriptionIssue, 'Command description issue')}</span><CharacterLimit value={node.data?.description ?? ''} maxLength={100}><input value={node.data?.description ?? ''} maxLength={100} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => update('description', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="What this command does" aria-label="Slash command description" /></CharacterLimit></label>
      <section className="slash-command-options-compact">
        <div><strong>Arguments</strong><span>{options.length}/25</span></div>
        <button type="button" className="node-config-action node-config-studio-action is-static-hover" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenSlashCommandStudio?.(node); }}><Plus size={12} /> Edit arguments</button>
      </section>
      <section className="slash-command-options-compact">
        <div><strong>Who can use this command</strong><span>{commandPermissionSummary}</span></div>
        <button type="button" className="node-config-action node-config-studio-action is-static-hover" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenPermissionStudio?.(node); }}><Plus size={12} /> Edit command permissions</button>
      </section>
      <details className="slash-command-availability">
        <summary>Installation and context</summary>
        <label className="slash-command-choice"><AnimatedCheckbox checked={usesAppDefaults} label="Use application defaults" onChange={(value) => update({ integrationTypes: value ? undefined : [0], contexts: value ? undefined : [0] })} onPointerDown={(event) => event.stopPropagation()} /><span>Use application defaults</span></label>
        <div className={`slash-command-choice-list ${usesAppDefaults ? 'is-disabled' : ''}`}>
          <span className="slash-command-choice-heading">Installations</span>
          {[[0, 'Server install'], [1, 'User install']].map(([value, label]) => <label className="slash-command-choice" key={value}><AnimatedCheckbox checked={integrationTypes.includes(value)} label={label} disabled={usesAppDefaults} onChange={() => toggleSelection('integrationTypes', integrationTypes, value)} onPointerDown={(event) => event.stopPropagation()} /><span>{label}</span></label>)}
          <span className="slash-command-choice-heading">Where it can be used</span>
          {[[0, 'Server channels'], [1, 'Bot DMs'], [2, 'Private channels']].map(([value, label]) => <label className="slash-command-choice" key={value}><AnimatedCheckbox checked={commandContexts.includes(value)} label={label} disabled={usesAppDefaults} onChange={() => toggleSelection('contexts', commandContexts, value)} onPointerDown={(event) => event.stopPropagation()} /><span>{label}</span></label>)}
          <small>Private channels require user installation. The application must support each selected install type.</small>
        </div>
      </details>
    </div>;
  }
  if (node.type === 'event_cron') {
    return <div className="node-config node-config-stack function-node-config">
      <FallbackField label="Cron (min hour day month weekday)"><input value={node.data?.cronExpression ?? '*/5 * * * *'} onChange={(event) => update('cronExpression', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="*/5 * * * *" aria-label="Cron schedule expression" /></FallbackField>
      <FallbackField label="Time zone"><input value={node.data?.timeZone ?? 'UTC'} onChange={(event) => update('timeZone', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="UTC or Asia/Tokyo" aria-label="Cron time zone" /></FallbackField>
      <span className="node-config-hint">Five-field cron. Runs once per matching minute; use an IANA time zone.</span>
    </div>;
  }
  if (node.type === 'action_set_presence') {
    const activityTypes = [{ value: '0', label: 'Playing' }, { value: '2', label: 'Listening' }, { value: '3', label: 'Watching' }, { value: '5', label: 'Competing' }];
    const statuses = [{ value: 'online', label: 'Online' }, { value: 'idle', label: 'Idle' }, { value: 'dnd', label: 'Do not disturb' }, { value: 'invisible', label: 'Invisible' }];
    return <div className="node-config node-config-stack">
      {!isConnected('activity_text') && <FallbackField label="Activity text"><input value={node.data?.activity_text ?? 'ARC Studio'} maxLength={128} onChange={(event) => update('activity_text', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="ARC Studio" aria-label="Presence activity text" /></FallbackField>}
      {!isConnected('activity_type') && <FallbackField label="Activity type"><AnimatedDropdown value={String(node.data?.activity_type ?? 0)} options={activityTypes} onChange={(value) => update('activity_type', Number(value))} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Presence activity type" className="node-select" /></FallbackField>}
      {!isConnected('status') && <FallbackField label="Status"><AnimatedDropdown value={node.data?.status ?? 'online'} options={statuses} onChange={(value) => update('status', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Bot presence status" className="node-select" /></FallbackField>}
    </div>;
  }
  if (node.type === 'function_input') {
    const type = node.data?.valueType || 'number';
    const optional = node.data?.optional !== false;
    const defaultValue = node.data?.defaultValue ?? defaultValueForType(type);
    return <div className="node-config node-config-stack function-node-config">
      <CharacterLimit value={node.data?.name || ''} maxLength={40}><input value={node.data?.name || ''} maxLength={40} onChange={(event) => update('name', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Input name" aria-label="Function input name" /></CharacterLimit>
      <AnimatedDropdown value={type} options={valueTypes} onChange={(value) => update({ valueType: value, defaultValue: defaultValueForType(value) })} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Function input type" className="node-select" />
      <div className="function-input-option"><span>Optional input</span><AnimatedCheckbox checked={optional} label="Optional input" onChange={(value) => update('optional', value)} onPointerDown={(event) => event.stopPropagation()} /></div>
      {optional && (type === 'object'
        ? <span className="node-config-hint">Default is an empty object. Connect an array or object node to supply data.</span>
        : type === 'boolean'
        ? <div className="function-input-default"><span>Default value</span><AnimatedCheckbox checked={Boolean(defaultValue)} label="Default value" onChange={(value) => update('defaultValue', value)} onPointerDown={(event) => event.stopPropagation()} /></div>
        : <label className="function-input-default"><span>Default value</span><input type={type === 'number' ? 'number' : 'text'} step={type === 'number' ? 'any' : undefined} value={type === 'number' ? (Number.isFinite(Number(defaultValue)) ? Number(defaultValue) : 0) : defaultValue} onChange={(event) => update('defaultValue', type === 'number' ? (Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : 0) : event.target.value)} onPointerDown={(event) => event.stopPropagation()} aria-label="Optional function input default value" /></label>)}
    </div>;
  }
  if (node.type === 'function_return') {
    const type = node.data?.valueType || 'number';
    return <div className="node-config node-config-stack function-node-config">
      <AnimatedDropdown value={type} options={valueTypes} onChange={(value) => update('valueType', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Function return type" className="node-select" />
    </div>;
  }
  if (node.type === 'function_call') {
    const target = callableGraphs.find((graph) => graph.id === node.data?.graphId);
    const parameters = (target?.nodes || []).filter((item) => item.type === 'function_input');
    const requiredCount = parameters.filter((item) => item.data?.optional === false).length;
    const optionalCount = parameters.length - requiredCount;
    const hasReturn = target?.nodes?.some((item) => item.type === 'function_return');
    return <div className="node-config node-config-stack function-node-config">
      <AnimatedDropdown value={node.data?.graphId || ''} options={callableGraphs.map((graph) => ({ value: graph.id, label: graph.name || 'Untitled graph' }))} onChange={(value) => {
        const selectedGraph = callableGraphs.find((graph) => graph.id === value);
        update({ graphId: value }, undefined, `Call ${selectedGraph?.name || 'Graph'}`);
      }} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Graph to call" placeholder={callableGraphs.length ? 'Select graph' : 'Save a graph first'} className="node-select" disabled={!callableGraphs.length} />
      {target && <span className="node-config-hint">{parameters.length ? `${requiredCount} required · ${optionalCount} optional input${parameters.length === 1 ? '' : 's'}` : 'No inputs'}</span>}
      {target && hasReturn
        ? <span className="node-config-hint">Returns {target.nodes.find((item) => item.type === 'function_return')?.data?.valueType || 'number'}</span>
        : target && <span className="node-config-warning" role="status"><AlertTriangle size={12} /> This graph has no Return Value</span>}
    </div>;
  }
  if (node.type === 'execute_graph') {
    const eventGraphs = callableGraphs.filter((graph) => graph.graphType !== 'function' && (graph.nodes || []).some((item) => item.type.startsWith('event_')));
    return <div className="node-config node-config-stack function-node-config">
      <AnimatedDropdown value={node.data?.graphId || ''} options={eventGraphs.map((graph) => ({ value: graph.id, label: graph.name || 'Untitled graph' }))} onChange={(value) => {
        const selectedGraph = eventGraphs.find((graph) => graph.id === value);
        update({ graphId: value }, undefined, `Run ${selectedGraph?.name || 'Graph'}`);
      }} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Event graph to run" placeholder={eventGraphs.length ? 'Select event graph' : 'Create an event graph first'} className="node-select" disabled={!eventGraphs.length} />
      <span className="node-config-hint">Runs with the current Discord event. The target needs a matching trigger.</span>
    </div>;
  }
  if (node.type === 'data_string_split') {
    return <div className="node-config node-config-stack">
      {!isConnected('separator') && <FallbackField label="Separator"><input value={node.data?.separator ?? ','} onChange={(event) => update('separator', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="," aria-label="Split text separator" />
      </FallbackField>}
    </div>;
  }
  if (node.type === 'data_array_get' && !isConnected('index')) {
    return <div className="node-config node-config-stack"><FallbackField label="Index"><NodeNumberInput min="0" step="1" value={node.data?.index ?? 0} onChange={(event) => update('index', Math.max(0, Math.trunc(Number(event.target.value) || 0)))} onPointerDown={(event) => event.stopPropagation()} placeholder="0" aria-label="Array item index" /></FallbackField><span className="node-config-hint">Zero-based index</span></div>;
  }
  if (node.type === 'data_regex') {
    const mode = ['test', 'match', 'replace'].includes(node.data?.mode) ? node.data.mode : 'test';
    return <div className="node-config node-config-stack">
      <FallbackField label="Operation"><AnimatedDropdown value={mode} options={[{ value: 'test', label: 'Test for a match' }, { value: 'match', label: 'Extract a match' }, { value: 'replace', label: 'Replace matches' }]} onChange={(value) => update('mode', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Regex operation" className="node-select" /></FallbackField>
      {!isConnected('text') && <FallbackField label="Text"><textarea rows={2} maxLength={8192} value={node.data?.text ?? ''} onChange={(event) => update('text', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Regex input text" /></FallbackField>}
      {!isConnected('pattern') && <FallbackField label="Pattern"><input maxLength={256} value={node.data?.pattern ?? ''} onChange={(event) => update('pattern', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="e.g. (\\d+)" aria-label="Regular expression pattern" /></FallbackField>}
      {!isConnected('flags') && <FallbackField label="Flags"><input maxLength={6} value={node.data?.flags ?? ''} onChange={(event) => update('flags', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="g, i, m, s, u, y" aria-label="Regular expression flags" /></FallbackField>}
      {mode === 'replace' && !isConnected('replacement') && <FallbackField label="Replacement"><textarea rows={2} maxLength={2000} value={node.data?.replacement ?? ''} onChange={(event) => update('replacement', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Replacement text" aria-label="Regex replacement text" /></FallbackField>}
      <span className="node-config-hint">Limits: 256-character pattern, 8,192-character input. Use Valid and Error to handle invalid patterns safely.</span>
    </div>;
  }
  if (node.type === 'data_to_number' && !isConnected('text')) {
    return <div className="node-config node-config-stack"><FallbackField label="Text"><input value={node.data?.text ?? ''} onChange={(event) => update('text', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="e.g. 42.5" aria-label="Text to convert to a number" /></FallbackField></div>;
  }
  if (node.type === 'data_to_text' && !isConnected('value')) {
    return <div className="node-config node-config-stack"><FallbackField label="Value"><input value={node.data?.value ?? ''} onChange={(event) => update('value', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Value to convert to text" /></FallbackField></div>;
  }
  if (node.type === 'data_to_boolean' && !isConnected('value')) {
    return <div className="node-config node-config-stack"><FallbackField label="Value"><AnimatedDropdown value={String(node.data?.value ?? false)} options={[{ value: 'false', label: 'False' }, { value: 'true', label: 'True' }]} onChange={(value) => update('value', value === 'true')} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Value to convert to a boolean" className="node-select" /></FallbackField></div>;
  }
  if (node.type === 'data_check_value') {
    return <div className="node-config node-config-stack">
      {!isConnected('value') && <span className="node-config-hint">Leave Value unconnected to detect a missing value.</span>}
      {!isConnected('fallback') && <FallbackField label="Fallback"><input value={node.data?.fallback ?? ''} onChange={(event) => update('fallback', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used for missing, null, or empty text" aria-label="Value check fallback" /></FallbackField>}
      <span className="node-config-hint">State is missing, null, empty, or value. Zero and false count as values.</span>
    </div>;
  }
  if (node.type === 'data_get_value_by_path') {
    return <div className="node-config node-config-stack">
      {!isConnected('path') && <FallbackField label="Path"><input value={node.data?.path ?? ''} onChange={(event) => update('path', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="user.profile.name or items[0].id" aria-label="Value path" /></FallbackField>}
      {!isConnected('fallback') && <FallbackField label="Fallback"><input value={node.data?.fallback ?? ''} onChange={(event) => update('fallback', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when the path is missing" aria-label="Path lookup fallback" /></FallbackField>}
    </div>;
  }
  if (node.type === 'data_find_array_item' || node.type === 'data_filter_array') {
    const comparisonOptions = [{ value: 'equals', label: 'Equals' }, { value: 'not_equals', label: 'Does not equal' }, { value: 'contains', label: 'Contains' }, { value: 'starts_with', label: 'Starts with' }, { value: 'ends_with', label: 'Ends with' }, { value: 'greater_than', label: 'Greater than' }, { value: 'greater_or_equal', label: 'At least' }, { value: 'less_than', label: 'Less than' }, { value: 'less_or_equal', label: 'At most' }, { value: 'exists', label: 'Path exists' }, { value: 'is_empty', label: 'Is empty' }];
    return <div className="node-config node-config-stack">
      {!isConnected('path') && <FallbackField label="Property path (optional)"><input value={node.data?.path ?? ''} onChange={(event) => update('path', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="id or user.name; blank checks each item" aria-label="Array item property path" /></FallbackField>}
      {node.type === 'data_filter_array' && !isConnected('operator') && <FallbackField label="Comparison"><AnimatedDropdown value={node.data?.operator || 'equals'} options={comparisonOptions} onChange={(value) => update('operator', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Array filter comparison" className="node-select" /></FallbackField>}
      {!isConnected('value') && !['exists', 'is_empty'].includes(node.data?.operator) && <FallbackField label="Match value"><input value={node.data?.value ?? ''} onChange={(event) => update('value', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Array match value" /></FallbackField>}
    </div>;
  }
  if (node.type === 'data_format_number') {
    const style = ['decimal', 'percent', 'currency'].includes(node.data?.style) ? node.data.style : 'decimal';
    return <div className="node-config node-config-stack">
      {!isConnected('value') && <FallbackField label="Value"><NodeNumberInput allowEmpty step="any" value={node.data?.value ?? 0} onChange={(event) => update('value', event.target.value === '' ? '' : Number(event.target.value))} onPointerDown={(event) => event.stopPropagation()} aria-label="Number to format" /></FallbackField>}
      {!isConnected('locale') && <FallbackField label="Locale"><input value={node.data?.locale ?? 'en-US'} onChange={(event) => update('locale', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="en-US" aria-label="Number format locale" /></FallbackField>}
      {!isConnected('style') && <FallbackField label="Style"><AnimatedDropdown value={style} options={[{ value: 'decimal', label: 'Number' }, { value: 'percent', label: 'Percent' }, { value: 'currency', label: 'Currency' }]} onChange={(value) => update('style', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Number format style" className="node-select" /></FallbackField>}
      {style === 'currency' && !isConnected('currency') && <FallbackField label="Currency code"><input maxLength={3} value={node.data?.currency ?? 'USD'} onChange={(event) => update('currency', event.target.value.toUpperCase())} onPointerDown={(event) => event.stopPropagation()} placeholder="USD" aria-label="Currency code" /></FallbackField>}
      <div className="node-config"><FallbackField label="Minimum decimals">{isConnected('minimum_fraction_digits') ? <span>Connected</span> : <NodeNumberInput min="0" max="20" step="1" value={node.data?.minimum_fraction_digits ?? 0} onChange={(event) => update('minimum_fraction_digits', Math.max(0, Math.min(20, Number(event.target.value) || 0)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Minimum fraction digits" />}</FallbackField><FallbackField label="Maximum decimals">{isConnected('maximum_fraction_digits') ? <span>Connected</span> : <NodeNumberInput min="0" max="20" step="1" value={node.data?.maximum_fraction_digits ?? 2} onChange={(event) => update('maximum_fraction_digits', Math.max(0, Math.min(20, Number(event.target.value) || 0)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Maximum fraction digits" />}</FallbackField></div>
    </div>;
  }
  if (node.type.startsWith('math_')) {
    if (node.type === 'math_random') return <div className="node-config node-config-stack">
      {!isConnected('min') && <FallbackField label="Minimum"><NodeNumberInput allowEmpty step="any" value={node.data?.min ?? 0} onChange={(event) => update('min', event.target.value === '' ? '' : Number(event.target.value))} onPointerDown={(event) => event.stopPropagation()} aria-label="Random number minimum" />
      </FallbackField>}
      {!isConnected('max') && <FallbackField label="Maximum"><NodeNumberInput allowEmpty step="any" value={node.data?.max ?? 1} onChange={(event) => update('max', event.target.value === '' ? '' : Number(event.target.value))} onPointerDown={(event) => event.stopPropagation()} aria-label="Random number maximum" /></FallbackField>}
    </div>;
    if (node.type === 'math_compare') {
      return <div className="node-config"><AnimatedDropdown value={node.data?.operation || 'less_than'} options={[{ value: 'less_than', label: 'A < B' }, { value: 'less_or_equal', label: 'A ≤ B' }, { value: 'equal', label: 'A = B' }, { value: 'not_equal', label: 'A ≠ B' }, { value: 'greater_or_equal', label: 'A ≥ B' }, { value: 'greater_than', label: 'A > B' }]} onChange={(value) => update('operation', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Number comparison" className="node-select" />{node.data?.operation === 'equal' || !node.data?.operation ? <span className="node-config-hint">Exact equality</span> : null}</div>;
    }
    if (node.type === 'math_round') return <div className="node-config node-config-stack"><label className="math-precision"><span>Decimal places</span><NodeNumberInput min="0" max="12" step="1" value={node.data?.precision ?? 0} onChange={(event) => update('precision', Math.max(0, Math.min(12, Number(event.target.value) || 0)))} onPointerDown={(event) => event.stopPropagation()} /></label></div>;
    if (node.type === 'math_constant') return <div className="node-config"><AnimatedDropdown value={node.data?.constant || 'pi'} options={[{ value: 'pi', label: 'π · Pi' }, { value: 'tau', label: 'τ · Tau' }, { value: 'e', label: 'e · Euler' }, { value: 'golden_ratio', label: 'φ · Golden ratio' }, { value: 'sqrt_two', label: '√2' }]} onChange={(value) => update('constant', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Mathematical constant" className="node-select" /></div>;
  }
  if (node.type === 'function_math') {
    return <div className="node-config"><AnimatedDropdown value={node.data?.operation || 'add'} options={[{ value: 'add', label: 'A + B' }, { value: 'subtract', label: 'A − B' }, { value: 'multiply', label: 'A × B' }, { value: 'divide', label: 'A ÷ B' }, { value: 'modulo', label: 'A mod B' }]} onChange={(value) => update('operation', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Arithmetic operation" className="node-select" /></div>;
  }
  if (node.type === 'value_text') {
    const value = String(node.data?.value ?? 'Hello World');
    const openTextEditor = () => onOpenTextStudio?.(node, 'value', 'Text value', value);
    return <div className="node-config node-config-stack">{value.length > LONG_TEXT_THRESHOLD ? <DiscordLongTextField value={value} onOpenEditor={openTextEditor} label="Text value" /> : <DiscordTextField onOpenTextEditor={openTextEditor} value={value} appEmojis={appEmojis} onChange={(event) => update('value', event.target.value)} onPointerDown={(event) => event.stopPropagation()} aria-label="Text value" />}<TemplateVariableHints value={node.data?.value} graphVariables={graphVariables}  templatePreviewValues={templatePreviewValues}/></div>;
  }
  if (node.type === 'data_format_time') {
    const styleOptions = [{ value: 'none', label: 'None' }, { value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'long', label: 'Long' }, { value: 'full', label: 'Full' }];
    return <div className="node-config node-config-stack">
      <label className="math-precision"><span>Locale</span><input value={node.data?.locale ?? 'en-US'} onChange={(event) => update('locale', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="en-US" /></label>
      <label className="math-precision"><span>Time zone</span><input value={node.data?.timeZone ?? 'UTC'} onChange={(event) => update('timeZone', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="America/New_York" /></label>
      <div className="node-config"><AnimatedDropdown value={node.data?.dateStyle ?? 'medium'} options={styleOptions} onChange={(value) => update('dateStyle', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Date style" className="node-select" /><AnimatedDropdown value={node.data?.timeStyle ?? 'short'} options={styleOptions} onChange={(value) => update('timeStyle', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Time style" className="node-select" /></div>
    </div>;
  }
  if (node.type === 'value_number') {
    return <div className="node-config"><NodeNumberInput value={node.data?.value ?? 0} onChange={(event) => update('value', Number(event.target.value))} onPointerDown={(event) => event.stopPropagation()} aria-label="Number value" /></div>;
  }
  if (node.type === 'value_boolean') {
    return <div className="node-config node-config-inline"><div className="node-checkbox-label"><AnimatedCheckbox checked={node.data?.value ?? true} onChange={(checked) => update('value', checked)} onPointerDown={(event) => event.stopPropagation()} label="Boolean value" /> <span>True</span></div></div>;
  }
  if (node.type === 'variable_create') {
    const type = ['string', 'number', 'boolean', 'array', 'object'].includes(node.data?.valueType) ? node.data.valueType : 'string';
    const variableTypes = [{ value: 'string', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'boolean', label: 'Boolean' }, { value: 'array', label: 'Array' }, { value: 'object', label: 'Object' }];
    const inferredType = nodeDef?.inputs?.find((pin) => pin.id === 'value')?.colorType || type;
    const setFallbackType = (nextType) => update({ valueType: nextType, value: defaultValueForType(nextType) });
    return <div className="node-config node-config-stack">
      <FallbackField label="Variable name"><input value={node.data?.name ?? ''} maxLength={64} onChange={(event) => update('name', event.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64))} onPointerDown={(event) => event.stopPropagation()} placeholder="e.g. current-score" aria-label="Created variable name" /></FallbackField>
      {isConnected('value')
        ? <span className="node-config-hint">Value type comes from the connected socket: {inferredType}.</span>
        : <>
          <FallbackField label="Variable type"><AnimatedDropdown value={type} options={variableTypes} onChange={setFallbackType} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Created variable type" className="node-select" /></FallbackField>
          {type === 'boolean'
            ? <FallbackCheckbox label="Fallback value" checked={node.data?.value ?? false} onChange={(value) => update('value', value)} />
            : ['array', 'object'].includes(type)
              ? <FallbackField label={`Fallback ${type === 'array' ? 'array' : 'JSON object'}`}><VariableJSONFallback key={type} type={type} value={node.data?.value} onChange={(value) => update('value', value)} /></FallbackField>
              : <FallbackField label="Fallback value">{type === 'number'
                ? <NodeNumberInput value={node.data?.value ?? 0} onChange={(event) => update('value', Number(event.target.value) || 0)} onPointerDown={(event) => event.stopPropagation()} aria-label="Variable fallback number" />
                : <input value={node.data?.value ?? ''} onChange={(event) => update('value', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Variable fallback text" />}</FallbackField>}
        </>}
      <FallbackCheckbox label="Persist between runs" checked={node.data?.persist !== false} onChange={(persist) => update('persist', persist)} />
      <span className="node-config-hint">Create Variable makes a graph variable. Project variables are managed in Variables and always persist.</span>
    </div>;
  }
  if (node.type === 'variable_get' || node.type === 'variable_set') {
    const currentScope = node.data?.scope || 'graph';
    const variableOptions = graphVariables.map((variable) => ({ value: `${variable.scope || 'graph'}:${variable.id}`, label: `${variable.scope === 'project' ? 'Project' : 'Graph'} · ${variable.name} · ${variable.type}` }));
    return <div className="node-config node-config-stack">
      {graphVariables.length ? <AnimatedDropdown value={`${currentScope}:${node.data?.variableId || ''}`} onChange={(value) => { const separator = value.indexOf(':'); update({ scope: value.slice(0, separator), variableId: value.slice(separator + 1) }); }} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Project or graph variable" placeholder="Select variable" options={variableOptions} className="node-select" /> : <button className="node-config-action" onClick={(event) => { event.stopPropagation(); onOpenVariables?.(); }}><Plus size={12} /> Create variable</button>}
      {selectedVariable && <span className="node-config-hint">{selectedVariable.name} · {selectedVariable.type}</span>}
    </div>;
  }
  if (node.type === 'format_text') {
    const value = String(node.data?.template ?? '');
    const openTextEditor = () => onOpenTextStudio?.(node, 'template', 'Text template', value);
    const valuePaths = graphVariables.flatMap((variable) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name || '') ? variableValuePaths(variable.initialValue, variable.name) : []);
    const templateSuggestions = nodeDef.inputs.filter((pin) => /^arg_\d+$/.test(pin.id)).map((pin) => ({ name: pin.id.replace(/^arg_/, 'arg'), label: pin.label }));
    return <div className="node-config node-config-stack">{value.length > LONG_TEXT_THRESHOLD ? <DiscordLongTextField value={value} onOpenEditor={openTextEditor} label="Text template" /> : <DiscordTextField onOpenTextEditor={openTextEditor} as="textarea" rows={2} value={value} appEmojis={appEmojis} graphVariables={graphVariables} discordAutocomplete templateAutocomplete templateValuePaths={valuePaths} templateSuggestions={templateSuggestions} onChange={(event) => update('template', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Type text with {{name}}" aria-label="Text template" />}<TemplateVariableHints value={node.data?.template} graphVariables={graphVariables} inputSlots={nodeDef.inputs.filter((pin) => pin.id.startsWith('slot_'))} connectedInputIds={connectedInputIds} templatePreviewValues={templatePreviewValues} /></div>;
  }
  if (node.type === 'data_permission_overwrites') {
    return <div className="node-config node-config-stack">
      <button type="button" className="node-config-action node-config-studio-action" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenPermissionStudio?.(node); }}><Plus size={12} /> Edit channel permissions</button>
    </div>;
  }
  if (node.type === 'build_embed') {
    return <EmbedNodeBuilder data={node.data || {}} connectedInputIds={connectedInputIds} appEmojis={appEmojis} graphVariables={graphVariables} templatePreviewValues={templatePreviewValues} onChange={(blocks) => update('blocks', blocks)} onOpenStudio={() => onOpenEmbedStudio?.(node)} onOpenTextStudio={(label, value, maxLength, applyValue, parentBlockContext) => onOpenTextStudio?.(node, null, label, value, maxLength, applyValue, '', parentBlockContext)} />;
  }
  if (node.type === 'build_modal') return <div className="node-config node-config-stack"><button type="button" className="node-config-action node-config-studio-action" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenModalStudio?.(node); }}><Plus size={12} /> Edit popup modal{node.data?.modal?.components?.length ? ` · ${node.data.modal.components.length} fields` : ''}</button></div>;
  if (node.type === 'action_send_message') {
    const componentsConnected = isConnected('components');
    return <div className="node-config node-config-stack">
      {!isConnected('channel_id') && <label className="node-config-fallback"><span>Channel ID</span><input value={node.data?.channel_id ?? ''} onChange={(event) => update('channel_id', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Channel ID" /></label>}
      {!isConnected('content') && <label className="node-config-fallback"><span>Message content</span>{textEditor('content', 'Message content', 2000, 'Used when unconnected')}<TemplateVariableHints value={node.data?.content} graphVariables={graphVariables}  templatePreviewValues={templatePreviewValues}/></label>}
      {!isConnected('mention_replied_user') && <FallbackCheckbox label="Mention Replied User" checked={node.data?.mention_replied_user ?? (isConnected('reply_to_message_id') || Boolean(node.data?.reply_to_message_id))} onChange={(value) => update('mention_replied_user', value)} />}
      {!isConnected('files') && <AttachmentPicker files={node.data?.files || []} authToken={authToken} onChange={(files) => update('files', files)} />}
      <button type="button" className={`node-config-action ${componentsConnected ? 'is-disabled' : ''}`} disabled={componentsConnected} title={componentsConnected ? 'Components input is connected. Edit the source node on the canvas instead.' : undefined} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { if (componentsConnected) return; event.stopPropagation(); onOpenEmbedStudio?.(node); }}><Plus size={12} /> {componentsConnected ? 'Components wired (edit source node)' : `Edit message components${node.data?.components?.length ? ` · ${node.data.components.length} rows` : ''}`}</button>
    </div>;
  }
  if (node.type === 'action_edit_message') {
    const componentsConnected = isConnected('components');
    return <div className="node-config node-config-stack">
      {!isConnected('channel_id') && <label className="node-config-fallback"><span>Channel ID</span><input value={node.data?.channel_id ?? ''} onChange={(event) => update('channel_id', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Channel ID" /></label>}
      {!isConnected('message_id') && <label className="node-config-fallback"><span>Message ID</span><input value={node.data?.message_id ?? ''} onChange={(event) => update('message_id', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Message ID" /></label>}
      {!isConnected('content') && <label className="node-config-fallback"><span>New content (Optional)</span>{textEditor('content', 'New content', 2000, 'Leave empty to keep existing')}<TemplateVariableHints value={node.data?.content} graphVariables={graphVariables}  templatePreviewValues={templatePreviewValues}/></label>}
      {!isConnected('files') && <AttachmentPicker files={node.data?.files || []} authToken={authToken} onChange={(files) => update('files', files)} />}
      <button type="button" className={`node-config-action ${componentsConnected ? 'is-disabled' : ''}`} disabled={componentsConnected} title={componentsConnected ? 'Components input is connected. Edit the source node on the canvas instead.' : undefined} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { if (componentsConnected) return; event.stopPropagation(); onOpenEmbedStudio?.(node); }}><Plus size={12} /> {componentsConnected ? 'Components wired (edit source node)' : `Edit message components${node.data?.components?.length ? ` · ${node.data.components.length} rows` : ''}`}</button>
    </div>;
  }
  if (node.type === 'modify_embed') {
    return <div className="node-config node-config-stack">
      {!isConnected('title') && <label className="node-config-fallback"><span>Title</span><input value={node.data?.title ?? ''} onChange={(event) => update('title', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="New title (Optional)" aria-label="Title" /></label>}
      {!isConnected('description') && <label className="node-config-fallback"><span>Description</span>{textEditor('description', 'Description', 4096, 'New description (Optional)')}</label>}
      {!isConnected('color') && <label className="node-config-fallback"><span>Color (#hex)</span><input value={node.data?.color ?? ''} onChange={(event) => update('color', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="#5865F2" aria-label="Color" /></label>}
    </div>;
  }
  if (node.type === 'modify_components') {
    return <div className="node-config node-config-stack">
      {!isConnected('custom_id') && <label className="node-config-fallback"><span>Target Custom ID</span><input value={node.data?.custom_id ?? 'all'} onChange={(event) => update('custom_id', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="all or button_id" aria-label="Target Custom ID" /></label>}
      {!isConnected('disabled') && <div className="function-input-option"><span>Disabled</span><AnimatedCheckbox checked={node.data?.disabled ?? true} label="Disabled" onChange={(val) => update('disabled', val)} onPointerDown={(event) => event.stopPropagation()} /></div>}
    </div>;
  }
  if (node.type === 'action_reply_interaction') {
    const componentsConnected = isConnected('components');
    return <div className="node-config node-config-stack">
      {!isConnected('interaction_token') && !node.data?.interaction_token && (
        <span className="node-config-warning" role="status"><AlertTriangle size={12} /> Connect an interaction token to reply</span>
      )}
      {!isConnected('content') && <label className="node-config-fallback"><span>Reply content</span>{textEditor('content', 'Reply content', 2000, 'Used when unconnected')}<TemplateVariableHints value={node.data?.content} graphVariables={graphVariables}  templatePreviewValues={templatePreviewValues}/></label>}
      {!isConnected('files') && <AttachmentPicker files={node.data?.files || []} authToken={authToken} onChange={(files) => update('files', files)} />}
      <button type="button" className={`node-config-action ${componentsConnected ? 'is-disabled' : ''}`} disabled={componentsConnected} title={componentsConnected ? 'Components input is connected. Edit the source node on the canvas instead.' : undefined} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { if (componentsConnected) return; event.stopPropagation(); onOpenEmbedStudio?.(node); }}><Plus size={12} /> {componentsConnected ? 'Components wired (edit source node)' : `Edit message components${node.data?.components?.length ? ` · ${node.data.components.length} rows` : ''}`}</button>
    </div>;
  }
  if (node.type === 'action_edit_interaction_reply') {
    const componentsConnected = isConnected('components');
    return <div className="node-config node-config-stack">
      {!isConnected('interaction_token') && !node.data?.interaction_token && (
        <span className="node-config-warning" role="status"><AlertTriangle size={12} /> Connect an interaction token to edit</span>
      )}
      {!isConnected('content') && <label className="node-config-fallback"><span>New content (Optional)</span>{textEditor('content', 'New content', 2000, 'Leave empty to keep existing')}<TemplateVariableHints value={node.data?.content} graphVariables={graphVariables}  templatePreviewValues={templatePreviewValues}/></label>}
      <button type="button" className={`node-config-action ${componentsConnected ? 'is-disabled' : ''}`} disabled={componentsConnected} title={componentsConnected ? 'Components input is connected. Edit the source node on the canvas instead.' : undefined} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { if (componentsConnected) return; event.stopPropagation(); onOpenEmbedStudio?.(node); }}><Plus size={12} /> {componentsConnected ? 'Components wired (edit source node)' : `Edit message components${node.data?.components?.length ? ` · ${node.data.components.length} rows` : ''}`}</button>
    </div>;
  }
  if (['action_defer_reply', 'action_defer_update'].includes(node.type)) {
    const missingToken = !isConnected('interaction_token') && !node.data?.interaction_token;
    const missingInteractionId = !isConnected('interaction_id') && !node.data?.interaction_id;
    if (missingToken || missingInteractionId) {
      return <div className="node-config node-config-stack">
        {missingToken && <span className="node-config-warning" role="status"><AlertTriangle size={12} /> Connect an interaction token to acknowledge</span>}
        {missingInteractionId && <span className="node-config-warning" role="status"><AlertTriangle size={12} /> Connect an Interaction ID</span>}
      </div>;
    }
  }
  if (node.type.startsWith('action_') && ['action_create_channel', 'action_edit_channel', 'action_delete_channel', 'action_create_role', 'action_member_role', 'action_moderate_member', 'action_voice_channel_status', 'action_voice_state'].includes(node.type)) {
    const textField = (id, label, placeholder = 'Used when unconnected') => isConnected(id) ? null : <FallbackField key={id} label={label}><input value={node.data?.[id] ?? ''} onChange={(event) => update(id, event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder={placeholder} aria-label={label} /></FallbackField>;
    const reason = textField('reason', 'Audit Log Reason');
    return <div className="node-config node-config-stack">
      {node.type === 'action_create_channel' && <>
        {textField('guild_id', 'Server ID')}{textField('name', 'Channel name')}
        {!isConnected('channel_type') && <FallbackField label="Channel type"><AnimatedDropdown value={node.data?.channel_type || 'text'} options={['text', 'voice', 'category', 'announcement', 'stage'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={(value) => update('channel_type', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Channel type" className="node-select" /></FallbackField>}
        {textField('parent_id', 'Category ID')}{['text', 'announcement'].includes(node.data?.channel_type || 'text') && textField('topic', 'Topic')}{reason}
      </>}
      {node.type === 'action_edit_channel' && <>
        {textField('channel_id', 'Channel ID')}{textField('name', 'New name')}{textField('topic', 'Description / topic')}{textField('parent_id', 'New category ID')}
        {!isConnected('rate_limit_per_user') && <FallbackField label="Slowmode (seconds)"><NodeNumberInput allowEmpty min="0" max="21600" value={node.data?.rate_limit_per_user ?? ''} onChange={(event) => update('rate_limit_per_user', event.target.value === '' ? '' : Math.max(0, Math.min(21600, Number(event.target.value) || 0)))} onPointerDown={(event) => event.stopPropagation()} placeholder="Leave unchanged" /><small className="node-config-hint">0–21,600 seconds · blank keeps the current value</small></FallbackField>}
        {!isConnected('nsfw') && <FallbackCheckbox label="Age restricted" checked={Boolean(node.data?.nsfw)} onChange={(value) => update('nsfw', value)} />}
        {!isConnected('permission_overwrites') && <button type="button" className="node-config-action node-config-studio-action" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenPermissionStudio?.({ ...node, type: 'data_permission_overwrites', label: 'Channel Permission Overwrites' }); }}><Plus size={12} /> Edit channel permissions</button>}
        {!isConnected('bitrate') && <FallbackField label="Voice bitrate (bits/sec)"><NodeNumberInput allowEmpty min="8000" max="384000" step="1" value={node.data?.bitrate ?? ''} onChange={(event) => update('bitrate', event.target.value === '' ? '' : Number(event.target.value) || 0)} onPointerDown={(event) => event.stopPropagation()} placeholder="Leave unchanged" /><small className="node-config-hint">Custom values: 8,000–384,000. The server tier sets the actual cap; Stage channels cap at 64,000.</small></FallbackField>}
        {!isConnected('user_limit') && <FallbackField label="User limit (0 = unlimited)"><NodeNumberInput allowEmpty min="0" max="10000" step="1" value={node.data?.user_limit ?? ''} onChange={(event) => update('user_limit', event.target.value === '' ? '' : Number(event.target.value) || 0)} onPointerDown={(event) => event.stopPropagation()} placeholder="Leave unchanged" /><small className="node-config-hint">Voice channels: 0–99 · Stage channels: up to 10,000</small></FallbackField>}
        {textField('rtc_region', 'Voice region (blank = automatic)')}
        {!isConnected('video_quality_mode') && <FallbackField label="Voice video quality"><AnimatedDropdown value={String(node.data?.video_quality_mode ?? '')} onChange={(value) => update('video_quality_mode', value === '' ? '' : Number(value))} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Voice video quality" options={[{ value: '', label: 'Leave unchanged' }, { value: '1', label: 'Automatic' }, { value: '2', label: '720p' }]} className="node-select" /></FallbackField>}
        {!isConnected('default_auto_archive_duration') && <FallbackField label="Default thread archive"><AnimatedDropdown value={String(node.data?.default_auto_archive_duration ?? '')} onChange={(value) => update('default_auto_archive_duration', value === '' ? '' : Number(value))} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Default thread archive duration" options={[{ value: '', label: 'Leave unchanged' }, ...[60, 1440, 4320, 10080].map((value) => ({ value: String(value), label: `${value >= 1440 ? value / 1440 + ' day' + (value > 1440 ? 's' : '') : value + ' minutes'}` }))]} className="node-select" /></FallbackField>}
        {reason}
      </>}
      {node.type === 'action_delete_channel' && <>{textField('channel_id', 'Channel ID')}{reason}<span className="node-config-warning"><AlertTriangle size={12} /> Deleting a channel cannot be undone.</span></>}
      {node.type === 'action_create_role' && <>
        {textField('guild_id', 'Server ID')}{textField('name', 'Role name')}
        {!isConnected('color') && <FallbackField label="Color (RGB number)"><NodeNumberInput min="0" max="16777215" value={node.data?.color ?? 0} onChange={(event) => update('color', Math.max(0, Math.min(16777215, Number(event.target.value) || 0)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Role RGB color number" /></FallbackField>}
        {!isConnected('permissions') && <button type="button" className="node-config-action" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenPermissionStudio?.(node); }}><Plus size={12} /> Edit role permissions</button>}
        {isConnected('permissions') && <span className="node-config-hint">Role permissions come from the connected input.</span>}
        {!isConnected('hoist') && <FallbackCheckbox label="Show separately" checked={node.data?.hoist ?? false} onChange={(value) => update('hoist', value)} />}
        {!isConnected('mentionable') && <FallbackCheckbox label="Mentionable" checked={node.data?.mentionable ?? false} onChange={(value) => update('mentionable', value)} />}{reason}
      </>}
      {node.type === 'action_member_role' && <>
        {textField('guild_id', 'Server ID')}{textField('user_id', 'User ID')}{textField('role_id', 'Role ID')}
        {!isConnected('operation') && <FallbackField label="Operation"><AnimatedDropdown value={node.data?.operation || 'add'} options={[{ value: 'add', label: 'Add role' }, { value: 'remove', label: 'Remove role' }]} onChange={(value) => update('operation', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Role operation" className="node-select" /></FallbackField>}{reason}
      </>}
      {node.type === 'action_moderate_member' && <>
        {textField('guild_id', 'Server ID')}{textField('user_id', 'Member ID')}
        {!isConnected('operation') && <FallbackField label="Action"><AnimatedDropdown value={node.data?.operation || 'timeout'} options={[{ value: 'timeout', label: 'Timeout' }, { value: 'kick', label: 'Kick' }, { value: 'ban', label: 'Ban' }, { value: 'unban', label: 'Unban' }]} onChange={(value) => update('operation', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Moderation action" className="node-select" /></FallbackField>}
        {node.data?.operation === 'timeout' && !isConnected('duration_minutes') && <FallbackField label="Timeout (minutes)"><NodeNumberInput min="1" max="40320" value={node.data?.duration_minutes ?? 10} onChange={(event) => update('duration_minutes', Math.max(1, Math.min(40320, Number(event.target.value) || 1)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Timeout duration in minutes" /></FallbackField>}
        {node.data?.operation === 'ban' && !isConnected('delete_message_seconds') && <FallbackField label="Delete recent messages (seconds)"><NodeNumberInput min="0" max="604800" value={node.data?.delete_message_seconds ?? 0} onChange={(event) => update('delete_message_seconds', Math.max(0, Math.min(604800, Number(event.target.value) || 0)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Ban message deletion period" /></FallbackField>}
        {textField('reason', 'Audit Log Reason')}
        <span className="node-config-warning"><AlertTriangle size={12} /> Discord checks the bot’s role position and server permissions.</span>
      </>}
      {node.type === 'action_voice_channel_status' && <>{textField('channel_id', 'Voice channel ID')}{textField('status', 'Status (blank clears)')}{reason}</>}
      {node.type === 'action_voice_state' && <>
        {textField('guild_id', 'Server ID')}{textField('channel_id', 'Voice channel ID (blank leaves)')}
        {!isConnected('self_mute') && <FallbackCheckbox label="Self Mute" checked={node.data?.self_mute ?? false} onChange={(value) => update('self_mute', value)} />}
        {!isConnected('self_deaf') && <FallbackCheckbox label="Self Deafen" checked={node.data?.self_deaf ?? false} onChange={(value) => update('self_deaf', value)} />}
        <span className="node-config-hint">Requests a Gateway join or leave. It does not stream audio.</span>
      </>}
    </div>;
  }
  if (node.type === 'action_web_fetch' || node.type === 'action_web_retry') {
    const canRetry = node.type === 'action_web_retry';
    return <div className="node-config node-config-stack">
      {!['url', 'method', 'headers', 'body', 'timeout_ms', 'max_bytes'].every(isConnected) && <span className="node-config-hint">Set a value here or connect a wire.</span>}
      {!isConnected('url') && <FallbackField label="URL"><input value={node.data?.url ?? ''} onChange={(event) => update('url', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Request URL" /></FallbackField>}
      {!isConnected('method') && <FallbackField label="Method"><AnimatedDropdown value={node.data?.method || 'GET'} options={['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((value) => ({ value, label: value }))} onChange={(value) => update('method', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Request method" className="node-select" /></FallbackField>}
      {!isConnected('headers') && <FallbackField label="Headers (JSON)"><textarea rows={2} value={node.data?.headers ?? '{}'} onChange={(event) => update('headers', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="{}" aria-label="Request headers JSON" /></FallbackField>}
      {!isConnected('body') && <FallbackField label="Body"><textarea rows={2} value={node.data?.body ?? ''} onChange={(event) => update('body', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Request body" /></FallbackField>}
      {!isConnected('timeout_ms') && <FallbackField label="Timeout (ms)"><NodeNumberInput min="1000" max="30000" value={node.data?.timeout_ms ?? 10000} onChange={(event) => update('timeout_ms', Math.max(1000, Math.min(30000, Number(event.target.value) || 1000)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Request timeout in milliseconds" /></FallbackField>}
      {!isConnected('max_bytes') && <FallbackField label="Max response bytes"><NodeNumberInput min="1024" max="1048576" value={node.data?.max_bytes ?? 1048576} onChange={(event) => update('max_bytes', Math.max(1024, Math.min(1048576, Number(event.target.value) || 1024)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Maximum response bytes" /></FallbackField>}
      {canRetry && !isConnected('max_attempts') && <FallbackField label="Max attempts"><NodeNumberInput min="1" max="5" value={node.data?.max_attempts ?? 3} onChange={(event) => update('max_attempts', Math.max(1, Math.min(5, Number(event.target.value) || 1)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Maximum request attempts" /></FallbackField>}
      {canRetry && !isConnected('retry_delay_ms') && <FallbackField label="Base retry delay (ms)"><NodeNumberInput min="100" max="10000" value={node.data?.retry_delay_ms ?? 500} onChange={(event) => update('retry_delay_ms', Math.max(100, Math.min(10000, Number(event.target.value) || 100)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Base retry delay in milliseconds" /></FallbackField>}
      {canRetry && !isConnected('retry_non_idempotent') && <FallbackCheckbox label="Retry POST and other non-idempotent methods" checked={node.data?.retry_non_idempotent ?? false} onChange={(value) => update('retry_non_idempotent', value)} />}
    </div>;
  }
  if (nodeDef.pluginAdapter) {
    return <div className="node-config node-config-stack plugin-adapter-config">
      {nodeDef.description && <span className="node-config-hint">{nodeDef.description}</span>}
      {nodeDef.inputs.filter((pin) => pin.type !== 'exec' && !isConnected(pin.id)).map((pin) => {
        if (pin.type === 'boolean') return <FallbackCheckbox key={pin.id} label={pin.label} checked={node.data?.[pin.id] ?? pin.defaultValue ?? false} onChange={(value) => update(pin.id, value)} />;
        if (pin.type === 'number') return <FallbackField key={pin.id} label={pin.label}><NodeNumberInput value={node.data?.[pin.id] ?? pin.defaultValue ?? 0} onChange={(event) => update(pin.id, Number(event.target.value) || 0)} onPointerDown={(event) => event.stopPropagation()} aria-label={pin.label} /></FallbackField>;
        const input = pin.editor === 'json-schema'
          ? <JsonSchemaEditor value={node.data?.[pin.id] ?? pin.defaultValue ?? '{}'} onChange={(value) => update(pin.id, value)} onOpenTextEditor={() => onOpenTextStudio?.(node, pin.id, pin.label, String(node.data?.[pin.id] ?? pin.defaultValue ?? '{}'), 12000)} label={pin.label} />
          : pin.editor === 'json'
            ? <div className="plugin-json-editor"><button type="button" className="node-config-editor-button" aria-label={`Edit ${pin.label} JSON`} onClick={(event) => { event.stopPropagation(); onOpenTextStudio?.(node, pin.id, pin.label, String(node.data?.[pin.id] ?? pin.defaultValue ?? '{}'), 12000); }}><FileCode2 size={13} />Edit JSON</button></div>
          : pin.id === 'svg'
          ? <textarea rows={4} value={node.data?.[pin.id] ?? pin.defaultValue ?? ''} onChange={(event) => update(pin.id, event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Paste SVG markup" aria-label={pin.label} />
          : <input value={node.data?.[pin.id] ?? pin.defaultValue ?? ''} onChange={(event) => update(pin.id, event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label={pin.label} />;
        return <FallbackField key={pin.id} label={pin.label}>{input}</FallbackField>;
      })}
    </div>;
  }
  if (node.type === 'compare_text') {
    return <div className="node-config node-config-stack compare-text-config">
      {!isConnected('text_a') && <label className="node-config-fallback"><span>Text A</span><input value={node.data?.text_a ?? ''} onChange={(event) => update('text_a', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Text A" /></label>}
      {!isConnected('text_b') && <label className="node-config-fallback"><span>Text B</span><input value={node.data?.text_b ?? ''} onChange={(event) => update('text_b', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Used when unconnected" aria-label="Text B" /></label>}
      {!isConnected('operator') && <AnimatedDropdown value={node.data?.operator ?? 'equals'} onChange={(value) => update('operator', value)} onPointerDown={(event) => event.stopPropagation()} ariaLabel="Text comparison operator" options={[{ value: 'equals', label: 'Equals' }, { value: 'contains', label: 'Contains' }, { value: 'startsWith', label: 'Starts with' }, { value: 'endsWith', label: 'Ends with' }]} className="node-select" />}
    </div>;
  }
  if (node.type === 'loop_count') {
    return <div className="node-config node-config-stack">
      {!isConnected('count') && <FallbackField label="Iterations"><NodeNumberInput min="0" max="1000" step="1" value={node.data?.count ?? 1} onChange={(event) => update('count', Math.max(0, Math.min(1000, Math.trunc(Number(event.target.value) || 0))))} onPointerDown={(event) => event.stopPropagation()} aria-label="Loop iteration count" /></FallbackField>}
    </div>;
  }
  if (node.type === 'repeat_while') {
    return <div className="node-config node-config-stack">
      {!isConnected('interval_ms') && <FallbackField label="Wait between passes (ms)"><NodeNumberInput min="100" max="604800000" step="100" value={node.data?.interval_ms ?? 500} onChange={(event) => update('interval_ms', Math.max(100, Math.min(604800000, Number(event.target.value) || 500)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Repeat interval in milliseconds" /></FallbackField>}
      <span className="node-config-hint">At least 100 ms. Set Condition false to stop; an always-true condition keeps the task running.</span>
    </div>;
  }
  if (node.type === 'delay') {
    return <div className="node-config node-config-stack">
      {!isConnected('ms') && <FallbackField label="Wait (ms)"><NodeNumberInput min="0" max="604800000" step="1000" value={node.data?.ms ?? 1000} onChange={(event) => update('ms', Math.max(0, Math.min(604800000, Number(event.target.value) || 0)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Wait duration in milliseconds" /></FallbackField>}
      <span className="node-config-hint">Maximum wait: 7 days per run.</span>
    </div>;
  }
  if (node.type === 'wait_until_condition') {
    return <div className="node-config node-config-stack">
      {!isConnected('timeout_ms') && <FallbackField label="Timeout (ms)"><NodeNumberInput min="1" max="86400000" value={node.data?.timeout_ms ?? 30000} onChange={(event) => update('timeout_ms', Math.max(1, Math.min(86400000, Number(event.target.value) || 1)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Condition wait timeout in milliseconds" /></FallbackField>}
      {!isConnected('interval_ms') && <FallbackField label="Check every (ms)"><NodeNumberInput min="50" max="10000" value={node.data?.interval_ms ?? 250} onChange={(event) => update('interval_ms', Math.max(50, Math.min(10000, Number(event.target.value) || 50)))} onPointerDown={(event) => event.stopPropagation()} aria-label="Condition check interval in milliseconds" /></FallbackField>}
    </div>;
  }
  if (node.type === 'wait_until_time') {
    return <div className="node-config node-config-stack">
      {!isConnected('time') && <FallbackField label="Time (ISO or timestamp)"><input value={node.data?.time ?? ''} onChange={(event) => update('time', event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="2026-10-17T12:00:00Z" aria-label="Time to continue" /></FallbackField>}
    </div>;
  }
  return null;
}

function FallbackField({ label, children }) {
  if (React.isValidElement(children) && children.type === 'textarea' && String(children.props.value ?? '').length > LONG_TEXT_THRESHOLD) {
    return <label className="node-config-fallback"><span>{label}</span><DiscordLongTextField
      value={String(children.props.value ?? '')}
      onChange={(value) => children.props.onChange?.({ target: { value } })}
      label={label}
      maxLength={children.props.maxLength}
      rows={14}
    /></label>;
  }
  return <label className="node-config-fallback"><span>{label}</span>{children}</label>;
}

function FallbackCheckbox({ label, checked, onChange }) {
  return <div className="node-checkbox-label"><AnimatedCheckbox checked={checked} onChange={onChange} onPointerDown={(event) => event.stopPropagation()} label={label} /><span>{label}</span></div>;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ filename: file.name, contentType: file.type || 'application/octet-stream', data: reader.result });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function AttachmentPicker({ files = [], authToken = '', onChange }) {
  const [error, setError] = React.useState('');
  const [urlEntryOpen, setUrlEntryOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [filename, setFilename] = React.useState('');
  const [urlLoading, setUrlLoading] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState(null);
  const contextMenuRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const onFiles = async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    const combined = [...files, ...selected];
    if (combined.length > 10) { setError('Choose up to 10 files.'); return; }
    if (selected.some((file) => file.name.length > 100)) { setError('Filenames must be 100 characters or fewer.'); return; }
    if (selected.some((file) => !file.size)) { setError('Empty files cannot be attached.'); return; }
    if (selected.some((file) => file.size > 20 * 1024 * 1024)) { setError('Each file must be 20 MiB or smaller.'); return; }
    const existingBytes = files.reduce((total, file) => total + Math.floor(String(file.data || '').split(',').pop().length * 3 / 4), 0);
    if (existingBytes + selected.reduce((total, file) => total + file.size, 0) > 24 * 1024 * 1024) { setError('Files must total 24 MiB or less.'); return; }
    if (new Set(combined.map((file) => String(file.filename || file.name).toLowerCase())).size !== combined.length) { setError('Each attachment needs a unique filename.'); return; }
    try {
      setError('');
      onChange([...files, ...await Promise.all(selected.map(readFileAsDataUrl))]);
    } catch (readError) { setError(readError.message || 'Could not read selected files.'); }
  };
  const remove = (index) => onChange(files.filter((_, fileIndex) => fileIndex !== index));
  const openContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 164;
    const menuHeight = 40;
    setContextMenu({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  };
  React.useEffect(() => {
    if (!contextMenu) return undefined;
    const close = (event) => {
      if (contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') setContextMenu(null); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKeyDown, true);
    const removePageBlurListener = onPageBlur(() => setContextMenu(null));
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKeyDown, true);
      removePageBlurListener();
    };
  }, [contextMenu]);
  const addUrl = async (event) => {
    event.preventDefault();
    let parsed;
    try { parsed = new URL(url.trim()); } catch { setError('Enter a valid public HTTP or HTTPS URL.'); return; }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) { setError('Use an HTTP or HTTPS URL without embedded credentials.'); return; }
    if (files.length >= 10) { setError('Choose up to 10 files.'); return; }
    const pathName = parsed.pathname.split('/').filter(Boolean).pop() || 'attachment.bin';
    let inferredName = pathName;
    try { inferredName = decodeURIComponent(pathName); } catch {}
    const cleanName = String(filename.trim() || inferredName).replace(/[\\/\0-\x1f]/g, '_').slice(0, 100) || 'attachment.bin';
    if (files.some((file) => String(file.filename || file.name || '').toLowerCase() === cleanName.toLowerCase())) { setError('Each attachment needs a unique filename.'); return; }
    setError('');
    setUrlLoading(true);
    try {
      const response = await fetch(apiUrl('/api/graphs/attachment-url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ url: parsed.href, filename: cleanName })
      });
      let result = {};
      try { result = await response.json(); } catch {}
      if (!response.ok || !result.file?.data) throw new Error(result.error || 'Could not download this attachment.');
      const currentBytes = files.reduce((total, file) => total + Math.floor(String(file.data || '').split(',').pop().length * 3 / 4), 0);
      const addedBytes = Math.floor(String(result.file.data).split(',').pop().length * 3 / 4);
      if (currentBytes + addedBytes > 24 * 1024 * 1024) throw new Error('Files must total 24 MiB or less.');
      onChange([...files, result.file]);
      setUrl('');
      setFilename('');
      setUrlEntryOpen(false);
    } catch (downloadError) { setError(downloadError.message || 'Could not download this attachment.'); }
    finally { setUrlLoading(false); }
  };
  return <div className="node-attachment-picker" onPointerDown={(event) => event.stopPropagation()}>
    <div className="node-attachment-heading"><span>Attachments</span><span>{files.length} / 10 · 20 MiB each</span></div>
    <button className="node-attachment-choose" type="button" onClick={() => fileInputRef.current?.click()} onContextMenu={openContextMenu}>Choose files</button>
    <input ref={fileInputRef} className="node-attachment-file-input" type="file" multiple onChange={onFiles} />
    {files.length > 0 && <div className="node-attachment-list">{files.map((file, index) => <div className="node-attachment-item" key={`${file.filename}-${index}`}><span title={file.url || undefined}>{file.filename}{file.url ? ' · URL' : ''}</span><button type="button" onClick={() => remove(index)} aria-label={`Remove ${file.filename}`}><X size={12} /></button></div>)}</div>}
    {urlEntryOpen && <form className="node-attachment-url-form" onSubmit={addUrl}>
      <input type="url" value={url} onChange={(event) => { setUrl(event.target.value); setError(''); }} onPointerDown={(event) => event.stopPropagation()} placeholder="https://example.com/image.png" aria-label="Attachment URL" autoCapitalize="none" autoCorrect="off" spellCheck="false" required disabled={urlLoading} />
      <input value={filename} onChange={(event) => setFilename(event.target.value)} onPointerDown={(event) => event.stopPropagation()} placeholder="Filename (optional)" aria-label="Attachment filename" maxLength={100} autoCapitalize="none" autoCorrect="off" spellCheck="false" disabled={urlLoading} />
      <div><button type="button" disabled={urlLoading} onClick={() => { setUrlEntryOpen(false); setError(''); }}>Cancel</button><button type="submit" disabled={urlLoading}>{urlLoading ? 'Downloading…' : 'Add URL'}</button></div>
    </form>}
    <small>24 MiB total per message. URL files are downloaded into the graph and included in exports. Embed images can use attachment://filename.</small>
    {error && <small className="node-attachment-error" role="alert">{error}</small>}
    {contextMenu && createPortal(<div ref={contextMenuRef} className="canvas-context-menu attachment-context-menu" role="menu" style={{ left: contextMenu.left, top: contextMenu.top }} onPointerDown={(event) => event.stopPropagation()}>
      <button role="menuitem" onClick={() => { setUrlEntryOpen(true); setContextMenu(null); setError(''); }}><span>Use URL</span></button>
    </div>, document.body)}
  </div>;
}
