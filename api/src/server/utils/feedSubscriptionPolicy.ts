/**
 * Paid feed subscriptions are not a par Noir product surface (no platform-hosted
 * subscriber billing). Policy: docs/business/FEEDS_AND_THIRD_PARTY_MONETIZATION.md
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
