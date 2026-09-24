import { describe, it, expect } from 'vitest';
import {
  composeAgentPrompt,
  validatePenAgentBuild,
  materializePenAgentBuild,
  plainTextToTipTapDoc,
  listStarterTemplates,
  draftSectionPath,
  docManifestPath,
  currentSectionPath,
  type PenAgentBuild
} from './index.js';

describe('composeAgentPrompt', () => {
  it('fills user_input and section_list for note.basic.v1', () => {
    const prompt = composeAgentPrompt('note.basic.v1', 'Write about autumn rain');
    expect(prompt).toContain('Write about autumn rain');
    expect(prompt).toContain('note.basic.v1');
    expect(prompt).toContain('body (required)');
    expect(prompt).not.toContain('{{user_input}}');
  });

  it('throws on unknown template', () => {
    expect(() => composeAgentPrompt('nope.v9', 'x')).toThrow(/unknown_pen_template/);
  });
});

describe('validatePenAgentBuild', () => {
  it('accepts a valid basic note', () => {
    const build: PenAgentBuild = {
      templateId: 'note.basic.v1',
      title: 'Autumn',
      sections: [{ slug: 'body', plainText: 'Soft rain on the window.' }]
    };
    const r = validatePenAgentBuild(build);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects unknown template', () => {
    const r = validatePenAgentBuild({ templateId: 'x', title: 't', sections: [] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.code).toBe('unknown_template');
  });

  it('rejects missing required section', () => {
    const r = validatePenAgentBuild({
      templateId: 'note.basic.v1',
      title: 'T',
      sections: []
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'missing_required_section')).toBe(true);
  });

  it('rejects empty required section', () => {
    const r = validatePenAgentBuild({
      templateId: 'note.basic.v1',
      title: 'T',
      sections: [{ slug: 'body', plainText: '   ' }]
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'empty_required_section')).toBe(true);
  });

  it('rejects unknown section slug', () => {
    const r = validatePenAgentBuild({
      templateId: 'note.basic.v1',
      title: 'T',
      sections: [
        { slug: 'body', plainText: 'ok' },
        { slug: 'extra', plainText: 'nope' }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'unknown_section')).toBe(true);
  });

  it('validates register rows against columns', () => {
    const ok = validatePenAgentBuild({
      templateId: 'register.basic.v1',
      title: 'Contacts',
      rows: [{ id: '1', label: 'Ada', notes: 'friend' }]
    });
    expect(ok.ok).toBe(true);

    const bad = validatePenAgentBuild({
      templateId: 'register.basic.v1',
      title: 'Contacts',
      rows: [{ id: '1' }]
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.code === 'missing_required_column')).toBe(true);
  });
});

describe('materializePenAgentBuild', () => {
  it('writes draft tree paths for a note', () => {
    const build: PenAgentBuild = {
      templateId: 'note.basic.v1',
      title: 'Rain',
      sections: [{ slug: 'body', plainText: 'It rains.' }]
    };
    const out = materializePenAgentBuild(build, {
      docId: 'pen_testdoc',
      draftId: 'draft_test',
      now: '2026-09-22T12:00:00.000Z'
    });
    expect(out.manifest.templateId).toBe('note.basic.v1');
    expect(out.files.some((f) => f.path === docManifestPath('pen_testdoc'))).toBe(true);
    expect(
      out.files.some((f) => f.path === draftSectionPath('pen_testdoc', 'draft_test', 'body'))
    ).toBe(true);
    const body = out.sections.find((s) => s.slug === 'body');
    expect(body?.doc.type).toBe('doc');
    expect(body?.layers?.length ?? 0).toBe(0);
    expect(out.manifest.pagePresentation).toBeTruthy();
    expect(out.manifest.pageLayout).toBe('flow');
  });

  it('writes current/ when asCurrent', () => {
    const out = materializePenAgentBuild(
      {
        templateId: 'note.basic.v1',
        title: 'Pub',
        sections: [{ slug: 'body', plainText: 'Live.' }]
      },
      { docId: 'pen_pub', asCurrent: true }
    );
    expect(out.files.some((f) => f.path === currentSectionPath('pen_pub', 'body'))).toBe(true);
    expect(out.manifest.lifecycle).toBe('published');
  });

  it('throws on invalid build', () => {
    expect(() =>
      materializePenAgentBuild({ templateId: 'note.basic.v1', title: '', sections: [] })
    ).toThrow(/pen_agent_build_invalid/);
  });
});

describe('templates agent starters', () => {
  it('every starter has agentStarter with user_input placeholder', () => {
    for (const t of listStarterTemplates()) {
      expect(t.agentStarter.length).toBeGreaterThan(40);
      expect(t.agentStarter).toContain('{{user_input}}');
    }
  });

  it('register.basic.v1 has registerColumns', () => {
    const t = listStarterTemplates().find((x) => x.id === 'register.basic.v1');
    expect(t?.registerColumns?.length).toBeGreaterThan(0);
  });
});

describe('plainTextToTipTapDoc', () => {
  it('splits paragraphs', () => {
    const doc = plainTextToTipTapDoc('One\n\nTwo');
    expect(doc.content?.length).toBe(2);
  });
});
