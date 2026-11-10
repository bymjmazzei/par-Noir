/**
 * @jest-environment node
 *
 * Validation and happy-path behaviour for the connection request/accept endpoints.
 * The device writes the owner's connections sheet; the API only checks the receipt
 * and hands the peer half to the mailbox.
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: jest.fn(() => 'hashed'),
  isDevVerbose: jest.fn(() => false),
}));

jest.mock('../utils/messagingLog', () => ({
  messagingLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('./socialRail', () => ({
  enqueueSocialJob: jest.fn(async () => true),
}));

import express from 'express';
import request from 'supertest';
import { generateConnectionId, setupConnectionRoutes } from './connectionRoutes';
import { enqueueSocialJob } from './socialRail';

const mockEnqueueSocialJob = enqueueSocialJob as jest.Mock;

const REQUESTER = 'pn-requester';
const RECIPIENT = 'pn-recipient';
/** ML-KEM-768 encapsulation keys are 1184 bytes; the route rejects anything under 1000. */
const ML_KEM_PUBLIC_KEY = Buffer.alloc(1184, 7).toString('base64');

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  setupConnectionRoutes(app);
  return app;
}

function validRequestBody() {
  return {
    requesterPnIdentifier: REQUESTER,
    recipientPnIdentifier: RECIPIENT,
    requesterMlKemPublicKey: ML_KEM_PUBLIC_KEY,
  };
}

describe('generateConnectionId', () => {
  it('is the same from either side', () => {
    expect(generateConnectionId(REQUESTER, RECIPIENT)).toBe(generateConnectionId(RECIPIENT, REQUESTER));
    expect(generateConnectionId(REQUESTER, RECIPIENT)).toMatch(/^conn_[a-zA-Z0-9]{1,32}$/);
  });
});

describe('POST /api/connections/request', () => {
  beforeEach(() => {
    mockEnqueueSocialJob.mockReset().mockResolvedValue(true);
  });

  it('requires both identifiers', async () => {
    const res = await request(buildApp())
      .post('/api/connections/request')
      .send({ requesterPnIdentifier: REQUESTER })
      .expect(400);
    expect(res.body.error).toContain('recipientPnIdentifier');
  });

  it('requires an ML-KEM public key', async () => {
    const res = await request(buildApp())
      .post('/api/connections/request')
      .send({ requesterPnIdentifier: REQUESTER, recipientPnIdentifier: RECIPIENT })
      .expect(400);
    expect(res.body.error).toBe('requesterMlKemPublicKey is required');
  });

  it('rejects an ML-KEM public key that is too short to be genuine', async () => {
    const res = await request(buildApp())
      .post('/api/connections/request')
      .send({ ...validRequestBody(), requesterMlKemPublicKey: Buffer.alloc(64).toString('base64') })
      .expect(400);
    expect(res.body.error).toBe('requesterMlKemPublicKey is invalid');
  });

  it('rejects a self-connection', async () => {
    const res = await request(buildApp())
      .post('/api/connections/request')
      .send({ ...validRequestBody(), recipientPnIdentifier: REQUESTER })
      .expect(400);
    expect(res.body.error).toBe('Cannot connect to yourself');
  });

  it('returns cloud_on_device until the device submits its write', async () => {
    const res = await request(buildApp())
      .post('/api/connections/request')
      .send(validRequestBody())
      .expect(409);
    expect(res.body.error).toBe('cloud_on_device');
    expect(mockEnqueueSocialJob).not.toHaveBeenCalled();
  });

  it('hands the recipient half to the mailbox after the device write', async () => {
    const res = await request(buildApp())
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        deviceCloudResult: { spreadsheetId: 'sheet-1', connectionId: 'conn-1', provider: 'google' },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.connection).toEqual({
      connectionId: 'conn-1',
      userPnIdentifier: RECIPIENT,
      status: 'pending_sent',
      createdAt: expect.any(String),
    });
    expect(mockEnqueueSocialJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSocialJob.mock.calls[0][0]).toMatchObject({
      jobType: 'connection_request',
      peerPn: RECIPIENT,
      requestId: 'conn-1',
    });
  });

  it('forwards the client-sealed envelope and the context it was sealed under', async () => {
    await request(buildApp())
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        deviceCloudResult: { spreadsheetId: 'sheet-1', provider: 'google' },
        recipientEnvelope: { kemCiphertext: 'kem', ciphertext: 'ct' },
        envelopeContext: 'connect:a:b',
      })
      .expect(200);

    expect(mockEnqueueSocialJob.mock.calls[0][0]).toMatchObject({
      envelope: { kemCiphertext: 'kem', ciphertext: 'ct' },
      envelopeContext: 'connect:a:b',
    });
  });

  it('returns 409 when the peer mailbox cannot receive the job', async () => {
    mockEnqueueSocialJob.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/connections/request')
      .send({
        ...validRequestBody(),
        deviceCloudResult: { spreadsheetId: 'sheet-1', provider: 'google' },
      })
      .expect(409);

    expect(res.body).toMatchObject({
      success: false,
      delivered: false,
      error: 'peer_mailbox_unavailable',
    });
  });
});

describe('POST /api/connections/:connectionId/accept', () => {
  it('requires a userPnIdentifier', async () => {
    const res = await request(buildApp())
      .post('/api/connections/conn-1/accept')
      .send({})
      .expect(400);
    expect(res.body.error).toContain('userPnIdentifier');
  });

  it('requires an ML-KEM-768 key exchange payload', async () => {
    const res = await request(buildApp())
      .post('/api/connections/conn-1/accept')
      .send({ userPnIdentifier: RECIPIENT, kemCiphertext: 'ct', wrappedMessageRootKey: 'wk' })
      .expect(400);
    expect(res.body.error).toContain('ML-KEM-768');
  });

  it('rejects a non-post-quantum key exchange algorithm', async () => {
    const res = await request(buildApp())
      .post('/api/connections/conn-1/accept')
      .send({
        userPnIdentifier: RECIPIENT,
        kemCiphertext: 'ct',
        wrappedMessageRootKey: 'wk',
        kemAlgId: 'X25519',
      })
      .expect(400);
    expect(res.body.error).toContain('ML-KEM-768');
  });

  it('refuses accept until the device submits the connections sheet receipt', async () => {
    const res = await request(buildApp())
      .post('/api/connections/conn-1/accept')
      .send({
        userPnIdentifier: RECIPIENT,
        kemCiphertext: 'ct',
        wrappedMessageRootKey: 'wk',
        kemAlgId: 'ML-KEM-768',
      })
      .expect(409);
    expect(res.body.error).toBe('cloud_on_device');
  });
});

describe('POST /api/connections/apply-inbound connection_accept', () => {
  it('returns cloud_on_device until the device submits its write', async () => {
    const res = await request(buildApp())
      .post('/api/connections/apply-inbound')
      .send({
        userPnIdentifier: REQUESTER,
        jobType: 'connection_accept',
        peerPnIdentifier: RECIPIENT,
        kemCiphertext: 'ct',
      })
      .expect(409);
    expect(res.body.error).toBe('cloud_on_device');
  });

  it('records a client-submitted connection result', async () => {
    const res = await request(buildApp())
      .post('/api/connections/apply-inbound')
      .send({
        userPnIdentifier: REQUESTER,
        jobType: 'connection_accept',
        peerPnIdentifier: RECIPIENT,
        requestId: 'conn-legacy-1',
        deviceCloudResult: { spreadsheetId: 'sheet-from-device', provider: 'google' },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.spreadsheetId).toBe('sheet-from-device');
  });
});
