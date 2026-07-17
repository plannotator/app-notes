import { createAnnotationStorage, getAnnotations } from '@/lib/storage';
import { getAnnotationStorageKeyForUrl } from '@/lib/page';
import { parseAnnotationMutationCommand } from '@/lib/types';
import { openNotesWorkspace } from '@/lib/open-notes-workspace';
import { isLocalFileUrl } from '@/lib/annotation-scope';
import {
  getLocalFileSettingsUrl,
  parseOpenLocalFileSettingsCommand,
  parsePendingLocalFileAccessTab,
  PENDING_LOCAL_FILE_ACCESS_TAB_KEY,
} from '@/lib/local-file-access';
import type {
  OpenLocalFileSettingsCommand,
  OpenLocalFileSettingsResult,
} from '@/lib/local-file-access';

export default defineBackground(() => {
  const annotationStorage = createAnnotationStorage(browser.storage.local, {
    now: () => Date.now(),
  });
  const badgeGenerations = new Map<number, number>();
  const pendingLocalFileResumes = new Set<number>();

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

  const openLocalFileSettings = async (
    command: OpenLocalFileSettingsCommand,
  ): Promise<OpenLocalFileSettingsResult> => {
    if (!import.meta.env.CHROME) return { _tag: 'failed' };

    try {
      await browser.tabs.get(command.tabId);

      await browser.storage.session.set({
        [PENDING_LOCAL_FILE_ACCESS_TAB_KEY]: command.tabId,
      });
      try {
        await browser.tabs.create({
          active: true,
          url: getLocalFileSettingsUrl(browser.runtime.id),
        });
      } catch {
        await browser.storage.session.remove(PENDING_LOCAL_FILE_ACCESS_TAB_KEY);
        return { _tag: 'failed' };
      }
      return { _tag: 'opened' };
    } catch {
      return { _tag: 'failed' };
    }
  };

  const resumePendingLocalFileTab = async (tabId: number) => {
    if (!import.meta.env.CHROME || pendingLocalFileResumes.has(tabId)) return;
    pendingLocalFileResumes.add(tabId);

    try {
      const stored = await browser.storage.session.get(PENDING_LOCAL_FILE_ACCESS_TAB_KEY);
      const pendingTabId = parsePendingLocalFileAccessTab(
        stored[PENDING_LOCAL_FILE_ACCESS_TAB_KEY],
      );
      if (pendingTabId !== tabId) return;

      const allowed = await browser.extension.isAllowedFileSchemeAccess();
      if (!allowed) return;

      const tab = await browser.tabs.get(tabId);
      if (!tab.url || !isLocalFileUrl(tab.url)) {
        await browser.storage.session.remove(PENDING_LOCAL_FILE_ACCESS_TAB_KEY);
        return;
      }

      await browser.tabs.reload(tabId);
      await browser.storage.session.remove(PENDING_LOCAL_FILE_ACCESS_TAB_KEY);
    } finally {
      pendingLocalFileResumes.delete(tabId);
    }
  };

  const clearPendingLocalFileTab = async (tabId: number) => {
    if (!import.meta.env.CHROME) return;
    const stored = await browser.storage.session.get(PENDING_LOCAL_FILE_ACCESS_TAB_KEY);
    const pendingTabId = parsePendingLocalFileAccessTab(
      stored[PENDING_LOCAL_FILE_ACCESS_TAB_KEY],
    );
    if (pendingTabId === tabId) {
      await browser.storage.session.remove(PENDING_LOCAL_FILE_ACCESS_TAB_KEY);
    }
  };

  browser.runtime.onMessage.addListener((message: unknown) => {
    const fileSettingsCommand = parseOpenLocalFileSettingsCommand(message);
    if (fileSettingsCommand !== null) return openLocalFileSettings(fileSettingsCommand);

    const command = parseAnnotationMutationCommand(message);
    return command === null ? undefined : annotationStorage.execute(command);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'open_side_panel') {
      openNotesWorkspace({ tabId: tab?.id, windowId: tab?.windowId }).catch(() => undefined);
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
    resumePendingLocalFileTab(tabId).catch(() => undefined);
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
    clearPendingLocalFileTab(tabId).catch(() => undefined);
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
