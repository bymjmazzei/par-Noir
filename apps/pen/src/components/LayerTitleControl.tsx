import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { IconCheck, IconPencil } from './icons/PenIcons';

/** Inline layer title with pen-to-edit and check-to-save (popover rows + toolbar menu). */
export function LayerTitleControl({
  label,
  editing,
  draft,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
  className = '',
  inputClassName = 'text-[12px]',
  titleClassName = 'text-[12px]'
}: {
  label: string;
  editing: boolean;
  draft: string;
  onStartEdit: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
  inputClassName?: string;
  titleClassName?: string;
}) {
  const cancelRename = useRef(false);

  function stopRowDrag(e: ReactPointerEvent) {
    e.stopPropagation();
  }

  if (editing) {
    return (
      <div className={`flex min-w-0 flex-1 items-center gap-0.5 ${className}`}>
        <input
          aria-label="Layer title"
          autoFocus
          className={`min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-0 outline-none ${inputClassName}`}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onPointerDown={stopRowDrag}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSave();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelRename.current = true;
              onCancel();
              cancelRename.current = false;
            }
          }}
        />
        <button
          type="button"
          aria-label="Save layer name"
          title="Save"
          className="shrink-0 p-0.5 text-neutral-600 hover:text-black"
          onPointerDown={stopRowDrag}
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
        >
          <IconCheck width={14} height={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 flex-1 items-center gap-0.5 ${className}`}>
      <span className={`min-w-0 flex-1 truncate ${titleClassName}`}>{label}</span>
      <button
        type="button"
        aria-label="Rename layer"
        title="Rename"
        className="shrink-0 p-0.5 text-neutral-500 hover:text-black"
        onPointerDown={stopRowDrag}
        onClick={(e) => {
          e.stopPropagation();
          onStartEdit();
        }}
      >
        <IconPencil width={12} height={12} />
      </button>
    </div>
  );
}
