import { type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantCls: Record<ButtonVariant, string> = {
  primary:
    'bg-pip-accent text-inverted text-base font-semibold hover:bg-pip-accent/90 disabled:opacity-40',
  secondary:
    'border border-pip-border text-pip-text hover:bg-surface-3 disabled:opacity-40',
  ghost:
    'text-pip-muted hover:text-pip-text hover:bg-surface-3 disabled:opacity-40',
  danger:
    'bg-err-bg text-err-text border border-err-text/30 hover:opacity-90 disabled:opacity-40',
};

const sizeCls: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-2.5 text-base rounded-lg',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors whitespace-nowrap flex-shrink-0',
        'cursor-pointer disabled:cursor-not-allowed',
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...props}
    />
  );
}
