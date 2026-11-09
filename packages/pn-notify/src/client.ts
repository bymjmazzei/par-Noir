/**
 * Opt-in Web Push subscription for one par Noir app on this device.
 * Permission is only requested from an explicit user action (the toggle).
 */

export const PUSH_CATEGORIES = ['messages', 'social', 'security'] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export const PN_NOTIFY_SW_URL = '/pn-notify-sw.js';

export interface WebPushOptions {
  apiEndpoint: string;
  getAccessToken: () => Promise<string | null>;
  appId: string;
  categories?: PushCategory[];
  /** App service worker that loads the push handlers; defaults to the standalone handler script. */
  swUrl?: string;
}

export type WebPushResult = 'subscribed' | 'denied' | 'unsupported' | 'unconfigured' | 'failed';

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(swUrl: string): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register(swUrl);
}

export async function getWebPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function subscribeWebPush(opts: WebPushOptions): Promise<WebPushResult> {
  if (!isWebPushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  // /api/push is first-party only, including the key lookup.
  const token = await opts.getAccessToken();
  if (!token) return 'failed';
  const auth = { Authorization: `Bearer ${token}` };

  const keyRes = await fetch(`${opts.apiEndpoint}/api/push/vapid-public-key`, { headers: auth });
  if (!keyRes.ok) return keyRes.status === 503 ? 'unconfigured' : 'failed';
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) return 'unconfigured';

  const reg = await registration(opts.swUrl ?? PN_NOTIFY_SW_URL);
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const res = await fetch(`${opts.apiEndpoint}/api/push/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({
      appId: opts.appId,
      subscription: sub.toJSON(),
      categories: opts.categories ?? [...PUSH_CATEGORIES],
    }),
  });
  return res.ok ? 'subscribed' : 'failed';
}

export async function unsubscribeWebPush(
  opts: Pick<WebPushOptions, 'apiEndpoint' | 'getAccessToken'>
): Promise<void> {
  const sub = await getWebPushSubscription();
  if (!sub) return;
  const token = await opts.getAccessToken();
  if (token) {
    await fetch(`${opts.apiEndpoint}/api/push/subscriptions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
  }
  await sub.unsubscribe();
}
