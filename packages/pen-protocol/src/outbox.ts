/** Fanout helpers for Pen outbox kinds (promote, comment, suggestion). */

export const PEN_SECTION_PROMOTE_KIND = 'pen.section_promote' as const;
export const PEN_COMMENT_KIND = 'pen.comment' as const;
export const PEN_SUGGESTION_KIND = 'pen.suggestion' as const;

export type PenOutboxKind =
  | typeof PEN_SECTION_PROMOTE_KIND
  | typeof PEN_COMMENT_KIND
  | typeof PEN_SUGGESTION_KIND;

function fanout(
  routeKeys: string[],
  jobType: PenOutboxKind
): Array<{ routeKey: string; jobType: PenOutboxKind }> {
  const seen = new Set<string>();
  const targets: Array<{ routeKey: string; jobType: PenOutboxKind }> = [];
  for (const routeKey of routeKeys) {
    const rk = routeKey.trim();
    if (!/^[a-f0-9]{64}$/i.test(rk) || seen.has(rk)) continue;
    seen.add(rk);
    targets.push({ routeKey: rk, jobType });
  }
  return targets;
}

export function penSectionPromoteFanout(
  routeKeys: string[]
): Array<{ routeKey: string; jobType: typeof PEN_SECTION_PROMOTE_KIND }> {
  return fanout(routeKeys, PEN_SECTION_PROMOTE_KIND) as Array<{
    routeKey: string;
    jobType: typeof PEN_SECTION_PROMOTE_KIND;
  }>;
}

export function penCommentFanout(
  routeKeys: string[]
): Array<{ routeKey: string; jobType: typeof PEN_COMMENT_KIND }> {
  return fanout(routeKeys, PEN_COMMENT_KIND) as Array<{
    routeKey: string;
    jobType: typeof PEN_COMMENT_KIND;
  }>;
}

export function penSuggestionFanout(
  routeKeys: string[]
): Array<{ routeKey: string; jobType: typeof PEN_SUGGESTION_KIND }> {
  return fanout(routeKeys, PEN_SUGGESTION_KIND) as Array<{
    routeKey: string;
    jobType: typeof PEN_SUGGESTION_KIND;
  }>;
}
