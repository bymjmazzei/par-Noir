/** Art layer background: color, gradient, image, video, or HTML snippet. */

import { useState } from 'react';
import {
  patchLayerStyle,
  setWidgetHtml,
  switchWidgetArtFillMode,
  applyWidgetArtMedia,
  widgetArtFillMode,
  type PenPageLayer,
  type PenSectionContent,
  type WidgetArtFillMode
} from '@par-noir/pen-protocol';
import { CloudFeedMediaPicker } from './CloudFeedMediaPicker';
import { ColorBox } from './PanelValueControls';
import { GradientPicker } from './GradientPicker';
import type { PenSession } from '../services/penSession';
import { setAttachPoster } from '../services/attachPosterCache';

const MODES: Array<{ id: WidgetArtFillMode; label: string }> = [
  { id: 'color', label: 'Color' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'html', label: 'HTML' }
];

export function WidgetArtFillEditor({
  layer,
  section,
  onSectionChange,
  session,
  docId
}: {
  layer: PenPageLayer;
  section: PenSectionContent;
  onSectionChange: (next: PenSectionContent) => void;
  session?: PenSession | null;
  docId?: string;
}) {
  const mode = widgetArtFillMode(layer);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudKind, setCloudKind] = useState<'image' | 'video'>('image');

  function pickMode(next: WidgetArtFillMode) {
    if (next === 'image' || next === 'video') {
      onSectionChange(switchWidgetArtFillMode(section, layer.id, next));
      setCloudKind(next);
      setCloudOpen(true);
      return;
    }
    onSectionChange(switchWidgetArtFillMode(section, layer.id, next));
  }

  return (
    <div className="flex flex-col gap-3 border-b border-stone-200 px-3 py-3 text-sm" data-widget-art-editor>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Art background</span>
        <div className="flex flex-wrap gap-1">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              className={`rounded px-2 py-0.5 text-[11px] ${
                mode === item.id ? 'bg-teal-800 text-white' : 'bg-stone-100 text-stone-800'
              }`}
              onClick={() => pickMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'color' && (
        <ColorBox
          label="Color"
          ariaLabel="Art background color"
          value={layer.backgroundColor || '#f5f5f5'}
          onChange={(value) =>
            onSectionChange(
              patchLayerStyle(section, layer.id, {
                backgroundColor: value,
                backgroundGradient: undefined,
                backgroundImage: undefined,
                backgroundVideo: undefined,
                htmlSource: undefined
              })
            )
          }
        />
      )}

      {mode === 'gradient' && (
        <GradientPicker
          value={layer.backgroundGradient}
          onChange={(next) =>
            onSectionChange(
              patchLayerStyle(section, layer.id, {
                backgroundGradient: next,
                backgroundImage: undefined,
                backgroundVideo: undefined,
                htmlSource: undefined
              })
            )
          }
        />
      )}

      {mode === 'image' && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="self-start text-teal-800"
            onClick={() => {
              setCloudKind('image');
              setCloudOpen(true);
            }}
          >
            Choose image
          </button>
          {layer.backgroundImage ? (
            <span className="truncate font-mono text-[10px] text-stone-500">{layer.backgroundImage}</span>
          ) : (
            <span className="text-xs text-stone-500">No image attached</span>
          )}
        </div>
      )}

      {mode === 'video' && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="self-start text-teal-800"
            onClick={() => {
              setCloudKind('video');
              setCloudOpen(true);
            }}
          >
            Choose video
          </button>
          {layer.backgroundVideo ? (
            <span className="truncate font-mono text-[10px] text-stone-500">{layer.backgroundVideo}</span>
          ) : (
            <span className="text-xs text-stone-500">No video attached</span>
          )}
        </div>
      )}

      {mode === 'html' && (
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">HTML snippet</span>
          <textarea
            aria-label="HTML snippet"
            className="min-h-24 border border-stone-300 px-2 py-1 font-mono text-xs"
            value={layer.htmlSource || ''}
            onChange={(event) => onSectionChange(setWidgetHtml(section, layer.id, event.target.value))}
          />
        </label>
      )}

      <CloudFeedMediaPicker
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        session={session || null}
        kind={cloudKind}
        docId={docId}
        onPickMediaSrc={(url, meta) => {
          if (meta?.blobUrl) setAttachPoster(url, meta.blobUrl);
          onSectionChange(
            applyWidgetArtMedia(section, layer.id, cloudKind === 'image' ? { kind: 'image', src: url } : { kind: 'video', src: url })
          );
          setCloudOpen(false);
        }}
      />
    </div>
  );
}
