/** One overlay layer's face, drawn the same in the Pen editor and in feed playback. */

import type { CSSProperties, ReactNode } from 'react';
import {
  docToHtml,
  docToPlainText,
  getTextLayerDoc,
  layerMediaSource,
  sanitizeWidgetMarkup,
  timeLayerCaption,
  widgetArtUsesHtmlSnippet,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import { DEFAULT_FEED_PLAYBACK, FeedLoopVideo, type FeedPlayback } from './FeedLoopVideo.js';
import { layerFaceStyle } from './penLayerStyle.js';

export type PenLayerFaceProps = {
  layer: PenPageLayer;
  /** Host frame: feed position + chrome. The face paint goes on top. */
  style?: CSSProperties;
  /** Corner radius multiplier (feed tiles pass the group zoom). */
  paintScale?: number;
  /** Doc default font for text layers. */
  fontFamily?: string;
  /** Poll result or other runtime face that replaces the authored label. */
  runtimeLabel?: string;
  /** Live counter shown after the authored label. */
  labelSuffix?: string;
  /** Time or score caption. Time falls back to its static caption. */
  caption?: string;
  inputValue?: string;
  onInput?: (layerId: string, value: string) => void;
  onPress?: (layerId: string) => void;
  /** Resolved address for the layer's image or video (see `layerMediaSource`). */
  mediaSrc?: string;
  /** Host-drawn media (Pen editor). Wins over `mediaSrc`. */
  media?: ReactNode;
  playback?: FeedPlayback;
  /** Editor: placeholder for empty text and scrollable overflow. */
  editor?: boolean;
  title?: string;
};

const EMPTY_TEXT_HTML = '<p class="text-neutral-400">Text</p>';

function MediaFill({
  media,
  src,
  kind,
  playback
}: {
  media?: ReactNode;
  src?: string;
  kind?: 'image' | 'video';
  playback: FeedPlayback;
}) {
  if (media) return <div className="absolute inset-0">{media}</div>;
  if (!src || !kind) return null;
  if (kind === 'video') {
    return (
      <div className="absolute inset-0">
        <FeedLoopVideo
          src={src}
          fit="cover"
          active={playback.active}
          paused={playback.paused}
          muted
        />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

function buttonFace(layer: PenPageLayer, runtimeLabel?: string, labelSuffix?: string): ReactNode {
  if (runtimeLabel) return runtimeLabel;
  const plain = layer.textDoc ? docToPlainText(layer.textDoc).trim() : '';
  const suffix = labelSuffix ? ` · ${labelSuffix}` : '';
  if (!plain) return `${layer.label || 'Button'}${suffix}`;
  return (
    <>
      <span
        className="pen-rich-html pen-rich-face"
        dangerouslySetInnerHTML={{ __html: docToHtml(layer.textDoc) }}
      />
      {suffix ? <span>{suffix}</span> : null}
    </>
  );
}

export function PenLayerFace({
  layer,
  style,
  paintScale,
  fontFamily,
  runtimeLabel,
  labelSuffix,
  caption,
  inputValue,
  onInput,
  onPress,
  mediaSrc,
  media,
  playback = DEFAULT_FEED_PLAYBACK,
  editor = false,
  title
}: PenLayerFaceProps) {
  const source = layerMediaSource(layer);
  const backgroundImageSrc =
    source?.kind === 'image' && layer.kind !== 'image' && mediaSrc ? mediaSrc : undefined;
  const face: CSSProperties = {
    ...style,
    ...layerFaceStyle(layer, { scale: paintScale, backgroundImageSrc })
  };
  const common = { 'data-pen-layer': layer.id, title };

  if (layer.kind === 'group') {
    return <div className="h-full w-full" style={face} {...common} />;
  }

  if (layer.kind === 'image' || layer.kind === 'video') {
    return (
      <div className="relative h-full w-full overflow-hidden" style={face} {...common}>
        <MediaFill media={media} src={mediaSrc} kind={source?.kind} playback={playback} />
      </div>
    );
  }

  if (layer.widgetElement === 'svg' && layer.svgSrc) {
    return (
      <div
        className="h-full w-full overflow-hidden"
        style={face}
        {...common}
        dangerouslySetInnerHTML={{ __html: sanitizeWidgetMarkup(layer.svgSrc) }}
      />
    );
  }

  if (layer.widgetElement === 'html') {
    if (widgetArtUsesHtmlSnippet(layer)) {
      return (
        <iframe
          title={layer.name || 'Art'}
          sandbox=""
          data-pen-html-snippet="1"
          data-pen-layer={layer.id}
          className="pointer-events-none h-full w-full border-0 bg-transparent"
          style={style}
          srcDoc={layer.htmlSource || ''}
        />
      );
    }
    const videoFill = source?.kind === 'video';
    return (
      <div
        className="relative h-full w-full overflow-hidden"
        style={face}
        data-widget-art-fill={videoFill ? 'video' : '1'}
        {...common}
      >
        {videoFill ? (
          <MediaFill media={media} src={mediaSrc} kind="video" playback={playback} />
        ) : null}
      </div>
    );
  }

  if (layer.widgetElement === 'input') {
    return (
      <input
        type="text"
        data-layer-id={layer.id}
        data-pen-layer={layer.id}
        aria-label={layer.name || 'Text input'}
        className="pointer-events-auto h-full w-full border-0 px-2 text-sm outline-none"
        style={{
          ...face,
          color: layer.textColor || '#141414',
          backgroundColor: layer.backgroundColor || '#ffffff'
        }}
        placeholder={layer.label || layer.name || ''}
        value={inputValue || ''}
        onChange={(e) => onInput?.(layer.id, e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onPress?.(layer.id);
        }}
        onKeyDown={(e) => e.stopPropagation()}
      />
    );
  }

  if (layer.widgetElement === 'time') {
    const text = caption ?? timeLayerCaption(layer);
    if (!text && !editor) return null;
    return (
      <div
        className="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden whitespace-nowrap text-xs tabular-nums"
        style={face}
        data-pen-time="1"
        {...common}
      >
        {text}
      </div>
    );
  }

  if (layer.widgetElement === 'score') {
    if (!caption && !editor) return null;
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm font-semibold tabular-nums"
        style={face}
        data-pen-score="1"
        {...common}
      >
        {caption}
      </div>
    );
  }

  if (layer.kind === 'interactive') {
    return (
      <button
        type="button"
        className="pointer-events-auto flex h-full w-full items-center justify-center overflow-hidden px-3 text-sm font-medium"
        style={face}
        data-pen-behavior={layer.behavior}
        {...common}
        title={title ?? layer.behavior ?? 'button'}
        onClick={(e) => {
          e.stopPropagation();
          onPress?.(layer.id);
        }}
      >
        {buttonFace(layer, runtimeLabel, labelSuffix)}
      </button>
    );
  }

  const html = docToHtml(getTextLayerDoc(layer)) || (editor ? EMPTY_TEXT_HTML : '');
  return (
    <div className="relative h-full w-full overflow-hidden" style={face} {...common}>
      {source?.kind === 'video' ? (
        <MediaFill media={media} src={mediaSrc} kind="video" playback={playback} />
      ) : null}
      <div
        className={`pen-rich-html relative flex h-full w-full flex-col p-2 text-sm ${editor ? 'overflow-auto' : 'overflow-hidden'}`}
        style={{ fontFamily: fontFamily || undefined, justifyContent: verticalJustify(layer) }}
        data-pen-valign={layer.textVerticalAlign || 'top'}
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

/** Unsafe justify, like Figma: tight label boxes still center when the line overflows. */
function verticalJustify(layer: PenPageLayer): CSSProperties['justifyContent'] {
  if (layer.textVerticalAlign === 'middle') return 'center';
  if (layer.textVerticalAlign === 'bottom') return 'flex-end';
  return undefined;
}
