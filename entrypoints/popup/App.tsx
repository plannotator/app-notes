import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  FolderOpen,
  PanelRight,
  Power,
  RotateCw,
  Trash2,
} from 'lucide-react';
import {
  collectionContainsStorageKey,
  getAnnotationCollectionIdentity,
  isLocalFileUrl,
  resolveAnnotationScope,
} from '@/lib/annotation-scope';
import {
  clearAnnotationsForScope,
  exportAnnotationsForScope,
  getAnnotationsForScope,
} from '@/lib/storage';
import { openNotesWorkspace } from '@/lib/open-notes-workspace';
import { parseOpenLocalFileSettingsResult } from '@/lib/local-file-access';
import type { AnnotationCollectionIdentity } from '@/lib/annotation-scope';

interface AnnotationModeResponse {
  readonly active: boolean;
}

type PageAvailability =
  | 'checking'
  | 'file-access-blocked'
  | 'file-reload-required'
  | 'ready'
  | 'unsupported';

function parseAnnotationModeResponse(value: unknown): AnnotationModeResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const active = Reflect.get(value, 'active');
  return typeof active === 'boolean' ? { active } : null;
}

function App() {
  const [active, setActive] = useState(false);
  const [availability, setAvailability] = useState<PageAvailability>('checking');
  const [count, setCount] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const [tabId, setTabId] = useState<number | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [status, setStatus] = useState('');
  const collectionIdentityRef = useRef<AnnotationCollectionIdentity | null>(null);
  const currentUrlRef = useRef('');
  const countGenerationRef = useRef(0);
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const toggleShortcut = isMac ? ['⌘', '⇧', 'X'] : ['Ctrl', '⇧', 'X'];
  const panelShortcut = isMac ? ['⌘', '⇧', 'U'] : ['Ctrl', '⇧', 'U'];

  useEffect(() => {
    let cancelled = false;

    const loadPopupState = async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (cancelled || tab?.id === undefined) return;

      setTabId(tab.id);
      if (!tab.url) {
        setAvailability('unsupported');
        return;
      }
      setCurrentUrl(tab.url);
      currentUrlRef.current = tab.url;
      const scope = resolveAnnotationScope(tab.url);
      collectionIdentityRef.current = getAnnotationCollectionIdentity(tab.url, scope);

      if (collectionIdentityRef.current === null) {
        setAvailability('unsupported');
        return;
      }

      const [annotations, localFileAccessAllowed] = await Promise.all([
        getAnnotationsForScope(tab.url, scope),
        isLocalFileUrl(tab.url) && import.meta.env.CHROME
          ? browser.extension.isAllowedFileSchemeAccess().catch(() => true)
          : Promise.resolve(true),
      ]);
      if (!cancelled) setCount(annotations.length);
      if (!localFileAccessAllowed) {
        if (!cancelled) setAvailability('file-access-blocked');
        return;
      }

      try {
        const rawResponse: unknown = await browser.tabs.sendMessage(tab.id, {
          type: 'app-notes-get-annotation-mode',
        });
        const response = parseAnnotationModeResponse(rawResponse);
        if (cancelled) return;
        if (!response) {
          setAvailability(isLocalFileUrl(tab.url) ? 'file-reload-required' : 'unsupported');
          return;
        }
        setActive(response.active);
        setAvailability('ready');
      } catch {
        if (!cancelled) {
          setAvailability(isLocalFileUrl(tab.url) ? 'file-reload-required' : 'unsupported');
        }
      }
    };

    const handleStorageChange = (
      changes: Record<string, { readonly newValue?: unknown }>,
      areaName: string,
    ) => {
      const identity = collectionIdentityRef.current;
      if (areaName !== 'local' || identity === null) return;
      if (!Object.keys(changes).some((key) => collectionContainsStorageKey(identity, key))) return;

      const generation = ++countGenerationRef.current;
      const scope = resolveAnnotationScope(currentUrlRef.current);
      getAnnotationsForScope(currentUrlRef.current, scope)
        .then((annotations) => {
          if (!cancelled && generation === countGenerationRef.current) {
            setCount(annotations.length);
          }
        })
        .catch(() => {
          if (!cancelled) setStatus('Couldn’t refresh notes.');
        });
    };

    loadPopupState().catch(() => setAvailability('unsupported'));
    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const toggleMode = async () => {
    if (tabId === null || availability !== 'ready' || isToggling) return;
    setIsToggling(true);
    setStatus('');

    try {
      const rawResponse: unknown = await browser.tabs.sendMessage(tabId, {
        type: 'app-notes-toggle-annotation-mode',
      });
      const response = parseAnnotationModeResponse(rawResponse);
      if (!response) {
        setStatus('Couldn’t update annotation mode.');
        return;
      }
      setActive(response.active);
    } catch {
      setAvailability(isLocalFileUrl(currentUrl) ? 'file-reload-required' : 'unsupported');
    } finally {
      setIsToggling(false);
    }
  };

  const handleAllowLocalFiles = async () => {
    if (tabId === null || isToggling) return;
    setIsToggling(true);
    setStatus('');

    try {
      const rawResponse: unknown = await browser.runtime.sendMessage({
        type: 'app-notes-open-local-file-settings',
        tabId,
      });
      const response = parseOpenLocalFileSettingsResult(rawResponse);
      if (response?._tag !== 'opened') {
        setStatus('Open App Notes settings and allow access to file URLs.');
      }
    } catch {
      setStatus('Open App Notes settings and allow access to file URLs.');
    } finally {
      setIsToggling(false);
    }
  };

  const handleReloadLocalFile = async () => {
    if (tabId === null || isToggling) return;
    setIsToggling(true);
    try {
      await browser.tabs.reload(tabId);
      window.close();
    } catch {
      setStatus('Reload this file, then open App Notes again.');
      setIsToggling(false);
    }
  };

  const handleOpenNotes = async () => {
    try {
      await openNotesWorkspace({
        tabId: tabId ?? undefined,
        windowId: -2,
      });
    } catch {
      setStatus('Couldn’t open notes.');
    }
  };

  const handleCopy = async () => {
    try {
      const scope = resolveAnnotationScope(currentUrl);
      const markdown = await exportAnnotationsForScope(currentUrl, scope);
      await navigator.clipboard.writeText(markdown);
      setStatus(isLocalFileUrl(currentUrl) ? 'File notes copied.' : 'All site notes copied.');
    } catch {
      setStatus('Couldn’t copy notes.');
    }
  };

  const handleClear = async () => {
    const localFile = isLocalFileUrl(currentUrl);
    if (!confirm(localFile ? 'Remove all notes from this file?' : 'Remove all notes from this site?')) {
      return;
    }

    try {
      const scope = resolveAnnotationScope(currentUrl);
      const result = await clearAnnotationsForScope(currentUrl, scope);
      const cleared = scope === 'page' ? result._tag === 'cleared' : result._tag === 'site-cleared';
      if (!cleared) {
        setStatus('Couldn’t clear notes.');
        return;
      }
      setCount(0);
      setStatus(localFile ? 'File notes cleared.' : 'Site notes cleared.');
    } catch {
      setStatus('Couldn’t clear notes.');
    }
  };

  const localFile = isLocalFileUrl(currentUrl);
  const copySuccess = localFile ? 'File notes copied.' : 'All site notes copied.';
  const defaultFooter = (() => {
    switch (availability) {
      case 'checking':
        return 'Checking this page…';
      case 'file-access-blocked':
        return 'Chrome needs one approval to open local files.';
      case 'file-reload-required':
        return 'Reload this file to finish enabling App Notes.';
      case 'unsupported':
        return 'App Notes isn’t available on this page.';
      case 'ready':
        return <>Press <Kbd keys={['Esc']} /> to leave annotation mode.</>;
    }
  })();

  const primaryItem = availability === 'file-access-blocked'
    ? {
        icon: <FolderOpen size={15} />,
        label: 'Allow local files',
        onClick: handleAllowLocalFiles,
      }
    : availability === 'file-reload-required'
      ? {
          icon: <RotateCw size={15} />,
          label: 'Reload local file',
          onClick: handleReloadLocalFile,
        }
      : {
          icon: active ? <Check size={15} /> : <Power size={15} />,
          label: active ? 'Annotations enabled' : 'Enable annotations',
          onClick: toggleMode,
        };

  return (
    <main className="p-2" aria-label="App Notes controls">
      <header className="mb-1 flex items-center justify-between px-2 py-1.5">
        <div>
          <h1 className="text-[13px] font-semibold tracking-[-0.01em] text-text-primary">App Notes</h1>
          <p className="mt-0.5 text-[10px] text-text-tertiary">
            {localFile ? 'Notes for this file' : 'Notes for this site'}
          </p>
        </div>
        <span
          className="app-notes-count inline-flex h-6 items-center justify-center rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent"
          aria-label={`${count} ${count === 1 ? 'note' : 'notes'}`}
        >
          {count}
        </span>
      </header>

      <div className="flex flex-col gap-0.5">
        <MenuItem
          icon={primaryItem.icon}
          label={primaryItem.label}
          shortcut={availability === 'ready' ? toggleShortcut : undefined}
          onClick={primaryItem.onClick}
          active={availability === 'ready' && active}
          ariaPressed={availability === 'ready' ? active : undefined}
          disabled={
            tabId === null
            || availability === 'checking'
            || availability === 'unsupported'
            || isToggling
          }
        />
        <MenuItem
          icon={<PanelRight size={15} />}
          label="Open notes"
          shortcut={panelShortcut}
          onClick={() => handleOpenNotes()}
        />
        <MenuItem
          icon={status === copySuccess ? <Check size={15} /> : <Copy size={15} />}
          label={status === copySuccess
            ? localFile ? 'Copied file notes' : 'Copied site notes'
            : localFile ? 'Copy file notes' : 'Copy all site notes'}
          onClick={handleCopy}
          disabled={count === 0}
        />

        <div className="my-1 h-px bg-border-subtle" />

        <MenuItem
          icon={<Trash2 size={15} />}
          label={localFile ? 'Clear file notes' : 'Clear site notes'}
          onClick={handleClear}
          danger
          disabled={count === 0}
        />
      </div>

      <footer className="mt-1 min-h-8 border-t border-border-subtle px-2 pt-2 text-[10px] leading-4 text-text-tertiary">
        <span role="status" aria-live="polite">
          {status || defaultFooter}
        </span>
      </footer>
    </main>
  );
}

interface MenuItemProps {
  readonly active?: boolean;
  readonly ariaPressed?: boolean;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void | Promise<void>;
  readonly shortcut?: ReadonlyArray<string>;
}

function MenuItem({
  active = false,
  ariaPressed,
  danger = false,
  disabled = false,
  icon,
  label,
  onClick,
  shortcut,
}: MenuItemProps) {
  return (
    <button
      type="button"
      aria-pressed={ariaPressed}
      onClick={onClick}
      disabled={disabled}
      className={`app-notes-pressable app-notes-touch-target flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-[background-color,color,transform] duration-150 disabled:cursor-not-allowed disabled:text-text-tertiary ${
        active
          ? 'bg-accent-soft text-accent'
          : danger
            ? 'text-danger hover:bg-danger-soft'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      <span aria-hidden="true" className="grid h-5 w-5 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      {shortcut && <Kbd keys={shortcut} />}
    </button>
  );
}

function Kbd({ keys }: { readonly keys: ReadonlyArray<string> }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {keys.map((key) => (
        <kbd
          key={key}
          className="min-w-[18px] rounded-[5px] bg-surface-2 px-1 py-1 text-center font-mono text-[9px] leading-none text-text-secondary shadow-[inset_0_0_0_1px_var(--color-field-border),inset_0_-1px_0_var(--color-border-subtle)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export default App;
