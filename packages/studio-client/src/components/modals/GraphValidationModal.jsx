import React from 'react';
import { AlertCircle, CheckCircle2, CircleAlert, ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
//
export function GraphValidationModal({ isOpen, onClose, graphName, result, onTraceIssue }) {
  if (!result) return null;
  const hasErrors = result.errors.length > 0;
  const items = result.issueItems || [
    ...result.errors.map((message) => ({ message, kind: 'error', nodeId: result.errorNodeIds?.[message] })),
    ...result.warnings.map((message) => ({ message, kind: 'warning', nodeId: result.warningNodeIds?.[message] }))
  ];
  return <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Graph checks"
    subtitle={graphName || 'Untitled graph'}
    icon={ShieldCheck}
    maxWidth="lg"
    footer={<button className="studio-button" onClick={onClose}>Done</button>}
  >
    <div className={`validation-summary ${hasErrors ? 'has-errors' : 'is-valid'}${result.warnings.length ? ' has-warnings' : ''}`}>
      {hasErrors ? <AlertCircle size={18} /> : result.warnings.length ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
      <div><strong>{hasErrors ? `${result.errors.length} blocking issue${result.errors.length === 1 ? '' : 's'}` : result.warnings.length ? 'Ready with notes' : 'All checks passed'}</strong><span>{result.errors.length ? 'Resolve these items before running this graph.' : result.warnings.length ? 'Review these warnings; the graph can still run.' : 'Node links and message payloads are within the supported limits.'}</span></div>
    </div>
    <div className="validation-list">
      {items.map((item, index) => {
        const content = <>{item.kind === 'error' ? <AlertCircle size={14} /> : <CircleAlert size={14} />}<span>{item.message}</span></>;
        const graphId = item.graphId || result.graphId;
        return item.nodeId && graphId
          ? <button key={`${item.kind}-${index}`} type="button" className={`validation-item is-${item.kind} is-clickable`} title="Open graph and highlight node" onClick={() => { onClose?.(); onTraceIssue?.(graphId, item.nodeId); }}>{content}</button>
          : <div key={`${item.kind}-${index}`} className={`validation-item is-${item.kind}`}>{content}</div>;
      })}
      {!result.errors.length && !result.warnings.length && <div className="validation-empty"><CheckCircle2 size={16} /> Ready to run</div>}
    </div>
  </Modal>;
}
