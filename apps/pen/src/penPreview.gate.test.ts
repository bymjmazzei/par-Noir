import { describe, expect, it } from 'vitest';
import { buildPreviewGrant, socialFeedPublishAllowed } from './services/penPreview';

describe('pen preview grant', () => {
  it('refuses a feed index row for a non-social class', () => {
    expect(socialFeedPublishAllowed('widgets.widget')).toBe(false);
    expect(socialFeedPublishAllowed('custom.doc')).toBe(false);
    expect(socialFeedPublishAllowed('social.note')).toBe(true);
  });

  it('seals the preview to one viewer', () => {
    expect(buildPreviewGrant('doc_1', ' pn-friend ')).toEqual({
      docId: 'doc_1',
      peerPnIdentifier: 'pn-friend',
      role: 'viewer',
      path: '/d/doc_1/preview'
    });
  });
});
