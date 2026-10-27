/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { RecoveryAuthProvider, useRecoveryAuth } from '../contexts/RecoveryAuthContext';
import { getRecoveryAuthSession, type RecoveryAuthSession } from '../services/recoveryAuthSession';

function session(expiresInMs: number): RecoveryAuthSession {
  return {
    encryptedIdentity: { publicKey: 'pk', encryptedData: 'e', iv: 'i', salt: 's' },
    pnName: 'k1',
    passcode: 'k2',
    expiresAt: Date.now() + expiresInMs,
  };
}

describe('RecoveryAuthProvider session change', () => {
  afterEach(() => jest.useRealTimers());

  it('tells the page after the shared session is saved, cleared and expired', () => {
    jest.useFakeTimers();
    const seen: boolean[] = [];
    const onSessionChange = jest.fn(() => seen.push(Boolean(getRecoveryAuthSession())));
    const { result } = renderHook(() => useRecoveryAuth(), {
      wrapper: ({ children }) => (
        <RecoveryAuthProvider onSessionChange={onSessionChange}>{children}</RecoveryAuthProvider>
      ),
    });
    seen.length = 0;

    act(() => result.current.startSession(session(60_000)));
    expect(seen).toEqual([true]);

    act(() => result.current.clearAuth());
    expect(seen).toEqual([true, false]);

    act(() => result.current.startSession(session(1_000)));
    act(() => {
      jest.advanceTimersByTime(1_500);
    });
    expect(seen).toEqual([true, false, true, false]);
    expect(result.current.isAuthenticated).toBe(false);
  });
});
