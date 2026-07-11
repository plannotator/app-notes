import { ShieldCheck } from 'lucide-react';
interface ExitWarningToastProps {
  discardAction: 'click' | 'escape';
  x: number;
  y: number;
  secondsLeft: number;
}

/** Confirms that an in-progress draft was protected from accidental dismissal. */
export function ExitWarningToast({ discardAction, x, y, secondsLeft }: ExitWarningToastProps) {
  const margin = 12;
  const width = Math.min(264, window.innerWidth - margin * 2);
  const estimatedHeight = 62;
  const left = Math.min(
    Math.max(x + 12, margin),
    Math.max(margin, window.innerWidth - width - margin),
  );
  const top = y + 12 + estimatedHeight <= window.innerHeight - margin
    ? y + 12
    : Math.max(margin, y - estimatedHeight - 12);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="app-notes-exit-toast"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      <span aria-hidden="true" className="app-notes-exit-icon">
        <ShieldCheck size={16} strokeWidth={2.2} />
      </span>
      <div>
        <p className="app-notes-exit-title">Draft kept</p>
        <p className="app-notes-exit-copy">
          {discardAction === 'escape'
            ? 'Press Esc again to discard (within 3 seconds).'
            : 'Click again to discard (within 3 seconds).'}
        </p>
      </div>
      <span aria-hidden="true" className="app-notes-exit-count">{secondsLeft}</span>
    </div>
  );
}
