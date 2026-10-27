import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecoveryPasscodeModal } from '../components/recovery/RecoveryPasscodeModal';

const KEY_1 = 'Brand-New-Key-One-2026!';
const KEY_2 = 'Brand-New-Key-Two-2026!';

function fill(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
}

describe('RecoveryPasscodeModal', () => {
  it('collects new Key 1 and Key 2 in the dashboard and submits them', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<RecoveryPasscodeModal isOpen onClose={jest.fn()} onSubmit={onSubmit} />);
    fill('Enter Key 1', ` ${KEY_1} `);
    fill('Confirm Key 1', KEY_1);
    fill('Enter Key 2', KEY_2);
    fill('Confirm Key 2', KEY_2);
    fireEvent.click(screen.getByRole('button', { name: 'Complete recovery' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(KEY_1, KEY_2));
  });

  it('accepts any non-empty keys, like creating a pN', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<RecoveryPasscodeModal isOpen onClose={jest.fn()} onSubmit={onSubmit} />);
    fill('Enter Key 1', 'abc');
    fill('Confirm Key 1', 'abc');
    fill('Enter Key 2', 'xyz');
    fill('Confirm Key 2', 'xyz');
    fireEvent.click(screen.getByRole('button', { name: 'Complete recovery' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('abc', 'xyz'));
  });

  it('blocks mismatched Key 1 before submitting', async () => {
    const onSubmit = jest.fn();
    render(<RecoveryPasscodeModal isOpen onClose={jest.fn()} onSubmit={onSubmit} />);
    fill('Enter Key 1', KEY_1);
    fill('Confirm Key 1', 'Different-Key-1!');
    fill('Enter Key 2', KEY_2);
    fill('Confirm Key 2', KEY_2);
    fireEvent.click(screen.getByRole('button', { name: 'Complete recovery' }));
    expect(await screen.findByText('Key 1 entries do not match')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the recovery error and keeps the form open', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('This recovery key does not open the recovery data.'));
    render(<RecoveryPasscodeModal isOpen onClose={jest.fn()} onSubmit={onSubmit} />);
    fill('Enter Key 1', KEY_1);
    fill('Confirm Key 1', KEY_1);
    fill('Enter Key 2', KEY_2);
    fill('Confirm Key 2', KEY_2);
    fireEvent.click(screen.getByRole('button', { name: 'Complete recovery' }));
    expect(await screen.findByText('This recovery key does not open the recovery data.')).toBeTruthy();
  });
});
