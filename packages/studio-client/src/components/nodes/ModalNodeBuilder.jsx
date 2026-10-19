import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AnimatedCheckbox, AnimatedDropdown } from '../ui/CustomControls.jsx';

const FIELD_TYPES = [
  { value: 'text', label: 'Text field' }, { value: 'string_select', label: 'String select' },
  { value: 'user_select', label: 'User select' }, { value: 'role_select', label: 'Role select' },
  { value: 'mentionable_select', label: 'User or role select' }, { value: 'channel_select', label: 'Channel select' },
  { value: 'file_upload', label: 'File upload' }, { value: 'checkbox', label: 'Checkbox' },
  { value: 'checkbox_group', label: 'Checkbox group' }, { value: 'radio_group', label: 'Radio group' }
];

export const createDefaultModal = () => ({
  customId: 'arc_modal', title: 'Tell us more',
  components: [{ type: 'text', customId: 'field_1', label: 'Question 1', style: 1, required: true, minLength: 0, maxLength: 4000, options: [] }]
});

function createDefaultField(index) {
  return { type: 'text', customId: `field_${index + 1}`, label: `Question ${index + 1}`, style: 1, required: true, minLength: 0, maxLength: 4000, options: [] };
}

export function ModalNodeBuilder({ value, onChange }) {
  const draft = value || createDefaultModal();
  const fields = Array.isArray(draft.components) ? draft.components : [];
  const commit = (next) => onChange?.(next);
  const patchField = (index, patch) => commit({ ...draft, components: fields.map((field, i) => i === index ? { ...field, ...patch } : field) });
  const addField = () => commit({ ...draft, components: [...fields, createDefaultField(fields.length)] });
  const updateOptions = (index, raw) => patchField(index, { options: raw.split('\n').filter(Boolean).slice(0, 25).map((line) => {
    const [label, ...rest] = line.split('|');
    const clean = label.trim().slice(0, 100);
    return { label: clean, value: (rest.join('|').trim() || clean).slice(0, 100) };
  }) });

  return <div className="modal-builder-config">
    <div className="modal-builder-heading">
      <label>Modal title<input value={draft.title || ''} maxLength={45} onChange={(event) => commit({ ...draft, title: event.target.value })} placeholder="Tell us more" /></label>
      <label>Modal custom ID<input value={draft.customId || ''} maxLength={100} onChange={(event) => commit({ ...draft, customId: event.target.value })} placeholder="arc_modal" /></label>
    </div>
    <div className="modal-builder-fields-heading"><strong>Fields</strong><span>{fields.length}/5</span></div>
    {fields.map((field, index) => <section className="modal-builder-field" key={`${field.customId}-${index}`}>
      <header><strong>Field {index + 1}</strong><button type="button" className="icon-button compact is-danger" disabled={fields.length <= 1} onClick={() => commit({ ...draft, components: fields.filter((_item, i) => i !== index) })} aria-label={`Remove field ${index + 1}`}><Trash2 size={13} /></button></header>
      <label>Input type<AnimatedDropdown value={field.type || 'text'} options={FIELD_TYPES} onChange={(type) => patchField(index, { ...createDefaultField(index), ...field, type })} ariaLabel={`Field ${index + 1} input type`} className="modal-builder-type" /></label>
      <div className="modal-builder-heading">
        <label>Label<input value={field.label || ''} maxLength={45} onChange={(event) => patchField(index, { label: event.target.value })} placeholder="Question" /></label>
        <label>Field custom ID<input value={field.customId || ''} maxLength={100} onChange={(event) => patchField(index, { customId: event.target.value })} placeholder={`field_${index + 1}`} /></label>
      </div>
      <label>Description (optional)<input value={field.description || ''} maxLength={100} onChange={(event) => patchField(index, { description: event.target.value })} placeholder="Help the user answer" /></label>
      {field.type !== 'text' && ['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(field.type) && <label>Placeholder<input value={field.placeholder || ''} maxLength={150} onChange={(event) => patchField(index, { placeholder: event.target.value })} /></label>}
      {field.type === 'text' && <>
        <label>Placeholder<input value={field.placeholder || ''} maxLength={100} onChange={(event) => patchField(index, { placeholder: event.target.value })} /></label>
        <div className="modal-builder-heading"><label>Text style<AnimatedDropdown value={Number(field.style) || 1} options={[{ value: 1, label: 'Short answer' }, { value: 2, label: 'Paragraph' }]} onChange={(style) => patchField(index, { style: Number(style) })} ariaLabel="Text input style" /></label><label>Maximum characters<input type="number" min="1" max="4000" value={field.maxLength ?? 4000} onChange={(event) => patchField(index, { maxLength: Number(event.target.value) })} /></label></div>
      </>}
      {field.type === 'string_select' && <>
        <label>Options (one per line, label | value)<textarea rows={4} value={(field.options || []).map((option) => `${option.label} | ${option.value}`).join('\n')} onChange={(event) => updateOptions(index, event.target.value)} placeholder={'Support | support\nBilling | billing'} /></label>
        <div className="modal-builder-heading"><label>Minimum selections<input type="number" min="0" max="25" value={field.minValues ?? (field.required === false ? 0 : 1)} onChange={(event) => patchField(index, { minValues: Number(event.target.value) })} /></label><label>Maximum selections<input type="number" min="1" max="25" value={field.maxValues ?? 1} onChange={(event) => patchField(index, { maxValues: Number(event.target.value) })} /></label></div>
      </>}
      {['checkbox_group', 'radio_group'].includes(field.type) && <>
        <label>Options (one per line, label | value)<textarea rows={3} value={(field.options || []).map((option) => `${option.label} | ${option.value}`).join('\n')} onChange={(event) => updateOptions(index, event.target.value)} placeholder={'General | general\nTechnical | technical'} /></label>
        {field.type === 'checkbox_group' && <div className="modal-builder-heading"><label>Minimum selections<input type="number" min="0" max="10" value={field.minValues ?? (field.required === false ? 0 : 1)} onChange={(event) => patchField(index, { minValues: Number(event.target.value) })} /></label><label>Maximum selections<input type="number" min="1" max="10" value={field.maxValues ?? 10} onChange={(event) => patchField(index, { maxValues: Number(event.target.value) })} /></label></div>}
      </>}
      {field.type === 'file_upload' && <>
        <div className="modal-builder-heading"><label>Minimum files<input type="number" min="0" max="10" value={field.minValues ?? (field.required === false ? 0 : 1)} onChange={(event) => patchField(index, { minValues: Number(event.target.value) })} /></label><label>Maximum files<input type="number" min="1" max="10" value={field.maxValues ?? 1} onChange={(event) => patchField(index, { maxValues: Number(event.target.value) })} /></label></div>
        <label>Allowed file types (optional, one per line)<textarea rows={2} value={(field.fileTypes || []).join('\n')} onChange={(event) => patchField(index, { fileTypes: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 10) })} placeholder={'image\n.pdf'} /></label>
      </>}
      {['user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(field.type) && <div className="modal-builder-heading"><label>Minimum selections<input type="number" min="0" max="25" value={field.minValues ?? 0} onChange={(event) => patchField(index, { minValues: Number(event.target.value) })} /></label><label>Maximum selections<input type="number" min="1" max="25" value={field.maxValues ?? 1} onChange={(event) => patchField(index, { maxValues: Number(event.target.value) })} /></label></div>}
      <div className="modal-builder-required">{field.type === 'checkbox' ? <><AnimatedCheckbox checked={Boolean(field.defaultChecked)} onChange={(defaultChecked) => patchField(index, { defaultChecked })} label={`Checkbox ${index + 1} checked by default`} /><span>Checked by default</span></> : <><AnimatedCheckbox checked={field.required !== false} onChange={(required) => patchField(index, { required })} label={`Required field ${index + 1}`} /><span>Required</span></>}</div>
    </section>)}
    <button type="button" className="modal-builder-add" disabled={fields.length >= 5} onClick={addField}><Plus size={14} /> Add field <small>{fields.length}/5</small></button>
    <small className="node-config-hint">Discord modals allow 1–5 fields, up to 25 string-select options, and up to 10 checkbox or radio choices.</small>
  </div>;
}
