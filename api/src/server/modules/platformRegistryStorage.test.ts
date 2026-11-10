import { PlatformRegistryStorage } from './platformRegistryStorage';

const query = jest.fn();
const upsertIndexerFromOAuthClient = jest.fn();

jest.mock('../utils/database', () => ({ getDatabasePool: () => ({ query }) }));
jest.mock('./thirdPartyIndexersService', () => ({
  getThirdPartyIndexersService: () => ({ upsertIndexerFromOAuthClient }),
}));

describe('PlatformRegistryStorage (Postgres)', () => {
  beforeEach(() => {
    query.mockReset();
    upsertIndexerFromOAuthClient.mockReset();
  });

  it('stores an application and updates it in place', async () => {
    const app = {
      applicationId: 'a1',
      clientId: 'c1',
      name: 'App',
      redirectUris: [],
      scopes: [],
      ownerPnId: 'abc',
      status: 'pending' as const,
      submittedAt: '2026-01-01T00:00:00Z',
    };
    query.mockResolvedValue({ rows: [] });
    await PlatformRegistryStorage.appendApplication(app);
    expect(query.mock.calls[0][1].slice(0, 4)).toEqual(['a1', 'c1', 'pn-abc', 'pending']);

    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ application: app }] }).mockResolvedValueOnce({ rows: [] });
    await PlatformRegistryStorage.updateApplication('a1', { status: 'approved' });
    expect(JSON.parse(query.mock.calls[1][1][4])).toMatchObject({ applicationId: 'a1', status: 'approved' });
  });

  it('reads registry OAuth clients with their suspended/revoked status', async () => {
    query.mockResolvedValue({
      rows: [
        { client_id: 'c1', name: 'One', redirect_uris: ['https://x'], scopes: ['s'], is_active: false, registry_status: 'revoked', verified: true, updated_at: new Date('2026-01-02T00:00:00Z') },
        { client_id: 'c2', name: 'Two', redirect_uris: [], scopes: [], is_active: true, registry_status: null, verified: false, updated_at: new Date('2026-01-02T00:00:00Z') },
      ],
    });
    const clients = await PlatformRegistryStorage.listOAuthClients();
    expect(clients.map((c) => [c.clientId, c.status, c.verified])).toEqual([
      ['c1', 'revoked', true],
      ['c2', 'active', false],
    ]);
  });

  it('activating a third-party client also registers it as an indexer', async () => {
    query.mockResolvedValue({ rows: [] });
    await PlatformRegistryStorage.upsertOAuthClient({
      clientId: 'acme-app',
      name: 'Acme',
      redirectUris: [],
      scopes: [],
      ownerPnId: 'pn-o',
      status: 'active',
      verified: false,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(upsertIndexerFromOAuthClient).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'acme-app', status: 'active' }));
  });
});
