/**
 * Compact panel controls. The slider and color picker stay inside the popover.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

type Rgb = { r: number; g: number; b: number; a: number };

export function parseCssColor(value: string | undefined): Rgb {
  const raw = (value || '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw);
  if (hex) {
    const body = hex[1]!;
    const full =
      body.length === 3
        ? body
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : body;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(raw);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] != null ? Number(rgba[4]) : 1
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

export function formatRgba(rgb: { r: number; g: number; b: number }, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100;
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a})`;
}

/** Hue slider with a transparency slider directly under it. */
export function ColorSliders({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseCssColor(value);
  const hsl = rgbToHsl(parsed.r, parsed.g, parsed.b);
  const alpha = Math.round(parsed.a * 100);
  function emit(hue: number, nextAlpha: number, hueMoved: boolean) {
    const sat = hueMoved && hsl.s < 1 ? 100 : hsl.s;
    const rgb = hslToRgb(hue, sat, hsl.l);
    onChange(formatRgba(rgb, nextAlpha / 100));
  }
  return (
    <div className="space-y-2">
      <label className="block text-[11px]">
        <span className="mb-1 block font-semibold uppercase tracking-wide text-stone-400">{label}</span>
        <input
          aria-label={`${label} color`}
          type="range"
          min={0}
          max={360}
          value={Math.round(hsl.h)}
          onChange={(event) => emit(Number(event.target.value), alpha, true)}
          className="w-full"
          style={{
            background: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'
          }}
        />
      </label>
      <label className="block text-[11px]">
        <span className="mb-1 flex justify-between text-stone-500">
          <span>Opacity</span>
          <span>{alpha}%</span>
        </span>
        <input
          aria-label={`${label} opacity`}
          type="range"
          min={0}
          max={100}
          value={alpha}
          onChange={(event) => emit(hsl.h, Number(event.target.value), false)}
          className="w-full"
        />
      </label>
    </div>
  );
}

function colorToHex(value: string): string {
  const parsed = parseCssColor(value);
  const channel = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${channel(parsed.r)}${channel(parsed.g)}${channel(parsed.b)}`;
}

/** A color block. Shadow and stroke use this instead of a hue slider. */
export function ColorBlock({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block text-[11px]">
      <span className="mb-1 block font-semibold uppercase tracking-wide text-stone-400">{label}</span>
      <input
        aria-label={`${label} color`}
        type="color"
        value={colorToHex(value)}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full cursor-pointer rounded border border-stone-300 bg-white p-0.5"
      />
    </label>
  );
}

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
  const parsed = parseCssColor(value);
  const swatch = formatRgba(parsed, parsed.a);
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
          {row ? (
            <span className="font-semibold uppercase text-stone-800">
              {Math.round(parsed.a * 100)}%
            </span>
          ) : null}
        </span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)}>
        <ColorSliders label={label} value={swatch} onChange={onChange} />
      </Popover>
    </div>
  );
}
