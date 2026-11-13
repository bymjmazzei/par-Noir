/**
 * One public Pen post for iframes on any site: /embed/post?creator=…&file=…
 * Reports its height to the host page so a host script can size the iframe.
 */

import { useEffect, useMemo, useRef } from 'react';
import { PN_POST_EMBED_SIZE, type PostEmbedSizeMessage } from '@par-noir/oauth-ui';
import { EmbedPostTile } from '../components/EmbedPostTile';

function readPostParams(): { fileId: string; creator?: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const fileId = (params.get('file') || '').trim();
    const creator = (params.get('creator') || '').trim();
    return creator ? { fileId, creator } : { fileId };
  } catch {
    return { fileId: '' };
  }
}

function postToParent(msg: PostEmbedSizeMessage) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  } catch {
    /* ignore */
  }
}

export function EmbedPostPage() {
  const { fileId, creator } = useMemo(() => readPostParams(), []);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !fileId) return;
    const report = () => {
      const height = Math.round(el.getBoundingClientRect().height);
      if (height > 0) postToParent({ v: 1, type: PN_POST_EMBED_SIZE, fileId, height });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fileId]);

  return (
    <div ref={rootRef} className="h-screen w-full bg-black" data-pn-embed-post-page={fileId || undefined}>
      <EmbedPostTile fileId={fileId} creator={creator} />
    </div>
  );
}
