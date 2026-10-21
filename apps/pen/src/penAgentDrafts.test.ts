/**
 * Hermetic: AI drafts inbox. Real ML-KEM sealing; mailbox and doc creation mocked.
 * Accept goes through createDocFromAgentBuild then acks; discard only acks; a build that
 * does not open or validate can never be accepted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { sealSocialEnvelope } from '@par-noir/dm-crypto';
import { penAgentDraftContextId, type PenAgentBuild } from '@par-noir/pen-protocol';

const ROUTE = 'a'.repeat(64);

const ownerGet = vi.fn();
const ownerFetch = vi.fn();
vi.mock('./services/penOwnerFetch', () => ({
  ownerGet: (...args: unknown[]) => ownerGet(...args),
  ownerFetch: (...args: unknown[]) => ownerFetch(...args)
}));
vi.mock('./services/penCollab', () => ({
  resolvePenMailboxRouteKey: vi.fn(async () => ROUTE)
}));
const createDocFromAgentBuild = vi.fn();
vi.mock('./services/createDocFromAgentBuild', () => ({
  createDocFromAgentBuild: (...args: unknown[]) => createDocFromAgentBuild(...args)
}));

import {
  acceptAgentDraft,
  discardAgentDraft,
  listAgentDrafts
} from './services/penAgentDrafts';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const kem = ml_kem768.keygen();
const session = {
  accessToken: 'at',
  pnIdentifier: 'pn-owner',
  mlKemSecretKey: b64(kem.secretKey)
};

const BUILD: PenAgentBuild = {
  templateId: 'note.hot_take.v1',
  title: 'From my agent',
  sections: [{ slug: 'body', plainText: 'Rain on the roof.' }]
};

async function job(id: string, draftId: string, build: unknown, sealedFor = draftId) {
  return {
    id,
    jobType: 'pen_agent_draft',
    payload: {
      envelope: await sealSocialEnvelope(b64(kem.publicKey), penAgentDraftContextId(sealedFor), build),
      envelopeContext: penAgentDraftContextId(draftId)
    },
    expiresAt: '2026-10-28T00:00:00.000Z'
  };
}

function pending(jobs: unknown[]) {
  ownerGet.mockResolvedValue(new Response(JSON.stringify({ jobs }), { status: 200 }));
}

beforeEach(() => {
  ownerGet.mockReset();
  ownerFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ acked: 1 }), { status: 200 }));
  createDocFromAgentBuild.mockReset().mockResolvedValue({ manifest: { docId: 'pen_new' } });
});

describe('AI drafts inbox', () => {
  it('asks the mailbox for drafts only and previews what it opens', async () => {
    pending([await job('job-1', 'draft_0001', BUILD)]);
    const drafts = await listAgentDrafts(session);
    expect(String(ownerGet.mock.calls[0][0])).toContain('jobType=pen_agent_draft');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      valid: true,
      draftId: 'draft_0001',
      jobId: 'job-1',
      preview: { title: 'From my agent', excerpt: 'Rain on the roof.' }
    });
    expect(createDocFromAgentBuild).not.toHaveBeenCalled();
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('accept creates the doc through createDocFromAgentBuild, then acks the draft', async () => {
    pending([await job('job-1', 'draft_0001', BUILD)]);
    const [draft] = await listAgentDrafts(session);
    const bundle = await acceptAgentDraft(session, draft);
    expect(bundle.manifest.docId).toBe('pen_new');
    expect(createDocFromAgentBuild).toHaveBeenCalledWith({ session, build: BUILD });
    expect(ownerFetch).toHaveBeenCalledWith(
      'POST',
      '/api/mailbox/ack',
      { pnIdentifier: 'pn-owner', routeKey: ROUTE, jobIds: ['job-1'] },
      { pnIdentifier: 'pn-owner' }
    );
    expect(createDocFromAgentBuild.mock.invocationCallOrder[0]).toBeLessThan(
      ownerFetch.mock.invocationCallOrder[0]
    );
  });

  it('keeps the draft when the doc could not be created', async () => {
    pending([await job('job-1', 'draft_0001', BUILD)]);
    const [draft] = await listAgentDrafts(session);
    createDocFromAgentBuild.mockRejectedValue(new Error('local save failed'));
    await expect(acceptAgentDraft(session, draft)).rejects.toThrow();
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('discard acks without creating anything', async () => {
    pending([await job('job-2', 'draft_0002', BUILD)]);
    const [draft] = await listAgentDrafts(session);
    await discardAgentDraft(session, draft);
    expect(createDocFromAgentBuild).not.toHaveBeenCalled();
    expect(ownerFetch).toHaveBeenCalledWith(
      'POST',
      '/api/mailbox/ack',
      expect.objectContaining({ jobIds: ['job-2'] }),
      expect.anything()
    );
  });

  it('rejects an invalid build: it can be discarded but never accepted', async () => {
    pending([await job('job-3', 'draft_0003', { templateId: 'note.hot_take.v1', title: '', sections: [] })]);
    const [draft] = await listAgentDrafts(session);
    expect(draft.valid).toBe(false);
    await expect(acceptAgentDraft(session, draft)).rejects.toThrow(/pen_agent_build_invalid/);
    expect(createDocFromAgentBuild).not.toHaveBeenCalled();
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('an envelope lifted onto another draft id does not open', async () => {
    pending([await job('job-4', 'draft_0004', BUILD, 'draft_9999')]);
    const [draft] = await listAgentDrafts(session);
    expect(draft.valid).toBe(false);
  });

  it('shows nothing while Pen is locked', async () => {
    expect(await listAgentDrafts({ accessToken: 'at', pnIdentifier: 'pn-owner' })).toEqual([]);
    expect(ownerGet).not.toHaveBeenCalled();
  });
});
