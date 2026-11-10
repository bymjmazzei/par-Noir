import { apiGet } from './penOwnerFetch';
import type { PenSession } from './penSession';

/** Verified author = active identity verification on the API (Veriff, included in membership). */
export async function resolveVerifiedAuthor(session: PenSession | null | undefined): Promise<boolean> {
  if (!session?.pnIdentifier || !session.accessToken) return false;
  try {
    const res = await apiGet('/api/pen/author-verification', {
      authToken: session.accessToken,
      pnIdentifier: session.pnIdentifier
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { verified?: boolean };
    return data.verified === true;
  } catch {
    return false;
  }
}
