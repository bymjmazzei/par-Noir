/** Phone bezel wrapper for social feed tiles (same chrome as gallery / template modal). */

import type { ReactNode } from 'react';

export function SocialPhoneFrame({
  children,
  large
}: {
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <div className={`pen-gallery-phone${large ? ' pen-gallery-phone--lg' : ''} pen-feed-phone`}>
      <div className="pen-gallery-phone-bezel">
        <div className="pen-gallery-phone-screen pen-feed-phone-screen">{children}</div>
      </div>
    </div>
  );
}
