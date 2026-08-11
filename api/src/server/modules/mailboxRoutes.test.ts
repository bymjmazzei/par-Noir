/**
 * @jest-environment node
 *
 * A route key is handed to every peer you connect with, so possession proves
 * nothing about ownership. These tests exist to prove the ownership gate
 * actually rejects a peer, not just that the happy path still works.
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
}));

const mockQuery = jest.fn();
jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({ query: mockQuery }),
}));

/** Bearer identity under test, swapped per case. */
let currentBearer: string | null = 'pn-bob';
/** Capabilities the device holds. */
let grantedCapabilities: string[] = ['messages.read', 'messages.send', 'social.read', 'social.write'];

jest.mock('./deviceCapabilityService', () => {
  const DEVICE_CAPABILITIES = {
    messagesRead: 'messages.read',
    messagesSend: 'messages.send',
    socialRead: 'social.read',
    socialWrite: 'social.write',
  };
  return {
    DEVICE_CAPABILITIES,
    normalizePnIdentifier: (pn: string) => pn,
    getBearerPnIdentifier: () => currentBearer,
    assertDeviceCapability: async (_req: unknown, cap: string) =>
      grantedCapabilities.includes(cap)
        ? { ok: true, ctx: {} }
        : { ok: false, status: 403, error: 'capability_not_allowed' },
    gateOwnerRoute: async (_req: unknown, res: any, cap: string, targetPn: string) => {
      if (!currentBearer) {
        res.status(401).json({ error: 'unauthorized' });
        return null;
      }
      if (currentBearer !== targetPn) {
        res.status(403).json({ error: 'forbidden', reason: 'pn_mismatch' });
        return null;
      }
      if (!grantedCapabilities.includes(cap)) {
        res.status(403).json({ error: 'capability_not_allowed' });
        return null;
      }
      return {};
    },
  };
});

jest.mock('../middleware/authMiddleware', () => ({
  getBearerTokenPayload: () => (currentBearer ? { pnIdentifier: currentBearer } : null),
}));

import express from 'express';
import request from 'supertest';
import { registerMailboxRoutes } from './mailboxRoutes';
import { mailboxOwnerHash } from './socialMailboxService';

const BOB = 'pn-bob';
const ALICE = 'pn-alice';
/** Bob minted this and handed it to Alice when they connected. */
const BOB_MINTED_ROUTE = 'b'.repeat(64);

function buildApp() {
  const app = express();
  app.use(express.json());
  registerMailboxRoutes(app, 'test');
  return app;
}

/**
 * One pending job on Bob's minted route, which Bob has claimed.
 */
function dbWithBobsClaimedRoute() {
  mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('SELECT route_key FROM mailbox_route_binding')) {
      const ownerHash = String(params[0]);
      if (ownerHash === mailboxOwnerHash(BOB)) {
        return { rows: [{ route_key: BOB_MINTED_ROUTE }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('SELECT owner_hash FROM mailbox_route_binding') || sql.includes('FROM mailbox_route_binding')) {
      const key = String(params[0]);
      return key === BOB_MINTED_ROUTE
        ? { rows: [{ owner_hash: mailboxOwnerHash(BOB) }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes('FROM social_mailbox')) {
      return {
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            route_key: BOB_MINTED_ROUTE,
            job_type: 'connection_request',
            payload: { requestId: 'conn-1' },
            created_at: new Date(),
            expires_at: new Date(Date.now() + 86400000),
            acked_at: null,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes('UPDATE social_mailbox')) {
      return { rows: [{ id: '11111111-1111-1111-1111-111111111111' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  currentBearer = BOB;
  grantedCapabilities = ['messages.read', 'messages.send', 'social.read', 'social.write'];
});

describe('GET /api/mailbox/pending — route ownership', () => {
  it('serves Bob the jobs on the route he claimed', async () => {
    dbWithBobsClaimedRoute();

    const res = await request(buildApp())
      .get(`/api/mailbox/pending?pnIdentifier=${BOB}&routeKey=${BOB_MINTED_ROUTE}`)
      .expect(200);

    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].jobType).toBe('connection_request');
  });

  it('THE GUARD: refuses Alice the route Bob claimed, even though she holds the key', async () => {
    dbWithBobsClaimedRoute();
    currentBearer = ALICE;

    const res = await request(buildApp())
      .get(`/api/mailbox/pending?pnIdentifier=${ALICE}&routeKey=${BOB_MINTED_ROUTE}`)
      .expect(403);

    expect(res.body.reason).toBe('route_not_owned');
  });

  it('refuses an unclaimed route: possession is not ownership', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(buildApp())
      .get(`/api/mailbox/pending?pnIdentifier=${BOB}&routeKey=${'c'.repeat(64)}`)
      .expect(403);

    expect(res.body.reason).toBe('route_not_owned');
  });

  it('refuses pending without an opaque routeKey (no legacy pn derive)', async () => {
    await request(buildApp())
      .get(`/api/mailbox/pending?pnIdentifier=${BOB}`)
      .expect(400);
  });
});

describe('POST /api/mailbox/ack — route ownership', () => {
  it('THE GUARD: Alice cannot ack jobs off Bob\'s route', async () => {
    dbWithBobsClaimedRoute();
    currentBearer = ALICE;

    const res = await request(buildApp())
      .post('/api/mailbox/ack')
      .send({
        pnIdentifier: ALICE,
        routeKey: BOB_MINTED_ROUTE,
        jobIds: ['11111111-1111-1111-1111-111111111111'],
      })
      .expect(403);

    expect(res.body.reason).toBe('route_not_owned');
  });
});

describe('capability separation', () => {
  it('a device with only messaging cannot enqueue a connection request', async () => {
    grantedCapabilities = ['messages.read', 'messages.send'];

    await request(buildApp())
      .post('/api/mailbox/enqueue')
      .send({
        pnIdentifier: BOB,
        routeKey: 'a'.repeat(64),
        jobType: 'connection_request',
        payload: { requestId: 'conn-1' },
      })
      .expect(403);
  });

  it('a device denied messaging can still receive social jobs', async () => {
    grantedCapabilities = ['social.read'];
    dbWithBobsClaimedRoute();

    const res = await request(buildApp())
      .get(`/api/mailbox/pending?pnIdentifier=${BOB}&routeKey=${BOB_MINTED_ROUTE}`)
      .expect(200);

    expect(res.body.jobs).toHaveLength(1);
  });

  it('a device with no mailbox capability at all is refused, not given an empty list', async () => {
    grantedCapabilities = [];

    const res = await request(buildApp())
      .get(`/api/mailbox/pending?pnIdentifier=${BOB}&routeKey=${BOB_MINTED_ROUTE}`)
      .expect(403);

    expect(res.body.reason).toBe('no_mailbox_read');
  });

  it('unkeyed-equivalent (no messages/social read) cannot drain via pending or ack', async () => {
    grantedCapabilities = [];
    dbWithBobsClaimedRoute();

    const pending = await request(buildApp())
      .get(`/api/mailbox/pending?pnIdentifier=${BOB}&routeKey=${BOB_MINTED_ROUTE}`)
      .expect(403);
    expect(pending.body.reason).toBe('no_mailbox_read');

    const ack = await request(buildApp())
      .post('/api/mailbox/ack')
      .send({
        pnIdentifier: BOB,
        routeKey: BOB_MINTED_ROUTE,
        jobIds: ['11111111-1111-1111-1111-111111111111'],
      })
      .expect(403);
    expect(ack.body.reason).toBe('no_mailbox_read');
  });
});

describe('POST /api/mailbox/route — claiming and convergence', () => {
  it('first claim wins and returns routeKey', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT route_key FROM mailbox_route_binding WHERE owner_hash')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO mailbox_route_binding')) {
        return { rows: [{ route_key: BOB_MINTED_ROUTE }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await request(buildApp())
      .post('/api/mailbox/route')
      .send({ pnIdentifier: BOB, routeKey: BOB_MINTED_ROUTE })
      .expect(200);

    expect(res.body.routeKey).toBe(BOB_MINTED_ROUTE);
    expect(res.body.adopted).toBe(false);
  });

  it('second mint for the same owner adopts the existing route', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT route_key FROM mailbox_route_binding WHERE owner_hash')) {
        return { rows: [{ route_key: BOB_MINTED_ROUTE }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await request(buildApp())
      .post('/api/mailbox/route')
      .send({ pnIdentifier: BOB, routeKey: 'd'.repeat(64) })
      .expect(200);

    expect(res.body.routeKey).toBe(BOB_MINTED_ROUTE);
    expect(res.body.adopted).toBe(true);
  });

  it('a route already bound to someone else is refused', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT route_key FROM mailbox_route_binding WHERE owner_hash')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO mailbox_route_binding')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT owner_hash FROM mailbox_route_binding')) {
        return { rows: [{ owner_hash: mailboxOwnerHash(ALICE) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await request(buildApp())
      .post('/api/mailbox/route')
      .send({ pnIdentifier: BOB, routeKey: BOB_MINTED_ROUTE })
      .expect(409);

    expect(res.body.error).toBe('route_already_claimed');
  });

  it('GET returns the claimed route for the owner', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT route_key FROM mailbox_route_binding WHERE owner_hash')) {
        return { rows: [{ route_key: BOB_MINTED_ROUTE }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await request(buildApp())
      .get(`/api/mailbox/route?pnIdentifier=${BOB}`)
      .expect(200);

    expect(res.body.routeKey).toBe(BOB_MINTED_ROUTE);
  });

  it('GET 404 when no route claimed', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await request(buildApp())
      .get(`/api/mailbox/route?pnIdentifier=${BOB}`)
      .expect(404);
  });
});

describe('enqueue requires opaque routeKey', () => {
  it('refuses recipientIdentityId-only addressing', async () => {
    await request(buildApp())
      .post('/api/mailbox/enqueue')
      .send({
        pnIdentifier: BOB,
        recipientIdentityId: ALICE,
        jobType: 'message_append',
        payload: { messageId: 'm1' },
      })
      .expect(400);
  });
});
