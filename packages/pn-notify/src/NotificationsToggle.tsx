import { useWebPushToggle, webPushProblemText } from './useWebPushToggle';
import type { WebPushOptions } from './client';

export interface NotificationsToggleProps extends WebPushOptions {
  className?: string;
  labelClassName?: string;
  hintClassName?: string;
}

export interface NotificationsBellButtonProps extends WebPushOptions {
  className?: string;
}

/** Compact header variant of the opt-in, for app chrome without a settings menu. */
export function NotificationsBellButton({ className, ...opts }: NotificationsBellButtonProps) {
  const { supported, enabled, busy, problem, toggle } = useWebPushToggle(opts);
  if (!supported) return null;
  const title =
    webPushProblemText(problem) ??
    (enabled ? 'Notifications on for this device. Click to turn off.' : 'Notify me on this device while locked');
  return (
    <button
      type="button"
      className={className}
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={enabled}
      aria-label={title}
      title={title}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        {!enabled && <line x1="3" y1="3" x2="21" y2="21" />}
      </svg>
    </button>
  );
}

/** Per-device opt-in. Shown only while unlocked; the subscription itself survives lock. */
export function NotificationsToggle({
  className,
  labelClassName,
  hintClassName,
  ...opts
}: NotificationsToggleProps) {
  const { supported, enabled, busy, problem, toggle } = useWebPushToggle(opts);
  if (!supported) return null;
  const hint = webPushProblemText(problem);
  return (
    <div className={className}>
      <label className={labelClassName} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} disabled={busy} onChange={() => void toggle()} />
        <span>Notify me on this device while locked</span>
      </label>
      <p className={hintClassName}>{hint ?? 'Shows only that something arrived, never who or what.'}</p>
    </div>
  );
}
