/** Pen session load/save — thin helper for ownerFetch + cloud mint. */

export interface PenSession {
  accessToken: string;
  refreshToken?: string;
  pnIdentifier: string;
  mlDsaPublicKey?: string;
  mlDsaSecretKey?: string;
  mlKemSecretKey?: string;
}

export const PEN_SESSION_KEY = 'pen_session';

export function loadPenSession(): PenSession | null {
  try {
    const raw = sessionStorage.getItem(PEN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PenSession;
    if (!parsed?.accessToken || !parsed?.pnIdentifier) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePenSession(session: PenSession): void {
  sessionStorage.setItem(PEN_SESSION_KEY, JSON.stringify(session));
}

export function clearPenSession(): void {
  sessionStorage.removeItem(PEN_SESSION_KEY);
}
