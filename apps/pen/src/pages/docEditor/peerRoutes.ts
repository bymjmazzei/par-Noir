import type { PenSession } from '../../services/penSession';
import { fetchGroupRoster } from '../../services/penCollab';

export async function peerRoutes(
  session: PenSession,
  groupId: string | undefined
): Promise<string[]> {
  if (!groupId) return [];
  try {
    const roster = await fetchGroupRoster({
      groupId,
      ownerPnIdentifier: session.pnIdentifier
    });
    return roster
      .filter((m) => m.memberPnIdentifier !== session.pnIdentifier && m.routeKey)
      .map((m) => m.routeKey!) as string[];
  } catch {
    return [];
  }
}
