/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { webcrypto } from 'crypto';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const OWNER_PK = 'owner-public-key';
const OWNER_PN = 'pn-owner1';
const ENVELOPE = { version: 1, iv: 'iv', ciphertext: 'ct' };

const startPnOAuthPopup = jest.fn();
const fetchPortalUserInfo = jest.fn();
const exchangeCodeForToken = jest.fn(async () => 'fresh-token');
const getIdentity = jest.fn();

jest.mock('@par-noir/oauth-ui', () => ({
  buildOAuthConsentUrl: (cfg: { state: string }) => `https://unlock.test/oauth/consent?state=${cfg.state}`,
  startPnOAuthPopup: (...args: unknown[]) => startPnOAuthPopup(...args),
  fetchPortalUserInfo: (...args: unknown[]) => fetchPortalUserInfo(...args),
}));
jest.mock('../config/api', () => ({ API_ENDPOINT: 'https://api.test' }));
jest.mock('../services/parNoirOAuthInline', () => ({
  PN_CLIENT_ID: 'browser-app',
  exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForToken(...(args as [])),
}));
jest.mock(
  '@par-noir/pqc-crypto/oauth-unlock-proof',
  () => ({ deriveCanonicalPnIdentifier: (pk: string) => (pk === OWNER_PK ? OWNER_PN : 'pn-other') }),
  { virtual: true }
);
jest.mock('../utils/simpleStorage', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getIdentity }) },
}));

import { RecoveryAuthProvider, useRecoveryAuth } from '../contexts/RecoveryAuthContext';
import { getRecoveryAuthSession } from '../services/recoveryAuthSession';
import {
  clearShellRecoveryEnvelope,
  rememberShellRecoveryEnvelope,
} from '../services/shellRecoveryEnvelope';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoveryAuthProvider>{children}</RecoveryAuthProvider>
);

const expectedUser = { id: 'did:pn:owner', publicKey: OWNER_PK };
const loadEncryptedIdentity = jest.fn(async () => null);

beforeEach(() => {
  jest.clearAllMocks();
  clearShellRecoveryEnvelope();
  startPnOAuthPopup.mockImplementation(async (opts: { url: string; expectedState: string }) => ({
    code: 'auth-code',
    state: opts.expectedState,
  }));
  getIdentity.mockResolvedValue({
    publicKey: OWNER_PK,
    encryptedData: { encryptedData: 'enc', iv: 'iv', salt: 'salt', recoveryEnvelope: ENVELOPE },
  });
});

describe('Recovery tab step-up through the shared unlock popup', () => {
  it('unlocks recovery with the stored envelope when the popup returns the same pN', async () => {
    fetchPortalUserInfo.mockResolvedValue({ pn_identifier: 'owner1' });
    const { result } = renderHook(() => useRecoveryAuth(), { wrapper });

    await act(async () => {
      await result.current.unlockViaOAuthPopup({ expectedUser, loadEncryptedIdentity });
    });

    expect(startPnOAuthPopup).toHaveBeenCalledWith(
      expect.objectContaining({ completeViaParentNavigation: false, expectedState: expect.any(String) })
    );
    expect(exchangeCodeForToken).toHaveBeenCalledWith('auth-code', `${window.location.origin}/oauth-callback.html`);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.auth?.encryptedIdentity.recoveryEnvelope).toEqual(ENVELOPE);
    expect(result.current.auth?.pnName).toBeUndefined();
    expect(result.current.auth?.passcode).toBeUndefined();
    expect(getRecoveryAuthSession()?.encryptedIdentity.publicKey).toBe(OWNER_PK);
  });

  it('uses the envelope from the Unlock-app session when this browser has no saved .pn', async () => {
    getIdentity.mockResolvedValue(null);
    rememberShellRecoveryEnvelope([OWNER_PK], JSON.stringify(ENVELOPE));
    fetchPortalUserInfo.mockResolvedValue({ pn_identifier: OWNER_PN });
    const { result } = renderHook(() => useRecoveryAuth(), { wrapper });

    await act(async () => {
      await result.current.unlockViaOAuthPopup({ expectedUser, loadEncryptedIdentity });
    });

    expect(result.current.auth?.encryptedIdentity.recoveryEnvelope).toEqual(ENVELOPE);
    expect(result.current.auth?.encryptedIdentity.publicKey).toBe(OWNER_PK);
  });

  it('explains how to fix it when neither the session nor this browser has the envelope', async () => {
    getIdentity.mockResolvedValue(null);
    fetchPortalUserInfo.mockResolvedValue({ pn_identifier: OWNER_PN });
    const { result } = renderHook(() => useRecoveryAuth(), { wrapper });

    await act(async () => {
      await expect(
        result.current.unlockViaOAuthPopup({ expectedUser, loadEncryptedIdentity })
      ).rejects.toThrow('did not share this pN’s recovery data');
    });
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('rejects when the popup unlocked a different pN', async () => {
    fetchPortalUserInfo.mockResolvedValue({ pn_identifier: 'pn-someone-else' });
    const { result } = renderHook(() => useRecoveryAuth(), { wrapper });

    await act(async () => {
      await expect(
        result.current.unlockViaOAuthPopup({ expectedUser, loadEncryptedIdentity })
      ).rejects.toThrow('does not match the active dashboard session');
    });
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('reports a closed popup as cancelled', async () => {
    startPnOAuthPopup.mockRejectedValue(new Error('POPUP_CLOSED'));
    const { result } = renderHook(() => useRecoveryAuth(), { wrapper });

    await act(async () => {
      await expect(
        result.current.unlockViaOAuthPopup({ expectedUser, loadEncryptedIdentity })
      ).rejects.toThrow('Unlock was cancelled.');
    });
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });
});
