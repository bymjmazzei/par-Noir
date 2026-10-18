/** Visual gradient editor: drag stops on the bar, click the bar to add one, drag the dial for angle. */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_GRADIENT,
  formatCssGradient,
  parseCssGradient,
  type GradientSpec,
  type GradientStop
} from '@par-noir/pen-protocol';
import { ColorBox, colorToHex, formatRgba, parseCssColor } from './PanelValueControls';

function barBackground(stops: GradientStop[]): string {
  return formatCssGradient({ type: 'linear', angle: 90, stops });
}

/** Stop color at a position, blended from its neighbors. */
function colorAt(stops: GradientStop[], at: number): string {
  const left = [...stops].reverse().find((stop) => stop.at <= at) || stops[0]!;
  const right = stops.find((stop) => stop.at >= at) || stops[stops.length - 1]!;
  const a = parseCssColor(left.color);
  const b = parseCssColor(right.color);
  const t = right.at === left.at ? 0 : (at - left.at) / (right.at - left.at);
  const mix = (x: number, y: number) => x + (y - x) * t;
  const alpha = mix(a.a, b.a);
  const rgb = { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) };
  return alpha >= 1 ? colorToHex(formatRgba(rgb, 1)) : formatRgba(rgb, alpha);
}

/** Keep a stop's transparency when the system picker returns plain hex. */
function withAlphaOf(previous: string, hex: string): string {
  const alpha = parseCssColor(previous).a;
  return alpha >= 1 ? hex : formatRgba(parseCssColor(hex), alpha);
}

function AngleDial({ angle, onChange }: { angle: number; onChange: (next: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function angleFrom(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = ref.current!.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    onChange(Math.round((deg + 360) % 360));
  }

  return (
    <div className="flex h-8 items-center gap-1">
      <span className="min-w-0 flex-1 truncate text-[13px] text-stone-500">Angle</span>
      <span className="text-[13px] tabular-nums text-stone-700">{angle}°</span>
      <div
        ref={ref}
        role="slider"
        aria-label="Gradient angle"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={angle}
        tabIndex={0}
        className="relative h-7 w-7 shrink-0 cursor-grab touch-none rounded-full border border-stone-300 bg-white"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          angleFrom(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) angleFrom(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange((angle + 1) % 360);
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange((angle + 359) % 360);
        }}
      >
        <span
          className="absolute left-1/2 top-1/2 h-1/2 w-0.5 origin-top rounded bg-stone-700"
          style={{ transform: `translateX(-50%) rotate(${angle + 180}deg)` }}
        />
      </div>
    </div>
  );
}

export function GradientPicker({
  value,
  onChange
}: {
  value: string | undefined;
  onChange: (next: string) => void;
}) {
  const spec = parseCssGradient(value) || DEFAULT_GRADIENT;
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);
  const dragging = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const active = Math.min(selected, spec.stops.length - 1);
  const stop = spec.stops[active]!;

  function select(index: number) {
    selectedRef.current = index;
    setSelected(index);
  }

  function emit(next: GradientSpec, followIndex?: number) {
    const order = next.stops.map((item, index) => ({ item, index })).sort((a, b) => a.item.at - b.item.at);
    if (followIndex != null) select(order.findIndex((entry) => entry.index === followIndex));
    onChange(formatCssGradient({ ...next, stops: order.map((entry) => entry.item) }));
  }

  function pctFrom(event: ReactPointerEvent<HTMLDivElement>): number {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.round(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)));
  }

  function moveStop(index: number, at: number) {
    emit({ ...spec, stops: spec.stops.map((item, i) => (i === index ? { ...item, at } : item)) }, index);
  }

  return (
    <div className="space-y-1.5 py-1" data-gradient-picker>
      <div className="flex items-center gap-2 text-[13px]">
        {(['linear', 'radial'] as const).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={spec.type === type}
            className={spec.type === type ? 'font-semibold text-stone-800' : 'text-stone-500 hover:text-stone-800'}
            onClick={() => emit({ ...spec, type })}
          >
            {type === 'linear' ? 'Linear' : 'Radial'}
          </button>
        ))}
        <span
          aria-hidden
          className="ml-auto h-5 w-8 rounded border border-stone-300"
          style={{ backgroundImage: formatCssGradient(spec) }}
        />
      </div>
      <div
        ref={barRef}
        aria-label="Gradient stops"
        className="relative mx-1.5 h-5 cursor-copy touch-none rounded border border-stone-300"
        style={{ backgroundImage: barBackground(spec.stops) }}
        onPointerDown={(event) => {
          const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-stop-index]');
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          if (handle) {
            select(Number(handle.dataset.stopIndex));
            return;
          }
          const at = pctFrom(event);
          const added = { color: colorAt(spec.stops, at), at };
          emit({ ...spec, stops: [...spec.stops, added] }, spec.stops.length);
        }}
        onPointerMove={(event) => {
          if (dragging.current) moveStop(selectedRef.current, pctFrom(event));
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
      >
        {spec.stops.map((item, index) => (
          <span
            key={index}
            data-stop-index={index}
            role="button"
            aria-label={`Gradient stop ${index + 1}`}
            aria-pressed={index === active}
            className={`absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-sm border-2 shadow ${
              index === active ? 'border-stone-900' : 'border-white'
            }`}
            style={{ left: `${item.at}%`, backgroundColor: item.color }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ColorBox
            label={`Stop ${stop.at}%`}
            ariaLabel="Gradient stop color"
            value={stop.color}
            onChange={(hex) =>
              emit({
                ...spec,
                stops: spec.stops.map((item, i) => (i === active ? { ...item, color: withAlphaOf(item.color, hex) } : item))
              })
            }
          />
        </div>
        {spec.stops.length > 2 ? (
          <button
            type="button"
            aria-label="Remove gradient stop"
            title="Remove stop"
            className="text-[13px] text-stone-500 hover:text-black"
            onClick={() => {
              select(Math.max(0, active - 1));
              emit({ ...spec, stops: spec.stops.filter((_, i) => i !== active) });
            }}
          >
            −
          </button>
        ) : null}
      </div>
      {spec.type === 'linear' ? <AngleDial angle={spec.angle} onChange={(angle) => emit({ ...spec, angle })} /> : null}
    </div>
  );
}
