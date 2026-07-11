import { createAnnotationStorage, getAnnotations } from '@/lib/storage';
import { getAnnotationStorageKeyForUrl } from '@/lib/page';
import { parseAnnotationMutationCommand } from '@/lib/types';

export default defineBackground(() => {
  const annotationStorage = createAnnotationStorage(browser.storage.local, {
    now: () => Date.now(),
  });
  const badgeGenerations = new Map<number, number>();

  browser.action.setBadgeBackgroundColor({ color: '#2563eb' }).catch(() => undefined);

  const updateBadgeForTab = async (tabId: number, url?: string) => {
    const generation = (badgeGenerations.get(tabId) ?? 0) + 1;
    badgeGenerations.set(tabId, generation);
    const requestedStorageKey = url ? getAnnotationStorageKeyForUrl(url) : null;

    if (!url || requestedStorageKey === null) {
      const currentTab = await browser.tabs.get(tabId);
      const currentStorageKey = currentTab.url
        ? getAnnotationStorageKeyForUrl(currentTab.url)
        : null;
      if (badgeGenerations.get(tabId) === generation && currentStorageKey === null) {
        await browser.action.setBadgeText({ tabId, text: '' });
      }
      return;
    }

    const annotations = await getAnnotations(url);
    const currentTab = await browser.tabs.get(tabId);
    const currentStorageKey = currentTab.url
      ? getAnnotationStorageKeyForUrl(currentTab.url)
      : null;
    if (
      badgeGenerations.get(tabId) !== generation
      || currentStorageKey !== requestedStorageKey
    ) return;

    await browser.action.setBadgeText({
      tabId,
      text: annotations.length > 0 ? String(annotations.length) : '',
    });
  };

  const updateAllTabBadges = async () => {
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.map((tab) => {
      if (tab.id === undefined) return Promise.resolve();
      return updateBadgeForTab(tab.id, tab.url);
    }));
  };

  const notifyPageLocationChanged = (tabId: number, url: string) => {
    updateBadgeForTab(tabId, url).catch(() => undefined);
    browser.tabs.sendMessage(tabId, {
      type: 'app-notes-page-location-changed',
      url,
    }).catch(() => undefined);
  };

  const openSidePanel = (tab?: { readonly id?: number; readonly windowId?: number }) => {
    const sidePanel = browser.sidePanel;
    if (!sidePanel) return;

    try {
      if (tab?.id !== undefined) {
        sidePanel.open({ tabId: tab.id }).catch(() => undefined);
        return;
      }
      if (tab?.windowId !== undefined) {
        sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
      }
    } catch {
      // The browser rejected a side-panel request outside a supported user gesture.
    }
  };

  browser.runtime.onMessage.addListener((message: unknown) => {
    const command = parseAnnotationMutationCommand(message);
    return command === null ? undefined : annotationStorage.execute(command);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'open_side_panel') {
      openSidePanel(tab);
      return;
    }

    if (command !== 'toggle_annotation') return;
    if (tab?.id !== undefined) {
      browser.tabs.sendMessage(tab.id, {
        type: 'app-notes-toggle-annotation-mode',
      }).catch(() => undefined);
      return;
    }

    browser.tabs.query({ active: true, currentWindow: true })
      .then(([activeTab]) => {
        if (activeTab?.id === undefined) return undefined;
        return browser.tabs.sendMessage(activeTab.id, {
          type: 'app-notes-toggle-annotation-mode',
        });
      })
      .catch(() => undefined);
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    browser.tabs.get(tabId)
      .then((tab) => updateBadgeForTab(tabId, tab.url))
      .catch(() => undefined);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      notifyPageLocationChanged(tabId, changeInfo.url);
      return;
    }
    if (changeInfo.status === 'complete') {
      updateBadgeForTab(tabId, tab.url).catch(() => undefined);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    badgeGenerations.delete(tabId);
  });

  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId === 0) notifyPageLocationChanged(details.tabId, details.url);
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!Object.keys(changes).some((key) => key.startsWith('annotations:'))) return;
    updateAllTabBadges().catch(() => undefined);
  });

  updateAllTabBadges().catch(() => undefined);
  browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => undefined);
});
