/**
 * Postgres-backed integrator webhooks for data-point approve/decline and future L5 events.
 */

import crypto from 'crypto';
import { getDatabasePool } from '../utils/database';

export const INTEGRATOR_WEBHOOK_EVENTS = {
  DATA_POINT_REQUEST_APPROVED: 'data_point_request.approved',
  DATA_POINT_REQUEST_DECLINED: 'data_point_request.declined'
} as const;

export type IntegratorWebhookEventType =
  (typeof INTEGRATOR_WEBHOOK_EVENTS)[keyof typeof INTEGRATOR_WEBHOOK_EVENTS];

const ALLOWED_EVENTS = new Set<string>(Object.values(INTEGRATOR_WEBHOOK_EVENTS));

/** Retry delays in seconds — matches api/webhook-system/constants/webhookConstants.ts */
const RETRY_DELAYS_SEC = [0, 60, 300, 900, 3600];
const MAX_FAILURE_COUNT = 10;

export interface WebhookSubscriptionRecord {
  id: string;
  clientId: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DataPointWebhookPayload {
  requestId: string;
  identityId: string;
  clientId: string;
  dataPoints: string[];
  status: 'approved' | 'declined';
  approvedAt: string;
}

function rowToSubscription(row: Record<string, unknown>): WebhookSubscriptionRecord {
  const events = row.events as string[] | unknown;
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    url: String(row.url),
    events: Array.isArray(events) ? events.map(String) : [],
    isActive: Boolean(row.is_active),
    failureCount: Number(row.failure_count ?? 0),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString()
  };
}

function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
}

function signPayload(secret: string, body: string, timestamp: number): string {
  const signed = `${timestamp}.${body}`;
  return crypto.createHmac('sha256', secret).update(signed).digest('hex');
}

function validateWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && process.env.NODE_ENV !== 'development') {
      return 'webhook URL must use https in production';
    }
    return null;
  } catch {
    return 'invalid webhook URL';
  }
}

function filterEvents(events: string[]): string[] {
  const filtered = events.filter((e) => ALLOWED_EVENTS.has(e));
  if (filtered.length === 0) {
    throw new Error('At least one supported event is required');
  }
  return filtered;
}

export class IntegratorWebhookService {
  static async assertClientOwnedBy(clientId: string, ownerPnId: string): Promise<void> {
    const { ClientRegistrationService } = await import('./clientRegistration');
    const client = await ClientRegistrationService.getClient(clientId);
    if (!client || !client.isActive) {
      throw Object.assign(new Error('OAuth client not found'), { statusCode: 404 });
    }
    const owner = client.ownerPnId?.startsWith('pn-') ? client.ownerPnId : client.ownerPnId ? `pn-${client.ownerPnId}` : undefined;
    const normalizedOwner = ownerPnId.startsWith('pn-') ? ownerPnId : `pn-${ownerPnId}`;
    if (!owner || owner !== normalizedOwner) {
      throw Object.assign(new Error('You do not own this OAuth client'), { statusCode: 403 });
    }
  }

  static async createSubscription(params: {
    clientId: string;
    ownerPnId: string;
    url: string;
    events: string[];
  }): Promise<{ subscription: WebhookSubscriptionRecord; secret: string }> {
    await this.assertClientOwnedBy(params.clientId, params.ownerPnId);
    const urlError = validateWebhookUrl(params.url);
    if (urlError) throw Object.assign(new Error(urlError), { statusCode: 400 });

    const events = filterEvents(params.events);
    const secret = generateWebhookSecret();
    const pool = getDatabasePool();
    const result = await pool.query(
      `INSERT INTO integrator_webhook_subscriptions (client_id, url, signing_secret, events)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [params.clientId, params.url.trim(), secret, events]
    );
    return { subscription: rowToSubscription(result.rows[0]), secret };
  }

  static async listSubscriptions(clientId: string, ownerPnId: string): Promise<WebhookSubscriptionRecord[]> {
    await this.assertClientOwnedBy(clientId, ownerPnId);
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, client_id, url, events, is_active, failure_count, created_at, updated_at
       FROM integrator_webhook_subscriptions WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId]
    );
    return result.rows.map(rowToSubscription);
  }

  static async getSubscription(id: string, ownerPnId: string): Promise<WebhookSubscriptionRecord | null> {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, client_id, url, events, is_active, failure_count, created_at, updated_at
       FROM integrator_webhook_subscriptions WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const sub = rowToSubscription(result.rows[0]);
    await this.assertClientOwnedBy(sub.clientId, ownerPnId);
    return sub;
  }

  static async updateSubscription(
    id: string,
    ownerPnId: string,
    patch: { url?: string; events?: string[]; isActive?: boolean }
  ): Promise<WebhookSubscriptionRecord | null> {
    const existing = await this.getSubscription(id, ownerPnId);
    if (!existing) return null;

    const url = patch.url?.trim() ?? existing.url;
    if (patch.url) {
      const urlError = validateWebhookUrl(url);
      if (urlError) throw Object.assign(new Error(urlError), { statusCode: 400 });
    }
    const events = patch.events ? filterEvents(patch.events) : existing.events;
    const isActive = patch.isActive ?? existing.isActive;

    const pool = getDatabasePool();
    const result = await pool.query(
      `UPDATE integrator_webhook_subscriptions
       SET url = $1, events = $2, is_active = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, client_id, url, events, is_active, failure_count, created_at, updated_at`,
      [url, events, isActive, id]
    );
    return rowToSubscription(result.rows[0]);
  }

  static async deleteSubscription(id: string, ownerPnId: string): Promise<boolean> {
    const existing = await this.getSubscription(id, ownerPnId);
    if (!existing) return false;
    const pool = getDatabasePool();
    await pool.query(`DELETE FROM integrator_webhook_subscriptions WHERE id = $1`, [id]);
    return true;
  }

  static async rotateSecret(id: string, ownerPnId: string): Promise<{ secret: string } | null> {
    const existing = await this.getSubscription(id, ownerPnId);
    if (!existing) return null;
    const secret = generateWebhookSecret();
    const pool = getDatabasePool();
    await pool.query(
      `UPDATE integrator_webhook_subscriptions
       SET signing_secret = $1, failure_count = 0, updated_at = NOW()
       WHERE id = $2`,
      [secret, id]
    );
    return { secret };
  }

  /** Fire-and-forget delivery to all active subscriptions for client + event type. */
  static emitDataPointRequestEvent(
    clientId: string,
    eventType: IntegratorWebhookEventType,
    payload: DataPointWebhookPayload
  ): void {
    void this.deliverEvent(clientId, eventType, payload).catch((err) => {
      console.error('[IntegratorWebhook] emit failed:', err);
    });
  }

  static async deliverEvent(
    clientId: string,
    eventType: IntegratorWebhookEventType,
    payload: DataPointWebhookPayload
  ): Promise<void> {
    const pool = getDatabasePool();
    const subsResult = await pool.query(
      `SELECT id, url, signing_secret FROM integrator_webhook_subscriptions
       WHERE client_id = $1 AND is_active = true AND $2 = ANY(events)`,
      [clientId, eventType]
    );
    if (subsResult.rows.length === 0) return;

    const eventResult = await pool.query(
      `INSERT INTO integrator_webhook_events (client_id, event_type, payload)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [clientId, eventType, JSON.stringify(payload)]
    );
    const eventId = eventResult.rows[0].id as string;

    for (const row of subsResult.rows) {
      const deliveryResult = await pool.query(
        `INSERT INTO integrator_webhook_deliveries (subscription_id, event_id, status, next_retry_at)
         VALUES ($1, $2, 'pending', NOW())
         RETURNING id`,
        [row.id, eventId]
      );
      const deliveryId = deliveryResult.rows[0].id as string;
      void this.processDelivery(
        deliveryId,
        row.id as string,
        eventId,
        eventType,
        payload,
        row.signing_secret as string,
        row.url as string
      );
    }
  }

  /** Process pending retries — call from interval in server startup. */
  static async processPendingRetries(): Promise<void> {
    const pool = getDatabasePool();
    const pending = await pool.query(
      `SELECT d.id AS delivery_id, d.subscription_id, d.event_id, d.attempts,
              s.url, s.signing_secret, e.event_type, e.payload
       FROM integrator_webhook_deliveries d
       JOIN integrator_webhook_subscriptions s ON s.id = d.subscription_id
       JOIN integrator_webhook_events e ON e.id = d.event_id
       WHERE d.status = 'pending'
         AND d.next_retry_at IS NOT NULL
         AND d.next_retry_at <= NOW()
         AND s.is_active = true
       LIMIT 20`
    );
    for (const row of pending.rows) {
      void this.processDelivery(
        row.delivery_id as string,
        row.subscription_id as string,
        row.event_id as string,
        row.event_type as IntegratorWebhookEventType,
        row.payload as DataPointWebhookPayload,
        row.signing_secret as string,
        row.url as string,
        row.attempts as number
      );
    }
  }

  private static async processDelivery(
    deliveryId: string,
    subscriptionId: string,
    eventId: string,
    eventType: string,
    payload: DataPointWebhookPayload,
    signingSecret: string,
    url: string,
    priorAttempts = 0
  ): Promise<void> {
    const pool = getDatabasePool();
    const bodyObj = {
      id: eventId,
      type: eventType,
      createdAt: new Date().toISOString(),
      data: payload
    };
    const body = JSON.stringify(bodyObj);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(signingSecret, body, timestamp);
    const attempts = priorAttempts + 1;
    let responseCode: number | null = null;
    let responseBody: string | null = null;
    let status: 'delivered' | 'pending' | 'failed' = 'failed';
    let nextRetry: Date | null = null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PN-Signature': `t=${timestamp},v1=${signature}`,
          'X-PN-Event': eventType,
          'X-PN-Delivery': deliveryId,
          'User-Agent': 'par-Noir-Webhook/1.0'
        },
        body,
        signal: AbortSignal.timeout(15000)
      });
      responseCode = response.status;
      responseBody = (await response.text()).slice(0, 2000);
      if (response.ok) {
        status = 'delivered';
        await pool.query(
          `UPDATE integrator_webhook_subscriptions SET failure_count = 0, updated_at = NOW() WHERE id = $1`,
          [subscriptionId]
        );
      } else if (attempts < RETRY_DELAYS_SEC.length) {
        status = 'pending';
        nextRetry = new Date(Date.now() + RETRY_DELAYS_SEC[attempts] * 1000);
        await pool.query(
          `UPDATE integrator_webhook_subscriptions
           SET failure_count = failure_count + 1, updated_at = NOW()
           WHERE id = $1`,
          [subscriptionId]
        );
      } else {
        await pool.query(
          `UPDATE integrator_webhook_subscriptions
           SET failure_count = failure_count + 1, updated_at = NOW()
           WHERE id = $1`,
          [subscriptionId]
        );
        await this.maybeDisableSubscription(subscriptionId);
      }
    } catch (err) {
      responseBody = err instanceof Error ? err.message : 'delivery failed';
      if (attempts < RETRY_DELAYS_SEC.length) {
        status = 'pending';
        nextRetry = new Date(Date.now() + RETRY_DELAYS_SEC[attempts] * 1000);
      } else {
        await this.maybeDisableSubscription(subscriptionId);
      }
    }

    await pool.query(
      `UPDATE integrator_webhook_deliveries
       SET status = $1, attempts = $2, response_code = $3, response_body = $4,
           last_attempt_at = NOW(), next_retry_at = $5
       WHERE id = $6`,
      [status, attempts, responseCode, responseBody, nextRetry, deliveryId]
    );
  }

  private static async maybeDisableSubscription(subscriptionId: string): Promise<void> {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT failure_count FROM integrator_webhook_subscriptions WHERE id = $1`,
      [subscriptionId]
    );
    if (result.rows.length && Number(result.rows[0].failure_count) >= MAX_FAILURE_COUNT) {
      await pool.query(
        `UPDATE integrator_webhook_subscriptions SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [subscriptionId]
      );
    }
  }

  /** Verify webhook signature (for integrator docs / tests). */
  static verifySignature(secret: string, body: string, header: string, maxAgeSec = 300): boolean {
    const match = header.match(/^t=(\d+),v1=([a-f0-9]+)$/);
    if (!match) return false;
    const timestamp = parseInt(match[1], 10);
    const sig = match[2];
    if (Math.abs(Date.now() / 1000 - timestamp) > maxAgeSec) return false;
    const expected = signPayload(secret, body, timestamp);
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
