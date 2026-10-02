/**
 * Layer settings on the page preview bar — one dropdown for the active layer
 * (page frame = layer 0, or an overlay object). Wrap stays a toggle on the bar.
 * Page (layer 0): background only. Overlay objects: background, shadow, blur, blend, opacity, and stroke.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  attachMediaToLayer,
  layerShadowCss,
  layerStrokeStyle,
  patchLayerStyle,
  wrapSideFromGeom,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent,
  type PenStrokeAlign,
  type PenStrokeStyle
} from '@par-noir/pen-protocol';
import { ActionBindStrip } from './ActionBindStrip';
import { parseCssColor } from './PanelValueControls';
import { CloudFeedMediaPicker } from './CloudFeedMediaPicker';
import { probeMediaAspect } from '../services/penAttach';
import { isPenMediaSrcRef, resolvePenMediaSrc } from '../services/penLocalMedia';
import type { PenSession } from '../services/penSession';

export type ObjectToolTarget =
  | { kind: 'page' }
  | { kind: 'layer'; layer: PenPageLayer };

type BgMode = 'color' | 'gradient' | 'image' | 'video';

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion'
] as const;

const RANGE_CLASS =
  'mt-1 h-1 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-stone-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-stone-500';

function colorHex(value: string): string {
  const parsed = parseCssColor(value);
  const channel = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${channel(parsed.r)}${channel(parsed.g)}${channel(parsed.b)}`;
}

function modeLabel(mode: string): string {
  return mode
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ValueRow({
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

function ColorBox({
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
  const hex = colorHex(value);
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

function ChoiceLine({
  label,
  selected,
  onClick
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`block w-full py-0.5 text-left text-[13px] ${
        selected ? 'font-semibold text-stone-800' : 'text-stone-500'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SectionRow({
  label,
  summary,
  open,
  onToggle,
  children
}: {
  label: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        className="flex h-5 w-full items-center gap-1"
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1 truncate text-left text-[13px] text-stone-500">{label}</span>
        {summary ? <span className="truncate text-[13px] text-stone-700">{summary}</span> : null}
      </button>
      {open ? <div className="pb-1 pl-2">{children}</div> : null}
    </div>
  );
}

function LineMenu({
  label,
  value,
  open,
  onToggle,
  children
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        className="flex h-5 w-full items-center gap-1"
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1 truncate text-left text-[13px] text-stone-500">{label}</span>
        <span className="truncate text-[13px] text-stone-700">{value}</span>
      </button>
      {open ? <div className="pl-2">{children}</div> : null}
    </div>
  );
}

function AlignIcon({ align }: { align: PenStrokeAlign }) {
  if (align === 'inside') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        <rect x="7" y="7" width="10" height="10" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (align === 'outside') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="2" />
        <rect x="7" y="7" width="10" height="10" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="5" width="14" height="14" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function FillIcon({ mode }: { mode: BgMode | 'none' }) {
  if (mode === 'none') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M7 17L17 7" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (mode === 'color') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
      </svg>
    );
  }
  if (mode === 'gradient') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" opacity="0.25" />
        <path d="M4 20L20 4" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (mode === 'image') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M3 15l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M10 9l6 3-6 3V9z" fill="currentColor" />
    </svg>
  );
}

function pageFill(p: PenPagePresentation): {
  mode: BgMode | 'none';
  color: string;
  gradient: string;
} {
  if (p.backgroundVideo) return { mode: 'video', color: p.backgroundColor || '#ffffff', gradient: '' };
  if (p.backgroundImage) return { mode: 'image', color: p.backgroundColor || '#ffffff', gradient: '' };
  if (p.backgroundGradient)
    return { mode: 'gradient', color: p.backgroundColor || '#ffffff', gradient: p.backgroundGradient };
  if (!p.backgroundColor || p.backgroundColor === 'transparent') {
    return { mode: 'none', color: '#ffffff', gradient: '' };
  }
  return { mode: 'color', color: p.backgroundColor, gradient: '' };
}

function layerFill(l: PenPageLayer): {
  mode: BgMode;
  color: string;
  gradient: string;
} {
  if (l.kind === 'video' && l.videoSrc)
    return { mode: 'video', color: l.backgroundColor || '#ffffff', gradient: '' };
  if (l.kind === 'image' && l.imageSrc)
    return { mode: 'image', color: l.backgroundColor || '#ffffff', gradient: '' };
  if (l.backgroundVideo) return { mode: 'video', color: l.backgroundColor || '#ffffff', gradient: '' };
  if (l.backgroundImage) return { mode: 'image', color: l.backgroundColor || '#ffffff', gradient: '' };
  if (l.backgroundGradient)
    return { mode: 'gradient', color: l.backgroundColor || '#ffffff', gradient: l.backgroundGradient };
  return { mode: 'color', color: l.backgroundColor || '#ffffff', gradient: '' };
}

export function LayerObjectToolbar({
  target,
  presentation,
  section,
  session,
  docId,
  contentWidthPx = 736,
  contentHeightPx = 976,
  onPresentationChange,
  onSectionChange,
  hideActionBind,
  hideObjectTools
}: {
  target: ObjectToolTarget;
  presentation: PenPagePresentation;
  section: PenSectionContent;
  session?: PenSession | null;
  docId?: string;
  /** Content-box width for Wrap side (left/right from object center). */
  contentWidthPx?: number;
  /** Content-box height — used when fitting attached media to the page. */
  contentHeightPx?: number;
  onPresentationChange?: (next: Partial<PenPagePresentation>) => void;
  onSectionChange: (next: PenSectionContent) => void;
  hideActionBind?: boolean;
  /** Widget color and stroke live in the side pane. */
  hideObjectTools?: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [slider, setSlider] = useState<string | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [fileKind, setFileKind] = useState<'image' | 'video'>('image');
  const menuRef = useRef<HTMLDivElement>(null);

  const isPage = target.kind === 'page';
  const layer = target.kind === 'layer' ? target.layer : null;
  const isGroup = layer?.kind === 'group';
  const fill = isPage ? pageFill(presentation) : layerFill(layer!);

  function patchLayer(patch: Parameters<typeof patchLayerStyle>[2]) {
    if (!layer) return;
    const replacesMedia =
      'backgroundVideo' in patch ||
      'backgroundImage' in patch ||
      'videoSrc' in patch ||
      'imageSrc' in patch;
    onSectionChange(
      patchLayerStyle(
        section,
        layer.id,
        replacesMedia ? { editProxySrc: undefined, ...patch } : patch
      )
    );
  }

  function patchPage(partial: Partial<PenPagePresentation>) {
    const replacesMedia = 'backgroundVideo' in partial || 'backgroundImage' in partial;
    onPresentationChange?.(replacesMedia ? { editProxySrc: undefined, ...partial } : partial);
  }

  async function applyMediaSrc(src: string, meta?: { blobUrl?: string }) {
    // Probe aspect against a playable URL (blob:), store the tiny ref on the layer.
    const playable =
      meta?.blobUrl || (await resolvePenMediaSrc(src, docId)) || src;
    if (!isPage && layer && !isGroup) {
      // Object layers: convert to image/video and fit aspect into the frame / page.
      const aspect = await probeMediaAspect(playable, fileKind);
      onSectionChange(
        attachMediaToLayer(
          section,
          layer.id,
          fileKind === 'image' ? { kind: 'image', src } : { kind: 'video', src },
          {
            aspectRatio: aspect,
            pageWidth: contentWidthPx,
            pageHeight: contentHeightPx
          }
        )
      );
      return;
    }
    if (fileKind === 'image') {
      if (isPage) {
        patchPage({
          backgroundImage: src,
          backgroundVideo: undefined,
          backgroundGradient: undefined,
          backgroundColor: 'transparent'
        });
      } else {
        patchLayer({
          backgroundImage: src,
          backgroundVideo: undefined,
          backgroundGradient: undefined,
          backgroundColor: undefined
        });
      }
    } else if (isPage) {
      patchPage({
        backgroundVideo: src,
        backgroundImage: undefined,
        backgroundGradient: undefined,
        backgroundColor: 'transparent'
      });
    } else {
      patchLayer({
        backgroundVideo: src,
        backgroundImage: undefined,
        backgroundGradient: undefined,
        backgroundColor: undefined
      });
    }
  }

  const shadowBlur = layer?.shadowBlur ?? (layer && layerShadowCss(layer) ? 3 : 0);
  const shadowX = layer?.shadowOffsetX ?? 0;
  const shadowY = layer?.shadowOffsetY ?? 0;
  const shadowColor = layer?.shadowColor || '#000000';
  const blurVal = layer?.blur || 0;
  const opacity = layer?.opacity ?? 100;
  const blendMode = layer?.mixBlendMode || 'normal';
  const blendAmount = layer?.blendAmount ?? 100;
  const strokeColor = layer?.strokeColor || '#000000';
  const strokeWidth = layer?.strokeWidth ?? 0;
  const strokeStyle = (layer?.strokeStyle || 'solid') as PenStrokeStyle;
  const strokeAlign = (layer?.strokeAlign || 'center') as PenStrokeAlign;

  function closePanel() {
    setPanelOpen(false);
    setOpenSection(null);
    setOpenLine(null);
    setSlider(null);
  }

  function toggleSection(id: string) {
    setOpenSection((current) => (current === id ? null : id));
    setOpenLine(null);
    setSlider(null);
  }

  function toggleLine(id: string) {
    setOpenLine((current) => (current === id ? null : id));
  }

  function toggleSlider(id: string) {
    setSlider((current) => (current === id ? null : id));
  }

  function chooseFill(mode: BgMode | 'none') {
    if (mode === 'none') {
      patchPage({
        backgroundColor: 'transparent',
        backgroundGradient: undefined,
        backgroundImage: undefined,
        backgroundVideo: undefined
      });
      return;
    }
    if (mode === 'color') {
      if (isPage) {
        patchPage({
          backgroundColor: '#ffffff',
          backgroundGradient: undefined,
          backgroundImage: undefined,
          backgroundVideo: undefined
        });
      } else {
        patchLayer({
          backgroundGradient: undefined,
          backgroundImage: undefined,
          backgroundVideo: undefined,
          backgroundColor: fill.color || '#ffffff'
        });
      }
      return;
    }
    if (mode === 'gradient') {
      const gradient = 'linear-gradient(135deg, #111111 0%, #666666 100%)';
      if (isPage) {
        patchPage({
          backgroundGradient: gradient,
          backgroundImage: undefined,
          backgroundVideo: undefined,
          backgroundColor: 'transparent'
        });
      } else {
        patchLayer({
          backgroundGradient: gradient,
          backgroundImage: undefined,
          backgroundVideo: undefined,
          backgroundColor: undefined
        });
      }
      return;
    }
    setFileKind(mode);
    setCloudOpen(true);
    closePanel();
  }

  const isAction = layer?.kind === 'embed' || layer?.kind === 'interactive';
  const showBackground = !hideObjectTools;
  const showChrome = !isPage && !isGroup && !hideObjectTools;
  const showBlend = !isPage && !isGroup;
  const showPanel = showBackground || showBlend;

  useEffect(() => {
    if (!panelOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      closePanel();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [panelOpen]);

  const fillChoices: Array<BgMode | 'none'> = isPage
    ? ['none', 'color', 'gradient', 'image', 'video']
    : ['color', 'gradient', 'image', 'video'];

  return (
    <div className="relative flex max-w-full flex-wrap items-center gap-0.5">
      {isAction && layer && !hideActionBind && (
        <ActionBindStrip
          layer={layer}
          section={section}
          session={session}
          onSectionChange={onSectionChange}
        />
      )}
      {showPanel && (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            title="Layer"
            aria-label="Layer"
            aria-expanded={panelOpen}
            aria-pressed={panelOpen}
            className={`inline-flex h-7 w-7 items-center justify-center rounded ${
              panelOpen ? 'bg-neutral-100 text-black' : 'text-neutral-500 hover:text-black'
            }`}
            onClick={() => {
              if (panelOpen) closePanel();
              else setPanelOpen(true);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {panelOpen ? (
            <div
              data-layer-menu
              className="absolute right-0 top-full z-50 mt-1 max-h-80 w-56 overflow-y-auto rounded-md border border-stone-200 bg-white p-2 shadow-lg"
            >
              {showBackground && (
                <SectionRow
                  label="Background"
                  summary={fill.mode === 'none' ? 'None' : modeLabel(fill.mode)}
                  open={openSection === 'background'}
                  onToggle={() => toggleSection('background')}
                >
                  <div className="flex items-center gap-0.5">
                    {fillChoices.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-label={mode === 'none' ? 'No background' : modeLabel(mode)}
                        aria-pressed={fill.mode === mode}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded ${
                          fill.mode === mode ? 'bg-neutral-100 text-black' : 'text-neutral-500 hover:text-black'
                        }`}
                        onClick={() => chooseFill(mode)}
                      >
                        <FillIcon mode={mode} />
                      </button>
                    ))}
                  </div>
                  {fill.mode === 'color' && (
                    <ColorBox
                      label="Color"
                      ariaLabel="Background color"
                      value={fill.color || '#ffffff'}
                      onChange={(next) => {
                        if (isPage) patchPage({ backgroundColor: next });
                        else patchLayer({ backgroundColor: next, backgroundGradient: undefined });
                      }}
                    />
                  )}
                  {fill.mode === 'gradient' && (
                    <label className="flex h-5 items-center gap-1">
                      <span className="shrink-0 text-[13px] text-stone-500">Gradient</span>
                      <input
                        aria-label="Gradient"
                        type="text"
                        className="min-w-0 flex-1 bg-transparent text-right text-[13px] text-stone-700 outline-none"
                        value={fill.gradient}
                        onChange={(e) => {
                          if (isPage) patchPage({ backgroundGradient: e.target.value });
                          else patchLayer({ backgroundGradient: e.target.value });
                        }}
                      />
                    </label>
                  )}
                </SectionRow>
              )}
              {showChrome && (
                <SectionRow
                  label="Shadow"
                  open={openSection === 'shadow'}
                  onToggle={() => toggleSection('shadow')}
                >
                  <ColorBox
                    label="Color"
                    ariaLabel="Shadow color"
                    value={shadowColor || '#000000'}
                    onChange={(next) => patchLayer({ shadowColor: next, textShadow: undefined })}
                  />
                  <ValueRow
                    label="Blur"
                    ariaLabel="Shadow blur"
                    value={shadowBlur}
                    min={0}
                    max={40}
                    display={`${shadowBlur}px`}
                    open={slider === 'shadow-blur'}
                    onToggle={() => toggleSlider('shadow-blur')}
                    onChange={(next) => patchLayer({ shadowBlur: next, textShadow: undefined })}
                  />
                  <ValueRow
                    label="X"
                    value={shadowX}
                    min={-30}
                    max={30}
                    display={`${shadowX}px`}
                    open={slider === 'shadow-x'}
                    onToggle={() => toggleSlider('shadow-x')}
                    onChange={(next) => patchLayer({ shadowOffsetX: next, textShadow: undefined })}
                  />
                  <ValueRow
                    label="Y"
                    value={shadowY}
                    min={-30}
                    max={30}
                    display={`${shadowY}px`}
                    open={slider === 'shadow-y'}
                    onToggle={() => toggleSlider('shadow-y')}
                    onChange={(next) => patchLayer({ shadowOffsetY: next, textShadow: undefined })}
                  />
                </SectionRow>
              )}
              {showChrome && (
                <ValueRow
                  label="Blur"
                  value={blurVal}
                  min={0}
                  max={24}
                  display={`${blurVal}px`}
                  open={slider === 'blur'}
                  onToggle={() => toggleSlider('blur')}
                  onChange={(next) => patchLayer({ blur: next || undefined })}
                />
              )}
              {showBlend && (
                <SectionRow
                  label="Blend"
                  summary={modeLabel(blendMode)}
                  open={openSection === 'blend'}
                  onToggle={() => toggleSection('blend')}
                >
                  <ValueRow
                    label="Amount"
                    ariaLabel="Blend amount"
                    value={blendAmount}
                    min={0}
                    max={100}
                    display={`${Math.round(blendAmount)}%`}
                    open={slider === 'blend'}
                    onToggle={() => toggleSlider('blend')}
                    onChange={(next) => patchLayer({ blendAmount: next })}
                  />
                  <label className="flex h-5 items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-left text-[13px] text-stone-500">Mode</span>
                    <select
                      aria-label="Blend mode"
                      className="max-w-[8rem] truncate bg-transparent text-right text-[13px] text-stone-700 outline-none"
                      value={blendMode}
                      onChange={(e) => patchLayer({ mixBlendMode: e.target.value })}
                    >
                      {BLEND_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {modeLabel(mode)}
                        </option>
                      ))}
                    </select>
                  </label>
                </SectionRow>
              )}
              {showChrome && (
                <ValueRow
                  label="Opacity"
                  value={opacity}
                  min={0}
                  max={100}
                  display={`${Math.round(opacity)}%`}
                  open={slider === 'opacity'}
                  onToggle={() => toggleSlider('opacity')}
                  onChange={(next) => patchLayer({ opacity: next })}
                />
              )}
              {showChrome && (
                <SectionRow
                  label="Stroke"
                  open={openSection === 'stroke'}
                  onToggle={() => toggleSection('stroke')}
                >
                  <ColorBox
                    label="Color"
                    ariaLabel="Stroke color"
                    value={strokeColor || '#000000'}
                    onChange={(next) =>
                      patchLayer({
                        strokeColor: next,
                        strokeWidth: strokeWidth || 1
                      })
                    }
                  />
                  <ValueRow
                    label="Width"
                    value={strokeWidth}
                    min={0}
                    max={24}
                    display={`${strokeWidth}px`}
                    open={slider === 'stroke-width'}
                    onToggle={() => toggleSlider('stroke-width')}
                    onChange={(next) =>
                      patchLayer({
                        strokeWidth: next || undefined,
                        strokeColor: next ? strokeColor || '#000000' : undefined
                      })
                    }
                  />
                  <LineMenu
                    label="Style"
                    value={modeLabel(strokeStyle)}
                    open={openLine === 'stroke-style'}
                    onToggle={() => toggleLine('stroke-style')}
                  >
                    {(['solid', 'dashed', 'dotted'] as PenStrokeStyle[]).map((style) => (
                      <ChoiceLine
                        key={style}
                        label={modeLabel(style)}
                        selected={strokeStyle === style}
                        onClick={() =>
                          patchLayer({
                            strokeStyle: style,
                            strokeWidth: strokeWidth || 1,
                            strokeColor: strokeColor || '#000000'
                          })
                        }
                      />
                    ))}
                  </LineMenu>
                  <div className="flex h-5 items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-left text-[13px] text-stone-500">Align</span>
                    <span className="flex items-center gap-0.5">
                      {(['inside', 'center', 'outside'] as PenStrokeAlign[]).map((align) => (
                        <button
                          key={align}
                          type="button"
                          aria-label={modeLabel(align)}
                          aria-pressed={strokeAlign === align}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded ${
                            strokeAlign === align
                              ? 'bg-neutral-100 text-black'
                              : 'text-neutral-500 hover:text-black'
                          }`}
                          onClick={() =>
                            patchLayer({
                              strokeAlign: align,
                              strokeWidth: strokeWidth || 1,
                              strokeColor: strokeColor || '#000000'
                            })
                          }
                        >
                          <AlignIcon align={align} />
                        </button>
                      ))}
                    </span>
                  </div>
                </SectionRow>
              )}
            </div>
          ) : null}
        </div>
      )}
      {!isPage && !isGroup && (
          <button
            type="button"
            title="Wrap with Body — Body text flows around this object"
            aria-label="Wrap with Body"
            aria-pressed={Boolean(layer?.bodyWrap)}
            className={`inline-flex h-7 items-center justify-center rounded px-1.5 text-[11px] ${
              layer?.bodyWrap
                ? 'font-bold text-black'
                : 'font-medium text-neutral-400 hover:text-neutral-600'
            }`}
            onClick={() => {
              if (!layer) return;
              if (layer.bodyWrap) {
                patchLayer({ bodyWrap: undefined });
              } else {
                const side = wrapSideFromGeom(layer.x, layer.w, contentWidthPx);
                patchLayer({ bodyWrap: side });
              }
            }}
          >
            Wrap
          </button>
      )}


      <CloudFeedMediaPicker
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        session={session || null}
        kind={fileKind}
        docId={docId}
        onPickMediaSrc={(url, meta) => void applyMediaSrc(url, meta)}
      />
    </div>
  );
}

/** Shadow, blur, opacity, blend, and stroke belong to the layer frame, outside the clipped face. */
export function layerChromeStyle(layer: PenPageLayer): CSSProperties {
  const shadow = layerShadowCss(layer);
  const stroke = layerStrokeStyle(layer);
  const opacityPct = layer.opacity ?? 100;
  const blendAmt = (layer.blendAmount ?? 100) / 100;
  const boxShadow =
    stroke.boxShadow && shadow ? `${stroke.boxShadow}, ${shadow}` : stroke.boxShadow || shadow;
  const style: CSSProperties = {
    opacity: (opacityPct / 100) * (layer.mixBlendMode && layer.mixBlendMode !== 'normal' ? blendAmt : 1),
    mixBlendMode: (layer.mixBlendMode as CSSProperties['mixBlendMode']) || undefined,
    filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
    boxShadow,
    border: stroke.border,
    outline: stroke.outline,
    outlineOffset: stroke.outlineOffset
  };
  if (layer.kind === 'group') {
    style.border = style.border || '1px dashed rgba(0,0,0,0.25)';
  }
  return style;
}

/** Fill painted on the clipped face. Text color lives in the text document. */
export function layerPreviewStyle(layer: PenPageLayer): CSSProperties {
  const style: CSSProperties = {};
  if (layer.kind === 'group') {
    style.backgroundColor = 'transparent';
    return style;
  }
  if (layer.kind === 'image' || layer.kind === 'video') {
    style.backgroundColor = layer.backgroundColor || 'transparent';
    return style;
  }
  if (layer.cornerRadius) style.borderRadius = `${layer.cornerRadius}px`;
  if (layer.backgroundGradient) {
    style.backgroundImage = layer.backgroundGradient;
  } else if (layer.backgroundImage && !isPenMediaSrcRef(layer.backgroundImage)) {
    style.backgroundImage = `url(${layer.backgroundImage})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  } else if (layer.backgroundColor) {
    style.backgroundColor = layer.backgroundColor;
  } else {
    style.backgroundColor = 'rgba(255,255,255,0.95)';
  }
  return style;
}

export function pageFrameStyle(presentation: PenPagePresentation): CSSProperties {
  const style: CSSProperties = {};
  const hasMedia =
    Boolean(presentation.backgroundGradient) ||
    Boolean(presentation.backgroundImage) ||
    Boolean(presentation.backgroundVideo);
  if (
    presentation.backgroundColor &&
    presentation.backgroundColor !== 'transparent' &&
    !hasMedia
  ) {
    style.backgroundColor = presentation.backgroundColor;
  } else {
    style.backgroundColor = 'transparent';
  }
  if (presentation.backgroundGradient) {
    style.backgroundImage = presentation.backgroundGradient;
  }
  // Image/video backgrounds render via ResolvedPageBackground (supports penlocal/penmedia).
  return style;
}
