/**
 * Dev-only stage for scripts/widget-posters.mjs, with no session.
 * A starter widget sits on a page sized to its art. A platform post template shows its first page at full frame, intros settled.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { frameOf, getTemplate, PAGE_LAYER_ID, PLATFORM_POST_TEMPLATE_IDS } from '@par-noir/pen-protocol';
import { EditablePagePreview } from './components/EditablePagePreview';
import { previewBundleFromTemplate } from './components/TemplateGalleryThumb';
import './services/penMediaSetup';
import './index.css';

/** The editor's default page padding on each side of the art frame. */
const STAGE_PAD_PX = 40;

function PosterStage() {
  const id = new URLSearchParams(window.location.search).get('id') || '';
  const template = getTemplate(id);
  const bundle = template ? previewBundleFromTemplate(undefined, template) : null;
  const section = bundle?.sections[0];
  if (!template || !bundle || !section) return <p data-poster-missing="1">Unknown template {id}</p>;
  const isPost = PLATFORM_POST_TEMPLATE_IDS.includes(id);
  const art = section.layers?.find((layer) => layer.widgetElement === 'html');
  const frame = isPost ? frameOf(template) : { w: art?.w ?? 360, h: art?.h ?? 360 };
  const settledSec = isPost
    ? Math.max(0, ...(section.layers || []).map((layer) => layer.motion?.animation?.durationSec ?? 0.4)) + 0.1
    : undefined;
  /** Groups draw a dashed editor guide unless stroked; posters show the post, not the guide. */
  const staged = isPost
    ? {
        ...section,
        layers: (section.layers || []).map((layer) =>
          layer.kind === 'group' && !layer.strokeWidth
            ? { ...layer, strokeWidth: 1, strokeColor: 'transparent', strokeAlign: 'inside' as const }
            : layer
        )
      }
    : section;
  return (
    <div data-poster-frame-w={frame.w} data-poster-frame-h={frame.h}>
      <EditablePagePreview
        manifest={{
          ...bundle.manifest,
          pageLayout: 'flow',
          flowWorkspaceWidthPx: frame.w + 2 * STAGE_PAD_PX,
          flowWorkspaceHeightPx: frame.h + 2 * STAGE_PAD_PX
        }}
        section={staged}
        activeLayerId={PAGE_LAYER_ID}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
        showToolbar={false}
        hideObjectTools
        playheadSec={settledSec}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PosterStage />
    </BrowserRouter>
  </React.StrictMode>
);
