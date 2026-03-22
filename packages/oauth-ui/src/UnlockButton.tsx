import type { CSSProperties, ReactNode } from 'react';
import { LockIcon } from './LockIcon';

export interface UnlockButtonConfig {
  clientId: string;
  apiEndpoint: string;
  redirectUri: string;
  scope?: string[];
  state?: string;
  nonce?: string;
}

function generateState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds the OAuth authorize URL and returns it. Caller can navigate or open popup.
 */
export function buildOAuthAuthorizeUrl(config: UnlockButtonConfig): string {
  const state = config.state ?? generateState();
  const nonce = config.nonce ?? generateNonce();
  const scope = (config.scope ?? ['openid', 'profile']).join(' ');

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope,
    state,
    nonce,
  });

  return `${config.apiEndpoint.replace(/\/$/, '')}/oauth/authorize/consent?${params.toString()}`;
}

export interface UnlockButtonProps {
  config: UnlockButtonConfig;
  /** Store state/nonce here before navigation (e.g. sessionStorage key) */
  onBeforeNavigate?: (state: string, nonce: string) => void;
  children?: ReactNode;
  className?: string;
  /** Override click; if provided, config/navigate are ignored */
  onClick?: () => void;
  /** If true, show lock icon (default true) */
  showIcon?: boolean;
  /** Icon + label in compact headers (no visible label; uses aria-label) */
  iconOnly?: boolean;
  title?: string;
}

/**
 * Button that navigates to the canonical OAuth consent page.
 * Uses buildOAuthAuthorizeUrl; stores state/nonce via onBeforeNavigate for callback verification.
 */
const iconStyle: CSSProperties = {
  width: '1.125rem',
  height: '1.125rem',
  flexShrink: 0,
  display: 'block',
  verticalAlign: 'middle',
};

export function UnlockButton({
  config,
  onBeforeNavigate,
  children = 'Unlock pN',
  className = '',
  onClick,
  showIcon = true,
  iconOnly = false,
  title = 'Unlock pN',
}: UnlockButtonProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }

    const state = config.state ?? generateState();
    const nonce = config.nonce ?? generateNonce();
    onBeforeNavigate?.(state, nonce);

    const url = buildOAuthAuthorizeUrl({
      ...config,
      state,
      nonce,
    });
    window.location.href = url;
  };

  const showLabel = !iconOnly && children != null && children !== false;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      title={title}
      aria-label={iconOnly ? title : undefined}
    >
      {showIcon && (
        <LockIcon
          style={{
            ...iconStyle,
            marginRight: showLabel ? '0.375rem' : 0,
          }}
        />
      )}
      {showLabel ? children : null}
    </button>
  );
}
