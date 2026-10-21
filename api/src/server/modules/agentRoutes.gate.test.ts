/**
 * @jest-environment node
 *
 * /api/agent/* fails closed: only pn-agent-mcp bearers whose owner still delegates the
 * scope get through, and responses carry only allowlisted public fields of the owner's
 * published rows.
 */

jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false,
}));

const validateAccessToken = jest.fn();
jest.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    validateAccessToken: (...args: unknown[]) => validateAccessToken(...args),
  },
}));

const resolveAgentDelegation = jest.fn();
jest.mock('./ownedAssetService', () => ({
  OwnedAssetService: {
    resolveAgentDelegation: (...args: unknown[]) => resolveAgentDelegation(...args),
  },
}));

const searchMetadata = jest.fn();
const getFileMetadata = jest.fn();
jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({ searchMetadata, getFileMetadata }),
  },
}));

import express from 'express';
import request from 'supertest';
import { registerAgentRoutes } from './agentRoutes';

const ROOT = 'pn-root';

function app() {
  const a = express();
  a.use(express.json());
  registerAgentRoutes(a);
  return a;
}

function agentToken(scope = ['openid', 'ai:files.published', 'ai:pen.published']) {
  validateAccessToken.mockReturnValue({ pnIdentifier: 'pn-agent1', clientId: 'pn-agent-mcp', scope });
}

function delegate(scopes = ['ai:files.published', 'ai:pen.published']) {
  resolveAgentDelegation.mockResolvedValue({ assetId: 'a1', rootPnIdentifier: ROOT, scopes });
}

const SENSITIVE = {
  publicToken: 'tok-secret',
  publicContentRef: { backend: 'google_drive', objectId: 'drive-obj', publicUrl: 'https://x' },
  creator: { '@type': 'Person', '@id': 'did:key:root' },
  author: { did: 'did:key:root' },
  backendFileId: 'drive-obj',
  email: 'owner@example.com',
};

function row(fileId: string, meta: Record<string, unknown>, pn = ROOT) {
  return { fileId, pnIdentifier: pn, submittedAt: '2026-01-01', metadata: { fileId, ...SENSITIVE, ...meta } };
}

beforeEach(() => {
  validateAccessToken.mockReset();
  resolveAgentDelegation.mockReset();
  searchMetadata.mockReset();
  getFileMetadata.mockReset();
});

describe('agent routes gate', () => {
  it('401 without a bearer', async () => {
    validateAccessToken.mockReturnValue(null);
    const res = await request(app()).get('/api/agent/files/search?q=x');
    expect(res.status).toBe(401);
  });

  it('403 for a first-party token', async () => {
    validateAccessToken.mockReturnValue({ pnIdentifier: ROOT, clientId: 'browser-app', scope: ['openid'] });
    const res = await request(app()).get('/api/agent/files/search').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('agent_client_required');
  });

  it('403 delegation_revoked when the owner revoked the agent', async () => {
    agentToken();
    resolveAgentDelegation.mockResolvedValue(null);
    const res = await request(app()).get('/api/agent/files/search').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('delegation_revoked');
    expect(searchMetadata).not.toHaveBeenCalled();
  });

  it('403 insufficient_scope when the token lacks the scope', async () => {
    agentToken(['openid', 'ai:files.published']);
    delegate();
    const res = await request(app()).get('/api/agent/pen/doc1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
  });

  it('403 insufficient_scope when the delegation no longer has the scope', async () => {
    agentToken();
    delegate(['ai:pen.published']);
    const res = await request(app()).get('/api/agent/files/f1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
  });

  it('503 fails closed when the delegation lookup errors', async () => {
    agentToken();
    resolveAgentDelegation.mockRejectedValue(new Error('db down'));
    const res = await request(app()).get('/api/agent/files/f1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(503);
  });
});

describe('agent routes data', () => {
  beforeEach(() => {
    agentToken();
    delegate();
  });

  it('search returns only the owner published rows, allowlisted', async () => {
    searchMetadata.mockResolvedValue({
      files: [
        row('f1', { isPublic: true, name: 'Trip notes', keywords: ['travel'], uploadDate: '2026-02-01' }),
        row('f2', { isPublic: false, publicToken: 'share', name: 'Private' }),
        row('f3', { name: 'Unset visibility' }),
        row('f4', { isPublic: true, name: 'Someone else' }, 'pn-other'),
      ],
      total: 4,
      hasMore: false,
    });
    const res = await request(app()).get('/api/agent/files/search?q=trip').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(searchMetadata).toHaveBeenCalledWith('trip', expect.objectContaining({ authorDid: ROOT }));
    expect(res.body.files.map((f: { fileId: string }) => f.fileId)).toEqual(['f1']);
    expect(Object.keys(res.body.files[0]).sort()).toEqual(
      ['contentClass', 'description', 'fileId', 'fileType', 'publishedAt', 'tags', 'title'].sort()
    );
    const raw = JSON.stringify(res.body);
    for (const leak of ['tok-secret', 'drive-obj', 'did:key', 'owner@example.com', ROOT]) {
      expect(raw).not.toContain(leak);
    }
  });

  it('read file 404s for a row the owner did not publish', async () => {
    getFileMetadata.mockResolvedValue(row('f2', { isPublic: false }));
    const res = await request(app()).get('/api/agent/files/f2').set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
  });

  it('read file 404s for another author', async () => {
    getFileMetadata.mockResolvedValue(row('f4', { isPublic: true }, 'pn-other'));
    const res = await request(app()).get('/api/agent/files/f4').set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
  });

  it('read file returns published text without sensitive fields', async () => {
    getFileMetadata.mockResolvedValue(
      row('f1', { isPublic: true, name: 'Thought', textPost: { content: 'hello world', style: { padding: 2 } } })
    );
    const res = await request(app()).get('/api/agent/files/f1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.file).toMatchObject({ fileId: 'f1', title: 'Thought', text: 'hello world', textTruncated: false });
    const raw = JSON.stringify(res.body);
    for (const leak of ['tok-secret', 'drive-obj', 'did:key', 'owner@example.com', 'padding']) {
      expect(raw).not.toContain(leak);
    }
  });

  it('pen returns the published post for the doc', async () => {
    searchMetadata.mockResolvedValue({
      files: [
        row('p0', { isPublic: false, penDocId: 'doc1' }),
        row('p1', { isPublic: true, penDocId: 'doc1', title: 'Essay', textPost: { content: 'body' } }),
      ],
      total: 2,
      hasMore: false,
    });
    const res = await request(app()).get('/api/agent/pen/doc1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ docId: 'doc1', fileId: 'p1', title: 'Essay', text: 'body' });
    expect(JSON.stringify(res.body)).not.toContain('tok-secret');
  });

  it('pen 404s when the doc is not published', async () => {
    searchMetadata.mockResolvedValue({ files: [row('p0', { isPublic: false, penDocId: 'doc1' })], total: 1, hasMore: false });
    const res = await request(app()).get('/api/agent/pen/doc1').set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
  });
});
