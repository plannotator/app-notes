interface ElementHighlightProps {
  rect: DOMRect;
  selected?: boolean;
  label?: string;
}

/** Draws the immediate picker outline and its human-readable target label. */
export function ElementHighlight({ rect, selected = false, label }: ElementHighlightProps) {
  const labelBelow = rect.top < 26;
  const labelTop = labelBelow ? rect.bottom + 4 : rect.top - 22;
  const labelLeft = Math.min(
    Math.max(rect.left, 8),
    Math.max(8, window.innerWidth - 308),
  );

  return (
    <>
      <div
        aria-hidden="true"
        className="app-notes-highlight"
        data-selected={selected}
        style={{
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        }}
      />
      {label && (
        <div
          aria-hidden="true"
          className="app-notes-element-label"
          style={{ top: `${labelTop}px`, left: `${labelLeft}px` }}
        >
          {label}
        </div>
      )}
    </>
  );
}
