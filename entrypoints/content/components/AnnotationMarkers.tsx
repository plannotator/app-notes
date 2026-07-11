import { useCallback, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { resolveAnnotationAnchor } from '@/lib/anchoring';
import type { Annotation } from '@/lib/types';

interface MarkerRect {
  readonly annotation: Annotation;
  readonly rect: DOMRect;
}

interface AnnotationMarkersProps {
  annotations: ReadonlyArray<Annotation>;
}

function markerSetsMatch(
  current: ReadonlyArray<MarkerRect>,
  next: ReadonlyArray<MarkerRect>,
): boolean {
  if (current.length !== next.length) return false;
  return current.every((marker, index) => {
    const candidate = next[index];
    if (!candidate || marker.annotation.id !== candidate.annotation.id) return false;
    return marker.rect.top === candidate.rect.top
      && marker.rect.left === candidate.rect.left
      && marker.rect.width === candidate.rect.width
      && marker.rect.height === candidate.rect.height;
  });
}

/** Re-resolves stored anchors and keeps their passive page markers aligned. */
export function AnnotationMarkers({ annotations }: AnnotationMarkersProps) {
  const [markers, setMarkers] = useState<ReadonlyArray<MarkerRect>>([]);

  const resolveMarkers = useCallback(() => {
    const resolved: Array<MarkerRect> = [];

    for (const annotation of annotations) {
      const element = resolveAnnotationAnchor(annotation.anchor);
      if (!element || !element.isConnected || element.getClientRects().length === 0) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      resolved.push({ annotation, rect });
    }

    setMarkers((current) => markerSetsMatch(current, resolved) ? current : resolved);
  }, [annotations]);

  useEffect(() => {
    if (annotations.length === 0) {
      setMarkers([]);
      return;
    }

    let frame: number | null = null;
    const scheduleResolve = () => {
      if (frame !== null || document.hidden) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        resolveMarkers();
      });
    };

    resolveMarkers();

    const observer = new MutationObserver(scheduleResolve);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'id',
        'class',
        'aria-label',
        'data-testid',
        'data-test',
        'data-cy',
        'name',
        'role',
        'placeholder',
        'href',
        'alt',
      ],
    });

    window.addEventListener('scroll', scheduleResolve, true);
    window.addEventListener('resize', scheduleResolve);
    document.addEventListener('visibilitychange', scheduleResolve);
    const interval = window.setInterval(scheduleResolve, 250);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', scheduleResolve, true);
      window.removeEventListener('resize', scheduleResolve);
      document.removeEventListener('visibilitychange', scheduleResolve);
      window.clearInterval(interval);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [annotations.length, resolveMarkers]);

  if (markers.length === 0) return null;

  return (
    <>
      {markers.map(({ annotation, rect }) => (
        <div
          key={annotation.id}
          aria-hidden="true"
          className="app-notes-marker"
          style={{
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
        >
          {annotation.note && (
            <span className="app-notes-marker-badge">
              <MessageSquare size={9} fill="currentColor" strokeWidth={2.4} />
            </span>
          )}
        </div>
      ))}
    </>
  );
}
