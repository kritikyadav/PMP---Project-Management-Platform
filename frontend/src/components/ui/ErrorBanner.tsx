interface ErrorBannerProps { message: string; onDismiss?: () => void; className?: string; }

export function ErrorBanner({ message, onDismiss, className }: ErrorBannerProps) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border border-err-text/30 bg-err-bg/20 px-4 py-3 text-sm text-err-text ${className ?? ''}`}>
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 text-err-text/70 hover:text-err-text" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
