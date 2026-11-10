#!/usr/bin/env node
/**
 * One-time Stripe setup for pN monetization (safe to re-run; reuses what exists).
 *
 *   cd api && STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-bootstrap.mjs [--api-base https://api.parnoir.com]
 *
 * Creates the membership product + $10/month price, the platform webhook, and the Connect webhook,
 * then prints the env lines to paste into the API secret store. Webhook signing secrets are only
 * returned by Stripe at creation; for an endpoint that already exists, roll its secret in the Dashboard.
 */
import Stripe from 'stripe';

const PRODUCT_TAG = 'parnoir_membership';
const PRICE_CENTS = 1000;

const PLATFORM_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
  'transfer.reversed',
  'identity.verification_session.verified',
  'identity.verification_session.requires_input'
];
const CONNECT_EVENTS = ['checkout.session.completed'];

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error('STRIPE_SECRET_KEY is required');
  process.exit(1);
}
const apiBase = (argValue('--api-base') || process.env.API_BASE_URL || 'https://api.parnoir.com').replace(/\/+$/, '');
const stripe = new Stripe(key);

async function ensureProduct() {
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata?.parnoir === PRODUCT_TAG) return p;
  }
  return stripe.products.create({
    name: 'pN membership',
    description: 'par Noir monthly membership (identity verification included; balance funds the creator pool)',
    metadata: { parnoir: PRODUCT_TAG }
  });
}

async function ensurePrice(productId) {
  for await (const p of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    if (p.unit_amount === PRICE_CENTS && p.currency === 'usd' && p.recurring?.interval === 'month') return p;
  }
  return stripe.prices.create({
    product: productId,
    unit_amount: PRICE_CENTS,
    currency: 'usd',
    recurring: { interval: 'month' }
  });
}

async function ensureWebhook(url, events, connect) {
  for await (const w of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (w.url === url) {
      const missing = events.filter((e) => !w.enabled_events.includes(e) && !w.enabled_events.includes('*'));
      if (missing.length) {
        await stripe.webhookEndpoints.update(w.id, { enabled_events: [...new Set([...w.enabled_events, ...events])] });
      }
      return { endpoint: w, secret: null };
    }
  }
  const endpoint = await stripe.webhookEndpoints.create({ url, enabled_events: events, connect });
  return { endpoint, secret: endpoint.secret };
}

const product = await ensureProduct();
const price = await ensurePrice(product.id);
const platform = await ensureWebhook(`${apiBase}/api/monetization/stripe-webhook`, PLATFORM_EVENTS, false);
const connectHook = await ensureWebhook(`${apiBase}/api/monetization/stripe-connect-webhook`, CONNECT_EVENTS, true);

const mode = key.startsWith('sk_live_') ? 'LIVE' : 'TEST';
console.log(`\nStripe ${mode} mode — product ${product.id}, price ${price.id}`);
console.log(`Platform webhook ${platform.endpoint.id} → ${platform.endpoint.url}`);
console.log(`Connect webhook  ${connectHook.endpoint.id} → ${connectHook.endpoint.url}\n`);
console.log('# API env');
console.log(`STRIPE_MONETIZATION_PRICE_ID=${price.id}`);
console.log(`STRIPE_MONETIZATION_RENEWAL_CENTS=${PRICE_CENTS}`);
console.log(
  platform.secret
    ? `STRIPE_WEBHOOK_SECRET=${platform.secret}`
    : '# STRIPE_WEBHOOK_SECRET unchanged (endpoint existed; roll it in the Dashboard if you need it again)'
);
console.log(
  connectHook.secret
    ? `STRIPE_CONNECT_WEBHOOK_SECRET=${connectHook.secret}`
    : '# STRIPE_CONNECT_WEBHOOK_SECRET unchanged (endpoint existed; roll it in the Dashboard if you need it again)'
);
