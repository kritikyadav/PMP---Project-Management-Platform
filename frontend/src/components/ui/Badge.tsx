import { cn } from '../../lib/cn.js';

export type BadgeVariant =
  | 'draft' | 'published' | 'not-started'
  | 'active' | 'inactive'
  | 'pm' | 'pgm' | 'cxo' | 'admin';

const variantCls: Record<BadgeVariant, string> = {
  draft:        'bg-rag-amber-bg/20 text-rag-amber-bg border border-rag-amber-bg/30',
  published:    'bg-rag-green-bg/20 text-rag-green-text border border-rag-green-bg/30',
  'not-started':'bg-surface-4 text-pip-muted border border-pip-border-subtle',
  active:       'badge-active bg-pip-accent-dim/20 text-pip-accent border border-pip-accent/60',
  inactive:     'badge-inactive bg-err-bg/20 text-err-text border border-err-text/40',
  pm:           'bg-surface-4 text-pip-secondary border border-pip-border-subtle',
  pgm:          'bg-surface-4 text-pip-secondary border border-pip-border-subtle',
  cxo:          'bg-surface-4 text-pip-secondary border border-pip-border-subtle',
  admin:        'bg-pip-accent/10 text-pip-accent border border-pip-accent/30',
};

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
        variantCls[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
