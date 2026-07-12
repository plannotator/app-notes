import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnnotationMarkers } from './components/AnnotationMarkers';
import { AnnotationPopover } from './components/AnnotationPopover';
import type { DraftExitSource } from './components/AnnotationPopover';
import { ElementHighlight } from './components/ElementHighlight';
import { ExitWarningToast } from './components/ExitWarningToast';
import { OverlayStyles } from './components/OverlayStyles';
import type { ContentEventBridge } from './event-bridge';
import {
  createAnnotationAnchor,
  deepElementFromPoint,
  identifyElement,
  resolveAnnotationAnchor,
} from '@/lib/anchoring';
import { getAnnotationStorageKeyForUrl, getPageDisplayLabel } from '@/lib/page';
import { getAnnotations, saveAnnotation } from '@/lib/storage';
import { parseAnnotations } from '@/lib/types';
import type { Annotation, AnnotationAnchor } from '@/lib/types';
import type { AnnotationStorageKey } from '@/lib/page';
import { captureVisibleElement } from '@/lib/element-capture';
import type { ElementScreenshotDraft } from '@/lib/element-capture';

interface SelectedElement {
  readonly annotationId: string;
  readonly anchor: AnnotationAnchor;
  readonly anchorXRatio: number;
  readonly element: Element;
  readonly label: string;
  readonly pageUrl: string;
  readonly pageTitle: string;
  readonly rect: DOMRect;
  readonly returnFocus: HTMLElement | null;
  readonly storageKey: AnnotationStorageKey | null;
}

interface ExitWarningState {
  readonly discardAction: 'click' | 'escape';
  readonly x: number;
  readonly y: number;
  readonly secondsLeft: number;
}

interface PageContext {
  readonly href: string;
  readonly storageKey: AnnotationStorageKey | null;
}

interface CommittedSelectionGesture {
  readonly expiresAt: number;
  readonly x: number;
  readonly y: number;
}

interface ParkedDraft {
  readonly note: string;
  readonly selection: SelectedElement;
  readonly screenshot: ElementScreenshotDraft | null;
}

interface ContentAppProps {
  readonly eventBridge: ContentEventBridge;
  readonly getShadowHost: () => HTMLElement | null;
}

function createPageContext(href: string): PageContext {
  return { href, storageKey: getAnnotationStorageKeyForUrl(href) };
}

function getCurrentPageTitle(href: string): string {
  const title = document.title.replace(/\s+/g, ' ').trim();
  if (title) return title.slice(0, 160);

  try {
    const parsed = new URL(href);
    const fallback = parsed.hostname || getPageDisplayLabel(href) || 'Untitled page';
    return fallback.slice(0, 160);
  } catch {
    return 'Untitled page';
  }
}

function isRuntimeMessage(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSelectableElement(element: Element | null): element is Element {
  if (!element || !element.isConnected) return false;
  if (element === document.body || element === document.documentElement) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function rectChanged(previous: DOMRect, next: DOMRect): boolean {
  return previous.top !== next.top
    || previous.left !== next.left
    || previous.width !== next.width
    || previous.height !== next.height;
}

/** Owns the page picker, draft lifecycle, and current-page annotation snapshot. */
export function ContentApp({ eventBridge, getShadowHost }: ContentAppProps) {
  const [active, setActive] = useState(false);
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState('');
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [draft, setDraft] = useState('');
  const [screenshot, setScreenshot] = useState<ElementScreenshotDraft | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [annotations, setAnnotations] = useState<ReadonlyArray<Annotation>>([]);
  const [exitWarning, setExitWarning] = useState<ExitWarningState | null>(null);

  const activeRef = useRef(false);
  const selectedRef = useRef<SelectedElement | null>(null);
  const draftRef = useRef('');
  const screenshotRef = useRef<ElementScreenshotDraft | null>(null);
  const isCapturingRef = useRef(false);
  const hoveredElementRef = useRef<Element | null>(null);
  const lastPointerRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const committedSelectionGestureRef = useRef<CommittedSelectionGesture | null>(null);
  const pageRef = useRef<PageContext>(createPageContext(window.location.href));
  const parkedDraftsRef = useRef(new Map<AnnotationStorageKey, ParkedDraft>());
  const loadGenerationRef = useRef(0);
  const layoutFrameRef = useRef<number | null>(null);
  const exitArmedRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);
  const exitCountdownRef = useRef<number | null>(null);

  const clearHover = useCallback(() => {
    hoveredElementRef.current = null;
    setHoveredRect(null);
    setHoveredLabel('');
  }, []);

  const clearExitWarning = useCallback(() => {
    exitArmedRef.current = false;
    setExitWarning(null);

    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (exitCountdownRef.current !== null) {
      window.clearInterval(exitCountdownRef.current);
      exitCountdownRef.current = null;
    }
  }, []);

  const updateDraft = useCallback((note: string) => {
    draftRef.current = note;
    setDraft(note);
  }, []);

  const updateScreenshot = useCallback((next: ElementScreenshotDraft | null) => {
    screenshotRef.current = next;
    setScreenshot(next);
  }, []);

  const closeEditor = useCallback((restoreFocus = true) => {
    const focusTarget = selectedRef.current?.returnFocus ?? null;
    selectedRef.current = null;
    setSelected(null);
    draftRef.current = '';
    setDraft('');
    screenshotRef.current = null;
    setScreenshot(null);
    isCapturingRef.current = false;
    setIsCapturing(false);
    setCaptureError('');
    clearExitWarning();
    clearHover();

    if (restoreFocus && focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true });
    }
  }, [clearExitWarning, clearHover]);

  const setAnnotationMode = useCallback((next: boolean) => {
    activeRef.current = next;
    setActive(next);
    if (!next) closeEditor();
  }, [closeEditor]);

  const requestExitDraft = useCallback((
    x: number,
    y: number,
    discardAction: ExitWarningState['discardAction'],
  ): boolean => {
    if (
      (draftRef.current.trim().length === 0 && screenshotRef.current === null)
      || exitArmedRef.current
    ) {
      closeEditor();
      return true;
    }

    exitArmedRef.current = true;
    const expiresAt = Date.now() + 3000;
    setExitWarning({ discardAction, x, y, secondsLeft: 3 });

    exitCountdownRef.current = window.setInterval(() => {
      const secondsLeft = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      setExitWarning((current) => current ? { ...current, secondsLeft } : null);
    }, 100);
    exitTimerRef.current = window.setTimeout(clearExitWarning, 3000);
    return false;
  }, [clearExitWarning, closeEditor]);

  const requestExitDraftNearSelection = useCallback((source: DraftExitSource): boolean => {
    const rect = selectedRef.current?.rect;
    return requestExitDraft(
      rect ? Math.min(rect.right + 8, window.innerWidth - 24) : window.innerWidth / 2,
      rect ? Math.max(rect.top, 24) : window.innerHeight / 2,
      source === 'keyboard' ? 'escape' : 'click',
    );
  }, [requestExitDraft]);

  const isEventInsideOverlay = useCallback((event: Event): boolean => {
    const host = getShadowHost();
    return host !== null && event.composedPath().includes(host);
  }, [getShadowHost]);

  const loadAnnotationsForPage = useCallback(async (page: PageContext) => {
    const generation = ++loadGenerationRef.current;
    if (page.storageKey === null) {
      setAnnotations([]);
      return;
    }

    try {
      const items = await getAnnotations(page.href);
      if (
        generation === loadGenerationRef.current
        && pageRef.current.storageKey === page.storageKey
      ) {
        setAnnotations(items);
      }
    } catch {
      if (generation === loadGenerationRef.current) setAnnotations([]);
    }
  }, []);

  const changePage = useCallback((href: string) => {
    const nextPage = createPageContext(href);
    const previousPage = pageRef.current;
    pageRef.current = nextPage;

    if (nextPage.storageKey === previousPage.storageKey) return;

    ++loadGenerationRef.current;
    setAnnotations([]);
    const currentSelection = selectedRef.current;
    if (currentSelection) {
      const currentDraft = draftRef.current;
      const currentScreenshot = screenshotRef.current;
      if (
        currentSelection.storageKey
        && (currentDraft.trim().length > 0 || currentScreenshot !== null)
      ) {
        parkedDraftsRef.current.set(currentSelection.storageKey, {
          selection: currentSelection,
          note: currentDraft,
          screenshot: currentScreenshot,
        });
      }
      closeEditor(false);
    } else {
      clearHover();
      clearExitWarning();
    }

    loadAnnotationsForPage(nextPage).catch(() => undefined);
  }, [clearExitWarning, clearHover, closeEditor, loadAnnotationsForPage]);

  const openEditorForElement = useCallback((element: Element, clientX: number) => {
    const rect = element.getBoundingClientRect();
    const nextSelection: SelectedElement = {
      annotationId: crypto.randomUUID(),
      anchor: createAnnotationAnchor(element, rect),
      anchorXRatio: rect.width > 0
        ? Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
        : 0.5,
      element,
      label: identifyElement(element),
      pageUrl: pageRef.current.href,
      pageTitle: getCurrentPageTitle(pageRef.current.href),
      rect,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      storageKey: pageRef.current.storageKey,
    };

    selectedRef.current = nextSelection;
    setSelected(nextSelection);
    updateDraft('');
    updateScreenshot(null);
    setCaptureError('');
    clearExitWarning();
    clearHover();
  }, [clearExitWarning, clearHover, updateDraft, updateScreenshot]);

  useEffect(() => {
    loadAnnotationsForPage(pageRef.current).catch(() => undefined);
  }, [loadAnnotationsForPage]);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, { readonly newValue?: unknown }>,
      areaName: string,
    ) => {
      const storageKey = pageRef.current.storageKey;
      if (areaName !== 'local' || storageKey === null) return;
      const change = changes[storageKey];
      if (!change) return;

      ++loadGenerationRef.current;
      setAnnotations(parseAnnotations(change.newValue));
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    const checkLocation = () => changePage(window.location.href);
    window.addEventListener('popstate', checkLocation);
    const interval = window.setInterval(checkLocation, 500);

    return () => {
      window.removeEventListener('popstate', checkLocation);
      window.clearInterval(interval);
    };
  }, [changePage]);

  useLayoutEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      if (!activeRef.current || selectedRef.current || event.pointerType === 'touch') return;

      const element = deepElementFromPoint(event.clientX, event.clientY);
      if (!isSelectableElement(element)) {
        clearHover();
        return;
      }

      if (element !== hoveredElementRef.current) {
        hoveredElementRef.current = element;
        setHoveredRect(element.getBoundingClientRect());
        setHoveredLabel(identifyElement(element));
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!activeRef.current || event.button !== 0 || isEventInsideOverlay(event)) return;

      if (!selectedRef.current) {
        const target = deepElementFromPoint(event.clientX, event.clientY);
        if (!isSelectableElement(target)) return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!activeRef.current || event.button !== 0 || isEventInsideOverlay(event)) return;

      if (selectedRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const element = deepElementFromPoint(event.clientX, event.clientY);
      if (!isSelectableElement(element)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      openEditorForElement(element, event.clientX);
      committedSelectionGestureRef.current = {
        x: event.clientX,
        y: event.clientY,
        expiresAt: Date.now() + 500,
      };
    };

    const handleClick = (event: MouseEvent) => {
      if (!activeRef.current || event.button !== 0 || isEventInsideOverlay(event)) return;

      const committedGesture = committedSelectionGestureRef.current;
      committedSelectionGestureRef.current = null;
      if (
        committedGesture
        && committedGesture.expiresAt >= Date.now()
        && Math.abs(committedGesture.x - event.clientX) <= 4
        && Math.abs(committedGesture.y - event.clientY) <= 4
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (selectedRef.current) {
        requestExitDraft(event.clientX, event.clientY, 'click');
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const element = deepElementFromPoint(event.clientX, event.clientY);
      if (!isSelectableElement(element)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      openEditorForElement(element, event.clientX);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null && !selectedRef.current) clearHover();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current || event.key !== 'Escape') return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (selectedRef.current) {
        requestExitDraftNearSelection('keyboard');
        return;
      }

      setAnnotationMode(false);
    };

    return eventBridge.setHandlers({
      click: handleClick,
      keydown: handleKeyDown,
      pointerdown: handlePointerDown,
      pointermove: handlePointerMove,
      pointerout: handlePointerOut,
      pointerup: handlePointerUp,
    });
  }, [
    clearHover,
    eventBridge,
    isEventInsideOverlay,
    openEditorForElement,
    requestExitDraft,
    requestExitDraftNearSelection,
    setAnnotationMode,
  ]);

  useEffect(() => {
    if (!active) return;

    const updateRects = () => {
      layoutFrameRef.current = null;

      const currentSelection = selectedRef.current;
      if (currentSelection) {
        let element = currentSelection.element;
        const samePage = currentSelection.storageKey === pageRef.current.storageKey;
        if (!element.isConnected && samePage) {
          element = resolveAnnotationAnchor(currentSelection.anchor) ?? element;
        }

        if (element.isConnected) {
          const nextRect = element.getBoundingClientRect();
          if (rectChanged(currentSelection.rect, nextRect) || element !== currentSelection.element) {
            const nextSelection = { ...currentSelection, element, rect: nextRect };
            selectedRef.current = nextSelection;
            setSelected(nextSelection);
          }
        }
        return;
      }

      const currentStorageKey = pageRef.current.storageKey;
      const parkedDraft = currentStorageKey
        ? parkedDraftsRef.current.get(currentStorageKey)
        : undefined;
      if (currentStorageKey && parkedDraft) {
        const element = parkedDraft.selection.element.isConnected
          ? parkedDraft.selection.element
          : resolveAnnotationAnchor(parkedDraft.selection.anchor);
        if (element?.isConnected) {
          parkedDraftsRef.current.delete(currentStorageKey);
          const restoredSelection = {
            ...parkedDraft.selection,
            element,
            rect: element.getBoundingClientRect(),
          };
          selectedRef.current = restoredSelection;
          setSelected(restoredSelection);
          updateDraft(parkedDraft.note);
          updateScreenshot(parkedDraft.screenshot);
          clearHover();
          return;
        }
      }

      const pointer = lastPointerRef.current;
      if (!pointer) return;
      const element = deepElementFromPoint(pointer.x, pointer.y);
      if (!isSelectableElement(element)) {
        clearHover();
        return;
      }

      const rect = element.getBoundingClientRect();
      if (element !== hoveredElementRef.current) {
        hoveredElementRef.current = element;
        setHoveredLabel(identifyElement(element));
        setHoveredRect(rect);
        return;
      }

      setHoveredRect((current) => current && !rectChanged(current, rect) ? current : rect);
    };

    const scheduleUpdate = () => {
      if (layoutFrameRef.current !== null || document.hidden) return;
      layoutFrameRef.current = window.requestAnimationFrame(updateRects);
    };

    window.addEventListener('scroll', scheduleUpdate, true);
    window.addEventListener('resize', scheduleUpdate);
    document.addEventListener('visibilitychange', scheduleUpdate);
    const interval = window.setInterval(scheduleUpdate, 200);

    return () => {
      window.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
      document.removeEventListener('visibilitychange', scheduleUpdate);
      window.clearInterval(interval);
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
    };
  }, [active, clearHover, updateDraft, updateScreenshot]);

  useEffect(() => {
    const handleMessage = (message: unknown) => {
      if (!isRuntimeMessage(message)) return undefined;

      if (message.type === 'app-notes-get-annotation-mode') {
        return Promise.resolve({ active: activeRef.current });
      }

      if (message.type === 'app-notes-toggle-annotation-mode') {
        if (activeRef.current && selectedRef.current) {
          const closed = requestExitDraftNearSelection('keyboard');
          if (!closed) return Promise.resolve({ active: true, draftProtected: true });
        }

        const next = !activeRef.current;
        setAnnotationMode(next);
        return Promise.resolve({ active: next });
      }

      if (message.type === 'app-notes-page-location-changed' && typeof message.url === 'string') {
        changePage(message.url);
      }

      return undefined;
    };

    browser.runtime.onMessage.addListener(handleMessage);
    return () => browser.runtime.onMessage.removeListener(handleMessage);
  }, [changePage, requestExitDraftNearSelection, setAnnotationMode]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) clearExitWarning();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearExitWarning]);

  useEffect(() => () => {
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    if (exitCountdownRef.current !== null) window.clearInterval(exitCountdownRef.current);
  }, []);

  const handleCapture = useCallback(async (): Promise<void> => {
    const currentSelection = selectedRef.current;
    const overlayHost = getShadowHost();
    if (!currentSelection || overlayHost === null || isCapturingRef.current) return;

    isCapturingRef.current = true;
    setIsCapturing(true);
    setCaptureError('');
    try {
      const result = await captureVisibleElement(currentSelection.rect, overlayHost);
      if (selectedRef.current?.annotationId !== currentSelection.annotationId) return;
      if (result._tag === 'capture-failed') {
        setCaptureError(result.message);
        return;
      }
      updateScreenshot(result.screenshot);
    } catch {
      if (selectedRef.current?.annotationId === currentSelection.annotationId) {
        setCaptureError('Couldn’t capture this element. Try again.');
      }
    } finally {
      if (selectedRef.current?.annotationId === currentSelection.annotationId) {
        isCapturingRef.current = false;
        setIsCapturing(false);
      }
    }
  }, [getShadowHost, updateScreenshot]);

  const handleSave = useCallback(async (note: string): Promise<boolean> => {
    const currentSelection = selectedRef.current;
    if (!currentSelection || currentSelection.storageKey === null) return false;

    const result = await saveAnnotation({
      id: currentSelection.annotationId,
      url: currentSelection.pageUrl,
      type: 'comment',
      anchor: currentSelection.anchor,
      note,
      color: 'blue',
      pageTitle: currentSelection.pageTitle,
      ...(screenshotRef.current !== null ? {
        screenshot: {
          id: currentSelection.annotationId,
          ...screenshotRef.current,
        },
      } : {}),
    });
    if (result._tag !== 'created') return false;

    if (currentSelection.storageKey) {
      const parkedDraft = parkedDraftsRef.current.get(currentSelection.storageKey);
      if (parkedDraft?.selection.annotationId === currentSelection.annotationId) {
        parkedDraftsRef.current.delete(currentSelection.storageKey);
      }
    }
    if (selectedRef.current?.annotationId === currentSelection.annotationId) closeEditor();
    return true;
  }, [closeEditor]);

  return (
    <div className="app-notes-root">
      <OverlayStyles />
      <AnnotationMarkers annotations={annotations} />

      {active && hoveredRect && !selected && (
        <ElementHighlight rect={hoveredRect} label={hoveredLabel} />
      )}

      {active && selected && (
        <>
          <ElementHighlight rect={selected.rect} selected label={selected.label} />
          <AnnotationPopover
            rect={selected.rect}
            anchorXRatio={selected.anchorXRatio}
            label={selected.label}
            note={draft}
            screenshot={screenshot}
            isCapturing={isCapturing}
            captureError={captureError}
            onNoteChange={updateDraft}
            onCapture={handleCapture}
            onRemoveScreenshot={() => {
              updateScreenshot(null);
              setCaptureError('');
            }}
            onSave={handleSave}
            onRequestExit={requestExitDraftNearSelection}
          />
        </>
      )}

      {active && exitWarning && <ExitWarningToast {...exitWarning} />}
    </div>
  );
}
