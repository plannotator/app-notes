/** Capture-phase event handlers owned by the mounted annotation UI. */
export interface ContentEventHandlers {
  readonly click: (event: MouseEvent) => void;
  readonly keydown: (event: KeyboardEvent) => void;
  readonly pointerdown: (event: PointerEvent) => void;
  readonly pointermove: (event: PointerEvent) => void;
  readonly pointerout: (event: PointerEvent) => void;
  readonly pointerup: (event: PointerEvent) => void;
}

/** An early-installed bridge that preserves listener priority before page scripts run. */
export interface ContentEventBridge {
  readonly dispose: () => void;
  readonly setHandlers: (handlers: ContentEventHandlers) => () => void;
}

/** Register stable window listeners immediately and delegate them to the latest React handlers. */
export function createContentEventBridge(): ContentEventBridge {
  let currentHandlers: ContentEventHandlers | null = null;
  const listeners = {
    click: (event: MouseEvent) => currentHandlers?.click(event),
    keydown: (event: KeyboardEvent) => currentHandlers?.keydown(event),
    pointerdown: (event: PointerEvent) => currentHandlers?.pointerdown(event),
    pointermove: (event: PointerEvent) => currentHandlers?.pointermove(event),
    pointerout: (event: PointerEvent) => currentHandlers?.pointerout(event),
    pointerup: (event: PointerEvent) => currentHandlers?.pointerup(event),
  };

  window.addEventListener('click', listeners.click, true);
  window.addEventListener('keydown', listeners.keydown, true);
  window.addEventListener('pointerdown', listeners.pointerdown, true);
  window.addEventListener('pointermove', listeners.pointermove, true);
  window.addEventListener('pointerout', listeners.pointerout, true);
  window.addEventListener('pointerup', listeners.pointerup, true);

  return {
    setHandlers: (handlers) => {
      currentHandlers = handlers;
      return () => {
        if (currentHandlers === handlers) currentHandlers = null;
      };
    },
    dispose: () => {
      currentHandlers = null;
      window.removeEventListener('click', listeners.click, true);
      window.removeEventListener('keydown', listeners.keydown, true);
      window.removeEventListener('pointerdown', listeners.pointerdown, true);
      window.removeEventListener('pointermove', listeners.pointermove, true);
      window.removeEventListener('pointerout', listeners.pointerout, true);
      window.removeEventListener('pointerup', listeners.pointerup, true);
    },
  };
}
