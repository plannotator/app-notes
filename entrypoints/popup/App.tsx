import { useEffect, useRef, useState } from 'react';
import { Check, Copy, PanelRight, Power, Trash2 } from 'lucide-react';
import { getAnnotationStoragePrefixForUrl } from '@/lib/page';
import {
  clearSiteAnnotations,
  exportSiteAnnotations,
  getSiteAnnotations,
} from '@/lib/storage';
import type { AnnotationStoragePrefix } from '@/lib/page';

interface AnnotationModeResponse {
  readonly active: boolean;
}

function parseAnnotationModeResponse(value: unknown): AnnotationModeResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const active = Reflect.get(value, 'active');
  return typeof active === 'boolean' ? { active } : null;
}

function App() {
  const [active, setActive] = useState(false);
  const [count, setCount] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const [tabId, setTabId] = useState<number | null>(null);
  const [modeAvailable, setModeAvailable] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [status, setStatus] = useState('');
  const storagePrefixRef = useRef<AnnotationStoragePrefix | null>(null);
  const currentUrlRef = useRef('');
  const countGenerationRef = useRef(0);
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const toggleShortcut = isMac ? ['⌘', '⇧', 'X'] : ['Ctrl', '⇧', 'X'];
  const panelShortcut = isMac ? ['⌘', '⇧', 'U'] : ['Ctrl', '⇧', 'U'];

  useEffect(() => {
    let cancelled = false;

    const loadPopupState = async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (cancelled || tab?.id === undefined || !tab.url) return;

      setTabId(tab.id);
      setCurrentUrl(tab.url);
      currentUrlRef.current = tab.url;
      storagePrefixRef.current = getAnnotationStoragePrefixForUrl(tab.url);

      if (storagePrefixRef.current === null) {
        setStatus('App Notes isn’t available on this page.');
        return;
      }

      const annotations = await getSiteAnnotations(tab.url);
      if (!cancelled) setCount(annotations.length);

      try {
        const rawResponse: unknown = await browser.tabs.sendMessage(tab.id, {
          type: 'app-notes-get-annotation-mode',
        });
        const response = parseAnnotationModeResponse(rawResponse);
        if (!cancelled && response) {
          setActive(response.active);
          setModeAvailable(true);
        }
      } catch {
        if (!cancelled) setStatus('App Notes isn’t available on this page.');
      }
    };

    const handleStorageChange = (
      changes: Record<string, { readonly newValue?: unknown }>,
      areaName: string,
    ) => {
      const storagePrefix = storagePrefixRef.current;
      if (areaName !== 'local' || storagePrefix === null) return;
      if (!Object.keys(changes).some((key) => key.startsWith(storagePrefix))) return;

      const generation = ++countGenerationRef.current;
      getSiteAnnotations(currentUrlRef.current)
        .then((annotations) => {
          if (!cancelled && generation === countGenerationRef.current) {
            setCount(annotations.length);
          }
        })
        .catch(() => {
          if (!cancelled) setStatus('Couldn’t refresh site notes.');
        });
    };

    loadPopupState().catch(() => setStatus('App Notes isn’t available on this page.'));
    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const toggleMode = async () => {
    if (tabId === null || !modeAvailable || isToggling) return;
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
      setStatus('App Notes isn’t available on this page.');
    } finally {
      setIsToggling(false);
    }
  };

  const openSidePanel = () => {
    browser.sidePanel?.open({ windowId: -2 }).catch(() => {
      setStatus('Couldn’t open the side panel.');
    });
  };

  const handleCopy = async () => {
    try {
      const markdown = await exportSiteAnnotations(currentUrl);
      await navigator.clipboard.writeText(markdown);
      setStatus('All site notes copied.');
    } catch {
      setStatus('Couldn’t copy notes.');
    }
  };

  const handleClear = async () => {
    if (!confirm('Remove all notes from this site?')) return;

    try {
      const result = await clearSiteAnnotations(currentUrl);
      if (result._tag !== 'site-cleared') {
        setStatus('Couldn’t clear notes.');
        return;
      }
      setCount(0);
      setStatus('Site notes cleared.');
    } catch {
      setStatus('Couldn’t clear notes.');
    }
  };

  return (
    <main className="p-2" aria-label="App Notes controls">
      <header className="mb-1 flex items-center justify-between px-2 py-1.5">
        <div>
          <h1 className="text-[13px] font-semibold tracking-[-0.01em] text-text-primary">App Notes</h1>
          <p className="mt-0.5 text-[10px] text-text-tertiary">Notes for this site</p>
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
          icon={active ? <Check size={15} /> : <Power size={15} />}
          label={active ? 'Annotations enabled' : 'Enable annotations'}
          shortcut={toggleShortcut}
          onClick={toggleMode}
          active={active}
          ariaPressed={active}
          disabled={tabId === null || !modeAvailable || isToggling}
        />
        <MenuItem
          icon={<PanelRight size={15} />}
          label="Open side panel"
          shortcut={panelShortcut}
          onClick={openSidePanel}
        />
        <MenuItem
          icon={status === 'All site notes copied.' ? <Check size={15} /> : <Copy size={15} />}
          label={status === 'All site notes copied.' ? 'Copied site notes' : 'Copy all site notes'}
          onClick={handleCopy}
          disabled={count === 0}
        />

        <div className="my-1 h-px bg-border-subtle" />

        <MenuItem
          icon={<Trash2 size={15} />}
          label="Clear site notes"
          onClick={handleClear}
          danger
          disabled={count === 0}
        />
      </div>

      <footer className="mt-1 min-h-8 border-t border-border-subtle px-2 pt-2 text-[10px] leading-4 text-text-tertiary">
        <span role="status" aria-live="polite">
          {status || <>Press <Kbd keys={['Esc']} /> to leave annotation mode.</>}
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
            ? 'text-danger hover:bg-red-50'
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
          className="min-w-[18px] rounded-[5px] bg-surface-2 px-1 py-1 text-center font-mono text-[9px] leading-none text-text-secondary shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08),inset_0_-1px_0_rgba(15,23,42,0.08)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export default App;
