import {
  useCallback,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { AnchoredPanel } from '../AnchoredPanel';
import { ColorOpacityPicker, parseCssColor } from '../PanelValueControls';

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
  const close = useCallback(() => setOpen(false), []);

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
      <AnchoredPanel
        open={open}
        anchorRef={rootRef}
        onClose={close}
        className={`pen-ribbon-menu-panel ${wide ? 'is-wide' : ''}`}
      >
        {children(close)}
      </AnchoredPanel>
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
  onChange: (next: string) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const parsed = parseCssColor(color);
  const safe = color && color !== 'transparent' ? color : mode === 'highlight' ? '#fef08a' : '#1c1917';
  const swatch = parsed.a > 0 ? safe : mode === 'highlight' ? '#fef08a' : '#1c1917';

  return (
    <span className="relative inline-flex" ref={anchorRef}>
      <button
        type="button"
        title={title}
        aria-expanded={open}
        className={`pen-ribbon-btn pen-ribbon-a ${mode === 'highlight' ? 'is-highlight' : 'is-text'}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        style={
          mode === 'text'
            ? { ['--pen-a-color' as string]: swatch }
            : { ['--pen-a-bg' as string]: swatch }
        }
      >
        <span className="pen-ribbon-a-glyph">A</span>
      </button>
      <AnchoredPanel
        open={open}
        anchorRef={anchorRef}
        onClose={close}
        className="w-48 rounded-md border border-stone-200 bg-white p-2 shadow-lg"
      >
        <ColorOpacityPicker label={title} value={safe} onChange={onChange} />
      </AnchoredPanel>
    </span>
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
