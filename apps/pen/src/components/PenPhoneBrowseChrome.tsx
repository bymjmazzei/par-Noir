/**
 * Display-only browse chrome for SocialPhoneFrame: top FeedRail strip + bottom nav.
 * Mirrors aggregator-browser FeedRail vocabulary (not Pen ClassFeedRail).
 */

import type { ReactNode } from 'react';
import { Home, Search, Plus, User, MessageSquare } from 'lucide-react';

const BROWSE_RAIL_TABS = [
  { id: 'discovery', label: 'DISCOVER' },
  { id: 'public', label: 'pN', isPnLogo: true },
  { id: 'media', label: 'MEDIA' },
  { id: 'notes', label: 'NOTES' },
  { id: 'collections', label: 'COLLECTIONS' },
  { id: 'pen-templates', label: 'TEMPLATES' }
] as const;

function PnLogoMark() {
  return (
    <svg
      className="pen-phone-feed-rail-pn"
      width="24"
      height="20"
      viewBox="0 0 24 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <text
        x="0"
        y="15"
        fontSize="16"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="500"
        fill="currentColor"
        letterSpacing="0.05em"
      >
        pN
      </text>
      <line
        x1="2"
        y1="4"
        x2="8"
        y2="4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PenPhoneBrowseChrome({
  activeFeedId = 'public',
  engagement
}: {
  /** Browse feed id to highlight — 'pen-templates' on Templates, 'public' (pN) elsewhere. */
  activeFeedId?: 'discovery' | 'public' | 'media' | 'notes' | 'collections' | 'pen-templates';
  engagement?: ReactNode;
}) {
  return (
    <>
      <div className="pen-phone-feed-rail" aria-hidden>
        <div className="pen-phone-feed-rail-scroll">
          <div className="pen-phone-feed-rail-inner">
            {BROWSE_RAIL_TABS.map((item) => {
              const active = item.id === activeFeedId;
              return (
                <span
                  key={item.id}
                  className={`pen-phone-feed-rail-tab${active ? ' is-active' : ''}${
                    'isPnLogo' in item && item.isPnLogo ? ' pen-phone-feed-rail-tab--pn' : ''
                  }`}
                >
                  {'isPnLogo' in item && item.isPnLogo ? <PnLogoMark /> : item.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      {engagement}
      <div className="pen-phone-bottom-nav" aria-hidden>
        <span className="pen-phone-bottom-nav-item is-active" title="Home">
          <Home className="pen-phone-bottom-nav-icon" />
        </span>
        <span className="pen-phone-bottom-nav-item" title="Search">
          <Search className="pen-phone-bottom-nav-icon" />
        </span>
        <span className="pen-phone-bottom-nav-item" title="Upload">
          <Plus className="pen-phone-bottom-nav-icon" />
        </span>
        <span className="pen-phone-bottom-nav-item" title="Me">
          <User className="pen-phone-bottom-nav-icon" />
        </span>
        <span className="pen-phone-bottom-nav-item" title="Inbox">
          <MessageSquare className="pen-phone-bottom-nav-icon" />
        </span>
      </div>
    </>
  );
}
