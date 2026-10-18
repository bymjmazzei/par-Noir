/** Preview face for widget Art layers — structured fill or sandboxed HTML snippet. */

import type { CSSProperties } from 'react';
import { widgetArtUsesHtmlSnippet, type PenPageLayer } from '@par-noir/pen-protocol';
import { isPenMediaSrcRef } from '@par-noir/pen-media';
import { layerPreviewStyle } from './LayerObjectToolbar';
import { ResolvedPageBackground } from './EditablePagePreview';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import type { PenSession } from '../services/penSession';

function WidgetArtStructuredFill({
  layer,
  shell,
  docId,
  session
}: {
  layer: PenPageLayer;
  shell: CSSProperties;
  docId?: string;
  session?: PenSession | null;
}) {
  const imageRef = layer.backgroundImage?.trim() || '';
  const { resolved: resolvedImage } = useResolvedMediaSrc(
    imageRef && isPenMediaSrcRef(imageRef) ? imageRef : '',
    { docId, session }
  );
  const style: CSSProperties = { ...shell, ...layerPreviewStyle(layer) };
  if (imageRef && isPenMediaSrcRef(imageRef) && resolvedImage) {
    style.backgroundImage = `url(${resolvedImage})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  }

  if (layer.backgroundVideo?.trim()) {
    return (
      <div className="relative h-full w-full overflow-hidden" style={style} data-widget-art-fill="video">
        <div className="absolute inset-0">
          <ResolvedPageBackground
            src={layer.backgroundVideo}
            videoSrc={layer.videoSrc}
            kind="video"
            docId={docId}
            session={session}
          />
        </div>
      </div>
    );
  }

  return <div className="h-full w-full overflow-hidden" style={style} data-widget-art-fill="1" />;
}

export function WidgetArtLayerFace({
  layer,
  shell,
  docId,
  session
}: {
  layer: PenPageLayer;
  shell: CSSProperties;
  docId?: string;
  session?: PenSession | null;
}) {
  if (layer.widgetElement !== 'html') return null;
  if (!widgetArtUsesHtmlSnippet(layer)) {
    return <WidgetArtStructuredFill layer={layer} shell={shell} docId={docId} session={session} />;
  }
  return (
    <iframe
      title={layer.name || 'Art'}
      sandbox=""
      data-pen-html-snippet="1"
      className="pointer-events-none h-full w-full border-0 bg-white"
      srcDoc={layer.htmlSource || ''}
    />
  );
}
