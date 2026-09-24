/**
 * Public pen-templates feed at /templates — platform starters + CDN published rows.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTemplate } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import {
  TemplatesCdnFeedScroller,
  type PublicTemplateFeedSelect
} from '../components/TemplatesCdnFeedScroller';

export function PublicTemplatesFeedPage({
  session,
  onBack
}: {
  session: PenSession | null;
  /** Locked chrome: return to templates catalog without session. */
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const [activeClassId, setActiveClassId] = useState('all');
  const [hint, setHint] = useState<string | null>(null);

  function onSelect(sel: PublicTemplateFeedSelect) {
    if (sel.kind === 'platform') {
      navigate(`/?template=${encodeURIComponent(sel.templateId)}`);
      return;
    }
    const meta = sel.entry.metadata as {
      basedOnTemplateId?: string;
      title?: string;
      name?: string;
    };
    const starterId = meta.basedOnTemplateId;
    if (starterId && getTemplate(starterId)) {
      navigate(`/?template=${encodeURIComponent(starterId)}`);
      return;
    }
    setHint(
      `Public template “${meta.title || meta.name || sel.entry.fileId}” — Use-from-CDN IR coming soon.`
    );
    window.setTimeout(() => setHint(null), 4000);
  }

  return (
    <div className="pen-library-page pen-feed-mode bg-white">
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
                  ← Templates
                </button>
              ) : (
                <Link to="/" className="text-sm text-neutral-600 hover:text-black">
                  ← My Library
                </Link>
              )}
              <h1 className="text-lg font-bold text-black">Templates</h1>
              <p className="text-sm text-neutral-500">
                Platform starters plus published network templates. Engagement appears only on
                published IndexedFile rows.
              </p>
              {hint ? <p className="mt-1 text-sm text-neutral-600">{hint}</p> : null}
            </div>
          </div>
          <div className="pen-library-body">
            <div className="pen-library-sheet">
              <TemplatesCdnFeedScroller
                session={session}
                activeClassId={activeClassId}
                onActiveClassId={setActiveClassId}
                onSelect={onSelect}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
