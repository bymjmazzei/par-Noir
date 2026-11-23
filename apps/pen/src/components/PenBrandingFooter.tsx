/**
 * Shared Pen chrome footer — same on locked home, library, templates.
 * Editor has no footer.
 */

import type { Ref } from 'react';
/** Bundled like Unlock — public/ relative URLs break under Electron file:// deep routes. */
import footerBgUrl from '../../public/branding/Par-Noir-Pen.png';
import footerLogoUrl from '../../public/branding/Par-Noir-Logo-White.png';

const FOOTER_BG_SRC = footerBgUrl;
const FOOTER_LOGO_SRC = footerLogoUrl;

export function PenBrandingFooter({
  footerRef,
  logoRef
}: {
  footerRef?: Ref<HTMLElement>;
  logoRef?: Ref<HTMLImageElement>;
}) {
  return (
    <footer
      ref={footerRef}
      className="pen-library-footer"
      style={{ backgroundImage: `url(${FOOTER_BG_SRC})` }}
    >
      <img
        ref={logoRef}
        className="pen-library-footer-logo"
        src={FOOTER_LOGO_SRC}
        alt="par Noir"
        width={160}
        height={48}
        decoding="async"
      />
      <p className="pen-library-footer-copy">© par Noir</p>
    </footer>
  );
}
