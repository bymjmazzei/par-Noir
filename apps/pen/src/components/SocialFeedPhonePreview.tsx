/**
 * Same phone stack as Templates/Library feed: bevel + browse chrome + feed tile.
 * Gallery thumbs use density="thumb" — layout at feed size, then scale the whole
 * phone into a slot sized to the scaled footprint (transform alone leaves an
 * 18rem box that overflow:hidden clips to blank / a corner speck).
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';
import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';
import { SocialPhoneFrame } from './SocialPhoneFrame';
import { PenPhoneBrowseChrome } from './PenPhoneBrowseChrome';
import { TemplateEngagementRail } from './TemplateEngagementRail';
import { BrowseFeedTilePreview } from './BrowseFeedTilePreview';
import {
  resolveFeedTileAspect,
  resolvePhoneFrameAspect
} from './DocGalleryPreview';
import type { PenSession } from '../services/penSession';

/** Feed-size reference width (px). Height follows phone aspect. */
const THUMB_REF_W = 288;

function GalleryFeedPhoneThumb({
  aspectCss,
  landscape,
  children
}: {
  aspectCss: string;
  landscape: boolean;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const refH = landscape ? (THUMB_REF_W * 9) / 16 : (THUMB_REF_W * 16) / 9;

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const measure = () => {
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      if (ow <= 0 || oh <= 0) return;
      const next = Math.min(ow / THUMB_REF_W, oh / refH, 1);
      setScale(next > 0 && Number.isFinite(next) ? next : 0);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [aspectCss, landscape, refH]);

  const style = {
    ['--pen-feed-aspect' as string]: aspectCss
  } as CSSProperties;

  return (
    <div ref={outerRef} className="pen-gallery-feed-thumb" style={style}>
      {scale > 0 ? (
        <div
          className="pen-gallery-feed-thumb-slot"
          style={{ width: THUMB_REF_W * scale, height: refH * scale }}
        >
          <div
            className={`pen-gallery-feed-thumb-inner${
              landscape ? ' is-landscape' : ''
            }`}
            style={{
              width: THUMB_REF_W,
              height: refH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left'
            }}
          >
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SocialFeedPhonePreview({
  manifest,
  sections,
  session,
  templateId,
  authorLabel,
  phoneActiveFeedId = 'public',
  large,
  density = 'feed'
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  session?: PenSession | null;
  templateId: string;
  authorLabel?: string;
  phoneActiveFeedId?: 'discovery' | 'public' | 'media' | 'notes' | 'collections' | 'pen-templates';
  large?: boolean;
  /** thumb = gallery: layout at feed size then scale to fit the tile. */
  density?: 'feed' | 'thumb';
}) {
  const phoneAspectCss = resolvePhoneFrameAspect(manifest);
  const feedAspect = resolveFeedTileAspect(manifest);
  const unlocked = Boolean(session?.pnIdentifier);
  const landscape =
    phoneAspectCss.includes('16 / 9') || phoneAspectCss.startsWith('16/');
  // Thumb always uses large bezel chrome so scale matches feed proportions.
  const useLarge = density === 'thumb' ? true : Boolean(large);

  const phone = (
    <SocialPhoneFrame
      large={useLarge}
      aspectRatio={phoneAspectCss}
      chrome={
        <PenPhoneBrowseChrome
          activeFeedId={phoneActiveFeedId}
          engagement={
            <TemplateEngagementRail
              templateId={templateId}
              fileId={null}
              authorLabel={authorLabel}
              userPnIdentifier={session?.pnIdentifier}
              unlocked={unlocked}
              readOnly
              placement="overlay"
            />
          }
        />
      }
    >
      <BrowseFeedTilePreview
        manifest={manifest}
        sections={sections}
        bare
        compact
        session={session}
        hideEngagementRail
        aspectRatio={feedAspect}
      />
    </SocialPhoneFrame>
  );

  if (density !== 'thumb') return phone;

  return (
    <GalleryFeedPhoneThumb aspectCss={phoneAspectCss} landscape={landscape}>
      {phone}
    </GalleryFeedPhoneThumb>
  );
}
