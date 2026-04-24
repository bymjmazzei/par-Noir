/**
 * Creator fund monetization — Stripe Checkout / Portal / webhooks / Connect onboarding.
 */

import type { Application, Request, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { MonetizationService, isStripeMonetizationConfigured } from './monetizationService';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

function pnFromReq(req: AuthenticatedRequest): string | null {
  const raw = req.user?.pnIdentifier?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function returnBaseFromBody(req: Request): string {
  const u = req.body?.return_base_url;
  if (typeof u === 'string' && u.trim().length > 0) {
    try {
      const parsed = new URL(u.trim());
      if (parsed.protocol === 'https:' || (NODE_ENV !== 'production' && parsed.protocol === 'http:')) {
        return `${parsed.origin}`;
      }
    } catch {
      /* fall through */
    }
  }
  return 'https://pn.parnoir.com';
}

export function registerStripeMonetizationRoutes(app: Application): void {
  const auth = [requireAuth];

  app.get('/api/monetization/status', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = pnFromReq(req);
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      await MonetizationService.syncConnectStatus(pn);
      const status = await MonetizationService.getStatus(pn);
      return res.json(status);
    } catch (e: unknown) {
      console.error('[monetization] status:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/monetization/create-checkout-session', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = pnFromReq(req);
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      if (!isStripeMonetizationConfigured()) {
        return res.status(503).json({
          error: 'service_unavailable',
          error_description: 'Monetization billing is not configured on this server.'
        });
      }
      const { url } = await MonetizationService.createCheckoutSession(pn, returnBaseFromBody(req));
      return res.json({ url });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'stripe_not_configured' || msg === 'stripe_price_not_configured') {
        return res.status(503).json({
          error: 'service_unavailable',
          error_description: 'Stripe is not configured.'
        });
      }
      console.error('[monetization] checkout:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/monetization/create-portal-session', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = pnFromReq(req);
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      if (!isStripeMonetizationConfigured()) {
        return res.status(503).json({
          error: 'service_unavailable',
          error_description: 'Monetization billing is not configured on this server.'
        });
      }
      const { url } = await MonetizationService.createBillingPortalSession(pn, returnBaseFromBody(req));
      return res.json({ url });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'no_stripe_customer') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Subscribe first before opening the billing portal.'
        });
      }
      console.error('[monetization] portal:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/monetization/renew-from-balance', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = pnFromReq(req);
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      if (!isStripeMonetizationConfigured()) {
        return res.status(503).json({
          error: 'service_unavailable',
          error_description: 'Monetization billing is not configured on this server.'
        });
      }
      const result = await MonetizationService.renewFromBalance(pn);
      return res.json(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'renewal_price_unknown') {
        return res.status(503).json({
          error: 'service_unavailable',
          error_description: 'Set STRIPE_MONETIZATION_RENEWAL_CENTS or a valid STRIPE_MONETIZATION_PRICE_ID.'
        });
      }
      console.error('[monetization] renew-from-balance:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/monetization/request-payout', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = pnFromReq(req);
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      if (!isStripeMonetizationConfigured()) {
        return res.status(503).json({
          error: 'service_unavailable',
          error_description: 'Monetization billing is not configured on this server.'
        });
      }
      const raw = (req.body as { amount_cents?: unknown })?.amount_cents;
      const amountCents = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
      const out = await MonetizationService.requestCreatorFundPayout(pn, amountCents);
      return res.json(out);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'payout_amount_invalid') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Minimum payout is 10.00 USD (1000 cents); pass amount_cents as an integer at least that value.'
        });
      }
      if (msg === 'connect_payouts_not_ready') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Complete Stripe Connect onboarding with payouts enabled before requesting a transfer.'
        });
      }
      if (msg === 'payout_exceeds_available') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Requested amount exceeds available bounty balance (after hold and prior payouts).'
        });
      }
      console.error('[monetization] request-payout:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/monetization/create-connect-account-link', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = pnFromReq(req);
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      if (!isStripeMonetizationConfigured()) {
        return res.status(503).json({
          error: 'service_unavailable',
          error_description: 'Stripe is not configured.'
        });
      }
      const out = await MonetizationService.createConnectAccountLink(pn, returnBaseFromBody(req));
      if (out.alreadyOnboarded) {
        return res.json({ alreadyOnboarded: true });
      }
      return res.json({ url: out.url });
    } catch (e: unknown) {
      console.error('[monetization] connect link:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/monetization/stripe-webhook', async (req: Request, res: Response) => {
    try {
      const sig = req.headers['stripe-signature'];
      const raw = req.body;
      if (!Buffer.isBuffer(raw)) {
        return res.status(400).send('Webhook requires raw body');
      }
      const event = MonetizationService.constructWebhookEvent(raw, typeof sig === 'string' ? sig : undefined);
      await MonetizationService.handleStripeWebhookEvent(event);
      return res.json({ received: true });
    } catch (e: unknown) {
      console.error('[monetization] webhook:', e);
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'stripe_webhook_not_configured' || msg === 'missing_signature') {
        return res.status(400).send('Webhook misconfigured');
      }
      return res.status(400).send(`Webhook error: ${safeClientErrorMessage(e, false)}`);
    }
  });
}
