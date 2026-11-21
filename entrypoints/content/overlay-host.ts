const DIALOG_SELECTOR = 'dialog[open], [role="dialog"]:not(dialog), [role="alertdialog"]:not(dialog)';

function composedParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function findOverlayLayer(target: Element | null, supportsPopover: boolean): HTMLElement | null {
  if (!target?.isConnected) return null;

  for (let current: Element | null = target; current; current = composedParent(current)) {
    if (!(current instanceof HTMLElement)) continue;
    if (current.matches(DIALOG_SELECTOR) || (supportsPopover && current.matches(':popover-open'))) {
      return current;
    }
  }
  return null;
}

export interface OverlayHost {
  readonly host: HTMLElement;
  readonly setTarget: (target: Element | null) => void;
}

export function createOverlayHost(host: HTMLElement, documentElement: HTMLElement): OverlayHost {
  const supportsPopover = typeof host.showPopover === 'function';

  return {
    host,
    setTarget(target) {
      const layer = findOverlayLayer(target, supportsPopover);
      const parent = layer ?? documentElement;
      if (host.parentElement === parent) return;

      // Reuse the shadow root and React tree so moving between layers doesn't reset the draft.
      const focused = host.shadowRoot?.activeElement;
      host.removeAttribute('popover');
      parent.append(host);

      // A z-index can't raise the overlay above a native top-layer element. The host
      // also has to live inside a modal to avoid its inert area (and custom focus traps).
      if (layer && supportsPopover) {
        host.setAttribute('popover', 'manual');
        try {
          host.showPopover();
        } catch {
          // Leave the inline overlay usable if the browser can't promote it.
          host.removeAttribute('popover');
        }
      }

      if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
    },
  };
}
