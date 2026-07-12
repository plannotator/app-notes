/** Browser tab/window context used to keep the notes workspace attached to a page. */
export interface NotesWorkspaceContext {
  readonly tabId?: number;
  readonly windowId?: number;
}

interface BrowserWithSidebarAction {
  readonly sidebarAction?: {
    open(): Promise<void>;
  };
}

/** Opens the browser's native notes surface, with a full-tab fallback. */
export async function openNotesWorkspace(
  context: NotesWorkspaceContext = {},
): Promise<void> {
  const sidePanel = browser.sidePanel;
  if (sidePanel) {
    if (context.tabId !== undefined) {
      await sidePanel.open({ tabId: context.tabId });
      return;
    }
    if (context.windowId !== undefined) {
      await sidePanel.open({ windowId: context.windowId });
      return;
    }
  }

  // SAFETY: Firefox exposes sidebarAction at runtime; the shared WXT type is
  // generated for Chrome and omits it, so capability detection is still required.
  const sidebarAction = (browser as typeof browser & BrowserWithSidebarAction).sidebarAction;
  if (sidebarAction?.open) {
    await sidebarAction.open();
    return;
  }

  const search = new URLSearchParams({ view: 'all' });
  if (context.tabId !== undefined) search.set('tabId', String(context.tabId));
  await browser.tabs.create({
    url: browser.runtime.getURL(`/sidepanel.html?${search.toString()}`),
  });
}
