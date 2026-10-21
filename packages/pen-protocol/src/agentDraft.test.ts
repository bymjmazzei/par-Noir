import { describe, it, expect } from 'vitest';
import {
  draftIdFromContextId,
  parsePenAgentDraftSubmission,
  penAgentDraftContextId,
  penAgentDraftSubmissionBytes,
  previewPenAgentBuild
} from './index.js';

const ENVELOPE = { kemCiphertext: 'kem', ciphertext: 'ct' };

describe('pen agent draft contract', () => {
  it('round-trips the context id for a valid draft id only', () => {
    expect(penAgentDraftContextId('draft_0001')).toBe('pen-agent-draft:draft_0001');
    expect(draftIdFromContextId('pen-agent-draft:draft_0001')).toBe('draft_0001');
    expect(draftIdFromContextId('pen.comment:draft_0001')).toBeNull();
    expect(() => penAgentDraftContextId('short')).toThrow(/invalid_draft_id/);
    expect(() => penAgentDraftContextId('has spaces in it')).toThrow(/invalid_draft_id/);
  });

  it('accepts only the exact sealed submission shape', () => {
    expect(parsePenAgentDraftSubmission({ draftId: 'draft_0001', envelope: ENVELOPE })).toEqual({
      draftId: 'draft_0001',
      envelope: ENVELOPE
    });
    const refused = [
      null,
      { draftId: 'draft_0001' },
      { draftId: 'draft_0001', envelope: ENVELOPE, build: { title: 'clear' } },
      { draftId: 'draft_0001', envelope: { ...ENVELOPE, title: 'clear' } },
      { draftId: 'draft_0001', envelope: { kemCiphertext: '', ciphertext: 'ct' } },
      { draftId: 'x', envelope: ENVELOPE },
      { draftId: 'draft_0001', envelope: [ENVELOPE] }
    ];
    for (const body of refused) expect(parsePenAgentDraftSubmission(body)).toBeNull();
  });

  it('measures the submission in bytes', () => {
    const s = { draftId: 'draft_0001', envelope: { kemCiphertext: 'k', ciphertext: 'é' } };
    expect(penAgentDraftSubmissionBytes(s)).toBe(JSON.stringify(s).length + 1);
  });

  it('previews a valid build and rejects an invalid one', () => {
    const preview = previewPenAgentBuild({
      templateId: 'note.hot_take.v1',
      title: '  Autumn  ',
      sections: [{ slug: 'body', plainText: 'Rain on the roof.' }]
    });
    expect(preview).toMatchObject({ title: 'Autumn', templateId: 'note.hot_take.v1', excerpt: 'Rain on the roof.' });
    expect(preview.templateTitle).toBeTruthy();
    expect(() =>
      previewPenAgentBuild({ templateId: 'note.hot_take.v1', title: '', sections: [] })
    ).toThrow(/pen_agent_build_invalid/);
  });
});
