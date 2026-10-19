import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
//
export function Modal({ isOpen, onClose, onConfirm, title, subtitle, icon: Icon, children, footer, maxWidth, shake = false }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const onConfirmRef = useRef(onConfirm);
  onCloseRef.current = onClose;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (!isOpen) return undefined;
    dialogRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('textarea, select, button, [role="combobox"]'))) return;
      const dialog = dialogRef.current;
      if (!dialog?.contains(target)) return;
      const form = target instanceof HTMLInputElement ? target.form : null;
      const formSubmitter = form?.querySelector('button[type="submit"], input[type="submit"]');
      if (form && formSubmitter) {
        event.preventDefault();
        form.requestSubmit(formSubmitter);
        return;
      }
      event.preventDefault();
      if (onConfirmRef.current) {
        onConfirmRef.current();
        return;
      }
      const modalButtons = [...dialog.querySelectorAll('button.studio-button')];
      const enabledButtons = modalButtons.filter((button) => !button.disabled);
      const primary = enabledButtons.filter((button) => button.classList.contains('studio-button-primary'));
      const danger = enabledButtons.filter((button) => button.classList.contains('studio-button-danger'));
      const action = primary.at(-1) || danger.at(-1) || enabledButtons.filter((button) => !button.classList.contains('studio-button-secondary')).at(-1);
      action?.click();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;
  const widthClass = String(maxWidth || '').includes('2xl') ? 'modal-wide' : String(maxWidth || '').includes('lg') ? 'modal-medium' : '';
  return <div className="dialog-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
    <section ref={dialogRef} className={`modal-panel ${widthClass} ${shake ? 'is-shaking' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <header className="modal-header">
        {Icon && <div className="modal-title-icon"><Icon size={17} /></div>}
        <div className="modal-title-copy"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button>
      </header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </section>
  </div>;
}
