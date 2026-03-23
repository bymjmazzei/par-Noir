import type { CSSProperties, ReactNode } from 'react';
import { LockIcon } from './LockIcon';
import {
  buildOAuthConsentUrl,
  startPnOAuthPopup,
  type PnOAuthPopupResult,
} from './pnOAuthPopup';

export type { OAuthConsentUrlConfig } from './pnOAuthPopup';
export { buildOAuthConsentUrl, buildOAuthAuthorizeUrl, startPnOAuthPopup } from './pnOAuthPopup';
export type { PnOAuthPopupResult } from './pnOAuthPopup';

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

export interface UnlockButtonProps {
  config: UnlockButtonConfig;
  /** Store state/nonce here before navigation (e.g. sessionStorage key) */
  onBeforeNavigate?: (state: string, nonce: string) => void;
  /** After popup completes (success or OAuth error payload). Not called for forceRedirect. */
  onPopupResult?: (result: PnOAuthPopupResult) => void | Promise<void>;
  /** Popup blocked, timeout, closed without result, or unexpected error */
  onPopupFlowFailed?: (reason: string) => void;
  /** Native / full-window: skip popup and assign location (e.g. Capacitor) */
  forceRedirect?: boolean;
  /**
   * When true, popup completion navigates this window to /?oauth_resume=1&code=... (host must handle on load).
   * Use for first-party apps (e.g. Prism) when postMessage/storage bridging is unreliable.
   */
  completeViaParentNavigation?: boolean;
  children?: ReactNode;
  className?: string;
  /** Override click; if provided, default unlock behavior is skipped */
  onClick?: () => void;
  showIcon?: boolean;
  iconOnly?: boolean;
  title?: string;
}

const iconStyle: CSSProperties = {
  width: '1.125rem',
  height: '1.125rem',
  flexShrink: 0,
  display: 'block',
  verticalAlign: 'middle',
};

/**
 * Button that starts pN OAuth in a popup (default) or full redirect when forceRedirect is set.
 */
export function UnlockButton({
  config,
  onBeforeNavigate,
  onPopupResult,
  onPopupFlowFailed,
  forceRedirect = false,
  completeViaParentNavigation = false,
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

    const url = buildOAuthConsentUrl({
      ...config,
      state,
      nonce,
      forPopup: !forceRedirect,
    });

    if (forceRedirect) {
      window.location.href = url;
      return;
    }

    let apiOrigin = '';
    try {
      apiOrigin = new URL(config.apiEndpoint.replace(/\/$/, '') || config.apiEndpoint).origin;
    } catch {
      /* ignore */
    }

    void (async () => {
      try {
        const result = await startPnOAuthPopup({
          url,
          expectedState: state,
          completeViaParentNavigation,
          allowedMessageOrigins: apiOrigin ? [apiOrigin] : undefined,
        });
        await onPopupResult?.(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'POPUP_BLOCKED') {
          onPopupFlowFailed?.('Popup blocked. Allow popups for this site.');
        } else if (msg === 'POPUP_TIMEOUT') {
          onPopupFlowFailed?.('Authentication timed out. Try again.');
        } else if (msg === 'POPUP_CLOSED') {
          onPopupFlowFailed?.('Sign-in was cancelled or the window closed.');
        } else if (msg === 'OAUTH_STATE_MISMATCH' || msg === 'OAUTH_STATE_MISSING') {
          onPopupFlowFailed?.('Sign-in could not be verified. Close other tabs and try again.');
        } else {
          onPopupFlowFailed?.(msg);
        }
      }
    })();
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
