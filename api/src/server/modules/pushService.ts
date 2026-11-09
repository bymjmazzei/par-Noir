/**
 * Content-free push for locked pNs.
 *
 * A push only says that something happened in a category; the text comes from
 * a fixed map and the payload carries the category and target app, never
 * message bodies, senders, or ids. The app fetches real data after unlock.
 * Locking keeps subscriptions; revoking the device removes them.
 */

import express from 'express';
import webpush from 'web-push';
import { getDatabasePool } from '../utils/database';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { sendPushViaFCM } from './pushFcm';

export const PUSH_CATEGORIES = ['messages', 'social', 'security'] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export const PUSH_COPY: Record<PushCategory, { title: string; body: string; app: string }> = {
  messages: { title: 'par Noir', body: 'You have a new message', app: 'messaging' },
  social: { title: 'par Noir', body: 'You have new notifications', app: 'browse' },
  security: { title: 'par Noir', body: 'Security alert. Unlock to review.', app: 'dashboard' },
};

export function pushPayloadFor(category: PushCategory): PushPayload {
  const copy = PUSH_COPY[category];
  return { title: copy.title, body: copy.body, data: { category, app: copy.app } };
}

/** Maps a realtime event to a push category; null means no push. */
export function pushCategoryForRealtime(
  event: string,
  payload: Record<string, unknown>
): PushCategory | null {
  if (event === 'mailbox_pending') return 'messages';
  if (event !== 'new_notification') return null;
  const type = payload.notificationType;
  if (type === 'device_unkeyed_unlock') return 'security';
  if (type === 'new_message') return 'messages';
  return 'social';
}

export interface PushSubscriptionInput {
  kind: 'web' | 'fcm';
  appId: string;
  endpoint: string;
  p256dh?: string;
  auth?: string;
  platform?: string;
  deviceId?: string;
  browserId?: string;
  categories?: PushCategory[];
}

interface SubscriptionRow {
  id: string;
  kind: 'web' | 'fcm';
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

const APP_ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const MAX_ENDPOINT = 2048;

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

function normalizeCategories(raw: unknown): PushCategory[] {
  if (!Array.isArray(raw)) return [...PUSH_CATEGORIES];
  const picked = PUSH_CATEGORIES.filter((c) => raw.includes(c));
  return picked.length ? picked : [...PUSH_CATEGORIES];
}

/** Validates a Web Push subscription body from a first-party app. */
export function normalizeWebSubscription(body: unknown): PushSubscriptionInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as {
    appId?: unknown;
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    categories?: unknown;
    deviceId?: unknown;
  };
  const appId = typeof b.appId === 'string' ? b.appId.trim() : '';
  const endpoint = typeof b.subscription?.endpoint === 'string' ? b.subscription.endpoint : '';
  const p256dh = b.subscription?.keys?.p256dh;
  const auth = b.subscription?.keys?.auth;
  if (!APP_ID_RE.test(appId)) return null;
  if (!endpoint.startsWith('https://') || endpoint.length > MAX_ENDPOINT) return null;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) return null;
  return {
    kind: 'web',
    appId,
    endpoint,
    p256dh,
    auth,
    deviceId: typeof b.deviceId === 'string' && b.deviceId.length <= 128 ? b.deviceId : undefined,
    categories: normalizeCategories(b.categories),
  };
}

let vapidReady: boolean | null = null;
let fcmWarned = false;

function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = vapidPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@parnoir.com';
  vapidReady = Boolean(pub && priv);
  if (vapidReady) webpush.setVapidDetails(subject, pub!, priv!);
  return vapidReady;
}

function isGoneStatus(err: unknown): boolean {
  const status = (err as { statusCode?: number })?.statusCode;
  return status === 404 || status === 410;
}

export class PushService {
  static async subscribe(pnIdentifier: string, input: PushSubscriptionInput): Promise<void> {
    await getDatabasePool().query(
      `INSERT INTO push_subscriptions
         (pn_identifier, kind, app_id, endpoint, p256dh, auth, platform, device_id, browser_id, categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (pn_identifier, endpoint) DO UPDATE SET
         kind = $2, app_id = $3, p256dh = $5, auth = $6, platform = $7,
         device_id = $8, browser_id = $9, categories = $10`,
      [
        normalizePn(pnIdentifier),
        input.kind,
        input.appId,
        input.endpoint,
        input.p256dh ?? null,
        input.auth ?? null,
        input.platform ?? null,
        input.deviceId ?? null,
        input.browserId ?? null,
        input.categories ?? [...PUSH_CATEGORIES],
      ]
    );
  }

  static async unsubscribe(pnIdentifier: string, endpoint: string): Promise<void> {
    await getDatabasePool().query(
      'DELETE FROM push_subscriptions WHERE pn_identifier = $1 AND endpoint = $2',
      [normalizePn(pnIdentifier), endpoint]
    );
  }

  static async removeDevice(pnIdentifier: string, deviceId: string): Promise<void> {
    await getDatabasePool().query(
      'DELETE FROM push_subscriptions WHERE pn_identifier = $1 AND device_id = $2',
      [normalizePn(pnIdentifier), deviceId]
    );
  }

  static async send(pnIdentifier: string, category: PushCategory): Promise<void> {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, kind, endpoint, p256dh, auth FROM push_subscriptions
       WHERE pn_identifier = $1 AND $2 = ANY(categories)`,
      [normalizePn(pnIdentifier), category]
    );
    const rows = result.rows as SubscriptionRow[];
    if (!rows.length) return;

    const payload = pushPayloadFor(category);
    const gone: string[] = [];
    const delivered: string[] = [];

    const web = rows.filter((r) => r.kind === 'web' && r.p256dh && r.auth);
    if (web.length && ensureVapid()) {
      const body = JSON.stringify(payload);
      await Promise.all(
        web.map(async (r) => {
          try {
            await webpush.sendNotification(
              { endpoint: r.endpoint, keys: { p256dh: r.p256dh!, auth: r.auth! } },
              body,
              { TTL: 3600, topic: category, urgency: category === 'security' ? 'high' : 'normal' }
            );
            delivered.push(r.id);
          } catch (err) {
            if (isGoneStatus(err)) gone.push(r.id);
          }
        })
      );
    }

    const fcm = rows.filter((r) => r.kind === 'fcm');
    if (fcm.length) {
      try {
        const { invalidTokens } = await sendPushViaFCM(
          fcm.map((r) => r.endpoint),
          payload,
          category
        );
        for (const r of fcm) {
          if (invalidTokens.includes(r.endpoint)) gone.push(r.id);
          else delivered.push(r.id);
        }
      } catch (err) {
        if (!fcmWarned) {
          fcmWarned = true;
          safeLogger.warn('[Push] FCM send skipped', {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (gone.length) {
      await pool.query('DELETE FROM push_subscriptions WHERE id = ANY($1::uuid[])', [gone]);
    }
    if (delivered.length) {
      await pool.query(
        'UPDATE push_subscriptions SET last_success_at = NOW() WHERE id = ANY($1::uuid[])',
        [delivered]
      );
    }
  }
}

export const PUSH_COALESCE_MS = 60_000;

/** One push per pN and category per window; the realtime socket covers unlocked tabs. */
export class PushDispatcher {
  private static lastSent = new Map<string, number>();

  static notify(pnIdentifier: string, category: PushCategory, now: number = Date.now()): boolean {
    const key = `${normalizePn(pnIdentifier)}|${category}`;
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < PUSH_COALESCE_MS) return false;
    this.lastSent.set(key, now);
    if (this.lastSent.size > 10_000) {
      for (const [k, t] of this.lastSent) {
        if (now - t >= PUSH_COALESCE_MS) this.lastSent.delete(k);
      }
    }
    void PushService.send(pnIdentifier, category).catch((err) => {
      safeLogger.warn('[Push] send failed', {
        pnIdHash: hashIdentifier(pnIdentifier),
        category,
        err: err instanceof Error ? err.message : String(err),
      });
    });
    return true;
  }

  static reset(): void {
    this.lastSent.clear();
  }
}

export function setupPushRoutes(app: express.Application): void {
  app.get('/api/push/vapid-public-key', (_req, res) => {
    const publicKey = vapidPublicKey();
    if (!publicKey) return res.status(503).json({ error: 'push_not_configured' });
    return res.json({ publicKey });
  });

  app.post('/api/push/subscriptions', async (req, res) => {
    const { requireFirstPartyOAuthClient } = await import('./deviceCapabilityService');
    const payload = requireFirstPartyOAuthClient(req, res);
    if (!payload?.pnIdentifier) return;
    const input = normalizeWebSubscription(req.body);
    if (!input) return res.status(400).json({ error: 'invalid_request' });
    const bid = (payload as { bid?: unknown }).bid;
    try {
      await PushService.subscribe(payload.pnIdentifier, {
        ...input,
        browserId: typeof bid === 'string' ? bid : undefined,
      });
      return res.json({ success: true, categories: input.categories });
    } catch (error) {
      safeLogger.error('[Push] subscribe failed', {
        pnIdHash: hashIdentifier(payload.pnIdentifier),
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.delete('/api/push/subscriptions', async (req, res) => {
    const { requireFirstPartyOAuthClient } = await import('./deviceCapabilityService');
    const payload = requireFirstPartyOAuthClient(req, res);
    if (!payload?.pnIdentifier) return;
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    if (!endpoint) return res.status(400).json({ error: 'invalid_request' });
    try {
      await PushService.unsubscribe(payload.pnIdentifier, endpoint);
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
