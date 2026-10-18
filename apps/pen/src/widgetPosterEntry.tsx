/** Dev-only stage for scripts/widget-posters.mjs: one starter widget on a page sized to its art, no session. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { getTemplate, PAGE_LAYER_ID } from '@par-noir/pen-protocol';
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
  if (!bundle || !section) return <p data-poster-missing="1">Unknown widget {id}</p>;
  const art = section.layers?.find((layer) => layer.widgetElement === 'html');
  return (
    <EditablePagePreview
      manifest={{
        ...bundle.manifest,
        pageLayout: 'flow',
        flowWorkspaceWidthPx: (art?.w ?? 360) + 2 * STAGE_PAD_PX,
        flowWorkspaceHeightPx: (art?.h ?? 360) + 2 * STAGE_PAD_PX
      }}
      section={section}
      activeLayerId={PAGE_LAYER_ID}
      onSelectLayer={() => undefined}
      onSectionChange={() => undefined}
      showToolbar={false}
      hideObjectTools
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PosterStage />
    </BrowserRouter>
  </React.StrictMode>
);
