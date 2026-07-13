import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Camera, MessageSquare, RotateCcw, Send, X } from 'lucide-react';
import type { ElementScreenshotDraft } from '@/lib/element-capture';

export type DraftExitSource = 'keyboard' | 'pointer';

interface AnnotationPopoverProps {
  rect: DOMRect;
  anchorXRatio: number;
  label: string;
  note: string;
  screenshot: ElementScreenshotDraft | null;
  captureAvailable: boolean;
  isCapturing: boolean;
  captureError: string;
  onNoteChange: (note: string) => void;
  onCapture: () => void | Promise<void>;
  onRemoveScreenshot: () => void;
  onSave: (note: string) => Promise<boolean>;
  onRequestExit: (source: DraftExitSource) => void;
}

interface PopoverPlacement {
  readonly arrowLeft: number;
  readonly left: number;
  readonly side: 'bottom' | 'top';
  readonly top: number;
  readonly transformOrigin: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function placePopover(
  rect: DOMRect,
  anchorXRatio: number,
  popoverHeight: number,
): PopoverPlacement {
  const margin = 12;
  const gap = 10;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(312, viewportWidth - margin * 2);
  const safeHeight = Math.min(popoverHeight, viewportHeight - margin * 2);
  const spaceBelow = viewportHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const side = spaceBelow >= safeHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
  const desiredTop = side === 'bottom' ? rect.bottom + gap : rect.top - safeHeight - gap;
  const top = clamp(desiredTop, margin, Math.max(margin, viewportHeight - safeHeight - margin));
  const ratio = clamp(anchorXRatio, 0, 1);
  const anchorX = rect.left + rect.width * ratio;
  const left = clamp(anchorX - 34, margin, Math.max(margin, viewportWidth - width - margin));
  const arrowLeft = clamp(anchorX - left - 5, 18, Math.max(18, width - 28));

  return {
    arrowLeft,
    left,
    side,
    top,
    transformOrigin: `${arrowLeft + 5}px ${side === 'bottom' ? '0px' : `${safeHeight}px`}`,
  };
}

/** A compact, anchored editor for creating one element note. */
export function AnnotationPopover({
  rect,
  anchorXRatio,
  label,
  note,
  screenshot,
  captureAvailable,
  isCapturing,
  captureError,
  onNoteChange,
  onCapture,
  onRemoveScreenshot,
  onSave,
  onRequestExit,
}: AnnotationPopoverProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [popoverHeight, setPopoverHeight] = useState(236);
  const popoverRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const targetId = useId();
  const editorId = useId();
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const placement = placePopover(rect, anchorXRatio, popoverHeight);
  const canSave = note.trim().length > 0 && !isSaving && !isCapturing;

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    textarea.style.height = `${clamp(textarea.scrollHeight, 88, 180)}px`;
  }, [note]);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const measure = () => setPopoverHeight(popover.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(popover);
    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (!trimmedNote || isSaving) return;

    setIsSaving(true);
    setSaveError('');
    try {
      const saved = await onSave(trimmedNote);
      if (saved) return;
      setSaveError('Couldn’t save this note. Try again.');
      setIsSaving(false);
    } catch {
      setSaveError('Couldn’t save this note. Try again.');
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onRequestExit('keyboard');
    }
  };

  return (
    <form
      ref={popoverRef}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={targetId}
      className="app-notes-popover"
      data-side={placement.side}
      onSubmit={handleSubmit}
      style={{
        top: `${placement.top}px`,
        left: `${placement.left}px`,
        transformOrigin: placement.transformOrigin,
      }}
    >
      <span
        aria-hidden="true"
        className="app-notes-popover-arrow"
        style={{ left: `${placement.arrowLeft}px` }}
      />

      <header className="app-notes-popover-header">
        <span aria-hidden="true" className="app-notes-popover-icon">
          <MessageSquare size={15} strokeWidth={2.2} />
        </span>
        <div className="app-notes-popover-heading">
          <h2 id={titleId} className="app-notes-popover-title">Add note</h2>
          <span id={targetId} className="app-notes-popover-target" title={label}>{label}</span>
        </div>
        <button
          type="button"
          aria-label="Close note editor"
          className="app-notes-icon-button"
          onClick={() => onRequestExit('pointer')}
        >
          <X aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </header>

      {screenshot === null && captureAvailable ? (
        <button
          type="button"
          className="app-notes-capture-button"
          disabled={isSaving || isCapturing}
          onClick={onCapture}
        >
          <Camera aria-hidden="true" size={14} strokeWidth={2.1} />
          <span>{isCapturing ? 'Capturing…' : 'Capture element'}</span>
          <span className="app-notes-capture-hint">PNG · local folder</span>
        </button>
      ) : screenshot !== null ? (
        <figure className="app-notes-screenshot-preview">
          <img
            src={screenshot.dataUrl}
            alt={`Screenshot of ${label}`}
            width={screenshot.width}
            height={screenshot.height}
          />
          <figcaption>
            <span>{screenshot.width} × {screenshot.height} PNG</span>
            <span className="app-notes-screenshot-actions">
              <button
                type="button"
                className="app-notes-screenshot-action"
                disabled={isSaving || isCapturing}
                onClick={onCapture}
              >
                <RotateCcw aria-hidden="true" size={11} />
                <span>{isCapturing ? 'Capturing…' : 'Retake'}</span>
              </button>
              <button
                type="button"
                aria-label="Remove screenshot"
                className="app-notes-screenshot-remove"
                disabled={isSaving || isCapturing}
                onClick={onRemoveScreenshot}
              >
                <X aria-hidden="true" size={12} />
              </button>
            </span>
          </figcaption>
        </figure>
      ) : null}

      <label className="app-notes-editor-label" htmlFor={editorId}>Note</label>
      <textarea
        ref={textareaRef}
        id={editorId}
        aria-keyshortcuts={isMac ? 'Meta+Enter' : 'Control+Enter'}
        className="app-notes-editor"
        value={note}
        onChange={(event) => {
          onNoteChange(event.target.value);
          if (saveError) setSaveError('');
        }}
        onKeyDown={handleKeyDown}
        placeholder="What should change?"
        rows={4}
        spellCheck="true"
      />

      <p className="app-notes-popover-error" role="status" aria-live="polite">
        {saveError || captureError}
      </p>

      <footer className="app-notes-popover-footer">
        <span className="app-notes-shortcut" aria-hidden="true">
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd><kbd>↵</kbd> to add
        </span>
        <button
          type="submit"
          className="app-notes-primary-button"
          disabled={!canSave}
        >
          <Send aria-hidden="true" size={13} strokeWidth={2.2} />
          <span>{isSaving ? 'Adding…' : 'Add note'}</span>
        </button>
      </footer>
    </form>
  );
}
