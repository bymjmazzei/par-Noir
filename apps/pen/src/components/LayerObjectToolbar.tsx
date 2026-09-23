/**
 * Object adjustment icons on the page preview bar — apply only to the active layer
 * (page frame = layer 0, or an overlay object).
 * Page (layer 0): background only. Overlay objects: BG + shadow + blur + blend + opacity + stroke.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  layerShadowCss,
  layerStrokeStyle,
  patchLayerStyle,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent,
  type PenStrokeAlign,
  type PenStrokeStyle
} from '@par-noir/pen-protocol';
import { CloudFeedMediaPicker } from './CloudFeedMediaPicker';
import type { PenSession } from '../services/penSession';

export type ObjectToolTarget =
  | { kind: 'page' }
  | { kind: 'layer'; layer: PenPageLayer };

type BgMode = 'color' | 'gradient' | 'image' | 'video';
type OpenTool = 'bg' | 'shadow' | 'blur' | 'blend' | 'opacity' | 'stroke' | null;

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

function ToolButton({
  title,
  active,
  onClick,
  children
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`inline-flex h-7 w-7 items-center justify-center rounded ${
        active ? 'bg-neutral-100 text-black' : 'text-neutral-500 hover:text-black'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
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
      className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-neutral-200 bg-white p-3 shadow-lg"
    >
      {children}
    </div>
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
  onPresentationChange,
  onSectionChange
}: {
  target: ObjectToolTarget;
  presentation: PenPagePresentation;
  section: PenSectionContent;
  session?: PenSession | null;
  docId?: string;
  onPresentationChange?: (next: Partial<PenPagePresentation>) => void;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const [open, setOpen] = useState<OpenTool>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [fileKind, setFileKind] = useState<'image' | 'video'>('image');

  const isPage = target.kind === 'page';
  const layer = target.kind === 'layer' ? target.layer : null;
  const isGroup = layer?.kind === 'group';
  const fill = isPage ? pageFill(presentation) : layerFill(layer!);

  function patchLayer(patch: Parameters<typeof patchLayerStyle>[2]) {
    if (!layer) return;
    onSectionChange(patchLayerStyle(section, layer.id, patch));
  }

  function patchPage(partial: Partial<PenPagePresentation>) {
    onPresentationChange?.(partial);
  }

  async function applyMediaDataUrl(src: string) {
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

  function toggle(tool: Exclude<OpenTool, null>) {
    setOpen(open === tool ? null : tool);
  }

  return (
    <div className="relative flex items-center gap-0.5">
      <ToolButton title="Background" active={open === 'bg'} onClick={() => toggle('bg')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M3 15l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </ToolButton>
      {!isPage && !isGroup && (
        <>
          <ToolButton title="Shadow" active={open === 'shadow'} onClick={() => toggle('shadow')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="5" y="5" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="2" />
              <path d="M9 15h8v8H9z" fill="currentColor" opacity="0.25" />
            </svg>
          </ToolButton>
          <ToolButton title="Blur" active={open === 'blur'} onClick={() => toggle('blur')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2" />
            </svg>
          </ToolButton>
          <ToolButton title="Blend" active={open === 'blend'} onClick={() => toggle('blend')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="9" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
              <circle cx="15" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </ToolButton>
          <ToolButton title="Opacity" active={open === 'opacity'} onClick={() => toggle('opacity')}>
            <span className="text-[10px] font-bold">{Math.round(opacity)}</span>
          </ToolButton>
          <ToolButton title="Stroke" active={open === 'stroke'} onClick={() => toggle('stroke')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="4"
                y="4"
                width="16"
                height="16"
                rx="1"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="3 2"
                fill="none"
              />
            </svg>
          </ToolButton>
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
              if (layer?.bodyWrap) {
                patchLayer({ bodyWrap: undefined });
              } else {
                const side =
                  layer.x + layer.w / 2 < 50 ? ('left' as const) : ('right' as const);
                patchLayer({ bodyWrap: side });
              }
            }}
          >
            Wrap
          </button>
        </>
      )}

      <Popover open={open === 'bg'} onClose={() => setOpen(null)}>
        <div className="space-y-2 text-[11px]">
          <div className="font-bold uppercase tracking-wide text-neutral-400">Background</div>
          <div className="flex flex-wrap gap-1">
            {isPage && (
              <button
                type="button"
                className={`rounded px-2 py-1 ${
                  fill.mode === 'none' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700'
                }`}
                onClick={() =>
                  patchPage({
                    backgroundColor: 'transparent',
                    backgroundGradient: undefined,
                    backgroundImage: undefined,
                    backgroundVideo: undefined
                  })
                }
              >
                None
              </button>
            )}
            {(['color', 'gradient', 'image', 'video'] as BgMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`rounded px-2 py-1 capitalize ${
                  fill.mode === m ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700'
                }`}
                onClick={() => {
                  if (m === 'color') {
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
                  } else if (m === 'gradient') {
                    const g = 'linear-gradient(135deg, #111111 0%, #666666 100%)';
                    if (isPage) {
                      patchPage({
                        backgroundGradient: g,
                        backgroundImage: undefined,
                        backgroundVideo: undefined,
                        backgroundColor: 'transparent'
                      });
                    } else {
                      patchLayer({
                        backgroundGradient: g,
                        backgroundImage: undefined,
                        backgroundVideo: undefined,
                        backgroundColor: undefined
                      });
                    }
                  } else {
                    setFileKind(m);
                    setCloudOpen(true);
                    setOpen(null);
                  }
                }}
              >
                {m}
              </button>
            ))}
          </div>
          {(fill.mode === 'color' || fill.mode === 'gradient') && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Color</span>
              <input
                type="color"
                value={/^#/.test(fill.color) ? fill.color : '#ffffff'}
                onChange={(e) => {
                  if (isPage) patchPage({ backgroundColor: e.target.value });
                  else patchLayer({ backgroundColor: e.target.value, backgroundGradient: undefined });
                }}
                className="h-7 w-10 cursor-pointer rounded border border-neutral-300"
              />
            </label>
          )}
          {fill.mode === 'gradient' && (
            <label className="block space-y-1">
              <span className="text-neutral-500">Gradient CSS</span>
              <input
                type="text"
                className="w-full rounded border border-neutral-200 px-2 py-1 text-[11px]"
                value={fill.gradient}
                onChange={(e) => {
                  if (isPage) patchPage({ backgroundGradient: e.target.value });
                  else patchLayer({ backgroundGradient: e.target.value });
                }}
              />
            </label>
          )}
          {(fill.mode === 'image' || fill.mode === 'video') && (
            <button
              type="button"
              className="font-bold text-black hover:opacity-60"
              onClick={() => {
                setFileKind(fill.mode === 'video' ? 'video' : 'image');
                setCloudOpen(true);
                setOpen(null);
              }}
            >
              Replace {fill.mode}…
            </button>
          )}
        </div>
      </Popover>

      <Popover open={open === 'shadow'} onClose={() => setOpen(null)}>
        <div className="space-y-2 text-[11px]">
          <div className="font-bold uppercase tracking-wide text-neutral-400">Shadow</div>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Color</span>
            <input
              type="color"
              value={/^#/.test(shadowColor) ? shadowColor.slice(0, 7) : '#000000'}
              onChange={(e) => patchLayer({ shadowColor: e.target.value, textShadow: undefined })}
              className="h-7 w-10 cursor-pointer rounded border border-neutral-300"
            />
          </label>
          <label className="block">
            <div className="mb-0.5 flex justify-between text-neutral-500">
              <span>Blur</span>
              <span>{shadowBlur}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={shadowBlur}
              onChange={(e) =>
                patchLayer({ shadowBlur: Number(e.target.value), textShadow: undefined })
              }
              className="w-full"
            />
          </label>
          <label className="block">
            <div className="mb-0.5 flex justify-between text-neutral-500">
              <span>X</span>
              <span>{shadowX}px</span>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              value={shadowX}
              onChange={(e) =>
                patchLayer({ shadowOffsetX: Number(e.target.value), textShadow: undefined })
              }
              className="w-full"
            />
          </label>
          <label className="block">
            <div className="mb-0.5 flex justify-between text-neutral-500">
              <span>Y</span>
              <span>{shadowY}px</span>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              value={shadowY}
              onChange={(e) =>
                patchLayer({ shadowOffsetY: Number(e.target.value), textShadow: undefined })
              }
              className="w-full"
            />
          </label>
        </div>
      </Popover>

      <Popover open={open === 'blur'} onClose={() => setOpen(null)}>
        <div className="space-y-2 text-[11px]">
          <div className="font-bold uppercase tracking-wide text-neutral-400">Blur</div>
          <label className="block">
            <div className="mb-0.5 flex justify-between text-neutral-500">
              <span>Amount</span>
              <span>{blurVal}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={blurVal}
              onChange={(e) => patchLayer({ blur: Number(e.target.value) || undefined })}
              className="w-full"
            />
          </label>
        </div>
      </Popover>

      <Popover open={open === 'blend'} onClose={() => setOpen(null)}>
        <div className="space-y-2 text-[11px]">
          <div className="font-bold uppercase tracking-wide text-neutral-400">Blend</div>
          <select
            className="w-full rounded border border-neutral-200 px-2 py-1"
            value={blendMode}
            onChange={(e) => patchLayer({ mixBlendMode: e.target.value })}
          >
            {BLEND_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className="block">
            <div className="mb-0.5 flex justify-between text-neutral-500">
              <span>Amount</span>
              <span>{Math.round(blendAmount)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={blendAmount}
              onChange={(e) => patchLayer({ blendAmount: Number(e.target.value) })}
              className="w-full"
            />
          </label>
        </div>
      </Popover>

      <Popover open={open === 'opacity'} onClose={() => setOpen(null)}>
        <div className="space-y-2 text-[11px]">
          <div className="font-bold uppercase tracking-wide text-neutral-400">Opacity</div>
          <label className="block">
            <div className="mb-0.5 flex justify-between text-neutral-500">
              <span>Value</span>
              <span>{Math.round(opacity)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => patchLayer({ opacity: Number(e.target.value) })}
              className="w-full"
            />
          </label>
        </div>
      </Popover>

      <Popover open={open === 'stroke'} onClose={() => setOpen(null)}>
        <div className="space-y-2 text-[11px]">
          <div className="font-bold uppercase tracking-wide text-neutral-400">Stroke</div>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Color</span>
            <input
              type="color"
              value={/^#/.test(strokeColor) ? strokeColor.slice(0, 7) : '#000000'}
              onChange={(e) =>
                patchLayer({
                  strokeColor: e.target.value,
                  strokeWidth: strokeWidth || 1
                })
              }
              className="h-7 w-10 cursor-pointer rounded border border-neutral-300"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-neutral-500">Style</span>
            <select
              className="w-full rounded border border-neutral-200 px-2 py-1"
              value={strokeStyle}
              onChange={(e) =>
                patchLayer({
                  strokeStyle: e.target.value as PenStrokeStyle,
                  strokeWidth: strokeWidth || 1,
                  strokeColor: strokeColor || '#000000'
                })
              }
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
          <label className="block">
            <div className="mb-0.5 flex justify-between text-neutral-500">
              <span>Width</span>
              <span>{strokeWidth}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={strokeWidth}
              onChange={(e) => {
                const v = Number(e.target.value);
                patchLayer({
                  strokeWidth: v || undefined,
                  strokeColor: v ? strokeColor || '#000000' : undefined
                });
              }}
              className="w-full"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-neutral-500">Align</span>
            <div className="flex gap-1">
              {(['inside', 'center', 'outside'] as PenStrokeAlign[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`flex-1 rounded px-1 py-1 capitalize ${
                    strokeAlign === a ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700'
                  }`}
                  onClick={() =>
                    patchLayer({
                      strokeAlign: a,
                      strokeWidth: strokeWidth || 1,
                      strokeColor: strokeColor || '#000000'
                    })
                  }
                >
                  {a}
                </button>
              ))}
            </div>
          </label>
        </div>
      </Popover>

      <CloudFeedMediaPicker
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        session={session || null}
        kind={fileKind}
        docId={docId}
        onPickDataUrl={(url) => void applyMediaDataUrl(url)}
      />
    </div>
  );
}

/** Apply layer visual styles for preview render. */
export function layerPreviewStyle(layer: PenPageLayer): CSSProperties {
  const shadow = layerShadowCss(layer);
  const stroke = layerStrokeStyle(layer);
  const opacityPct = layer.opacity ?? 100;
  const blendAmt = (layer.blendAmount ?? 100) / 100;
  const style: CSSProperties = {
    opacity: (opacityPct / 100) * (layer.mixBlendMode && layer.mixBlendMode !== 'normal' ? blendAmt : 1),
    mixBlendMode: (layer.mixBlendMode as CSSProperties['mixBlendMode']) || undefined,
    filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
    boxShadow: stroke.boxShadow || shadow,
    textShadow: shadow,
    border: stroke.border,
    outline: stroke.outline,
    outlineOffset: stroke.outlineOffset
  };
  if (layer.kind === 'group') {
    style.backgroundColor = 'transparent';
    style.border = style.border || '1px dashed rgba(0,0,0,0.25)';
    return style;
  }
  if (layer.backgroundGradient) {
    style.backgroundImage = layer.backgroundGradient;
  } else if (layer.backgroundImage) {
    style.backgroundImage = `url(${layer.backgroundImage})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  } else if (layer.backgroundColor) {
    style.backgroundColor = layer.backgroundColor;
  } else {
    style.backgroundColor = 'rgba(255,255,255,0.95)';
  }
  // When both stroke center boxShadow and drop shadow exist, prefer stroke on the box;
  // drop shadow still applies via textShadow for text layers.
  if (stroke.boxShadow && shadow) {
    style.boxShadow = `${stroke.boxShadow}, ${shadow}`;
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
  } else if (presentation.backgroundImage) {
    style.backgroundImage = `url(${presentation.backgroundImage})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  }
  // Page (layer 0) has no shadow — fill/background only.
  return style;
}
