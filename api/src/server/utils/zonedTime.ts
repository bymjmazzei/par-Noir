/**
 * Wall-clock times in an IANA zone without a date library. Daylight-saving aware: a daily job
 * that re-aims with `nextZonedHour` after each run stays on the same local hour all year.
 */

function wallClock(t: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date(t));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** The zone's offset from UTC at instant `t`, in ms. */
function zoneOffset(t: number, timeZone: string): number {
  const w = wallClock(t, timeZone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000;
}

/** The instant when the wall clock in `timeZone` reads `hour`:00 on the given date. */
function zonedInstant(y: number, m: number, d: number, hour: number, timeZone: string): number {
  const wall = Date.UTC(y, m - 1, d, hour);
  const guess = wall - zoneOffset(wall, timeZone);
  return wall - zoneOffset(guess, timeZone);
}

/** The next time after `now` that the wall clock in `timeZone` reads `hour`:00. */
export function nextZonedHour(now: Date, hour: number, timeZone: string): Date {
  const today = wallClock(now.getTime(), timeZone);
  for (let add = 0; add <= 2; add++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + add));
    const t = zonedInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, timeZone);
    if (t > now.getTime()) return new Date(t);
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
