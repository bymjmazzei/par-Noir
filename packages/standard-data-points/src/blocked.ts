/** Data point ids that must never be requested or granted via integrator APIs. */
export const BLOCKED_DATA_POINTS = ['pn_file', 'pn_name', 'passcode', 'pnIdentifier'] as const;

export type BlockedDataPointId = (typeof BLOCKED_DATA_POINTS)[number];

const BLOCKED_SET = new Set<string>(BLOCKED_DATA_POINTS);

export function isBlockedDataPoint(id: string): boolean {
  return BLOCKED_SET.has(id);
}

export function filterAllowedDataPointIds(ids: string[]): string[] {
  return ids.filter((id) => !BLOCKED_SET.has(id));
}
