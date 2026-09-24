/**
 * Structured Time IR fields for Event / Schedule (humans + agents).
 * Never store raw PII in location — use placeLabel + optional geoProofRef.
 */

export type TimeEventFields = {
  title: string;
  /** ISO start (with offset or Z). */
  startAt: string;
  /** ISO end (optional). */
  endAt?: string;
  /** IANA timezone, e.g. America/New_York. */
  timeZone?: string;
  /** Human place label — not lat/lng. */
  placeLabel?: string;
  /** Opaque geo proof attached to this event (Knowledge/attestation extension). */
  geoProofRef?: string;
  details?: string;
};

export type TimeScheduleRow = {
  id: string;
  /** Wall-clock or relative start label (e.g. 09:00). */
  when: string;
  title: string;
  durationMinutes?: number;
  placeLabel?: string;
  notes?: string;
};

export type TimeScheduleFields = {
  title: string;
  timeZone?: string;
  rows: TimeScheduleRow[];
};

/** Serialize event fields into TipTap-friendly key lines for seed / agent parse. */
export function formatEventFieldLines(fields: TimeEventFields): string[] {
  return [
    `title:${fields.title}`,
    `startAt:${fields.startAt}`,
    ...(fields.endAt ? [`endAt:${fields.endAt}`] : []),
    ...(fields.timeZone ? [`timeZone:${fields.timeZone}`] : []),
    ...(fields.placeLabel ? [`placeLabel:${fields.placeLabel}`] : []),
    ...(fields.geoProofRef ? [`geoProofRef:${fields.geoProofRef}`] : []),
    ...(fields.details ? [`details:${fields.details}`] : [])
  ];
}

export function formatScheduleRowLines(rows: TimeScheduleRow[]): string[] {
  return rows.map(
    (r) =>
      `${r.when} — ${r.title}` +
      (r.durationMinutes != null ? ` (${r.durationMinutes}m)` : '') +
      (r.placeLabel ? ` @ ${r.placeLabel}` : '')
  );
}

/** Loose parse of `key:value` lines from event body (agents / seeds). */
export function parseEventFieldLines(lines: string[]): Partial<TimeEventFields> {
  const out: Partial<TimeEventFields> = {};
  for (const raw of lines) {
    const m = /^(\w+)\s*:\s*(.+)$/.exec(raw.trim());
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'title') out.title = value;
    else if (key === 'startAt') out.startAt = value;
    else if (key === 'endAt') out.endAt = value;
    else if (key === 'timeZone') out.timeZone = value;
    else if (key === 'placeLabel') out.placeLabel = value;
    else if (key === 'geoProofRef') out.geoProofRef = value;
    else if (key === 'details') out.details = value;
  }
  return out;
}
