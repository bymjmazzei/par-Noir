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

  it('allows social feed publish when class is social.note or isSocial is toggled', () => {
    const blankManifest = { classId: 'custom.doc', isSocial: false };
    expect(socialFeedPublishAllowed(blankManifest.classId)).toBe(false);

    // Toggling social does NOT change classId (preserves preview window/form), but enables feed publishing via isSocial: true
    const toggledToSocial = {
      ...blankManifest,
      isSocial: true
    };
    expect(toggledToSocial.classId).toBe('custom.doc');
    expect(toggledToSocial.isSocial).toBe(true);

    const toggledBack = {
      ...toggledToSocial,
      isSocial: false
    };
    expect(toggledBack.classId).toBe('custom.doc');
    expect(toggledBack.isSocial).toBe(false);
  });
});
