import type { AnnotationScope } from '@/lib/annotation-scope';

interface LocalFileScopeControlProps {
  readonly onChange: (scope: AnnotationScope) => void | Promise<void>;
  readonly scope: AnnotationScope;
}

/** Switches local-file annotation UI between the current file and its parent folder. */
export function LocalFileScopeControl({
  onChange,
  scope,
}: LocalFileScopeControlProps) {
  return (
    <div
      className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5"
      role="group"
      aria-label="Show local notes from"
    >
      <ScopeButton active={scope === 'page'} onClick={() => onChange('page')}>
        This file
      </ScopeButton>
      <ScopeButton active={scope === 'site'} onClick={() => onChange('site')}>
        This folder
      </ScopeButton>
    </div>
  );
}

interface ScopeButtonProps {
  readonly active: boolean;
  readonly children: React.ReactNode;
  readonly onClick: () => void | Promise<void>;
}

function ScopeButton({ active, children, onClick }: ScopeButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`app-notes-pressable app-notes-touch-target min-h-7 rounded-md px-2 text-[11px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 ${
        active
          ? 'bg-surface text-text-primary shadow-[inset_0_0_0_1px_var(--color-border-subtle)]'
          : 'text-text-tertiary'
      }`}
    >
      {children}
    </button>
  );
}
