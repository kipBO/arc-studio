import React from 'react';
import { LoaderCircle } from 'lucide-react';
//
export function Button({
  children, variant = 'primary', size = 'md', loading = false, disabled = false,
  icon: Icon, className = '', onClick, type = 'button', ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`studio-button studio-button-${variant} studio-button-${size} ${className}`.trim()}
      {...props}
    >
      {loading ? <LoaderCircle className="button-icon is-spinning" size={15} /> : Icon ? <Icon className="button-icon" size={15} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}
