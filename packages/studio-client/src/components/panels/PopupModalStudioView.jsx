import React, { useRef, useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { ModalNodeBuilder } from '../nodes/ModalNodeBuilder.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { useStudioEscape } from './useStudioEscape.js';
//
function validateModal(modal) {
  const title = String(modal?.title || '').trim();
  const customId = String(modal?.customId || '').trim();
  const fields = Array.isArray(modal?.components) ? modal.components : [];
  if (!title || title.length > 45) return 'Enter a modal title (45 characters maximum).';
  if (!customId || customId.length > 100) return 'Enter a modal custom ID (100 characters maximum).';
  if (fields.length < 1 || fields.length > 5) return 'A modal must contain 1–5 fields.';
  const ids = new Set();
  for (const [index, field] of fields.entries()) {
    const fieldId = String(field.customId || '').trim();
    const label = String(field.label || '').trim();
    if (!fieldId || fieldId.length > 100) return `Enter a custom ID for field ${index + 1} (100 characters maximum).`;
    if (ids.has(fieldId)) return `Field custom ID “${fieldId}” is used more than once.`;
    ids.add(fieldId);
    if (!label || label.length > 45) return `Enter a label for field ${index + 1} (45 characters maximum).`;
    if (field.type === 'string_select' && !(field.options || []).length) return `Add at least one option to field ${index + 1}.`;
  }
  return '';
}

function PreviewControl({ field }) {
  if (field.type === 'text') return field.style === 2
    ? <div className="popup-modal-preview-textarea">{field.placeholder || 'Write your answer…'}</div>
    : <div className="popup-modal-preview-input">{field.placeholder || 'Enter a response'}</div>;
  if (field.type === 'checkbox') return <div className="popup-modal-preview-check"><span className={field.defaultChecked ? 'is-checked' : ''}>{field.defaultChecked ? '✓' : ''}</span>{field.label}</div>;
  if (field.type === 'file_upload') return <div className="popup-modal-preview-upload">Choose files</div>;
  if (field.type === 'checkbox_group' || field.type === 'radio_group') return <div className="popup-modal-preview-options">
    {(field.options || []).slice(0, 4).map((option, index) => <span key={`${option.value}-${index}`}><i className={field.type === 'radio_group' ? 'is-radio' : ''} />{option.label || `Option ${index + 1}`}</span>)}
    {field.options?.length > 4 && <small>+{field.options.length - 4} more</small>}
  </div>;
  const selectLabel = ({ string_select: 'Select an option', user_select: 'Search users', role_select: 'Select roles', mentionable_select: 'Select users or roles', channel_select: 'Select channels' })[field.type] || 'Select';
  return <div className="popup-modal-preview-select">{field.placeholder || selectLabel}<span>⌄</span></div>;
}

export function PopupModalStudioView({ graphName, nodeName, modal, onDraftChange, onApply, onClose }) {
  const initialDraft = useRef(JSON.stringify(modal));
  const [discardOpen, setDiscardOpen] = useState(false);
  const fields = Array.isArray(modal?.components) ? modal.components : [];
  const issue = validateModal(modal);
  const hasChanges = JSON.stringify(modal) !== initialDraft.current;
  const requestClose = () => hasChanges ? setDiscardOpen(true) : onClose?.();
  useStudioEscape(requestClose);

  return <section className="popup-modal-studio" aria-label="Popup Modal Builder">
    <header className="popup-modal-studio-header">
      <button type="button" className="embed-studio-back" onClick={requestClose} title="Return to node graph"><ArrowLeft size={15} /><span>Back to graph</span></button>
      <div className="popup-modal-studio-title"><strong>Popup Modal Builder</strong><span>{graphName || 'Untitled graph'}</span><i>/</i><span>{nodeName || 'Show Popup Modal'}</span></div>
      <button type="button" className="embed-studio-save" disabled={Boolean(issue)} onClick={() => onApply?.(structuredClone(modal))}><Check size={15} /><span>Apply to node</span></button>
    </header>
    <div className="popup-modal-studio-body">
      <div className="popup-modal-studio-editor">
        <div className="popup-modal-studio-section-heading"><div><strong>Modal configuration</strong><span>Set the form and its submitted field IDs.</span></div><span>{fields.length}/5 fields</span></div>
        <div className="popup-modal-studio-editor-scroll"><ModalNodeBuilder value={modal} onChange={onDraftChange} />{issue && <p className="popup-modal-studio-error" role="alert">{issue}</p>}</div>
      </div>
      <aside className="popup-modal-studio-preview" aria-label="Live Discord modal preview">
        <div className="popup-modal-studio-preview-heading"><span>Discord preview</span><span>Modal</span></div>
        <div className="popup-modal-preview-stage">
          <div className="popup-modal-preview-card">
            <header><strong>{modal?.title || 'Modal title'}</strong><button type="button" aria-label="Preview close button" tabIndex={-1}><X size={17} /></button></header>
            <div className="popup-modal-preview-fields">
              {fields.map((field, index) => <div className="popup-modal-preview-field" key={`${field.customId}-${index}`}>
                {field.type !== 'checkbox' && <label>{field.label || `Field ${index + 1}`}{field.required !== false && <b>*</b>}</label>}
                {field.description && <small>{field.description}</small>}
                <PreviewControl field={field} />
              </div>)}
              {!fields.length && <span className="popup-modal-preview-empty">Add a field to preview the modal.</span>}
            </div>
            <footer><button type="button" tabIndex={-1}>Cancel</button><button type="button" tabIndex={-1}>Submit</button></footer>
          </div>
        </div>
      </aside>
    </div>
    <Modal isOpen={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard modal edits?" subtitle="Your changes have not been applied to the graph." footer={<><Button variant="secondary" onClick={() => setDiscardOpen(false)}>Keep editing</Button><Button variant="danger" onClick={onClose}>Discard</Button></>}><p className="close-graph-copy">Apply the modal to keep these edits in this graph.</p></Modal>
  </section>;
}
