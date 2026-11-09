/** Read / write the pN's idle lock policy (first-party apps only). */

export const IDLE_MINUTE_OPTIONS = [5, 15, 30, 60, 240, 480] as const;
export const DEFAULT_IDLE_MINUTES = 60;

export interface SessionPolicy {
  idleMinutes: number;
  trustedDevice: boolean;
  /** 0 when trustedDevice. */
  idleTimeoutS: number;
}

export function idleOptionLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} minutes` : minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
}

export async function fetchSessionPolicy(opts: {
  apiEndpoint: string;
  accessToken: string;
}): Promise<SessionPolicy | null> {
  const res = await fetch(`${opts.apiEndpoint.replace(/\/$/, '')}/api/session/policy`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as SessionPolicy;
}

export async function saveSessionPolicy(opts: {
  apiEndpoint: string;
  accessToken: string;
  idleMinutes: number;
  trustedDevice: boolean;
}): Promise<SessionPolicy> {
  const res = await fetch(`${opts.apiEndpoint.replace(/\/$/, '')}/api/session/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.accessToken}` },
    body: JSON.stringify({ idleMinutes: opts.idleMinutes, trustedDevice: opts.trustedDevice }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error_description?: string };
    throw new Error(err.error_description || 'Could not save session policy');
  }
  return (await res.json()) as SessionPolicy;
}
