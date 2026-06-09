/**
 * @jest-environment node
 */
import crypto from 'crypto';
import http from 'http';
import { IntegratorWebhookService, INTEGRATOR_WEBHOOK_EVENTS } from '../modules/integratorWebhookService';

describe('IntegratorWebhookService', () => {
  it('signs and verifies webhook payloads', () => {
    const secret = 'whsec_test_secret';
    const body = JSON.stringify({ type: 'data_point_request.approved', data: { requestId: 'r1' } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const header = `t=${timestamp},v1=${signed}`;
    expect(IntegratorWebhookService.verifySignature(secret, body, header)).toBe(true);
    expect(IntegratorWebhookService.verifySignature(secret, body, 't=0,v1=bad')).toBe(false);
  });

  it('delivers data_point_request.approved to mock HTTP server', async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }
    const received: { body: string; headers: http.IncomingHttpHeaders }[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        received.push({ body, headers: req.headers });
        res.writeHead(200);
        res.end('ok');
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const url = `http://127.0.0.1:${addr.port}/hook`;

    const pool = (await import('../utils/database')).getDatabasePool();
    await pool.query(
      `INSERT INTO oauth_clients (client_id, name, redirect_uris, scopes, is_active)
       VALUES ('webhook-test-client', 'Webhook Test', '[]'::jsonb, '[]'::jsonb, true)
       ON CONFLICT (client_id) DO NOTHING`
    );
    await pool.query(
      `UPDATE oauth_clients SET owner_pn_id = 'pn-test-owner' WHERE client_id = 'webhook-test-client'`
    ).catch(() => undefined);

    const { subscription, secret } = await IntegratorWebhookService.createSubscription({
      clientId: 'webhook-test-client',
      ownerPnId: 'pn-test-owner',
      url,
      events: [INTEGRATOR_WEBHOOK_EVENTS.DATA_POINT_REQUEST_APPROVED]
    });

    const payload = {
      requestId: 'dpr_test_1',
      identityId: 'pn-user-abc',
      clientId: 'webhook-test-client',
      dataPoints: ['age_attestation'],
      status: 'approved' as const,
      approvedAt: new Date().toISOString()
    };

    await IntegratorWebhookService.deliverEvent(
      'webhook-test-client',
      INTEGRATOR_WEBHOOK_EVENTS.DATA_POINT_REQUEST_APPROVED,
      payload
    );

    await new Promise((r) => setTimeout(r, 500));

    expect(received.length).toBeGreaterThanOrEqual(1);
    const first = received[0];
    expect(first.headers['x-pn-event']).toBe(INTEGRATOR_WEBHOOK_EVENTS.DATA_POINT_REQUEST_APPROVED);
    expect(first.headers['x-pn-signature']).toBeDefined();
    IntegratorWebhookService.verifySignature(
      secret,
      first.body,
      String(first.headers['x-pn-signature'])
    );

    await pool.query(`DELETE FROM integrator_webhook_subscriptions WHERE id = $1`, [subscription.id]);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 15000);
});
