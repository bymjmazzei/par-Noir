/**
 * Viewer paid subscriptions *to a feed* (charging other users via par Noir checkout)
 * are not a product surface. Creator **feed ownership / tier** pricing (`feeds.is_paid`,
 * monthly/annual, feed_creation) is separate. Policy:
 * docs/business/FEEDS_AND_THIRD_PARTY_MONETIZATION.md
 */

export const FEED_PAID_SUBSCRIPTIONS_DOC_PATH =
  'docs/business/FEEDS_AND_THIRD_PARTY_MONETIZATION.md';

export function feedPlatformSubscriptionsDisabledPayload(): {
  error: string;
  message: string;
  policyDoc: string;
} {
  return {
    error: 'feed_platform_subscriptions_disabled',
    message:
      'par Noir does not process paid subscriptions to feeds. Use a third-party tool for subscriber billing and access control.',
    policyDoc: FEED_PAID_SUBSCRIPTIONS_DOC_PATH,
  };
}
