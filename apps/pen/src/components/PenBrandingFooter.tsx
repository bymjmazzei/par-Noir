/**
 * Shared Pen chrome footer — same on locked home, library, templates.
 * Editor has no footer.
 */

import type { Ref } from 'react';

const FOOTER_BG_SRC = './branding/Par-Noir-Pen.png';
const FOOTER_LOGO_SRC = './branding/Par-Noir-Logo-White.png';

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
        width={320}
        height={96}
        decoding="async"
      />
      <p className="pen-library-footer-copy">© par Noir</p>
    </footer>
  );
}
