/**
 * @jest-environment node
 *
 * Storage layout routes keep only the layout shell; provider secrets stay on the
 * owner's device and the API never opens the owner's cloud.
 */
jest.mock('../deviceCapabilityService', () => ({
  DEVICE_CAPABILITIES: { profileWrite: 'profile.write' },
  gateOwnerRoute: jest.fn(async () => ({ pnIdentifier: 'pn-test' })),
}));


const stored: { credentials: Record<string, unknown> | null } = { credentials: null };

jest.mock('../storageCredentialsService', () => ({
  ...jest.requireActual('../storageCredentialsService'),
  storageCredentialsService: {
    getCredentials: jest.fn(async () => (stored.credentials ? { credentials: stored.credentials } : null)),
    upsertCredentials: jest.fn(async (_pn: string, credentials: Record<string, unknown>) => {
      stored.credentials = credentials;
      return { identityId: 'pn-test', credentials };
    }),
  },
}));

import express from 'express';
import request from 'supertest';
import { registerStorageRoutes } from './storageRoutes';

function app() {
  const a = express();
  a.use(express.json());
  registerStorageRoutes(a, 'test');
  return a;
}

beforeEach(() => {
  stored.credentials = null;
});

describe('PUT /api/storage/credentials/:id/provider', () => {
  it('refuses provider secrets instead of storing them', async () => {
    const res = await request(app())
      .put('/api/storage/credentials/pn-test/provider')
      .send({ provider: 'aws_s3', awsS3: { bucket: 'b', region: 'us-east-1', secretAccessKey: 'shh' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('secrets_not_accepted');
    expect(stored.credentials).toBeNull();
  });

  it('stores the S3 layout shell and makes it the social cloud on first connect', async () => {
    const res = await request(app())
      .put('/api/storage/credentials/pn-test/provider')
      .send({ provider: 'aws_s3', awsS3: { bucket: 'b', region: 'us-east-1', accessKeyId: 'AKID' } });
    expect(res.status).toBe(200);
    expect(res.body.socialCloudProvider).toBe('aws_s3');
    const [account] = stored.credentials!.awsS3Accounts as Array<Record<string, unknown>>;
    expect(account).toMatchObject({ bucket: 'b', region: 'us-east-1', prefix: 'par-noir-pn-test' });
  });

  it('refuses a relay URL or token and stores only the relay prefix', async () => {
    for (const relay of [{ prefix: 'par-noir-pn-test', token: 't' }, { prefix: 'par-noir-pn-test', url: 'https://r' }]) {
      const res = await request(app()).put('/api/storage/credentials/pn-test/provider').send({ provider: 'relay', relay });
      expect(res.body.error).toBe('secrets_not_accepted');
    }
    expect(stored.credentials).toBeNull();

    const res = await request(app())
      .put('/api/storage/credentials/pn-test/provider')
      .send({ provider: 'relay', relay: { prefix: 'par-noir-pn-test' } });
    expect(res.body).toMatchObject({ provider: 'relay', socialCloudProvider: 'relay' });
    expect(stored.credentials!.relayAccounts).toEqual([
      { accountId: 'relay::pn-test::relay', prefix: 'par-noir-pn-test' },
    ]);
  });

  it('no longer accepts an FTP login', async () => {
    const res = await request(app())
      .put('/api/storage/credentials/pn-test/provider')
      .send({ provider: 'ftp', ftp: { host: 'h', username: 'u' } });
    expect(res.status).toBe(400);
    expect(stored.credentials).toBeNull();
  });
});

describe('PUT /api/storage/credentials/:id/social-cloud', () => {
  it('requires the device to report the copy before switching providers', async () => {
    stored.credentials = { socialCloudProvider: 'google_drive' };
    const blocked = await request(app())
      .put('/api/storage/credentials/pn-test/social-cloud')
      .send({ provider: 'dropbox', accountId: 'db' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('migration_required');

    const ok = await request(app())
      .put('/api/storage/credentials/pn-test/social-cloud')
      .send({ provider: 'dropbox', accountId: 'db', migrated: true });
    expect(ok.status).toBe(200);
    expect(stored.credentials).toMatchObject({ socialCloudProvider: 'dropbox', socialCloudAccountId: 'db' });
  });
});

describe('removed cloud proxy routes', () => {
  it.each([
    ['get', '/api/storage/blobs/pn-test?provider=aws_s3'],
    ['post', '/api/storage/blobs/pn-test/upload'],
    ['post', '/api/storage/test-connection/pn-test'],
    ['post', '/api/storage/credentials/pn-test/portable-init'],
    ['get', '/api/storage/context/pn-test'],
  ] as const)('%s %s is gone', async (method, path) => {
    const res = await request(app())[method](path);
    expect(res.status).toBe(404);
  });
});
