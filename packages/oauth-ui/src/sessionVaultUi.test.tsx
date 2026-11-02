// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SessionVaultIdentityPicker, SessionVaultUnlockOverlay } from './sessionVaultUi';

afterEach(cleanup);

const options = [
  { identityId: 'did:a', label: 'Alpha' },
  { identityId: 'did:b', label: 'Bravo' },
];

describe('SessionVaultIdentityPicker remove', () => {
  it('removes only after an inline confirm', () => {
    const onRemove = vi.fn();
    const onSelect = vi.fn();
    render(
      <SessionVaultIdentityPicker open options={options} onSelect={onSelect} onCancel={() => undefined} onRemove={onRemove} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Alpha' }));
    expect(onRemove).toHaveBeenCalledWith('did:a');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('has no Remove buttons without onRemove', () => {
    render(<SessionVaultIdentityPicker open options={options} onSelect={() => undefined} onCancel={() => undefined} />);
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});

describe('SessionVaultUnlockOverlay manage', () => {
  it('shows Manage saved pNs only when onManage is set', () => {
    const onManage = vi.fn();
    const { rerender } = render(
      <SessionVaultUnlockOverlay open onUnlock={() => undefined} onUseFullUnlock={() => undefined} />
    );
    expect(screen.queryByRole('button', { name: 'Manage saved pNs' })).toBeNull();
    rerender(
      <SessionVaultUnlockOverlay open onUnlock={() => undefined} onUseFullUnlock={() => undefined} onManage={onManage} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage saved pNs' }));
    expect(onManage).toHaveBeenCalled();
  });
});
