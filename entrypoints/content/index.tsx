import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ContentApp } from './App';
import { createContentEventBridge } from './event-bridge';

const FIREWALLED_EVENTS = [
  'click',
  'contextmenu',
  'dblclick',
  'keydown',
  'keyup',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
] as const;

function waitForDocumentElement(): Promise<HTMLElement> {
  if (document.documentElement) return Promise.resolve(document.documentElement);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      resolve(document.documentElement);
    });
    observer.observe(document, { childList: true });
  });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  async main(ctx) {
    const eventBridge = createContentEventBridge();
    const documentElement = await waitForDocumentElement();
    const host = document.createElement('app-notes-overlay');
    Object.assign(host.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '2147483640',
      pointerEvents: 'none',
      overflow: 'visible',
    });

    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      overflow: 'visible',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    });

    shadow.append(container);
    documentElement.append(host);

    // Keep toolbar/editor events from reaching page-level bubble handlers such as
    // dropdown outside-click listeners. React receives them inside the shadow root first.
    const stopPagePropagation = (event: Event) => event.stopPropagation();
    for (const eventName of FIREWALLED_EVENTS) {
      host.addEventListener(eventName, stopPagePropagation);
    }

    const root = createRoot(container);
    flushSync(() => {
      root.render(<ContentApp eventBridge={eventBridge} getShadowHost={() => host} />);
    });

    ctx.onInvalidated(() => {
      root.unmount();
      for (const eventName of FIREWALLED_EVENTS) {
        host.removeEventListener(eventName, stopPagePropagation);
      }
      eventBridge.dispose();
      host.remove();
    });
  },
});
