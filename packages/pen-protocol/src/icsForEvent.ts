/** Build a minimal .ics file for Add to calendar triggers. */

export function icsForEvent(input: {
  title: string;
  location?: string;
  startIso: string;
  durationMin?: number;
}): { ics: string; filename: string } {
  const start = Date.parse(input.startIso);
  if (Number.isNaN(start)) {
    throw new Error('event_start_invalid');
  }
  const durationMs = Math.max(1, input.durationMin ?? 60) * 60 * 1000;
  const end = start + durationMs;
  const stamp = formatIcsUtc(new Date());
  const dtStart = formatIcsUtc(new Date(start));
  const dtEnd = formatIcsUtc(new Date(end));
  const uid = `pen-${start}-${Math.random().toString(36).slice(2, 10)}@parnoir.com`;
  const title = escapeIcs(input.title || 'Event');
  const loc = input.location ? escapeIcs(input.location) : '';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//par Noir//Pen//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    ...(loc ? [`LOCATION:${loc}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  const safeName = (input.title || 'event').replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'event';
  return { ics: lines.join('\r\n'), filename: `${safeName}.ics` };
}

function formatIcsUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
