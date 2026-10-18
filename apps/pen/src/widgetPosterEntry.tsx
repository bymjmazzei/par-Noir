/** Dev-only stage for scripts/widget-posters.mjs: one starter widget on a 1:1 page, no session. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { getTemplate, PAGE_LAYER_ID } from '@par-noir/pen-protocol';
import { EditablePagePreview } from './components/EditablePagePreview';
import { previewBundleFromTemplate } from './components/TemplateGalleryThumb';
import './services/penMediaSetup';
import './index.css';

/** 360px card plus the editor's default 40px page padding on each side. */
const STAGE_PX = 440;

function PosterStage() {
  const id = new URLSearchParams(window.location.search).get('id') || '';
  const template = getTemplate(id);
  const bundle = template ? previewBundleFromTemplate(undefined, template) : null;
  const section = bundle?.sections[0];
  if (!bundle || !section) return <p data-poster-missing="1">Unknown widget {id}</p>;
  return (
    <EditablePagePreview
      manifest={{
        ...bundle.manifest,
        pageLayout: 'flow',
        flowWorkspaceWidthPx: STAGE_PX,
        flowWorkspaceHeightPx: STAGE_PX
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
