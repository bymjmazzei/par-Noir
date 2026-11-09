import type { CSSProperties, ReactNode } from 'react';
import { UnlockIcon } from './UnlockIcon';
import { revokePortalToken } from './portalOAuthSession';
import type { PnSession } from './session/pnSession';

export interface LockButtonProps {
  /** Shared session: lock runs app hooks, locks every app in this browser, reloads home. */
  session?: Pick<PnSession, 'lock'>;
  /** Legacy path for apps not yet on the shared session. */
  onLock?: () => void | Promise<void>;
  /** Legacy: POST /oauth/revoke before onLock. */
  refreshToken?: string | null;
  /** Legacy: API base URL for revoke endpoint */
  apiEndpoint?: string;
  children?: ReactNode;
  className?: string;
  /** If true, show unlock icon (default true) — shown when locked, represents "unlock" action to get back */
  showIcon?: boolean;
  title?: string;
}

/**
 * Button that ends the session.
 */
export function LockButton({
  session,
  onLock,
  refreshToken,
  apiEndpoint,
  children = 'Lock',
  className = '',
  showIcon = true,
  title = 'Lock session',
}: LockButtonProps) {
  const handleClick = async () => {
    if (session) {
      await session.lock('manual');
      return;
    }
    if (refreshToken && apiEndpoint) {
      try {
        await revokePortalToken({
          apiEndpoint,
          token: refreshToken,
          tokenTypeHint: 'refresh_token',
        });
      } catch {
        /* best-effort */
      }
    }
    await onLock?.();
  };

  const iconStyle: CSSProperties = {
    width: '1.125rem',
    height: '1.125rem',
    flexShrink: 0,
    display: 'block',
    verticalAlign: 'middle',
    marginRight: children != null && children !== false ? '0.375rem' : 0,
  };

  return (
    <button type="button" onClick={handleClick} className={className} title={title}>
      {showIcon && <UnlockIcon style={iconStyle} />}
      {children}
    </button>
  );
}
