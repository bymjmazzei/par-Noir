/**
 * Browse content expiry controls: Never | 24h | 48h | 7d | custom datetime.
 * End state: becomes private after expiresAt (file stays in storage).
 */

export type ContentExpiryPreset = 'never' | '24h' | '48h' | '7d' | 'custom';

export interface ContentExpiryValue {
  preset: ContentExpiryPreset;
  /** ISO string when set; null = never */
  expiresAt: string | null;
}

const PRESET_SECONDS: Record<'24h' | '48h' | '7d', number> = {
  '24h': 24 * 60 * 60,
  '48h': 48 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
};

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(local: string): string | null {
  if (!local.trim()) return null;
  const ms = Date.parse(local);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function inferExpiryPreset(expiresAt: string | null | undefined, now = new Date()): ContentExpiryPreset {
  if (!expiresAt) return 'never';
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return 'never';
  const deltaSec = Math.round((ms - now.getTime()) / 1000);
  for (const [key, sec] of Object.entries(PRESET_SECONDS) as Array<['24h' | '48h' | '7d', number]>) {
    if (Math.abs(deltaSec - sec) <= 120) return key;
  }
  return 'custom';
}

export function expiryFromPreset(preset: ContentExpiryPreset, customLocal?: string, now = new Date()): ContentExpiryValue {
  if (preset === 'never') return { preset: 'never', expiresAt: null };
  if (preset === 'custom') {
    const expiresAt = fromDatetimeLocalValue(customLocal || '');
    return { preset: 'custom', expiresAt };
  }
  const sec = PRESET_SECONDS[preset];
  return {
    preset,
    expiresAt: new Date(now.getTime() + sec * 1000).toISOString(),
  };
}

interface ContentExpiryFieldsProps {
  value: ContentExpiryValue;
  onChange: (next: ContentExpiryValue) => void;
  disabled?: boolean;
  /** Show under public-only sections */
  className?: string;
}

export function ContentExpiryFields({ value, onChange, disabled, className }: ContentExpiryFieldsProps) {
  const customLocal = toDatetimeLocalValue(value.expiresAt);
  const minLocal = toDatetimeLocalValue(new Date(Date.now() + 60_000).toISOString());

  const setPreset = (preset: ContentExpiryPreset) => {
    if (preset === 'custom') {
      const fallback =
        value.expiresAt && Date.parse(value.expiresAt) > Date.now()
          ? value.expiresAt
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      onChange({ preset: 'custom', expiresAt: fallback });
      return;
    }
    onChange(expiryFromPreset(preset));
  };

  return (
    <div className={className || 'space-y-3'}>
      <div>
        <p className="text-sm font-semibold text-white uppercase tracking-wide mb-1">Public feed expiry</p>
        <p className="text-xs text-text-secondary mb-3">
          Becomes private after this time (stays in your storage).
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['never', 'Never'],
              ['24h', '24h'],
              ['48h', '48h'],
              ['7d', '7d'],
              ['custom', 'Custom'],
            ] as const
          ).map(([id, label]) => {
            const active = value.preset === id;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => setPreset(id)}
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide rounded-md border transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-600/20 text-white'
                    : 'border-neutral-600 bg-neutral-800 text-text-secondary hover:text-text-primary'
                } disabled:opacity-50`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {value.preset === 'custom' && (
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Become private at
          </label>
          <input
            type="datetime-local"
            min={minLocal}
            value={customLocal}
            disabled={disabled}
            onChange={(e) => {
              const expiresAt = fromDatetimeLocalValue(e.target.value);
              onChange({ preset: 'custom', expiresAt });
            }}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {value.expiresAt && (
        <p className="text-xs text-text-secondary">
          Becomes private{' '}
          <span className="text-text-primary">
            {new Date(value.expiresAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </p>
      )}
    </div>
  );
}
