/** Test a template's buttons and page jumps before building from it. Nothing is saved. */

import { useState } from 'react';
import { FeedTileTestOverlay } from '@par-noir/feed-tile';
import { normalizeGalleryAspect, seedPageTitles, type PenTemplate } from '@par-noir/pen-protocol';
import { bundleToFeedTileModel } from '../services/feedTileFromPen';
import { previewBundleFromTemplate } from './TemplateGalleryThumb';

export function TemplateTestButton({
  template,
  pn,
  className = 'pen-templates-feed-build'
}: {
  template: PenTemplate;
  pn?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const preview = open ? previewBundleFromTemplate(pn, template) : null;
  const manifest = preview?.manifest;

  return (
    <>
      <button
        type="button"
        className={className}
        title="Test: try every button, nothing is saved"
        aria-label="Test"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        Test
      </button>
      {open && preview && manifest ? (
        <FeedTileTestOverlay
          aspectRatio={normalizeGalleryAspect(manifest.galleryAspect)}
          onClose={() => setOpen(false)}
          model={bundleToFeedTileModel({
            title: preview.title,
            sections: preview.sections,
            pagePresentation: manifest.pagePresentation,
            contentClass: manifest.docType,
            pageSwipeAxis: template.seedPageSwipeAxis,
            galleryAspect: manifest.galleryAspect,
            pageTitles: seedPageTitles(template, manifest.toc)
          })}
        />
      ) : null}
    </>
  );
}
