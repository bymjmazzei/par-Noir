import { IntegratorStorageClient } from '../src/IntegratorStorageClient';
import { IntegratorZkpClient } from '../src/IntegratorZkpClient';
import { IdentitySuccessionClient } from '../src/IdentitySuccessionClient';
import { PublicIndexClient } from '../src/PublicIndexClient';
import { PnApiError } from '../src/integrator/pnApiClient';

describe('IntegratorStorageClient', () => {
  const token = 'test-token';
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('getStorageRoot returns folder ids', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        integratorFolderId: 'f1',
        integratorPath: 'integrators/my-app',
        clientId: 'my-app'
      })
    });
    const client = new IntegratorStorageClient({ apiEndpoint: 'https://api.test' });
    const root = await client.getStorageRoot(token);
    expect(root.integratorFolderId).toBe('f1');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/integrator/storage-root');
  });

  it('listFiles returns files array', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ id: 'a', name: 'doc.txt' }] })
    });
    const client = new IntegratorStorageClient({ apiEndpoint: 'https://api.test' });
    const { files } = await client.listFiles(token, { pageSize: 10 });
    expect(files).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toContain('pageSize=10');
  });

  it('uploadFile posts base64 payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ file: { id: 'new' } })
    });
    const client = new IntegratorStorageClient({ apiEndpoint: 'https://api.test' });
    await client.uploadFile(token, {
      fileDataBase64: 'YWJj',
      fileName: 'test.bin'
    });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).fileName).toBe('test.bin');
  });

  it('throws PnApiError on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ error: 'insufficient_scope', error_description: 'Need cloud:app' })
    });
    const client = new IntegratorStorageClient({ apiEndpoint: 'https://api.test' });
    await expect(client.getStorageRoot(token)).rejects.toThrow(PnApiError);
  });
});

describe('IntegratorZkpClient', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        dataPoints: [{ dataPointId: 'age_attestation', zkpProof: 'proof' }]
      })
    });
  });

  it('getDataPoints passes data_points query', async () => {
    const client = new IntegratorZkpClient({ apiEndpoint: 'https://api.test' });
    const res = await client.getDataPoints('tok', { dataPoints: ['age_attestation'] });
    expect(res.dataPoints).toHaveLength(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('data_points=age_attestation');
  });
});

describe('IdentitySuccessionClient', () => {
  it('getSuccessor fetches public info', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ revoked: false })
    });
    const client = new IdentitySuccessionClient({ apiEndpoint: 'https://api.test' });
    const info = await client.getSuccessor('pn-abc');
    expect(info.revoked).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('pn_identifier=pn-abc');
  });
});

describe('PublicIndexClient', () => {
  it('getPublicIndex sends API key header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ identityId: 'pn-x', files: [], total: 0, updatedAt: '2020' })
    });
    const client = new PublicIndexClient({ apiEndpoint: 'https://api.test' });
    await client.getPublicIndex('pn-x', 'key-123');
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers['X-Api-Key']).toBe('key-123');
  });
});
