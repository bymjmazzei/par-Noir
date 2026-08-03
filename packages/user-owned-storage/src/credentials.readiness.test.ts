import { describe, expect, it } from 'vitest';
import {
  accountRecordHasUsableSecrets,
  assessCloudSessionReadiness,
  envelopeHasUsableSecrets,
  type StorageCredentialsEnvelope
} from './credentials.js';

describe('accountRecordHasUsableSecrets', () => {
  it('returns false for layout-only rows', () => {
    expect(
      accountRecordHasUsableSecrets({
        accountId: 'google_drive::pn-x::a',
        email: 'x@example.com'
      })
    ).toBe(false);
  });

  it('returns true when accessToken present', () => {
    expect(accountRecordHasUsableSecrets({ accessToken: 'tok' })).toBe(true);
  });

  it('returns true for S3 secretAccessKey', () => {
    expect(
      accountRecordHasUsableSecrets({
        accountId: 's3::pn-x::b',
        bucket: 'b',
        secretAccessKey: 'secret'
      })
    ).toBe(true);
  });
});

describe('assessCloudSessionReadiness', () => {
  it('returns unlinked when API has no layout', () => {
    expect(
      assessCloudSessionReadiness({
        apiAccounts: [],
        socialCloudProvider: null,
        localEnvelope: null
      })
    ).toBe('unlinked');
  });

  it('returns linkedInactive when API layout exists without local secrets', () => {
    expect(
      assessCloudSessionReadiness({
        apiAccounts: [{ provider: 'google_drive', accountId: 'a1' }],
        socialCloudProvider: 'google_drive',
        localEnvelope: {
          socialCloudProvider: 'google_drive',
          googleDriveAccounts: [{ accountId: 'a1', email: 'x@example.com' }]
        }
      })
    ).toBe('linkedInactive');
  });

  it('returns ready when local envelope has secrets', () => {
    const local: StorageCredentialsEnvelope = {
      socialCloudProvider: 'google_drive',
      googleDriveAccounts: [{ accountId: 'a1', accessToken: 'tok', refreshToken: 'rt' }]
    };
    expect(
      assessCloudSessionReadiness({
        apiAccounts: [{ provider: 'google_drive', accountId: 'a1' }],
        socialCloudProvider: 'google_drive',
        localEnvelope: local
      })
    ).toBe('ready');
    expect(envelopeHasUsableSecrets(local, 'google_drive')).toBe(true);
  });

  it('returns ready for portable secrets even if social provider differs', () => {
    expect(
      assessCloudSessionReadiness({
        apiAccounts: [{ provider: 'aws_s3', accountId: 's1' }],
        socialCloudProvider: 'aws_s3',
        localEnvelope: {
          socialCloudProvider: 'aws_s3',
          awsS3Accounts: [
            {
              accountId: 's1',
              bucket: 'b',
              region: 'us-east-1',
              accessKeyId: 'AKIA',
              secretAccessKey: 'secret',
              prefix: 'par-noir-pn-x'
            }
          ]
        }
      })
    ).toBe('ready');
  });
});
