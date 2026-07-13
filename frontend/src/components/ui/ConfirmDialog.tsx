import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal } from './Modal.js';
import { Button } from './Button.js';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Pending = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used within a <ConfirmDialogProvider>');
  return fn;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const handleClose = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const opts = pending?.options;
  const confirmVariant = opts?.destructive ? 'danger' : 'primary';
  const confirmLabel = opts?.confirmLabel ?? (opts?.destructive ? 'Delete' : 'Confirm');
  const cancelLabel = opts?.cancelLabel ?? 'Cancel';

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={pending !== null}
        onClose={() => handleClose(false)}
        maxWidth="max-w-md"
      >
        <div className="px-6 pt-6 pb-4">
          {opts?.title && (
            <h2 className="font-sora font-semibold text-pip-text text-lg mb-2">{opts.title}</h2>
          )}
          {opts?.message && (
            <p className="text-sm text-pip-secondary leading-relaxed">{opts.message}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5">
          <Button variant="ghost" onClick={() => handleClose(false)}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={() => handleClose(true)}>
            {confirmLabel}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}
