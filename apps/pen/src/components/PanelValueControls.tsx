/**
 * Compact panel controls. The slider and color picker stay inside the popover.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

function Popover({
  open,
  onClose,
  children
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1 w-52 rounded-md border border-stone-200 bg-white p-3 shadow-lg"
    >
      {children}
    </div>
  );
}

export function ValueSliderButton({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
  row = false
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  onChange: (next: number) => void;
  /** Title on the left, value on the right. The slider stays in the popover. */
  row?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative ${row ? 'w-full' : ''}`}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        className={
          row
            ? 'flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-[12px] text-stone-800 hover:bg-stone-100'
            : 'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-stone-300 bg-white px-1.5 text-[11px] font-semibold text-stone-800 hover:bg-stone-100'
        }
        onClick={() => setOpen((v) => !v)}
      >
        {row ? <span className="font-medium text-stone-600">{label}</span> : null}
        <span className={row ? 'font-semibold' : 'max-w-[4.5rem] truncate'}>{display}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)}>
        <div className="space-y-2 text-[11px]">
          <div className="flex justify-between font-semibold uppercase tracking-wide text-stone-400">
            <span>{label}</span>
            <span>{display}</span>
          </div>
          <input
            aria-label={`${label} value`}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </Popover>
    </div>
  );
}

export function ColorSwatchButton({
  label,
  value,
  onChange,
  row = false
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Title on the left, swatch and hex on the right. */
  row?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return (
    <div className={`relative ${row ? 'w-full' : ''}`}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        className={
          row
            ? 'flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-[12px] hover:bg-stone-100'
            : 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 bg-white hover:bg-stone-100'
        }
        onClick={() => setOpen((v) => !v)}
      >
        {row ? <span className="font-medium text-stone-600">{label}</span> : null}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-4 w-4 rounded-full border border-black/20"
            style={{ backgroundColor: swatch }}
          />
          {row ? <span className="font-semibold uppercase text-stone-800">{swatch}</span> : null}
        </span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)}>
        <label className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold uppercase tracking-wide text-stone-400">{label}</span>
          <input
            aria-label={`${label} picker`}
            type="color"
            value={swatch}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-stone-300"
          />
        </label>
      </Popover>
    </div>
  );
}
