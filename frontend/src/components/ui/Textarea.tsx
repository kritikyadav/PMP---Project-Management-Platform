import { type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-pip-secondary uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={4}
        className={cn(
          'w-full rounded-lg border border-pip-border bg-surface-2 px-3 py-2',
          'text-sm text-pip-text placeholder:text-pip-muted resize-y',
          'focus:outline-none focus:ring-2 focus:ring-pip-accent/40 focus:border-pip-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed read-only:cursor-not-allowed',
          error && 'border-err-text',
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs text-err-text">{error}</span>}
    </div>
  );
}
