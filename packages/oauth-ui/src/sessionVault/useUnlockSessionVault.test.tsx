// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  UnlockSessionVaultLayer,
  useUnlockSessionVault,
  type SavedPnEntry,
  type UnlockSessionVault,
  type UnlockVaultAdapter,
} from './useUnlockSessionVault';

afterEach(cleanup);

const SIGN_IN = '?client_id=browser-app&redirect_uri=https%3A%2F%2Fbrowse.parnoir.com%2Foauth-callback.html&response_type=code&scope=openid&state=abcdef0123456789';

function entry(id: string, nickname: string): SavedPnEntry {
  return {
    kind: 'unlock_keys',
    identityId: id,
    publicKey: `pk-${id}`,
    key1: `k1-${id}`,
    key2: `k2-${id}`,
    encryptedIdentityJson: '{"publicKey":"x"}',
    nickname,
  };
}

function fakeAdapter(initial: SavedPnEntry[]) {
  let entries = [...initial];
  const adapter: UnlockVaultAdapter = {
    isAvailable: async () => true,
    hasVault: async () => entries.length > 0,
    listIndex: async () => entries.map(({ identityId, publicKey, nickname }) => ({ identityId, publicKey, nickname })),
    hasIdentity: async (id) => entries.some((e) => e.identityId === id),
    enroll: vi.fn(async (e: SavedPnEntry) => {
      entries = [...entries.filter((x) => x.identityId !== e.identityId), e];
    }),
    unlockEntries: vi.fn(async () => [...entries]),
    remove: async (id) => {
      entries = entries.filter((e) => e.identityId !== id);
    },
    label: (e) => e.nickname ?? e.identityId,
    deviceNoun: 'Mac',
    biometricNoun: 'Touch ID',
  };
  return adapter;
}

function mount(adapter: UnlockVaultAdapter) {
  const ref: { current: UnlockSessionVault | null } = { current: null };
  function Harness() {
    const vault = useUnlockSessionVault(adapter);
    ref.current = vault;
    return (
      <>
        <UnlockSessionVaultLayer vault={vault} />
        <div data-testid="factors">{vault.vaultFactors?.key1 ?? ''}</div>
      </>
    );
  }
  render(<Harness />);
  return ref;
}

describe('useUnlockSessionVault', () => {
  it('opens the list for a single saved pN instead of signing in automatically', async () => {
    const vault = mount(fakeAdapter([entry('did:a', 'Alpha')]));
    await act(async () => {
      await vault.current!.offerForSearch(SIGN_IN);
    });
    await screen.findByRole('button', { name: 'Alpha' });
    expect(screen.getByTestId('factors').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(screen.getByTestId('factors').textContent).toBe('k1-did:a');
  });

  it('Use a different pN closes the list with no saved pN applied', async () => {
    const vault = mount(fakeAdapter([entry('did:a', 'Alpha')]));
    await act(async () => {
      await vault.current!.offerForSearch(SIGN_IN);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Use a different pN' }));
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    expect(screen.getByTestId('factors').textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Saved pNs' })).toBeTruthy();
  });

  it('manages saved pNs from the main screen; removing the last hides the button', async () => {
    mount(fakeAdapter([entry('did:a', 'Alpha')]));
    fireEvent.click(await screen.findByRole('button', { name: 'Saved pNs' }));
    await screen.findByText('Alpha');
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Alpha' }));
    await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Saved pNs' })).toBeNull();
  });

  it('Not now applies to this unlock only', async () => {
    const adapter = fakeAdapter([]);
    const vault = mount(adapter);
    const material = {
      identityId: 'did:new',
      publicKey: 'pk-new',
      key1: 'k1',
      key2: 'k2',
      encryptedIdentityJson: '{"publicKey":"pk-new"}',
    };

    let first!: Promise<void>;
    act(() => {
      first = vault.current!.onUnlockedForVault(material);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await act(async () => {
      await first;
    });

    let second!: Promise<void>;
    act(() => {
      second = vault.current!.onUnlockedForVault(material);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Enable with Touch ID' }));
    await act(async () => {
      await second;
    });
    expect(adapter.enroll).toHaveBeenCalledWith(expect.objectContaining({ identityId: 'did:new', key1: 'k1' }));
    await screen.findByRole('button', { name: 'Saved pNs' });
  });
});
