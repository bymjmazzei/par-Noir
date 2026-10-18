/** CSS gradient strings stored on `backgroundGradient` ⇄ editable stops. */

export type GradientStop = { color: string; at: number };

export type GradientSpec = {
  type: 'linear' | 'radial';
  /** Degrees; linear only. */
  angle: number;
  stops: GradientStop[];
};

export const DEFAULT_GRADIENT: GradientSpec = {
  type: 'linear',
  angle: 135,
  stops: [
    { color: '#111111', at: 0 },
    { color: '#666666', at: 100 }
  ]
};

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(body.slice(start).trim());
  return parts.filter(Boolean);
}

const SIDE_ANGLES: Record<string, number> = {
  'to top': 0,
  'to top right': 45,
  'to right top': 45,
  'to right': 90,
  'to bottom right': 135,
  'to right bottom': 135,
  'to bottom': 180,
  'to bottom left': 225,
  'to left bottom': 225,
  'to left': 270,
  'to top left': 315,
  'to left top': 315
};

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function parseStop(part: string): { color: string; at: number | null } | null {
  const match = /^(.*?)(?:\s+(-?[\d.]+)%)?$/.exec(part.trim());
  const color = match?.[1]?.trim();
  if (!color) return null;
  return { color, at: match?.[2] != null ? clampPct(Number(match[2])) : null };
}

/** Parse a linear/radial CSS gradient; unknown shapes return null. */
export function parseCssGradient(value: string | undefined | null): GradientSpec | null {
  const raw = (value || '').trim();
  const outer = /^(linear|radial)-gradient\(([\s\S]*)\)$/i.exec(raw);
  if (!outer) return null;
  const type = outer[1]!.toLowerCase() as GradientSpec['type'];
  const parts = splitTopLevel(outer[2]!);
  let angle = type === 'linear' ? 180 : 0;
  const head = parts[0]?.toLowerCase() || '';
  if (type === 'linear') {
    const deg = /^(-?[\d.]+)deg$/.exec(head);
    if (deg) {
      angle = ((Number(deg[1]) % 360) + 360) % 360;
      parts.shift();
    } else if (head in SIDE_ANGLES) {
      angle = SIDE_ANGLES[head]!;
      parts.shift();
    }
  } else if (/^(circle|ellipse)\b|\bat\b|closest|farthest/.test(head)) {
    parts.shift();
  }
  const parsed = parts.map(parseStop);
  if (parsed.length < 2 || parsed.some((stop) => !stop)) return null;
  const stops = parsed.map((stop, index) => ({
    color: stop!.color,
    at: stop!.at ?? Math.round((index / (parsed.length - 1)) * 100)
  }));
  return { type, angle: Math.round(angle), stops };
}

export function formatCssGradient(spec: GradientSpec): string {
  const stops = [...spec.stops]
    .sort((a, b) => a.at - b.at)
    .map((stop) => `${stop.color} ${Math.round(clampPct(stop.at))}%`)
    .join(', ');
  if (spec.type === 'radial') return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${Math.round(spec.angle)}deg, ${stops})`;
}
