import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

export function RibbonSep() {
  return <span className="pen-ribbon-sep" aria-hidden />;
}

export function RibbonIconBtn({
  active,
  onClick,
  title,
  children,
  className = ''
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={!!active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`pen-ribbon-btn ${active ? 'is-active' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function RibbonMenu({
  label,
  title,
  children,
  wide
}: {
  label: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="pen-ribbon-menu-wrap" ref={rootRef}>
      <button
        type="button"
        title={title}
        className={`pen-ribbon-menu-trigger ${open ? 'is-open' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="pen-ribbon-menu-label">{label}</span>
        <span className="pen-ribbon-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className={`pen-ribbon-menu-panel ${wide ? 'is-wide' : ''}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function ColorAButton({
  mode,
  color,
  onChange,
  title
}: {
  mode: 'text' | 'highlight';
  color: string;
  onChange: (hex: string) => void;
  title: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const safe = /^#[0-9a-fA-F]{6}$/.test(color)
    ? color
    : mode === 'highlight'
      ? '#fef08a'
      : '#1c1917';

  return (
    <button
      type="button"
      title={title}
      className={`pen-ribbon-btn pen-ribbon-a ${mode === 'highlight' ? 'is-highlight' : 'is-text'}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      style={
        mode === 'text'
          ? { ['--pen-a-color' as string]: safe }
          : { ['--pen-a-bg' as string]: safe }
      }
    >
      <span className="pen-ribbon-a-glyph">A</span>
      <input
        ref={inputRef}
        type="color"
        className="pen-ribbon-a-input"
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
      />
    </button>
  );
}

export function RibbonItem({
  onClick,
  children,
  active
}: {
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`pen-ribbon-menu-item ${active ? 'is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
