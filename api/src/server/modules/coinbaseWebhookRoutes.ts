/**
 * Coinbase Commerce webhook. Needs the raw body for signature verification,
 * so it registers its own express.raw parser instead of using the JSON parser.
 */

import express, { type Application } from 'express';

export async function registerCoinbaseWebhookRoutes(app: Application): Promise<void> {
    const { CoinbaseWebhookHandler } = await import('./coinbaseWebhookHandler');
    app.post('/api/webhooks/coinbase', express.raw({ type: 'application/json' }), async (req, res) => {
      await CoinbaseWebhookHandler.handleWebhook(req as any, res as any);
    });
}
