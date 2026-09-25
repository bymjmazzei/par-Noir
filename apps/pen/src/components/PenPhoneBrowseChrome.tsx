/**
 * Display-only browse chrome for SocialPhoneFrame: top FeedRail strip + bottom nav.
 * Apps must not import aggregator-browser — this mirrors browse sizing locally.
 */

import type { ReactNode } from 'react';
import { Home, Search, Plus, User, MessageSquare } from 'lucide-react';
import type { ClassFeedRailItem } from './ClassFeedRail';

export function PenPhoneBrowseChrome({
  railItems,
  activeRailId,
  engagement
}: {
  railItems: ClassFeedRailItem[];
  activeRailId: string;
  engagement?: ReactNode;
}) {
  return (
    <>
      <div className="pen-phone-feed-rail" aria-hidden>
        <div className="pen-phone-feed-rail-scroll">
          <div className="pen-phone-feed-rail-inner">
            {railItems.map((item) => {
              const active = item.id === activeRailId;
              return (
                <span
                  key={item.id}
                  className={`pen-phone-feed-rail-tab${active ? ' is-active' : ''}`}
                >
                  {item.label}
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
