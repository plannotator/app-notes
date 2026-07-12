import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Download,
  Files,
  ImageIcon,
  Library,
  MessageSquare,
  MousePointer2,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  getAnnotationStoragePrefixForUrl,
  getPageDisplayLabel,
  getSiteDisplayLabel,
  parseSiteId,
} from '@/lib/page';
import {
  clearSiteAnnotations,
  deleteAnnotation,
  exportSiteAnnotations,
  getAllAnnotations,
  getSiteAnnotations,
  groupAnnotationsByPage,
  updateAnnotation,
} from '@/lib/storage';
import { browserScreenshotStore } from '@/lib/screenshot-store';
import { createSiteExportArchive } from '@/lib/site-export';
import type { Annotation } from '@/lib/types';
import type { AnnotationStoragePrefix } from '@/lib/page';

interface PanelSite {
  readonly annotations: ReadonlyArray<Annotation>;
  readonly href: string;
  readonly storagePrefix: AnnotationStoragePrefix | null;
  readonly tabId: number;
}

type PanelView = 'site' | 'all';

interface WorkspaceLaunch {
  readonly sourceTabId: number | null;
  readonly view: PanelView;
}

function getWorkspaceLaunch(): WorkspaceLaunch {
  const search = new URLSearchParams(window.location.search);
  const rawTabId = search.get('tabId');
  const sourceTabId = rawTabId === null ? null : Number(rawTabId);
  const hasSourceTab = sourceTabId !== null
    && Number.isInteger(sourceTabId)
    && sourceTabId >= 0;

  return {
    sourceTabId: hasSourceTab ? sourceTabId : null,
    view: search.get('view') === 'all' ? 'all' : 'site',
  };
}

function sortNewestFirst(annotations: ReadonlyArray<Annotation>): ReadonlyArray<Annotation> {
  return [...annotations].sort((left, right) => right.updatedAt - left.updatedAt);
}

/** The current-website management surface for every saved note across its pages. */
export function SidePanelApp() {
  const [launch] = useState(getWorkspaceLaunch);
  const [site, setSite] = useState<PanelSite | null>(null);
  const [view, setView] = useState<PanelView>(launch.view);
  const [allAnnotations, setAllAnnotations] = useState<ReadonlyArray<Annotation> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const siteRef = useRef<PanelSite | null>(null);
  const viewRef = useRef<PanelView>(launch.view);
  const loadGenerationRef = useRef(0);
  const allLoadGenerationRef = useRef(0);
  const activeTabRequestRef = useRef(0);
  const editSessionRef = useRef(0);
  const copiedTimerRef = useRef<number | null>(null);

  const cancelEditing = useCallback(() => {
    ++editSessionRef.current;
    setEditingId(null);
    setEditText('');
  }, []);

  const commitSite = useCallback((next: PanelSite) => {
    siteRef.current = next;
    setSite(next);
  }, []);

  const showSiteView = useCallback(() => {
    viewRef.current = 'site';
    setView('site');
    setStatus('');
  }, []);

  const refreshAllAnnotations = useCallback(async () => {
    const generation = ++allLoadGenerationRef.current;
    try {
      const annotations = await getAllAnnotations();
      if (generation !== allLoadGenerationRef.current || viewRef.current !== 'all') return;
      setAllAnnotations(sortNewestFirst(annotations));
    } catch {
      if (generation === allLoadGenerationRef.current && viewRef.current === 'all') {
        setStatus('Couldn’t load all notes.');
      }
    }
  }, []);

  const showAllView = useCallback(() => {
    viewRef.current = 'all';
    setView('all');
    cancelEditing();
    setStatus('');
    refreshAllAnnotations().catch(() => undefined);
  }, [cancelEditing, refreshAllAnnotations]);

  const loadSite = useCallback(async (tabId: number, href: string) => {
    const storagePrefix = getAnnotationStoragePrefixForUrl(href);
    const currentSite = siteRef.current;
    if (currentSite?.storagePrefix === storagePrefix) {
      if (currentSite.href !== href || currentSite.tabId !== tabId) {
        commitSite({ ...currentSite, href, tabId });
      }
      return;
    }

    const generation = ++loadGenerationRef.current;
    const loadingSite: PanelSite = { tabId, href, storagePrefix, annotations: [] };
    commitSite(loadingSite);
    cancelEditing();
    setStatus('');

    if (storagePrefix === null) return;

    try {
      const annotations = await getSiteAnnotations(href);
      const current = siteRef.current;
      if (
        generation !== loadGenerationRef.current
        || current?.storagePrefix !== storagePrefix
      ) return;

      commitSite({ ...current, annotations: sortNewestFirst(annotations) });
    } catch {
      if (generation === loadGenerationRef.current) {
        setStatus('Couldn’t load notes for this site.');
      }
    }
  }, [cancelEditing, commitSite]);

  const loadActiveTab = useCallback(async () => {
    const request = ++activeTabRequestRef.current;
    const tab = launch.sourceTabId === null
      ? (await browser.tabs.query({ active: true, currentWindow: true }))[0]
      : await browser.tabs.get(launch.sourceTabId);
    if (request !== activeTabRequestRef.current || tab?.id === undefined || !tab.url) return;
    await loadSite(tab.id, tab.url);
  }, [launch.sourceTabId, loadSite]);

  useEffect(() => {
    const handleActivated = () => {
      if (launch.sourceTabId !== null) return;
      loadActiveTab().catch(() => setStatus('Couldn’t load the active page.'));
    };

    const handleUpdated = (
      tabId: number,
      changeInfo: { readonly status?: string; readonly url?: string },
      tab: { readonly url?: string },
    ) => {
      if (siteRef.current?.tabId !== tabId) return;
      const nextUrl = changeInfo.url ?? (changeInfo.status === 'complete' ? tab.url : undefined);
      if (nextUrl) loadSite(tabId, nextUrl).catch(() => undefined);
    };

    const handleHistoryNavigation = (details: {
      readonly frameId: number;
      readonly tabId: number;
      readonly url: string;
    }) => {
      if (details.frameId !== 0 || siteRef.current?.tabId !== details.tabId) return;
      loadSite(details.tabId, details.url).catch(() => undefined);
    };

    const handleStorageChange = (
      changes: Record<string, { readonly newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      const annotationKeys = Object.keys(changes).filter((key) => key.startsWith('annotations:'));
      if (annotationKeys.length === 0) return;

      if (viewRef.current === 'all') {
        refreshAllAnnotations().catch(() => undefined);
      }

      const current = siteRef.current;
      const currentStoragePrefix = current?.storagePrefix;
      if (!current || !currentStoragePrefix) return;
      if (!annotationKeys.some((key) => key.startsWith(currentStoragePrefix))) return;

      const generation = ++loadGenerationRef.current;
      getSiteAnnotations(current.href)
        .then((annotations) => {
          const latest = siteRef.current;
          if (
            generation !== loadGenerationRef.current
            || latest?.storagePrefix !== current.storagePrefix
          ) return;
          commitSite({ ...latest, annotations: sortNewestFirst(annotations) });
        })
        .catch(() => {
          if (siteRef.current?.storagePrefix === current.storagePrefix) {
            setStatus('Couldn’t refresh notes for this site.');
          }
        });
    };

    loadActiveTab().catch(() => setStatus('Couldn’t load the active page.'));
    if (viewRef.current === 'all') {
      refreshAllAnnotations().catch(() => setStatus('Couldn’t load all notes.'));
    }
    browser.tabs.onActivated.addListener(handleActivated);
    browser.tabs.onUpdated.addListener(handleUpdated);
    browser.webNavigation.onHistoryStateUpdated.addListener(handleHistoryNavigation);
    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browser.tabs.onActivated.removeListener(handleActivated);
      browser.tabs.onUpdated.removeListener(handleUpdated);
      browser.webNavigation.onHistoryStateUpdated.removeListener(handleHistoryNavigation);
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [commitSite, launch.sourceTabId, loadActiveTab, loadSite, refreshAllAnnotations]);

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const handleDelete = async (annotation: Annotation) => {
    if (!siteRef.current) return;

    const result = await deleteAnnotation(annotation.url, annotation.id);
    if (result._tag !== 'deleted') {
      setStatus('Couldn’t delete that note.');
      return;
    }
    if (!result.deleted) {
      setStatus('That note was already removed.');
      return;
    }

  };

  const handleEdit = (annotation: Annotation) => {
    ++editSessionRef.current;
    setEditingId(annotation.id);
    setEditText(annotation.note);
    setStatus('');
  };

  const handleSaveEdit = async () => {
    const currentSite = siteRef.current;
    const note = editText.trim();
    if (!currentSite || !editingId || !note) return;
    const annotation = currentSite.annotations.find(({ id }) => id === editingId);
    if (!annotation) return;

    const editSession = editSessionRef.current;
    const annotationId = editingId;
    const result = await updateAnnotation(annotation.url, annotationId, { note });
    if (editSessionRef.current !== editSession) return;
    if (result._tag !== 'updated' || result.annotation === null) {
      setStatus('Couldn’t update that note.');
      return;
    }

    ++editSessionRef.current;
    setEditingId(null);
    setEditText('');
  };

  const handleCopyAll = async () => {
    const currentSite = siteRef.current;
    if (!currentSite) return;

    try {
      const markdown = await exportSiteAnnotations(currentSite.href);
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      const screenshotCount = currentSite.annotations.filter(
        (annotation) => annotation.screenshot !== undefined,
      ).length;
      setStatus(screenshotCount === 0
        ? 'All site notes copied.'
        : 'Text copied. Export includes screenshots.');
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus('Couldn’t copy notes.');
    }
  };

  const handleExport = async () => {
    const currentSite = siteRef.current;
    if (!currentSite) return;

    try {
      const hasScreenshots = currentSite.annotations.some(
        (annotation) => annotation.screenshot !== undefined,
      );
      if (hasScreenshots) {
        const archive = await createSiteExportArchive(
          currentSite.href,
          currentSite.annotations,
          browserScreenshotStore,
        );
        downloadBlob(archive.blob, getExportFilename(currentSite.href, 'zip'));
        setStatus(archive.missingScreenshots === 0
          ? `${archive.includedScreenshots} ${archive.includedScreenshots === 1 ? 'screenshot' : 'screenshots'} exported with notes.`
          : 'Exported notes; one or more screenshots were unavailable.');
        return;
      }

      const markdown = await exportSiteAnnotations(currentSite.href);
      downloadBlob(
        new Blob([markdown], { type: 'text/markdown' }),
        getExportFilename(currentSite.href, 'md'),
      );
      setStatus('Markdown exported.');
    } catch {
      setStatus('Couldn’t export notes.');
    }
  };

  const handleClearAll = async () => {
    const currentSite = siteRef.current;
    if (!currentSite || !confirm('Remove all notes from this site?')) return;

    const result = await clearSiteAnnotations(currentSite.href);
    if (result._tag !== 'site-cleared') {
      setStatus('Couldn’t clear site notes.');
      return;
    }

    const latestSite = siteRef.current;
    if (
      latestSite?.storagePrefix === currentSite.storagePrefix
    ) {
      commitSite({ ...latestSite, annotations: [] });
      cancelEditing();
      setStatus('Site notes cleared.');
    }
  };

  const handleOpenAnnotation = async (annotation: Annotation) => {
    const currentSite = siteRef.current;
    if (!currentSite) return;

    try {
      if (currentSite.href !== annotation.url) {
        await browser.tabs.update(currentSite.tabId, { active: true, url: annotation.url });
      } else if (launch.sourceTabId !== null) {
        await browser.tabs.update(currentSite.tabId, { active: true });
      }
      await loadSite(currentSite.tabId, annotation.url);
      showSiteView();
    } catch {
      setStatus('Couldn’t open that note’s page.');
    }
  };

  const annotations = site?.annotations ?? [];
  const groups = buildPanelGroups(annotations);
  const globalAnnotations = allAnnotations ?? [];
  const pageUnavailable = site !== null && site.storagePrefix === null;
  const domain = site ? getSiteDisplayLabel(site.href) ?? 'Current site' : 'Current site';

  return (
    <main className="flex h-screen flex-col bg-surface">
      {view === 'all' ? (
        <header className="border-b border-border-subtle px-3 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Back to current site notes"
              title="Back to current site"
              onClick={showSiteView}
              className="app-notes-pressable app-notes-touch-target grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-secondary transition-[background-color,color,transform] hover:bg-surface-hover hover:text-text-primary"
            >
              <ArrowLeft aria-hidden="true" size={15} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold tracking-[-0.012em] text-text-primary">All notes</h1>
              <p className="mt-0.5 truncate text-xs text-text-secondary">Across every site</p>
            </div>
            {allAnnotations !== null && (
              <span
                className="app-notes-count inline-flex h-6 items-center justify-center rounded-full bg-surface-2 px-2 text-xs font-semibold text-text-secondary"
                aria-label={`${globalAnnotations.length} ${globalAnnotations.length === 1 ? 'note' : 'notes'}`}
              >
                {globalAnnotations.length}
              </span>
            )}
          </div>
        </header>
      ) : (
        <header className="border-b border-border-subtle px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold tracking-[-0.012em] text-text-primary">App Notes</h1>
              <p className="mt-0.5 truncate text-xs text-text-secondary">{domain} · all pages</p>
            </div>
            <button
              type="button"
              onClick={showAllView}
              className="app-notes-pressable app-notes-touch-target inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-text-secondary transition-[background-color,color,transform] hover:bg-surface-hover hover:text-text-primary"
            >
              <Library aria-hidden="true" size={13} />
              <span>All notes</span>
            </button>
            <span
              className="app-notes-count inline-flex h-6 items-center justify-center rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent"
              aria-label={`${annotations.length} ${annotations.length === 1 ? 'note' : 'notes'}`}
            >
              {annotations.length}
            </span>
          </div>
        </header>
      )}

      {view === 'all' ? (
        <AllNotesPage
          annotations={allAnnotations}
          onOpenAnnotation={handleOpenAnnotation}
        />
      ) : (
        <section className="min-h-0 flex-1 overflow-y-auto" aria-label="Site notes">
        {annotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-7 py-16 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
              <MousePointer2 aria-hidden="true" size={20} strokeWidth={2} />
            </span>
            <h2 className="text-sm font-medium text-text-primary">
              {pageUnavailable ? 'Page unavailable' : 'No notes on this site'}
            </h2>
            <p className="mt-1 max-w-[240px] text-xs leading-5 text-text-secondary">
              {pageUnavailable
                ? 'App Notes works on web pages and local files with browser access enabled.'
                : 'Annotate any page on this site and every note will collect here.'}
            </p>
          </div>
        ) : (
          <div>
            {groups.map((group) => (
              <section key={group.pageId} aria-labelledby={`page-${group.id}`}>
                <div className="app-notes-page-heading flex items-center gap-2 border-b border-border-subtle bg-surface-2 px-4 py-2.5">
                  <Files aria-hidden="true" className="shrink-0 text-text-tertiary" size={13} />
                  <h2
                    id={`page-${group.id}`}
                    className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-text-secondary"
                    title={group.pageId}
                  >
                    {group.label}
                  </h2>
                  <span
                    className="app-notes-page-count text-[10px] text-text-tertiary"
                    aria-label={`${group.annotations.length} ${group.annotations.length === 1 ? 'note' : 'notes'} on this page`}
                  >
                    {group.annotations.length}
                  </span>
                </div>
                <div className="divide-y divide-border-subtle">
                  {group.annotations.map((annotation) => (
                    <AnnotationCard
                      key={annotation.id}
                      annotation={annotation}
                      isEditing={editingId === annotation.id}
                      editText={editText}
                      onEditTextChange={setEditText}
                      onEdit={() => handleEdit(annotation)}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={cancelEditing}
                      onDelete={() => handleDelete(annotation)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        </section>
      )}

      {view === 'site' && annotations.length > 0 && (
        <footer className="border-t border-border-subtle bg-surface px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <FooterButton onClick={handleCopyAll} icon={copied ? <Check size={14} /> : <Copy size={14} />}>
              {copied ? 'Copied' : 'Copy all'}
            </FooterButton>
            <FooterButton onClick={handleExport} icon={<Download size={14} />}>
              Export
            </FooterButton>
          </div>
          <button
            type="button"
            onClick={handleClearAll}
            className="app-notes-pressable app-notes-touch-target mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-danger transition-[background-color,transform] hover:bg-danger-soft"
          >
            <Trash2 aria-hidden="true" size={13} />
            <span>Clear site notes</span>
          </button>
        </footer>
      )}

      <p
        className={`shrink-0 overflow-hidden px-4 text-center text-[10px] leading-4 text-text-tertiary ${
          status ? 'min-h-7 border-t border-border-subtle py-1.5' : 'h-0'
        }`}
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
    </main>
  );
}

interface AllNotesPageProps {
  readonly annotations: ReadonlyArray<Annotation> | null;
  readonly onOpenAnnotation: (annotation: Annotation) => void | Promise<void>;
}

function AllNotesPage({ annotations, onOpenAnnotation }: AllNotesPageProps) {
  if (annotations === null) {
    return (
      <section
        className="flex min-h-0 flex-1 items-center justify-center px-6 text-xs text-text-tertiary"
        aria-label="All notes"
      >
        Loading notes…
      </section>
    );
  }

  if (annotations.length === 0) {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col items-center justify-center px-7 text-center"
        aria-label="All notes"
      >
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-text-secondary">
          <Library aria-hidden="true" size={19} strokeWidth={2} />
        </span>
        <h2 className="text-sm font-medium text-text-primary">No notes yet</h2>
        <p className="mt-1 max-w-[240px] text-xs leading-5 text-text-secondary">
          Notes from every site will collect here.
        </p>
      </section>
    );
  }

  const groups = buildGlobalGroups(annotations);
  return (
    <section className="min-h-0 flex-1 overflow-y-auto" aria-label="All notes">
      {groups.map((group) => (
        <section key={group.siteId} aria-labelledby={`site-${group.id}`}>
          <div className="app-notes-global-site-heading flex items-center gap-2 border-b border-border-subtle bg-surface-2 px-4 py-2">
            <h2
              id={`site-${group.id}`}
              className="min-w-0 flex-1 truncate text-[11px] font-semibold text-text-secondary"
              title={group.siteId}
            >
              {group.label}
            </h2>
            <span
              className="app-notes-page-count text-[10px] text-text-tertiary"
              aria-label={`${group.annotations.length} ${group.annotations.length === 1 ? 'note' : 'notes'} on this site`}
            >
              {group.annotations.length}
            </span>
          </div>
          <div className="divide-y divide-border-subtle">
            {group.annotations.map((annotation) => (
              <button
                key={annotation.id}
                type="button"
                title={annotation.url}
                onClick={() => onOpenAnnotation(annotation)}
                className="app-notes-global-row app-notes-pressable app-notes-touch-target flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-[background-color,transform]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] leading-4 text-text-tertiary">
                    {annotation.screenshot !== undefined && (
                      <ImageIcon aria-hidden="true" className="shrink-0" size={11} />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {getAnnotationPageLabel(annotation)}
                    </span>
                    <span className="shrink-0">{getRelativeTime(annotation.updatedAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs leading-5 text-text-primary">
                    {getAnnotationSummary(annotation)}
                  </p>
                </div>
                <ChevronRight aria-hidden="true" className="shrink-0 text-text-tertiary" size={14} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

interface AnnotationCardProps {
  readonly annotation: Annotation;
  readonly editText: string;
  readonly isEditing: boolean;
  readonly onCancelEdit: () => void;
  readonly onDelete: () => void | Promise<void>;
  readonly onEdit: () => void;
  readonly onEditTextChange: (text: string) => void;
  readonly onSaveEdit: () => void | Promise<void>;
}

function AnnotationCard({
  annotation,
  editText,
  isEditing,
  onCancelEdit,
  onDelete,
  onEdit,
  onEditTextChange,
  onSaveEdit,
}: AnnotationCardProps) {
  const timeAgo = getRelativeTime(annotation.createdAt);

  return (
    <article className="group px-4 py-3.5 transition-colors hover:bg-surface-hover">
      <div className="flex min-h-8 items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 pt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
          {annotation.screenshot === undefined ? (
            <MessageSquare aria-hidden="true" size={11} strokeWidth={2.2} />
          ) : (
            <ImageIcon aria-hidden="true" size={11} strokeWidth={2.2} />
          )}
          <span>{annotation.screenshot === undefined ? 'Note' : 'Screenshot note'}</span>
        </div>
        <div className="app-notes-card-actions flex items-center gap-0.5 transition-opacity">
          <button
            type="button"
            aria-label={`Edit note on ${annotation.anchor.label}`}
            onClick={onEdit}
            className="app-notes-pressable app-notes-touch-target grid h-8 w-8 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <Pencil aria-hidden="true" size={13} />
          </button>
          <button
            type="button"
            aria-label={`Delete note on ${annotation.anchor.label}`}
            onClick={onDelete}
            className="app-notes-pressable app-notes-touch-target grid h-8 w-8 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 aria-hidden="true" size={13} />
          </button>
        </div>
      </div>

      <p
        className="mt-1 truncate text-xs leading-5 text-text-secondary"
        title={annotation.anchor.text ?? annotation.anchor.label}
      >
        {annotation.anchor.text ?? annotation.anchor.label}
      </p>
      <p className="truncate font-mono text-[10px] leading-4 text-text-tertiary" title={annotation.anchor.selector}>
        {annotation.anchor.selector}
      </p>

      {annotation.screenshot !== undefined && (
        <AnnotationScreenshotPreview annotation={annotation} />
      )}

      {isEditing ? (
        <div className="mt-2.5">
          <label className="sr-only" htmlFor={`edit-note-${annotation.id}`}>Edit note</label>
          <textarea
            id={`edit-note-${annotation.id}`}
            aria-keyshortcuts="Meta+Enter Control+Enter Escape"
            value={editText}
            onChange={(event) => onEditTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onSaveEdit();
              }
              if (event.key === 'Escape') onCancelEdit();
            }}
            className="mt-1 min-h-20 w-full resize-y rounded-lg bg-surface p-2.5 text-sm leading-5 text-text-primary shadow-[inset_0_0_0_1px_var(--color-field-border)]"
            rows={3}
            autoFocus
          />
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={editText.trim().length === 0}
              className="app-notes-pressable app-notes-touch-target min-h-8 rounded-lg bg-accent-solid px-3 text-[11px] font-semibold text-white transition-[background-color,transform] hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:bg-control-disabled"
            >
              Save note
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="app-notes-pressable app-notes-touch-target min-h-8 rounded-lg px-3 text-[11px] font-medium text-text-secondary transition-[background-color,color,transform] hover:bg-surface-2 hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-text-primary">
          {annotation.note}
        </p>
      )}

      <p className="mt-2 text-[10px] leading-4 text-text-tertiary">{timeAgo}</p>
    </article>
  );
}

function AnnotationScreenshotPreview({ annotation }: { readonly annotation: Annotation }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const screenshot = annotation.screenshot;

  useEffect(() => {
    if (screenshot === undefined) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setImageUrl(null);
    setUnavailable(false);

    browserScreenshotStore.get(screenshot.id)
      .then((blob) => {
        if (cancelled) return;
        if (blob === null) {
          setUnavailable(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [screenshot]);

  if (screenshot === undefined) return null;
  if (unavailable) {
    return (
      <p className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-text-tertiary">
        Screenshot unavailable
      </p>
    );
  }

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg bg-surface-2 shadow-[inset_0_0_0_1px_var(--color-border-subtle)]">
      {imageUrl === null ? (
        <div className="h-36 animate-pulse" aria-label="Loading screenshot" />
      ) : (
        <img
          src={imageUrl}
          alt={`Screenshot of ${annotation.anchor.text ?? annotation.anchor.label}`}
          width={screenshot.width}
          height={screenshot.height}
          loading="lazy"
          className="block h-36 w-full object-contain"
        />
      )}
    </div>
  );
}

function FooterButton({
  children,
  icon,
  onClick,
}: {
  readonly children: React.ReactNode;
  readonly icon: React.ReactNode;
  readonly onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-notes-pressable app-notes-touch-target flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-surface px-3 text-xs font-medium text-text-secondary shadow-[inset_0_0_0_1px_var(--color-border-subtle)] transition-[background-color,color,transform] hover:bg-surface-hover hover:text-text-primary"
    >
      <span aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

function getRelativeTime(timestamp: number): string {
  const difference = Date.now() - timestamp;
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface PanelPageGroup {
  readonly annotations: ReadonlyArray<Annotation>;
  readonly id: string;
  readonly label: string;
  readonly pageId: string;
}

interface GlobalSiteGroup {
  readonly annotations: ReadonlyArray<Annotation>;
  readonly id: string;
  readonly label: string;
  readonly siteId: string;
}

function buildGlobalGroups(
  annotations: ReadonlyArray<Annotation>,
): ReadonlyArray<GlobalSiteGroup> {
  const groups = new Map<string, { label: string; annotations: Annotation[] }>();
  for (const annotation of annotations) {
    const siteId = parseSiteId(annotation.url);
    const label = getSiteDisplayLabel(annotation.url);
    if (siteId === null || label === null) continue;

    const group = groups.get(siteId) ?? { label, annotations: [] };
    group.annotations.push(annotation);
    groups.set(siteId, group);
  }

  return [...groups.entries()]
    .map(([siteId, group]) => ({
      siteId,
      label: group.label,
      annotations: sortNewestFirst(group.annotations),
      latestUpdate: Math.max(...group.annotations.map(({ updatedAt }) => updatedAt)),
    }))
    .sort((left, right) => right.latestUpdate - left.latestUpdate)
    .map((group, index) => ({
      siteId: group.siteId,
      label: group.label,
      annotations: group.annotations,
      id: String(index),
    }));
}

function buildPanelGroups(
  annotations: ReadonlyArray<Annotation>,
): ReadonlyArray<PanelPageGroup> {
  return groupAnnotationsByPage(annotations)
    .map((group) => ({
      pageId: group.pageId,
      annotations: sortNewestFirst(group.annotations),
      latestUpdate: Math.max(...group.annotations.map(({ updatedAt }) => updatedAt)),
    }))
    .sort((left, right) => right.latestUpdate - left.latestUpdate)
    .map((group, index) => ({
      pageId: group.pageId,
      annotations: group.annotations,
      id: String(index),
      label: getPanelPageLabel(group.pageId, group.annotations),
    }));
}

function getPageLabel(pageId: string): string {
  return getPageDisplayLabel(pageId) ?? pageId;
}

function getAnnotationPageLabel(annotation: Annotation): string {
  const path = getPageLabel(annotation.url);
  if (!annotation.pageTitle) return path;
  return path === 'Home' ? annotation.pageTitle : `${annotation.pageTitle} · ${path}`;
}

function getPanelPageLabel(
  pageId: string,
  annotations: ReadonlyArray<Annotation>,
): string {
  const pageTitle = annotations.find((annotation) => annotation.pageTitle)?.pageTitle;
  return pageTitle ?? getPageLabel(pageId);
}

function getAnnotationSummary(annotation: Annotation): string {
  const selectedText = annotation.anchor.text?.trim();
  if (!selectedText) return annotation.note;
  if (selectedText === annotation.note.trim()) return selectedText;
  return `${selectedText} — ${annotation.note}`;
}

function getExportFilename(url: string, extension: 'md' | 'zip'): string {
  const site = (getSiteDisplayLabel(url) ?? 'site').replace(/[^a-z0-9.-]+/gi, '-');
  return `app-notes-${site}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  queueMicrotask(() => URL.revokeObjectURL(blobUrl));
}
