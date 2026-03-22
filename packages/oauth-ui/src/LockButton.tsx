import type { CSSProperties, ReactNode } from 'react';
import { UnlockIcon } from './UnlockIcon';

export interface LockButtonProps {
  onLock: () => void | Promise<void>;
  /** If provided, will POST to /oauth/revoke before calling onLock */
  refreshToken?: string | null;
  /** API base URL for revoke endpoint */
  apiEndpoint?: string;
  children?: ReactNode;
  className?: string;
  /** If true, show unlock icon (default true) — shown when locked, represents "unlock" action to get back */
  showIcon?: boolean;
  title?: string;
}

/**
 * Button that ends the session. Optionally revokes refresh token before calling onLock.
 */
export function LockButton({
  onLock,
  refreshToken,
  apiEndpoint,
  children = 'Lock',
  className = '',
  showIcon = true,
  title = 'Lock session',
}: LockButtonProps) {
  const handleClick = async () => {
    if (refreshToken && apiEndpoint) {
      try {
        await fetch(`${apiEndpoint.replace(/\/$/, '')}/oauth/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: refreshToken,
            token_type_hint: 'refresh_token',
          }),
        });
      } catch {
        /* best-effort */
      }
    }
    await onLock();
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
