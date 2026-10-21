import { describe, expect, it } from 'vitest';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { openSocialEnvelope } from '@par-noir/dm-crypto';
import { penAgentDraftContextId } from '@par-noir/pen-protocol';
import { MemoryTokenStore } from '../tokenStore';
import { ALL_SCOPES, SECRETS, assertNoSecrets, connect, fakeFetch, json, tokens } from './helpers';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const owner = ml_kem768.keygen();
const DRAFT_SCOPES = [...ALL_SCOPES, 'ai:pen.drafts'];

const BUILD = {
  templateId: 'note.hot_take.v1',
  title: 'Plaintext title marker',
  sections: [{ slug: 'body', plainText: 'Plaintext body marker about the garden.' }],
};

function draftApi(draftStatus: (n: number) => Response = (n) =>
  json(n === 1 ? 201 : 200, { draftId: 'draft_0001', status: 'awaiting_owner' })
) {
  const posted: Array<Record<string, unknown>> = [];
  const api = fakeFetch((url, init) => {
    if (url.pathname === '/api/agent/owner-key') return json(200, { mlKemPublicKey: b64(owner.publicKey) });
    if (url.pathname === '/api/agent/pen/drafts' && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)));
      return draftStatus(posted.length);
    }
    return json(404, { error: 'not_found' });
  });
  return { ...api, posted };
}

async function session(fetch: ReturnType<typeof fakeFetch>['fetch'], scopes = DRAFT_SCOPES) {
  return connect({ store: new MemoryTokenStore(tokens({ scopes })), fetch });
}

describe('propose_pen_draft', () => {
  it('is listed with the scope, as a non-destructive idempotent write', async () => {
    const { mcp, close } = await session(draftApi().fetch);
    const { tools } = await mcp.listTools();
    const tool = tools.find((t) => t.name === 'propose_pen_draft');
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
    expect(tool?.inputSchema.required?.sort()).toEqual(['build', 'draftId']);
    expect(Object.keys(tool?.outputSchema?.properties ?? {}).sort()).toEqual(['draftId', 'status']);
    await close();
  });

  it('is not listed without ai:pen.drafts', async () => {
    const { mcp, close } = await session(draftApi().fetch, ALL_SCOPES);
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name)).not.toContain('propose_pen_draft');
    await close();
  });

  it('seals the draft before sending: the request body holds no plaintext build', async () => {
    const api = draftApi();
    const { mcp, logs, close } = await session(api.fetch);
    const res = await mcp.callTool({
      name: 'propose_pen_draft',
      arguments: { draftId: 'draft_0001', build: { ...BUILD, ownerPn: SECRETS.pnIdentifier } },
    });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({ draftId: 'draft_0001', status: 'awaiting_owner' });

    expect(api.calls.map((c) => c.url.pathname)).toEqual(['/api/agent/owner-key', '/api/agent/pen/drafts']);
    expect(api.posted).toHaveLength(1);
    const body = api.posted[0];
    expect(Object.keys(body).sort()).toEqual(['draftId', 'envelope']);
    expect(Object.keys(body.envelope as object).sort()).toEqual(['ciphertext', 'kemCiphertext']);
    const wire = JSON.stringify(body);
    for (const plain of ['Plaintext title marker', 'Plaintext body marker', 'note.hot_take.v1']) {
      expect(wire).not.toContain(plain);
    }

    const opened = await openSocialEnvelope(
      body.envelope as { kemCiphertext: string; ciphertext: string },
      b64(owner.secretKey),
      penAgentDraftContextId('draft_0001')
    );
    expect(opened).toEqual(BUILD);
    await expect(
      openSocialEnvelope(
        body.envelope as { kemCiphertext: string; ciphertext: string },
        b64(owner.secretKey),
        penAgentDraftContextId('draft_9999')
      )
    ).rejects.toThrow();

    assertNoSecrets(res, logs, wire);
    expect(logs.join('\n')).not.toContain('Plaintext');
    await close();
  });

  it('is idempotent through the client draftId', async () => {
    const api = draftApi();
    const { mcp, close } = await session(api.fetch);
    const args = { name: 'propose_pen_draft', arguments: { draftId: 'draft_0001', build: BUILD } };
    const first = await mcp.callTool(args);
    const retry = await mcp.callTool(args);
    expect(first.structuredContent).toEqual(retry.structuredContent);
    expect(api.posted.map((b) => b.draftId)).toEqual(['draft_0001', 'draft_0001']);
    await close();
  });

  it('refuses an invalid build or draftId without calling the API', async () => {
    const api = draftApi();
    const { mcp, close } = await session(api.fetch);
    const badBuild = await mcp.callTool({
      name: 'propose_pen_draft',
      arguments: { draftId: 'draft_0001', build: { templateId: 'nope.v9', title: 'x' } },
    });
    expect(badBuild.content).toEqual([
      { type: 'text', text: 'That draft does not match a Pen template. Check templateId, title and the required sections.' },
    ]);
    const badId = await mcp.callTool({ name: 'propose_pen_draft', arguments: { draftId: 'x', build: BUILD } });
    expect(badId.isError).toBe(true);
    expect(api.calls).toHaveLength(0);
    await close();
  });

  it('refuses a draft over 256 KB before sending it', async () => {
    const api = draftApi();
    const { mcp, close } = await session(api.fetch);
    const res = await mcp.callTool({
      name: 'propose_pen_draft',
      arguments: {
        draftId: 'draft_0001',
        build: { ...BUILD, sections: [{ slug: 'body', plainText: 'x'.repeat(300 * 1024) }] },
      },
    });
    expect(res.content).toEqual([{ type: 'text', text: 'That draft is too large. Keep it under 256 KB.' }]);
    expect(api.posted).toHaveLength(0);
    await close();
  });

  it('maps the daily cap and a missing owner inbox to fixed messages', async () => {
    const limited = draftApi(() => json(429, { error: 'draft_rate_limited', detail: SECRETS.pnIdentifier }));
    const a = await session(limited.fetch);
    const res = await a.mcp.callTool({ name: 'propose_pen_draft', arguments: { draftId: 'draft_0001', build: BUILD } });
    expect(res.content).toEqual([
      { type: 'text', text: 'This AI agent has proposed the most drafts allowed today. Try again tomorrow.' },
    ]);
    assertNoSecrets(res, a.logs);
    await a.close();

    const noInbox = draftApi(() => json(409, { error: 'owner_inbox_unavailable' }));
    const b = await session(noInbox.fetch);
    const res2 = await b.mcp.callTool({ name: 'propose_pen_draft', arguments: { draftId: 'draft_0001', build: BUILD } });
    expect(res2.content).toEqual([{ type: 'text', text: 'The owner cannot receive drafts yet. Ask them to open Pen once.' }]);
    await b.close();
  });
});
