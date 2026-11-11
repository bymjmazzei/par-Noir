/**
 * Compact panel controls. The slider and color picker stay inside the popover.
 */

import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AnchoredPanel } from './AnchoredPanel';

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

/** Relative luminance, 0 (black) to 1 (white). */
export function colorLuminance(value: string | undefined): number {
  const { r, g, b } = parseCssColor(value);
  const lin = (n: number) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function formatRgba(rgb: { r: number; g: number; b: number }, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100;
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a})`;
}

/** Color row with a swatch, then an Opacity row whose slider opens on click. */
export function ColorOpacityPicker({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [sliderOpen, setSliderOpen] = useState(false);
  const parsed = parseCssColor(value);
  const alpha = Math.round(parsed.a * 100);
  function emit(hex: string, nextAlpha: number) {
    onChange(formatRgba(parseCssColor(hex), nextAlpha / 100));
  }
  return (
    <div className="space-y-1">
      <ColorBox
        label="Color"
        ariaLabel={`${label} color`}
        value={value}
        onChange={(hex) => emit(hex, alpha || 100)}
      />
      <ValueRow
        label="Opacity"
        ariaLabel={`${label} opacity`}
        value={alpha}
        min={0}
        max={100}
        display={`${alpha}%`}
        open={sliderOpen}
        onToggle={() => setSliderOpen((v) => !v)}
        onChange={(next) => emit(colorToHex(value), next)}
      />
    </div>
  );
}

const RANGE_CLASS =
  'mt-1 h-1 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-stone-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-stone-500';

/** Label on the left, value on the right; clicking the value opens a slider under the row. */
export function ValueRow({
  label,
  ariaLabel,
  value,
  min,
  max,
  display,
  open,
  onToggle,
  onChange
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  display: string;
  open: boolean;
  onToggle: () => void;
  onChange: (next: number) => void;
}) {
  const span = max - min || 1;
  const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const name = ariaLabel ?? label;
  return (
    <div>
      <div className="flex h-5 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-left text-[13px] text-stone-500">{label}</span>
        <button
          type="button"
          aria-label={name}
          aria-expanded={open}
          className="text-[13px] tabular-nums text-stone-700"
          onClick={onToggle}
        >
          {display}
        </button>
      </div>
      {open ? (
        <input
          aria-label={`${name} slider`}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={RANGE_CLASS}
          style={{ background: `linear-gradient(to right, #a8a29e ${pct}%, #e7e5e4 ${pct}%)` }}
        />
      ) : null}
    </div>
  );
}

export function colorToHex(value: string): string {
  const parsed = parseCssColor(value);
  const channel = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${channel(parsed.r)}${channel(parsed.g)}${channel(parsed.b)}`;
}

/** Label on the left, swatch on the right; the swatch opens the system color picker. */
export function ColorBox({
  label,
  ariaLabel,
  value,
  onChange
}: {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const hex = colorToHex(value);
  return (
    <div className="flex h-5 items-center gap-1">
      <span className="min-w-0 flex-1 truncate text-[13px] text-stone-500">{label}</span>
      <input
        aria-label={ariaLabel ?? label}
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-4 w-4 cursor-pointer appearance-none border border-stone-300 p-0 [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
        style={{ backgroundColor: hex }}
      />
    </div>
  );
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
  anchorRef,
  onClose,
  children
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AnchoredPanel
      open={open}
      anchorRef={anchorRef}
      onClose={onClose}
      className="w-52 rounded-md border border-stone-200 bg-white p-3 shadow-lg"
    >
      {children}
    </AnchoredPanel>
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div ref={anchorRef} className={`relative ${row ? 'w-full' : ''}`}>
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
      <Popover open={open} anchorRef={anchorRef} onClose={close}>
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const parsed = parseCssColor(value);
  const swatch = formatRgba(parsed, parsed.a);
  return (
    <div ref={anchorRef} className={`relative ${row ? 'w-full' : ''}`}>
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
      <Popover open={open} anchorRef={anchorRef} onClose={close}>
        <ColorOpacityPicker label={label} value={swatch} onChange={onChange} />
      </Popover>
    </div>
  );
}
