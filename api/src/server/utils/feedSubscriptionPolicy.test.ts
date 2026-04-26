import {
  FEED_PAID_SUBSCRIPTIONS_DOC_PATH,
  feedPlatformSubscriptionsDisabledPayload,
} from './feedSubscriptionPolicy';

describe('feedSubscriptionPolicy', () => {
  it('returns stable error code and doc path', () => {
    const body = feedPlatformSubscriptionsDisabledPayload();
    expect(body.error).toBe('feed_platform_subscriptions_disabled');
    expect(body.message.length).toBeGreaterThan(20);
    expect(body.policyDoc).toBe(FEED_PAID_SUBSCRIPTIONS_DOC_PATH);
  });
});
