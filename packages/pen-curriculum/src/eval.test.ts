import { describe, it, expect } from 'vitest';
import {
  validatePenAgentBuild,
  materializePenAgentBuild,
  composeAgentPrompt,
  draftSectionPath,
  currentSectionPath
} from '@par-noir/pen-protocol';
import { GOLDEN_FIXTURES, BAD_FIXTURES } from './fixtures.js';

describe('pen curriculum eval', () => {
  it('all golden fixtures validate and match expected templateId', () => {
    for (const fix of GOLDEN_FIXTURES) {
      const r = validatePenAgentBuild(fix.build);
      expect(r.ok, fix.id).toBe(true);
      expect(fix.build.templateId).toBe(fix.expectedTemplateId);
    }
  });

  it('golden fixtures materialize canonical paths', () => {
    for (const fix of GOLDEN_FIXTURES) {
      const out = materializePenAgentBuild(fix.build, {
        docId: `pen_${fix.id.replace(/[^a-z0-9]/gi, '').slice(0, 16)}`,
        draftId: 'draft_eval',
        asCurrent: fix.asCurrent,
        now: '2026-09-22T12:00:00.000Z'
      });
      expect(out.files.length).toBeGreaterThan(1);
      if (fix.asCurrent) {
        expect(out.files.some((f) => f.path.includes('/current/'))).toBe(true);
        if (fix.build.templateId === 'note.basic.v1') {
          expect(
            out.files.some((f) => f.path === currentSectionPath(out.docId, 'body'))
          ).toBe(true);
        }
      } else if (!fix.build.rows) {
        const firstSlug = fix.build.sections?.[0]?.slug;
        if (firstSlug) {
          expect(
            out.files.some((f) => f.path === draftSectionPath(out.docId, out.draftId, firstSlug))
          ).toBe(true);
        }
      }
    }
  });

  it('composeAgentPrompt embeds fixture intents for note templates', () => {
    const fix = GOLDEN_FIXTURES.find((f) => f.id === 'note-autumn-rain')!;
    const prompt = composeAgentPrompt(fix.expectedTemplateId, fix.intent);
    expect(prompt).toContain(fix.intent);
    expect(prompt).toContain('note.basic.v1');
  });

  it('rejects synthetic bad builds', () => {
    for (const bad of BAD_FIXTURES) {
      const r = validatePenAgentBuild(bad.build);
      expect(r.ok, bad.id).toBe(false);
      expect(
        r.errors.some((e) => e.code === bad.expectCode),
        `${bad.id} expected ${bad.expectCode}, got ${r.errors.map((e) => e.code).join(',')}`
      ).toBe(true);
    }
  });
});
