import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import type { PenAgentDraftSubmission } from '@par-noir/pen-protocol';
import { ERROR_MESSAGES, McpToolError } from '../errors';
import { createLogger } from '../log';
import { createPnMcpServer } from '../server';
import type { PnMcpMode, PnMcpSource } from '../source';
import { LEAKY, SECRETS, assertNoSecrets } from './helpers';

const owner = ml_kem768.keygen();
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

const EVERY_SCOPE = [
  'openid',
  'ai:files.published',
  'ai:pen.published',
  'ai:proofs',
  'ai:pen.drafts',
  'ai:files.private',
  'ai:pen.private',
];
const PUBLIC_TOOLS = ['fetch', 'propose_pen_draft', 'prove_data_point', 'read_file', 'read_pen_document', 'search', 'search_my_files'];
const PRIVATE_TOOLS = ['read_private_file', 'read_private_pen_document', 'search_private_files'];

const FILE = {
  fileId: 'file-1',
  title: 'Spring notes',
  description: 'Published essay',
  fileType: 'text',
  contentClass: 'text_post',
  tags: ['garden'],
  publishedAt: '2026-04-01T00:00:00.000Z',
};

/** An in-process source, as the API's /mcp supplies; it hands back raw rows with extra fields. */
function memorySource(scopes: string[], overrides: Partial<PnMcpSource> = {}) {
  const privateCalls: string[] = [];
  const drafts: PenAgentDraftSubmission[] = [];
  const source: PnMcpSource = {
    grantedScopes: async () => scopes,
    requireAnyScope: async (needed) => {
      if (!needed.some((s) => scopes.includes(s))) throw new McpToolError('insufficient_scope');
    },
    searchFiles: async () => [{ ...FILE, ...LEAKY }, { ...LEAKY }],
    readFile: async (fileId) => {
      if (fileId !== 'file-1') throw new McpToolError('not_found');
      return { ...FILE, ...LEAKY, text: 'Hello garden', textTruncated: false };
    },
    readPen: async () => ({}),
    prove: async (dataPointId) => ({ dataPointId, satisfied: true, level: 'attested', expiresAt: null, value: SECRETS.birthdate }),
    ownerMlKemPublicKey: async () => b64(owner.publicKey),
    proposeDraft: async (submission) => {
      drafts.push(submission);
      return { draftId: submission.draftId, status: 'awaiting_owner' };
    },
    private: {
      available: () => true,
      searchPrivate: async () => (privateCalls.push('search'), { files: [], penDocuments: [] }),
      readPrivateFile: async () => (privateCalls.push('file'), {}),
      readPrivatePen: async () => (privateCalls.push('pen'), {}),
    },
    ...overrides,
  };
  return { source, privateCalls, drafts };
}

async function connect(source: PnMcpSource, mode: PnMcpMode) {
  const logs: string[] = [];
  const server = await createPnMcpServer({ source, mode, logger: createLogger((line) => logs.push(line)) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);
  return { mcp, logs, close: () => mcp.close() };
}

const text = (res: { content?: unknown }) => (res.content as Array<{ text: string }>)[0]?.text;

describe('mode-based tool lists', () => {
  it('remote never lists a private tool, even with private scopes and a private source', async () => {
    const { source, privateCalls } = memorySource(EVERY_SCOPE);
    const { mcp, close } = await connect(source, 'remote');
    const names = (await mcp.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(PUBLIC_TOOLS);
    const res = await mcp.callTool({ name: 'read_private_file', arguments: { fileId: 'f1' } });
    expect(res.isError).toBe(true);
    expect(privateCalls).toEqual([]);
    await close();
  });

  it('local lists the private tools when the private source is available', async () => {
    const { source } = memorySource(EVERY_SCOPE);
    const { mcp, close } = await connect(source, 'local');
    const names = (await mcp.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...PUBLIC_TOOLS, ...PRIVATE_TOOLS].sort());
    await close();
  });

  it('local without a running private source lists only the public tools', async () => {
    const { source } = memorySource(EVERY_SCOPE);
    const { mcp, close } = await connect({ ...source, private: { ...source.private!, available: () => false } }, 'local');
    expect((await mcp.listTools()).tools.map((t) => t.name).sort()).toEqual(PUBLIC_TOOLS);
    await close();
  });

  it('remote failures tell the owner to reconnect in the app, not to run pn-mcp', async () => {
    const { source } = memorySource(EVERY_SCOPE, {
      readFile: async () => {
        throw new McpToolError('access_revoked');
      },
    });
    const { mcp, close } = await connect(source, 'remote');
    const res = await mcp.callTool({ name: 'read_file', arguments: { fileId: 'file-1' } });
    expect(text(res)).toBe('Access revoked or expired. Reconnect par Noir in this app.');
    expect(text(res)).not.toMatch(/pn-mcp/);
    await close();
  });

  it('remote drafts reach the source sealed, never as a plaintext build', async () => {
    const { source, drafts } = memorySource(EVERY_SCOPE);
    const { mcp, logs, close } = await connect(source, 'remote');
    const res = await mcp.callTool({
      name: 'propose_pen_draft',
      arguments: {
        draftId: 'draft_0001',
        build: { templateId: 'note.hot_take.v1', title: 'Plaintext title marker', sections: [{ slug: 'body', plainText: 'Plaintext body' }] },
      },
    });
    expect(res.structuredContent).toEqual({ draftId: 'draft_0001', status: 'awaiting_owner' });
    expect(drafts).toHaveLength(1);
    expect(Object.keys(drafts[0]).sort()).toEqual(['draftId', 'envelope']);
    expect(JSON.stringify(drafts[0])).not.toContain('Plaintext');
    expect(logs.join('\n')).not.toContain('Plaintext');
    await close();
  });
});

describe('search and fetch aliases', () => {
  it('search returns only id, title and the public resource URL', async () => {
    const { source } = memorySource(['ai:files.published']);
    const { mcp, logs, close } = await connect(source, 'remote');
    const res = await mcp.callTool({ name: 'search', arguments: { query: 'garden' } });
    expect(res.isError).toBeFalsy();
    const expected = { results: [{ id: 'file-1', title: 'Spring notes', url: 'https://parnoir.com/resource/file-1' }] };
    expect(res.structuredContent).toEqual(expected);
    expect(JSON.parse(text(res))).toEqual(expected);
    assertNoSecrets(res, logs);
    await close();
  });

  it('fetch returns the file text and allowlisted metadata only', async () => {
    const { source } = memorySource(['ai:files.published']);
    const { mcp, logs, close } = await connect(source, 'remote');
    const res = await mcp.callTool({ name: 'fetch', arguments: { id: 'file-1' } });
    expect(res.structuredContent).toEqual({
      id: 'file-1',
      title: 'Spring notes',
      text: 'Hello garden',
      url: 'https://parnoir.com/resource/file-1',
      metadata: {
        description: 'Published essay',
        fileType: 'text',
        contentClass: 'text_post',
        tags: ['garden'],
        publishedAt: '2026-04-01T00:00:00.000Z',
        textTruncated: false,
      },
    });
    assertNoSecrets(res, logs);
    const missing = await mcp.callTool({ name: 'fetch', arguments: { id: 'nope' } });
    expect(text(missing)).toBe(ERROR_MESSAGES.not_found);
    await close();
  });

  it('are listed only with ai:files.published', async () => {
    const { source } = memorySource(['openid', 'ai:proofs']);
    const { mcp, close } = await connect(source, 'remote');
    expect((await mcp.listTools()).tools.map((t) => t.name)).toEqual(['prove_data_point']);
    await close();
  });
});
