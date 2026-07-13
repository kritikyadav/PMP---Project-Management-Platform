import { cn } from '../../lib/cn.js';

export type RAGValue = 'green' | 'amber' | 'red' | null;

const ragCls: Record<string, string> = {
  green: 'bg-rag-green-bg text-rag-green-text',
  amber: 'bg-rag-amber-bg text-rag-amber-text',
  red:   'bg-rag-red-bg   text-rag-red-text',
};

const ragLabel: Record<string, string> = {
  green: 'Green', amber: 'Amber', red: 'Red',
};

interface RAGBadgeProps {
  value: RAGValue;
  size?: 'sm' | 'md';
  className?: string;
}

export function RAGBadge({ value, size = 'md', className }: RAGBadgeProps) {
  const cls = value ? ragCls[value] : 'bg-surface-4 text-pip-muted';
  const label = value ? ragLabel[value] : '—';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold uppercase tracking-wide',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        cls,
        className,
      )}
    >
      {label}
    </span>
  );
}
