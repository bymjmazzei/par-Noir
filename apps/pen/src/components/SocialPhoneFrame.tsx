/** Phone bezel wrapper for social feed tiles (same chrome as gallery / template modal). */

import type { CSSProperties, ReactNode } from 'react';

export function SocialPhoneFrame({
  children,
  chrome,
  large,
  aspectRatio = '9 / 16'
}: {
  children: ReactNode;
  /** Browse chrome (rail / engagement / bottom nav) as sibling over the poster. */
  chrome?: ReactNode;
  large?: boolean;
  /** CSS aspect-ratio value, e.g. "9 / 16" or "16 / 9". */
  aspectRatio?: string;
}) {
  const landscape = aspectRatio.includes('16 / 9') || aspectRatio.startsWith('16/');
  const style = {
    ['--pen-feed-aspect' as string]: aspectRatio
  } as CSSProperties;

  return (
    <div
      className={`pen-gallery-phone${large ? ' pen-gallery-phone--lg' : ''} pen-feed-phone${
        landscape ? ' pen-feed-phone--landscape' : ''
      }`}
      style={style}
    >
      <div className="pen-gallery-phone-bezel">
        <div className="pen-gallery-phone-screen pen-feed-phone-screen">
          <div className="pen-feed-phone-poster">{children}</div>
          {chrome ? <div className="pen-feed-phone-chrome">{chrome}</div> : null}
        </div>
      </div>
    </div>
  );
}
