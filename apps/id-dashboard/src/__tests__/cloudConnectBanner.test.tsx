/**
 * @jest-environment jsdom
 *
 * Layout banner: no storage is not "needs update", and it re-checks once the cloud registers.
 * Session Drive: a failed index save surfaces instead of being swallowed.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

const ownerFetch = jest.fn();
const ownerGet = jest.fn();

jest.mock('../config/api', () => ({ API_ENDPOINT: 'https://api.test' }));
jest.mock('../services/deviceProofContext', () => ({ deviceProofHeaders: async () => ({}) }));
jest.mock('../services/ownerApiService', () => ({
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
  ownerGet: (...args: unknown[]) => ownerGet(...args),
}));
jest.mock('@par-noir/oauth-ui', () => ({ PN_CLOUD_CREDENTIALS_READY_EVENT: 'pn-cloud-credentials-ready' }));
jest.mock('@par-noir/device-cloud-credentials', () => ({
  SERVER_CLOUD_REGISTRATION_COMPLETE_EVENT: 'pn-server-cloud-registered',
  getCloudAccessTokenFromSession: () => 'google-token',
  runDeviceCloudLayoutMigration: jest.fn(),
  ensureSessionDriveIndex: async (args: { persistIndex: (index: unknown) => Promise<void> }) => {
    await args.persistIndex({ pnFolderId: 'root' });
    return { pnFolderId: 'root' };
  },
}));

import { CloudLayoutUpdateBanner } from '../components/storage/CloudLayoutUpdateBanner';
import { sessionDriveFor } from '../services/sessionDrive';

const PN = `pn-${'c'.repeat(64)}`;
const statusResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const pending = { current: 0, required: 2, pending: [{ id: 'm1', description: 'x' }], complete: false, appliedMigrations: [] };
const complete = { current: 2, required: 2, pending: [], complete: true, appliedMigrations: ['m1', 'm2'] };

describe('CloudLayoutUpdateBanner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows nothing when no storage is connected (404)', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(statusResponse(404, { error: 'NO_STORAGE_CREDENTIALS' }));
    render(<CloudLayoutUpdateBanner apiToken="tok" pnIdentifier={PN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText('Cloud layout update required')).toBeNull();
  });

  it('prompts a legacy FTP social cloud to set up its relay', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(statusResponse(200, complete));
    const onSetUpRelay = jest.fn();
    render(
      <CloudLayoutUpdateBanner apiToken="tok" pnIdentifier={PN} socialCloudProvider="ftp" onSetUpRelay={onSetUpRelay} />
    );
    act(() => {
      screen.getByText('Set up relay').click();
    });
    expect(onSetUpRelay).toHaveBeenCalled();
  });

  it('re-checks and hides once the cloud registration completes', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(statusResponse(200, pending));
    render(<CloudLayoutUpdateBanner apiToken="tok" pnIdentifier={PN} />);
    expect(await screen.findByText('Cloud layout update required')).toBeTruthy();

    fetchMock.mockResolvedValueOnce(statusResponse(200, complete));
    act(() => {
      window.dispatchEvent(new CustomEvent('pn-server-cloud-registered', { detail: { pnIdentifier: PN } }));
    });
    await waitFor(() => expect(screen.queryByText('Cloud layout update required')).toBeNull());
  });
});

describe('sessionDriveFor', () => {
  it('throws when saving the built Drive index fails', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 404 });
    ownerFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(sessionDriveFor(PN, 'tok')).rejects.toThrow('Saving the Drive index failed (404)');
  });
});
