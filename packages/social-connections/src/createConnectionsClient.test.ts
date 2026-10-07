import { describe, expect, it, vi } from 'vitest';
import { createConnectionsClient } from './createConnectionsClient.js';

describe('createConnectionsClient', () => {
  it('returns accepted connections only', async () => {
    const list = vi.fn().mockResolvedValue([
      {
        connectionId: 'c1',
        userPnIdentifier: 'pn-peer',
        status: 'accepted',
        createdAt: '2020-01-01'
      },
      {
        connectionId: 'c2',
        userPnIdentifier: 'pn-other',
        status: 'pending_sent',
        createdAt: '2020-01-02'
      }
    ]);
    const client = createConnectionsClient({
      waitForCloud: async () => true,
      listConnectionRows: list
    });
    const rows = await client.getConnections('pn-me');
    expect(rows).toHaveLength(1);
    expect(rows[0].connectionId).toBe('c1');
  });

  it('resolves connected status from cache', async () => {
    const client = createConnectionsClient({
      waitForCloud: async () => true,
      listConnectionRows: async () => [
        {
          connectionId: 'c1',
          userPnIdentifier: 'peer',
          status: 'accepted',
          createdAt: '2020-01-01'
        }
      ]
    });
    const status = await client.resolveConnectionStatusFromCache('pn-me', 'pn-peer');
    expect(status.status).toBe('connected');
  });
});
