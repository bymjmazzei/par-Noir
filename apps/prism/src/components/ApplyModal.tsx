/**
 * Apply Modal — Ray application
 * Shows program requirements and Sign in with par Noir to apply
 */

import React, { useState } from 'react';
import { X, Shield, CheckCircle2 } from 'lucide-react';
import { buildOAuthConsentUrl, startPnOAuthPopup } from '@par-noir/oauth-ui';
import { Capacitor } from '@capacitor/core';
import { API_ENDPOINT } from '../config/api';
import { getPrismRedirectUri, PRISM_CLIENT_ID, prismOnBeforeNavigate } from '../utils/oauth';
import { exchangeCodeForToken } from '../services/prismAuthService';
import { useAuth } from '../contexts/AuthContext';

interface ApplyModalProps {
  open: boolean;
  onClose: () => void;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function ApplyModal({ open, onClose }: ApplyModalProps) {
  const { refreshSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);

  if (!open) return null;

  const handleSignIn = async () => {
    setFlowError(null);
    const state = randomHex(16);
    const nonce = randomHex(16);
    prismOnBeforeNavigate(state, nonce);

    const consentConfig = {
      clientId: PRISM_CLIENT_ID,
      apiEndpoint: API_ENDPOINT,
      redirectUri: getPrismRedirectUri(),
      scope: ['openid', 'profile'] as string[],
      state,
      nonce,
    };

    if (Capacitor.isNativePlatform()) {
      const url = buildOAuthConsentUrl({ ...consentConfig, forPopup: false });
      window.location.href = url;
      onClose();
      return;
    }

    const url = buildOAuthConsentUrl({ ...consentConfig, forPopup: true });
    setBusy(true);
    try {
      const result = await startPnOAuthPopup({
        url,
        expectedState: state,
        timeoutMs: 300_000,
        completeViaParentNavigation: false,
      });
      if (result.error) {
        setFlowError(result.error === 'access_denied' ? 'Authorization denied' : result.error);
        return;
      }
      if (!result.code) return;
      await exchangeCodeForToken(result.code);
      await refreshSession();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'POPUP_BLOCKED') {
        setFlowError('Popup blocked. Allow popups for this site.');
      } else if (msg === 'POPUP_CLOSED') {
        setFlowError('Sign-in was cancelled.');
      } else if (msg === 'OAUTH_STATE_MISMATCH' || msg === 'OAUTH_STATE_MISSING') {
        setFlowError('Sign-in could not be verified. Please try again.');
      } else if (msg !== 'POPUP_TIMEOUT') {
        setFlowError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-8 w-8 text-neutral-400" />
            <h2 className="text-xl font-semibold">Apply to become a Ray</h2>
          </div>

          <p className="text-neutral-400 mb-6">
            Rays review DMCA-flagged content and reach consensus. To apply, you need to sign in with your par Noir identity.
          </p>

          <ul className="space-y-3 mb-8">
            <li className="flex items-start gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-500/80 shrink-0 mt-0.5" />
              <span className="text-neutral-300">Reputation requirements (activity-based score)</span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-500/80 shrink-0 mt-0.5" />
              <span className="text-neutral-300">Identity and payment data points (required for rewards)</span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-500/80 shrink-0 mt-0.5" />
              <span className="text-neutral-300">Two Rays must agree to approve or deny content</span>
            </li>
          </ul>

          {flowError && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {flowError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleSignIn()}
            disabled={busy}
            className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            {busy ? 'Opening sign-in…' : 'Sign in with par Noir to apply'}
          </button>

          <p className="mt-4 text-xs text-neutral-500 text-center">
            Your identity is verified client-side. No secrets are sent to our servers.
          </p>
        </div>
      </div>
    </div>
  );
}
