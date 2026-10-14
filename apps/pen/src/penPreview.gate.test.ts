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

  it('allows social feed publish when class is social.note', () => {
    // When a blank custom.doc is toggled to social, class becomes social.note
    const blankManifest = { classId: 'custom.doc', isSocial: false };
    expect(socialFeedPublishAllowed(blankManifest.classId)).toBe(false);

    const toggledToSocial = {
      ...blankManifest,
      nonSocialClassId: blankManifest.classId,
      classId: 'social.note',
      docType: 'note',
      isSocial: true
    };
    expect(socialFeedPublishAllowed(toggledToSocial.classId)).toBe(true);
    expect(toggledToSocial.isSocial).toBe(true);

    const toggledBack = {
      ...toggledToSocial,
      classId: toggledToSocial.nonSocialClassId,
      docType: 'custom',
      isSocial: false
    };
    expect(socialFeedPublishAllowed(toggledBack.classId)).toBe(false);
    expect(toggledBack.isSocial).toBe(false);
  });
});
