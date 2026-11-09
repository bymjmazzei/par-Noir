import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/feedService', () => ({ FeedService: {} }));
vi.mock('../services/pnOAuthService', () => ({ PNOAuthService: {} }));
vi.mock('../services/personalFeed', () => ({ PERSONAL_FEED_CHANGE_EVENT: 'pn_personal_feed_change' }));

import { pickDefaultContext, type AppContext } from './useAppContext';

const pn: AppContext = { type: 'pn', id: 'pn-a', name: 'Me', pnIdentifier: 'pn-a' };
const paid: AppContext = { type: 'feed', id: 'f-paid', name: 'Paid', feedId: 'f-paid', isOwned: true };
const personal: AppContext = {
  type: 'feed',
  id: 'f-personal',
  name: 'Personal feed',
  feedId: 'f-personal',
  isOwned: true,
  isPersonal: true
};

describe('pickDefaultContext', () => {
  it('defaults to the personal feed', () => {
    expect(pickDefaultContext([pn, paid, personal], pn)).toBe(personal);
  });

  it('falls back to the pN before the personal feed registers', () => {
    expect(pickDefaultContext([pn, paid], pn)).toBe(pn);
  });
});
