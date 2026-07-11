const OVERLAY_STYLES = `
  :host {
    all: initial;
    color-scheme: light;
    direction: ltr;
  }

  .app-notes-root {
    --an-accent: #2563eb;
    --an-accent-hover: #1d4ed8;
    --an-accent-soft: #eff6ff;
    --an-ink: #0f172a;
    --an-secondary: #475569;
    --an-muted: #64748b;
    --an-separator: rgba(15, 23, 42, 0.11);
    --an-surface: rgba(255, 255, 255, 0.97);
    color: var(--an-ink);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  .app-notes-root,
  .app-notes-root *,
  .app-notes-root *::before,
  .app-notes-root *::after {
    box-sizing: border-box;
  }

  .app-notes-root button,
  .app-notes-root textarea {
    color: inherit;
    font: inherit;
  }

  .app-notes-root button {
    touch-action: manipulation;
  }

  .app-notes-highlight {
    position: fixed;
    z-index: 20;
    border: 2px solid rgba(37, 99, 235, 0.82);
    border-radius: 5px;
    background: rgba(37, 99, 235, 0.035);
    pointer-events: none;
  }

  .app-notes-highlight[data-selected="true"] {
    border-color: var(--an-accent);
    background: rgba(37, 99, 235, 0.065);
  }

  .app-notes-element-label {
    position: fixed;
    z-index: 30;
    max-width: min(300px, calc(100vw - 16px));
    overflow: hidden;
    border-radius: 5px;
    background: var(--an-accent);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
    color: #fff;
    font-family: "SF Mono", "Cascadia Code", Menlo, monospace;
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
    padding: 0 6px;
    pointer-events: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .app-notes-marker {
    position: fixed;
    z-index: 10;
    border: 2px solid rgba(37, 99, 235, 0.68);
    border-radius: 5px;
    background: rgba(37, 99, 235, 0.045);
    pointer-events: none;
  }

  .app-notes-marker-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    display: grid;
    width: 18px;
    height: 18px;
    place-items: center;
    border: 2px solid #fff;
    border-radius: 999px;
    background: var(--an-accent);
    box-shadow: 0 2px 5px rgba(15, 23, 42, 0.2);
    color: #fff;
  }

  .app-notes-popover {
    position: fixed;
    z-index: 40;
    width: min(312px, calc(100vw - 24px));
    overflow: visible;
    border: 0;
    border-radius: 14px;
    margin: 0;
    padding: 14px;
    background: var(--an-surface);
    box-shadow:
      0 0 0 1px var(--an-separator),
      0 8px 24px rgba(15, 23, 42, 0.13),
      0 2px 7px rgba(15, 23, 42, 0.08);
    backdrop-filter: blur(16px) saturate(135%);
    color: var(--an-ink);
    pointer-events: auto;
    animation: app-notes-popover-in 160ms cubic-bezier(0.215, 0.61, 0.355, 1) both;
  }

  @media (max-height: 320px) {
    .app-notes-popover {
      max-height: calc(100dvh - 24px);
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .app-notes-popover-arrow {
      display: none;
    }

    .app-notes-editor {
      min-height: 64px;
      max-height: 96px;
    }
  }

  .app-notes-popover[data-side="top"] {
    --an-enter-y: 4px;
  }

  .app-notes-popover[data-side="bottom"] {
    --an-enter-y: -4px;
  }

  @keyframes app-notes-popover-in {
    from {
      opacity: 0;
      transform: translateY(var(--an-enter-y)) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .app-notes-popover-arrow {
    position: absolute;
    width: 10px;
    height: 10px;
    transform: rotate(45deg);
    background: var(--an-surface);
    pointer-events: none;
  }

  .app-notes-popover[data-side="bottom"] .app-notes-popover-arrow {
    top: -5px;
    box-shadow: -1px -1px 0 var(--an-separator);
  }

  .app-notes-popover[data-side="top"] .app-notes-popover-arrow {
    bottom: -5px;
    box-shadow: 1px 1px 0 var(--an-separator);
  }

  .app-notes-popover-header {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 32px;
    gap: 9px;
    align-items: center;
    margin-bottom: 12px;
  }

  .app-notes-popover-icon {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 9px;
    background: var(--an-accent-soft);
    color: var(--an-accent);
  }

  .app-notes-popover-heading {
    min-width: 0;
  }

  .app-notes-popover-title {
    margin: 0;
    color: var(--an-ink);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: -0.006em;
    line-height: 17px;
  }

  .app-notes-popover-target {
    display: block;
    overflow: hidden;
    margin-top: 1px;
    color: var(--an-muted);
    font-family: "SF Mono", "Cascadia Code", Menlo, monospace;
    font-size: 10.5px;
    line-height: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .app-notes-icon-button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    padding: 0;
    background: transparent;
    color: var(--an-muted);
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease, transform 100ms ease-out;
  }

  .app-notes-editor-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .app-notes-editor {
    display: block;
    width: 100%;
    min-height: 88px;
    max-height: 180px;
    resize: none;
    overflow-y: auto;
    border: 0;
    border-radius: 10px;
    padding: 10px 11px;
    background: #f8fafc;
    box-shadow: inset 0 0 0 1px var(--an-separator);
    color: var(--an-ink);
    font-size: 14px;
    line-height: 20px;
    caret-color: var(--an-accent);
    transition: background-color 120ms ease, box-shadow 120ms ease;
  }

  .app-notes-editor::placeholder {
    color: #64748b;
  }

  .app-notes-editor:focus-visible {
    outline: 2px solid rgba(15, 23, 42, 0.72);
    outline-offset: 2px;
    background: #fff;
  }

  .app-notes-popover-error {
    min-height: 16px;
    margin: 6px 1px -2px;
    color: #b91c1c;
    font-size: 11px;
    line-height: 16px;
  }

  .app-notes-popover-footer {
    display: flex;
    min-height: 38px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
  }

  .app-notes-shortcut {
    color: var(--an-muted);
    font-size: 10.5px;
    line-height: 16px;
    white-space: nowrap;
  }

  .app-notes-shortcut kbd {
    display: inline-flex;
    min-width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    margin-right: 3px;
    padding: 0 5px;
    background: #f1f5f9;
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.09), inset 0 -1px 0 rgba(15, 23, 42, 0.08);
    color: var(--an-secondary);
    font-family: "SF Mono", "Cascadia Code", Menlo, monospace;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .app-notes-primary-button {
    display: inline-flex;
    min-width: 90px;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-radius: 9px;
    padding: 8px 12px;
    background: var(--an-accent);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.16);
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    font-weight: 650;
    line-height: 16px;
    transition: background-color 120ms ease, transform 100ms ease-out, opacity 120ms ease;
  }

  .app-notes-primary-button:disabled {
    background: #94a3b8;
    box-shadow: none;
    color: #fff;
    cursor: not-allowed;
  }

  .app-notes-icon-button:focus-visible,
  .app-notes-primary-button:focus-visible {
    outline: 2px solid rgba(15, 23, 42, 0.8);
    outline-offset: 2px;
  }

  .app-notes-exit-toast {
    position: fixed;
    z-index: 50;
    display: grid;
    width: min(264px, calc(100vw - 24px));
    min-height: 62px;
    grid-template-columns: 32px minmax(0, 1fr) 24px;
    gap: 9px;
    align-items: center;
    border-radius: 14px;
    padding: 10px 11px;
    background: var(--an-surface);
    box-shadow:
      0 0 0 1px var(--an-separator),
      0 8px 22px rgba(15, 23, 42, 0.13),
      0 2px 6px rgba(15, 23, 42, 0.07);
    backdrop-filter: blur(14px) saturate(130%);
    color: var(--an-ink);
    pointer-events: none;
    animation: app-notes-toast-in 150ms cubic-bezier(0.215, 0.61, 0.355, 1) both;
  }

  @keyframes app-notes-toast-in {
    from { opacity: 0; transform: translateY(4px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .app-notes-exit-icon {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: 9px;
    background: var(--an-accent-soft);
    color: var(--an-accent);
  }

  .app-notes-exit-title {
    margin: 0;
    color: var(--an-ink);
    font-size: 12px;
    font-weight: 650;
    line-height: 16px;
  }

  .app-notes-exit-copy {
    margin: 1px 0 0;
    color: var(--an-secondary);
    font-size: 10.5px;
    line-height: 15px;
  }

  .app-notes-exit-count {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    background: var(--an-accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  @media (hover: hover) and (pointer: fine) {
    .app-notes-icon-button:hover {
      background: #f1f5f9;
      color: var(--an-ink);
    }

    .app-notes-primary-button:not(:disabled):hover {
      background: var(--an-accent-hover);
    }
  }

  .app-notes-icon-button:active,
  .app-notes-primary-button:not(:disabled):active {
    transform: scale(0.97);
  }

  @media (pointer: coarse) {
    .app-notes-icon-button,
    .app-notes-primary-button {
      min-width: 44px;
      min-height: 44px;
    }

    .app-notes-editor {
      font-size: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .app-notes-popover,
    .app-notes-exit-toast {
      animation: none;
    }

    .app-notes-icon-button,
    .app-notes-editor,
    .app-notes-primary-button {
      transition: none;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .app-notes-popover,
    .app-notes-exit-toast {
      background: #fff;
      backdrop-filter: none;
    }

    .app-notes-popover-arrow {
      background: #fff;
    }
  }

  @media (prefers-contrast: more) {
    .app-notes-popover,
    .app-notes-exit-toast {
      background: #fff;
      box-shadow: 0 0 0 2px #0f172a, 0 8px 24px rgba(15, 23, 42, 0.16);
    }
  }
`;

/** Installs the deterministic style reset and visual language inside the overlay shadow root. */
export function OverlayStyles() {
  return <style>{OVERLAY_STYLES}</style>;
}
