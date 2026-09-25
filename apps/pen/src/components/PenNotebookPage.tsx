/**
 * Shared notebook chrome for My Library and Templates.
 * Density (list / gallery / feed) is a view of this page — not a second page type.
 */

import type { ReactNode } from 'react';
import type { PenBrowseDensity } from '../services/penClassPrefs';
import { PenBrandingFooter } from './PenBrandingFooter';

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="10" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="17" width="16" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function PenNotebookPage({
  density,
  onDensity,
  title,
  subtitle,
  onBack,
  backLabel,
  showDensityTools = true,
  toolsExtra,
  children
}: {
  density: PenBrowseDensity;
  onDensity: (d: PenBrowseDensity) => void;
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  showDensityTools?: boolean;
  /** e.g. library trash / bulk controls */
  toolsExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`pen-library-page bg-white${density === 'feed' ? ' pen-feed-mode' : ''}`}
    >
      <div className="pen-library-notebook flex-1">
        <div className="pen-library-notebook-inner">
          <div className="pen-explorer-rail" aria-hidden />

          <div className="pen-library-heading">
            <div className="min-w-0 flex-1">
              {onBack ? (
                <button
                  type="button"
                  className="text-sm text-neutral-600 hover:text-black"
                  onClick={onBack}
                >
                  ← {backLabel || 'Back'}
                </button>
              ) : null}
              <h1 className="text-lg font-bold text-black">{title}</h1>
              {subtitle != null ? (
                <p className="text-sm text-neutral-500">{subtitle}</p>
              ) : null}
            </div>
            {(showDensityTools || toolsExtra) && (
              <div className="pen-library-heading-tools">
                {showDensityTools ? (
                  <div
                    className="flex items-center justify-end gap-0"
                    role="group"
                    aria-label="Browse density"
                  >
                    <button
                      type="button"
                      title="List"
                      aria-label="List view"
                      aria-pressed={density === 'list'}
                      onClick={() => onDensity('list')}
                      className={`inline-flex h-8 w-8 items-center justify-center ${
                        density === 'list'
                          ? 'text-black'
                          : 'text-neutral-600 hover:text-neutral-800'
                      }`}
                    >
                      <ListIcon />
                    </button>
                    <button
                      type="button"
                      title="Gallery"
                      aria-label="Gallery view"
                      aria-pressed={density === 'gallery'}
                      onClick={() => onDensity('gallery')}
                      className={`inline-flex h-8 w-8 items-center justify-center ${
                        density === 'gallery'
                          ? 'text-black'
                          : 'text-neutral-600 hover:text-neutral-800'
                      }`}
                    >
                      <GalleryIcon />
                    </button>
                    <button
                      type="button"
                      title="Feed"
                      aria-label="Feed view"
                      aria-pressed={density === 'feed'}
                      onClick={() => onDensity('feed')}
                      className={`inline-flex h-8 w-8 items-center justify-center ${
                        density === 'feed'
                          ? 'text-black'
                          : 'text-neutral-600 hover:text-neutral-800'
                      }`}
                    >
                      <FeedIcon />
                    </button>
                  </div>
                ) : null}
                {toolsExtra}
              </div>
            )}
          </div>

          <div className="pen-library-body">
            <div className="pen-library-sheet">{children}</div>
          </div>

          <PenBrandingFooter />
        </div>
      </div>
    </div>
  );
}
