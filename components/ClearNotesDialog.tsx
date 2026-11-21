import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { isLocalFileUrl } from '@/lib/annotation-scope';
import type { AnnotationScope } from '@/lib/annotation-scope';
import { getPageDisplayLabel, getSiteDisplayLabel } from '@/lib/page';

interface ClearNotesDialogProps {
  readonly url: string;
  readonly scope: AnnotationScope;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly onConfirm: () => Promise<boolean>;
  readonly onDismiss: () => void;
}

/** Confirm a destructive clear inside the extension's own viewport. */
export function ClearNotesDialog({ url, scope, fallbackFocusRef, onConfirm, onDismiss }: ClearNotesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmingRef = useRef(false);
  const [status, setStatus] = useState<'ready' | 'deleting' | 'failed'>('ready');
  const titleId = useId();
  const descriptionId = useId();
  const collection = isLocalFileUrl(url) ? (scope === 'page' ? 'file' : 'folder') : 'site';
  const label = collection === 'file' ? getPageDisplayLabel(url) : getSiteDisplayLabel(url);
  const deleting = status === 'deleting';

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      dialog.close();
      // On success the original trigger may be disabled or removed.
      window.requestAnimationFrame(() => {
        if (document.activeElement === document.body) {
          fallbackFocusRef.current?.focus({ preventScroll: true });
        }
      });
    };
  }, [fallbackFocusRef]);

  const dismiss = () => {
    if (!confirmingRef.current) onDismiss();
  };

  const confirm = async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setStatus('deleting');
    let cleared = false;
    try {
      cleared = await onConfirm();
    } catch {
      // Keep the dialog open so the user can retry or cancel.
    }
    if (!dialogRef.current) return;
    if (cleared) {
      onDismiss();
    } else {
      confirmingRef.current = false;
      setStatus('failed');
    }
  };

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100%_-_1rem)] w-[calc(100%_-_1rem)] max-w-80 overflow-y-auto overscroll-contain rounded-xl border border-border-subtle bg-surface p-3 text-left shadow-lg backdrop:bg-black/45"
    >
      <h2 id={titleId} className="text-sm font-semibold text-text-primary">
        Delete all {collection} notes?
      </h2>
      <p id={descriptionId} className="mt-1 text-xs leading-5 text-text-secondary wrap-anywhere">
        Notes for {label ? <bdi className="font-medium text-text-primary">{label}</bdi> : `this ${collection}`} will be permanently deleted. This can’t be undone.
      </p>
      {status === 'failed' && (
        <p role="alert" className="mt-2 text-xs text-danger">Couldn’t delete notes. Try again.</p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          aria-disabled={deleting}
          onClick={dismiss}
          className="app-notes-touch-target min-h-9 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-hover aria-disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          aria-disabled={deleting}
          onClick={confirm}
          className="app-notes-touch-target min-h-9 rounded-lg bg-danger-solid px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-solid-hover aria-disabled:opacity-60"
        >
          {deleting ? 'Deleting…' : 'Delete notes'}
        </button>
      </div>
    </dialog>
  );
}
