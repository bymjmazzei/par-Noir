jest.mock('@par-noir/identity-crypto', () => ({ IdentityCrypto: {}, safePnDisplayName: jest.fn() }));
jest.mock('qrcode', () => ({}));
jest.mock('../utils/qrCode', () => ({}));
jest.mock('../utils/cloudSync', () => ({}));
jest.mock('../utils/licenseVerification', () => ({}));
jest.mock('../services/recoveryService', () => ({}));
jest.mock('../services/recoveryApiService', () => ({}));
jest.mock('../services/recoveryAuthSession', () => ({}));
jest.mock('../services/recoveryActiveSession', () => ({}));
jest.mock('../services/recoveryCredentialStorage', () => ({}));

import { useRecoveryCustodianHandlers } from '../hooks/useRecoveryCustodianHandlers';

describe('recovered .pn download', () => {
  it('downloads on an unkeyed session (recovery output is not an identity export)', () => {
    const createObjectURL = jest.fn(() => 'blob:recovered');
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const setError = jest.fn();

    const handlers = useRecoveryCustodianHandlers({
      recoveredIdentityExport: { publicKey: 'pk', encryptedData: 'e', iv: 'i', salt: 's' },
      deviceAuth: { isKeyedSession: false, deviceRequiredMessage: 'This action requires a keyed device.' },
      setError,
    } as unknown as Parameters<typeof useRecoveryCustodianHandlers>[0]);

    handlers.handleDownloadRecoveredPn();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(setError).not.toHaveBeenCalled();
  });
});
