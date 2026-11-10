/**
 * @jest-environment node
 *
 * Route-level behaviour for user-scoped endpoints. Grants and released proofs are
 * Postgres rows behind ThirdPartyPermissionsService, mocked here; the routes never
 * reach the user's cloud.
 */
jest.mock('../middleware/authMiddleware', () => ({
  getBearerTokenPayload: jest.fn(),
}));

/** Bearer identity under test — swapped to prove pn_mismatch / unauthorized. */
let currentBearer: string | null = 'pn-test';

jest.mock('./deviceCapabilityService', () => {
  const DEVICE_CAPABILITIES = {
    profileRead: 'profile.read',
    profileWrite: 'profile.write',
  };
  const gate = jest.fn(async (_req: unknown, res: any, _cap: string, targetPn?: string) => {
    if (!currentBearer) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    if (targetPn !== undefined && currentBearer !== targetPn) {
      res.status(403).json({ error: 'forbidden', reason: 'pn_mismatch' });
      return null;
    }
    return { pnIdentifier: currentBearer };
  });
  return {
    DEVICE_CAPABILITIES,
    gateOwnerSelfRoute: gate,
    gateOwnerRoute: gate,
  };
});

jest.mock('./thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermissions: jest.fn(),
    storePermission: jest.fn(),
    releaseProofs: jest.fn(),
    getReleasedProofs: jest.fn(),
  },
}));

jest.mock('./zkpDataPointsService', () => ({
  ZKPDataPointsService: { verifyProof: jest.fn() },
}));

jest.mock('./storageTierService', () => ({
  getStorageTier: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { setupUserRoutes } from './userRoutes';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { ThirdPartyPermissionsService } from './thirdPartyPermissionsService';
import { ZKPDataPointsService } from './zkpDataPointsService';
import { getStorageTier } from './storageTierService';

const mockBearerPayload = getBearerTokenPayload as jest.Mock;
const mockGetPermissions = ThirdPartyPermissionsService.getPermissions as jest.Mock;
const mockStorePermission = ThirdPartyPermissionsService.storePermission as jest.Mock;
const mockReleaseProofs = ThirdPartyPermissionsService.releaseProofs as jest.Mock;
const mockGetReleasedProofs = ThirdPartyPermissionsService.getReleasedProofs as jest.Mock;
const mockVerifyProof = ZKPDataPointsService.verifyProof as jest.Mock;
const mockGetStorageTier = getStorageTier as jest.Mock;

const PN = 'pn-test';
const AUTH = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  setupUserRoutes(app);
  return app;
}

describe('setupUserRoutes', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    currentBearer = PN;
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => {
      throw new Error('fetch should not be called');
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/users/:pnIdentifier/third-party-permissions', () => {
    it('rejects requests without an owner bearer', async () => {
      currentBearer = null;
      await request(buildApp()).get(`/api/users/${PN}/third-party-permissions`).expect(401);
      expect(mockGetPermissions).not.toHaveBeenCalled();
    });

    it('returns stored grants for a bare identifier, normalized', async () => {
      mockGetPermissions.mockResolvedValue({ 'browser-app': { dataPoints: ['age_attestation'] } });

      const res = await request(buildApp())
        .get('/api/users/test/third-party-permissions')
        .set('Authorization', AUTH)
        .expect(200);

      expect(res.body.permissions['browser-app'].dataPoints).toEqual(['age_attestation']);
      expect(mockGetPermissions).toHaveBeenCalledWith(PN);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/users/:pnIdentifier/third-party-permissions', () => {
    it('requires toolId and permission', async () => {
      const res = await request(buildApp())
        .put(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .send({ toolId: 'browser-app' })
        .expect(400);
      expect(res.body.error).toBe('toolId and permission are required');
    });

    it('rejects an unknown status', async () => {
      await request(buildApp())
        .put(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .send({ toolId: 'some-tool', permission: { status: 'granted' } })
        .expect(400);
      expect(mockStorePermission).not.toHaveBeenCalled();
    });

    it('rejects writing another identity grant', async () => {
      currentBearer = 'pn-attacker';
      await request(buildApp())
        .put(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .send({ toolId: 'some-tool', permission: { status: 'active' } })
        .expect(403);
      expect(mockStorePermission).not.toHaveBeenCalled();
    });

    it('forces browser-app required/optional data points to the static contract', async () => {
      await request(buildApp())
        .put(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .send({
          toolId: 'browser-app',
          permission: {
            status: 'active',
            dataPoints: ['over_21'],
            requiredDataPoints: ['email_verification'],
            optionalDataPoints: ['phone_verification'],
          },
        })
        .expect(200);

      const [pn, stored] = mockStorePermission.mock.calls[0];
      expect(pn).toBe(PN);
      expect(stored.toolId).toBe('browser-app');
      expect(stored.requiredDataPoints).toEqual([]);
      expect(stored.optionalDataPoints).toEqual(['over_21']);
      expect(stored.dataPointLevels).toEqual({ over_21: 'verified' });
      expect(stored.dataPoints).toEqual(['over_21']);
    });
  });

  describe('PUT /api/users/:pnIdentifier/released-proofs', () => {
    it('stores what the device released', async () => {
      mockReleaseProofs.mockResolvedValue(1);
      const proofs = [{ dataPointId: 'over_21', zkpProof: 'p', verifiedAt: 'x', verificationLevel: 'verified' }];

      const res = await request(buildApp())
        .put(`/api/users/${PN}/released-proofs`)
        .set('Authorization', AUTH)
        .send({ proofs })
        .expect(200);

      expect(res.body).toEqual({ success: true, released: 1 });
      expect(mockReleaseProofs).toHaveBeenCalledWith(PN, proofs);
    });

    it('rejects a non-array body', async () => {
      await request(buildApp())
        .put(`/api/users/${PN}/released-proofs`)
        .set('Authorization', AUTH)
        .send({ proofs: 'nope' })
        .expect(400);
      expect(mockReleaseProofs).not.toHaveBeenCalled();
    });

    it('rejects releasing for another identity', async () => {
      currentBearer = 'pn-attacker';
      await request(buildApp())
        .put(`/api/users/${PN}/released-proofs`)
        .set('Authorization', AUTH)
        .send({ proofs: [] })
        .expect(403);
      expect(mockReleaseProofs).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/users/:pnIdentifier/zkp-data-points/verify', () => {
    it('verifies a proof the caller supplies', async () => {
      mockVerifyProof.mockResolvedValue({ isValid: true });
      const res = await request(buildApp())
        .post(`/api/users/${PN}/zkp-data-points/verify`)
        .send({ zkpProof: 'proof-body', condition: 'age >= 21' })
        .expect(200);
      expect(res.body.verification).toEqual({ isValid: true });
      expect(mockVerifyProof).toHaveBeenCalledWith('proof-body', 'age >= 21');
      expect(mockGetReleasedProofs).not.toHaveBeenCalled();
    });

    it('falls back to a released proof by data point id', async () => {
      mockGetReleasedProofs.mockResolvedValue([{ dataPointId: 'over_21', zkpProof: 'released' }]);
      mockVerifyProof.mockResolvedValue({ isValid: true });
      await request(buildApp())
        .post(`/api/users/${PN}/zkp-data-points/verify`)
        .send({ dataPointId: 'over_21', condition: 'age >= 21' })
        .expect(200);
      expect(mockVerifyProof).toHaveBeenCalledWith('released', 'age >= 21');
    });

    it('404s when no proof is available', async () => {
      mockGetReleasedProofs.mockResolvedValue([]);
      await request(buildApp())
        .post(`/api/users/${PN}/zkp-data-points/verify`)
        .send({ dataPointId: 'over_21', condition: 'age >= 21' })
        .expect(404);
      expect(mockVerifyProof).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/users/:userPnIdentifier/storage-tier', () => {
    it('rejects an unauthenticated request', async () => {
      mockBearerPayload.mockReturnValue(null);
      const res = await request(buildApp()).get(`/api/users/${PN}/storage-tier`).expect(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('rejects reading another identity tier', async () => {
      mockBearerPayload.mockReturnValue({ pnIdentifier: PN, did: 'did:key:test' });
      const res = await request(buildApp()).get('/api/users/pn-someone-else/storage-tier').expect(403);
      expect(res.body.error).toBe('Can only request your own storage tier');
      expect(mockGetStorageTier).not.toHaveBeenCalled();
    });

    it('resolves "me" to the bearer identity', async () => {
      mockBearerPayload.mockReturnValue({ pnIdentifier: PN, did: 'did:key:test' });
      mockGetStorageTier.mockResolvedValue({ tier: 'free', encryptionLimit: 10 });

      const res = await request(buildApp()).get('/api/users/me/storage-tier').expect(200);
      expect(res.body).toEqual({ tier: 'free', encryptionLimit: 10 });
      expect(mockGetStorageTier).toHaveBeenCalledWith(PN, 'did:key:test');
    });
  });

  describe('removed cloud proxies', () => {
    it.each([
      ['get', '/preferences'],
      ['put', '/preferences'],
      ['get', '/tag-preferences'],
      ['get', '/zkp-data-points'],
    ])('%s %s is not served by the API', async (method, path) => {
      const agent = request(buildApp()) as any;
      await agent[method](`/api/users/${PN}${path}`).set('Authorization', AUTH).expect(404);
    });
  });
});
