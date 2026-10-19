import React, { useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { AnimatedCheckbox, AnimatedDropdown } from '../ui/CustomControls.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { useStudioEscape } from './useStudioEscape.js';

const MAX_OPTIONS = 25;
const TEXT_TYPES = new Set([3, 4, 10]);
const OPTION_TYPES = [
  { value: 3, label: 'Text' }, { value: 4, label: 'Integer' }, { value: 10, label: 'Number' },
  { value: 5, label: 'Boolean' }, { value: 6, label: 'User' }, { value: 7, label: 'Channel' },
  { value: 8, label: 'Role' }, { value: 9, label: 'Mentionable' }, { value: 11, label: 'Attachment' }
];
const CHOICE_MODES = [{ value: 'choices', label: 'Fixed choices' }, { value: 'autocomplete', label: 'Autocomplete' }];
const createLocalId = (kind) => `${kind}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const newOption = (index) => ({ id: createLocalId('option'), name: `argument_${index + 1}`, description: '', type: 3, required: false, choices: [] });

function validateOptions(options) {
  if (options.length > MAX_OPTIONS) return 'A command can have at most 25 options.';
  const names = new Set();
  for (const option of options) {
    const name = String(option.name || '').trim();
    const description = String(option.description || '').trim();
    const type = Number(option.type) || 3;
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) return 'Names must use 1–32 lowercase letters, numbers, underscores, or hyphens.';
    if (names.has(name)) return `“${name}” is used more than once.`;
    names.add(name);
    if (!description || Array.from(description).length > 100) return `Add a description of up to 100 characters for “${name}”.`;
    if (option.autocomplete && !TEXT_TYPES.has(type)) return 'Autocomplete is only available for text, integer, and number options.';
    if (option.autocomplete && !(option.choices || []).length && !option.dynamicAutocomplete) return `Add at least one autocomplete suggestion for “${name}”, or use graph-generated suggestions.`;
    if ((option.choices || []).length > 25) return `“${name}” can have at most 25 choices.`;
    if ((option.choices || []).some((choice) => !String(choice.name || '').trim() || String(choice.name).length > 100 || choice.value === undefined || String(choice.value).trim() === '' || String(choice.value).length > 100 || ([4, 10].includes(type) && !Number.isFinite(Number(choice.value))) || (type === 4 && !Number.isInteger(Number(choice.value))))) return `Check the choice names and values for “${name}”.`;
  }
  return '';
}

export function SlashCommandStudioView({ commandName, options = [], collaborators = [], onDraftChange, onApply, onClose }) {
  const draft = Array.isArray(options) ? options : [];
  const [discardOpen, setDiscardOpen] = useState(false);
  const [appliedOptions] = useState(() => structuredClone(draft));
  const changed = JSON.stringify(draft) !== JSON.stringify(appliedOptions);
  const issue = validateOptions(draft);
  const requestClose = () => changed ? setDiscardOpen(true) : onClose?.();
  useStudioEscape(requestClose);
  const updateDraft = (updater) => onDraftChange?.(typeof updater === 'function' ? updater(draft) : updater);
  const updateOption = (index, patch) => updateDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateChoice = (optionIndex, choiceIndex, patch) => updateDraft((current) => current.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, choices: (item.choices || []).map((choice, index) => index === choiceIndex ? { ...choice, ...patch } : choice) } : item));
  const apply = () => { if (!issue) onApply?.(draft.map((option) => ({ ...option, name: String(option.name || '').trim(), description: String(option.description || '').trim(), choices: (option.choices || []).map((choice) => ({ ...choice, name: String(choice.name || '').trim(), value: [4, 10].includes(Number(option.type)) ? Number(choice.value) : String(choice.value ?? '') })) }))); };

  return <section className="slash-command-studio" aria-label="Slash command argument editor">
    <header className="slash-command-studio-header">
      <button type="button" className="permission-studio-back" onClick={requestClose}><ArrowLeft size={16} /> Back</button>
      <div className="permission-studio-title"><div><h1>Command arguments</h1><p>/{commandName || 'command'} · {draft.length}/{MAX_OPTIONS} options</p></div></div>
      <button type="button" className="permission-studio-apply" onClick={apply} disabled={Boolean(issue)}><Check size={15} /> Apply</button>
    </header>
    <div className="slash-command-studio-toolbar"><span>{collaborators.length ? `Editing with ${collaborators.map((peer) => peer.username).join(', ')}` : 'Required options are listed before optional ones when deployed.'}</span><button type="button" className="permission-add-target" disabled={draft.length >= MAX_OPTIONS} onClick={() => updateDraft([...draft, newOption(draft.length)])}><Plus size={15} /> Add option <span>{draft.length}/{MAX_OPTIONS}</span></button></div>
    <div className="slash-command-studio-scroll">
      {!draft.length && <div className="slash-command-studio-empty"><strong>No options</strong><span>Add an option to ask for text, numbers, users, channels, roles, or attachments.</span><button type="button" className="permission-add-target" onClick={() => updateDraft([newOption(0)])}><Plus size={15} /> Add first option</button></div>}
      {draft.map((option, index) => {
        const type = Number(option.type) || 3;
        const supportsChoices = TEXT_TYPES.has(type);
        const choices = Array.isArray(option.choices) ? option.choices : [];
        const mode = option.autocomplete ? 'autocomplete' : 'choices';
        return <article className="slash-option-card" key={option.id || `${index}:${option.name}`}>
          <header><span><b>{String(index + 1).padStart(2, '0')}</b><strong>{option.name || 'New option'}</strong><small>{OPTION_TYPES.find((item) => item.value === type)?.label || 'Text'}{option.required ? ' · Required' : ' · Optional'}</small></span><div className="slash-option-order"><button type="button" title="Move up" aria-label={`Move ${option.name || 'option'} up`} disabled={index === 0} onClick={() => updateDraft((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}><ChevronUp size={15} /></button><button type="button" title="Move down" aria-label={`Move ${option.name || 'option'} down`} disabled={index === draft.length - 1} onClick={() => updateDraft((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}><ChevronDown size={15} /></button><button type="button" className="is-danger" title="Remove option" aria-label={`Remove ${option.name || 'option'}`} onClick={() => updateDraft(draft.filter((_item, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></div></header>
          <div className="slash-option-fields">
            <label>Option name<input value={option.name || ''} maxLength={32} onChange={(event) => updateOption(index, { name: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} placeholder="target" autoCapitalize="none" autoCorrect="off" spellCheck="false" /></label>
            <label>Type<AnimatedDropdown value={type} options={OPTION_TYPES} onChange={(value) => updateOption(index, { type: Number(value), autocomplete: false, choices: [], dynamicAutocomplete: false })} ariaLabel={`Type for ${option.name || `option ${index + 1}`}`} /></label>
            <label className="slash-option-description">Description<input value={option.description || ''} maxLength={100} onChange={(event) => updateOption(index, { description: event.target.value })} placeholder="What should the user provide?" /></label>
            <label className="slash-option-required"><AnimatedCheckbox checked={Boolean(option.required)} label={`Required ${option.name || `option ${index + 1}`}`} onChange={(required) => updateOption(index, { required })} /><span>Required</span></label>
          </div>
          {supportsChoices && <section className="slash-option-choices">
            <div className="slash-option-choice-toolbar"><label>Input<AnimatedDropdown value={mode} options={CHOICE_MODES} onChange={(value) => updateOption(index, { autocomplete: value === 'autocomplete', ...(value !== 'autocomplete' ? { dynamicAutocomplete: false } : {}) })} ariaLabel={`Input mode for ${option.name || `option ${index + 1}`}`} /></label>{!option.dynamicAutocomplete && <button type="button" disabled={choices.length >= 25} onClick={() => updateOption(index, { choices: [...choices, { id: createLocalId('choice'), name: '', value: '' }] })}><Plus size={13} /> Add {mode === 'autocomplete' ? 'suggestion' : 'choice'}</button>}</div>
            {mode === 'autocomplete' && <label className="slash-dynamic-suggestions"><AnimatedCheckbox checked={Boolean(option.dynamicAutocomplete)} label={`Use graph-generated suggestions for ${option.name || `option ${index + 1}`}`} onChange={(dynamicAutocomplete) => updateOption(index, { dynamicAutocomplete })} /><span>Build suggestions in the graph</span></label>}
            {option.dynamicAutocomplete
              ? <small>Use <b>On Command Autocomplete</b> and wire an array of {`{ name, value }`} objects into <b>Respond to Autocomplete</b>. Build it from variables, JSON, or other node outputs.</small>
              : <>
                {choices.length > 0 && <div className="slash-option-choice-head"><span>Shown to user</span><span>Value received by graph</span><span /></div>}
                {choices.map((choice, choiceIndex) => <div className="slash-option-choice-row" key={choice.id || choiceIndex}><input value={choice.name || ''} maxLength={100} onChange={(event) => updateChoice(index, choiceIndex, { name: event.target.value })} placeholder={mode === 'autocomplete' ? 'Suggestion' : 'Choice'} aria-label={`${mode === 'autocomplete' ? 'Suggestion' : 'Choice'} shown to user`} /><input value={choice.value ?? ''} maxLength={100} inputMode={[4, 10].includes(type) ? 'decimal' : 'text'} onChange={(event) => updateChoice(index, choiceIndex, { value: [4, 10].includes(type) ? event.target.value : event.target.value.slice(0, 100) })} placeholder={[4, 10].includes(type) ? 'Number' : 'Submitted value'} aria-label="Value received by graph" /><button type="button" title="Remove choice" aria-label="Remove choice" onClick={() => updateOption(index, { choices: choices.filter((_choice, itemIndex) => itemIndex !== choiceIndex) })}><Trash2 size={13} /></button></div>)}
              </>}
            <small>{option.autocomplete ? 'Fixed suggestions are filtered by what the user types.' : 'The user must choose one of these values.'} Up to 25.</small>
          </section>}
        </article>;
      })}
      {issue && <p className="slash-command-studio-error" role="alert">{issue}</p>}
    </div>
    <Modal isOpen={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard argument changes?" subtitle="These edits have not been applied to the graph." footer={<><Button variant="secondary" onClick={() => setDiscardOpen(false)}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard changes</Button></>}><p className="close-graph-copy">The command will keep its current options until you choose Apply.</p></Modal>
  </section>;
}
