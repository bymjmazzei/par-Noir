/**
 * Same phone stack as Templates/Library feed: bevel + browse chrome + feed tile.
 * Gallery thumbs use density="thumb" — layout at feed size, then transform-scale to fit
 * so poster proportions match feed (not HTML reflow into a tiny bevel).
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

const THUMB_REF_PX = 288; /* 18rem at 16px root */

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
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      const iw = inner.offsetWidth || THUMB_REF_PX;
      const ih = inner.offsetHeight || (landscape ? (iw * 9) / 16 : (iw * 16) / 9);
      if (ow <= 0 || oh <= 0 || iw <= 0 || ih <= 0) return;
      setScale(Math.min(ow / iw, oh / ih, 1));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [aspectCss, landscape]);

  const style = {
    ['--pen-feed-aspect' as string]: aspectCss
  } as CSSProperties;

  return (
    <div ref={outerRef} className="pen-gallery-feed-thumb" style={style}>
      <div
        ref={innerRef}
        className={`pen-gallery-feed-thumb-inner${landscape ? ' is-landscape' : ''}`}
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
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
