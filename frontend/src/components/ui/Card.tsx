import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function Card({ elevated = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-pip-border-subtle shadow-card transition-shadow duration-200',
        elevated ? 'bg-surface-2 shadow-card-elevated' : 'bg-surface-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
