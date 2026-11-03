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

describe('SessionVaultIdentityPicker modes', () => {
  it('renders Use a different pN and hides cancel without onCancel', () => {
    const onUseDifferent = vi.fn();
    render(<SessionVaultIdentityPicker open options={options} onSelect={() => undefined} onUseDifferent={onUseDifferent} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different pN' }));
    expect(onUseDifferent).toHaveBeenCalled();
  });

  it('selectable={false} shows labels only but keeps Remove', () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    render(
      <SessionVaultIdentityPicker
        open
        options={options}
        selectable={false}
        onSelect={onSelect}
        onRemove={onRemove}
        onCancel={() => undefined}
        cancelLabel="Done"
      />
    );
    expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    expect(screen.getByText('Alpha')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bravo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Bravo' }));
    expect(onRemove).toHaveBeenCalledWith('did:b');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('SessionVaultUnlockOverlay', () => {
  it('has no Manage saved pNs link', () => {
    render(<SessionVaultUnlockOverlay open onUnlock={() => undefined} onUseFullUnlock={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Manage saved pNs' })).toBeNull();
  });
});
