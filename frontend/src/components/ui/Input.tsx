import { type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export function Input({ label, error, className, id, icon, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-pip-secondary uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative w-full">
        {icon && (
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-pip-muted">
            {icon}
          </span>
        )}
        <input
          id={id}
          className={cn(
            'w-full rounded-lg border border-pip-border bg-surface-2 px-3 py-2',
            'text-sm text-pip-text placeholder:text-pip-muted',
            'focus:outline-none focus:ring-2 focus:ring-pip-accent/40 focus:border-pip-accent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'read-only:bg-surface-1 read-only:text-pip-muted read-only:cursor-not-allowed',
            icon && 'pl-10',
            error && 'border-err-text focus:ring-err-text/30',
            className,
          )}
          {...props}
        />
      </div>
      {error && <span className="text-xs text-err-text">{error}</span>}
    </div>
  );
}
