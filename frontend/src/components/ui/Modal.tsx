import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';
import { useScrollLock } from '../../hooks/useScrollLock.js';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-2xl' }: ModalProps) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div
        className={cn(
          'relative w-full rounded-card-lg bg-surface-1 border border-pip-border-subtle shadow-2xl',
          maxWidth,
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-pip-border-subtle">
            <h2 className="font-sora font-semibold text-pip-text text-lg">{title}</h2>
            <button
              onClick={onClose}
              className="text-pip-muted hover:text-pip-text transition-colors text-xl leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
