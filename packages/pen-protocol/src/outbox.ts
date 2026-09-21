/** Fanout helpers for pen.section_promote outbox kind. */

export const PEN_SECTION_PROMOTE_KIND = 'pen.section_promote' as const;

export function penSectionPromoteFanout(routeKeys: string[]): Array<{ routeKey: string; jobType: typeof PEN_SECTION_PROMOTE_KIND }> {
  const seen = new Set<string>();
  const targets: Array<{ routeKey: string; jobType: typeof PEN_SECTION_PROMOTE_KIND }> = [];
  for (const routeKey of routeKeys) {
    const rk = routeKey.trim();
    if (!/^[a-f0-9]{64}$/i.test(rk) || seen.has(rk)) continue;
    seen.add(rk);
    targets.push({ routeKey: rk, jobType: PEN_SECTION_PROMOTE_KIND });
  }
  return targets;
}
