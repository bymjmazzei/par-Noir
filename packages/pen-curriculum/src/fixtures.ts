/** Golden fixtures for Pen agent eval — intent → PenAgentBuild. */

import type { PenAgentBuild } from '@par-noir/pen-protocol';

export interface PenCurriculumFixture {
  id: string;
  /** Relative path under fixtures/ */
  dir: string;
  intent: string;
  expectedTemplateId: string;
  build: PenAgentBuild;
  /** When true, materialize with asCurrent (publish snapshot). */
  asCurrent?: boolean;
}

export const GOLDEN_FIXTURES: PenCurriculumFixture[] = [
  {
    id: 'note-autumn-rain',
    dir: 'notes/autumn-rain',
    intent: 'Write a short browse Note about autumn rain on the city.',
    expectedTemplateId: 'note.basic.v1',
    build: {
      templateId: 'note.basic.v1',
      title: 'Autumn rain',
      sections: [
        {
          slug: 'body',
          plainText: 'Soft rain slides down the glass. The streetlights blur into gold.'
        }
      ]
    }
  },
  {
    id: 'note-article-garden',
    dir: 'notes/article-garden',
    intent: 'Article Note about starting a balcony garden.',
    expectedTemplateId: 'note.article.v1',
    build: {
      templateId: 'note.article.v1',
      title: 'Balcony garden',
      sections: [
        { slug: 'title', plainText: 'Starting a balcony garden' },
        {
          slug: 'body',
          plainText:
            'Begin with two pots, potting mix, and herbs that forgive missed waterings. Basil and mint earn their keep.'
        }
      ]
    }
  },
  {
    id: 'note-list-market',
    dir: 'notes/list-market',
    intent: 'Make a shopping list for weekend market.',
    expectedTemplateId: 'list.basic.v1',
    build: {
      templateId: 'list.basic.v1',
      title: 'Weekend market',
      sections: [
        {
          slug: 'items',
          plainText: '- Tomatoes\n- Bread\n- Olive oil\n- Lemons'
        }
      ]
    }
  },
  {
    id: 'note-journal-march',
    dir: 'notes/journal-march',
    intent: 'Start a journal entry for a March morning walk.',
    expectedTemplateId: 'journal.basic.v1',
    build: {
      templateId: 'journal.basic.v1',
      title: 'March walk',
      sections: [
        {
          slug: 'entries',
          plainText: '2026-03-12 — Cold air, early green tips on the hedge. Coffee steam in the wind.'
        }
      ]
    }
  },
  {
    id: 'note-letter-thanks',
    dir: 'notes/letter-thanks',
    intent: 'Draft a short thank-you letter after a visit.',
    expectedTemplateId: 'letter.basic.v1',
    build: {
      templateId: 'letter.basic.v1',
      title: 'Thank you',
      sections: [
        {
          slug: 'body',
          plainText:
            'Dear friend,\n\nThank you for the quiet evening and the good bread. I made it home safely.\n\nWarmly'
        }
      ]
    }
  },
  {
    id: 'publish-note-before',
    dir: 'publish/note-draft',
    intent: 'Draft a Note that will later be published (before).',
    expectedTemplateId: 'note.basic.v1',
    build: {
      templateId: 'note.basic.v1',
      title: 'Harbor light',
      sections: [{ slug: 'body', plainText: 'The ferry horn carries across the harbor.' }]
    }
  },
  {
    id: 'publish-note-after',
    dir: 'publish/note-current',
    intent: 'Same Note after publish (current tree).',
    expectedTemplateId: 'note.basic.v1',
    asCurrent: true,
    build: {
      templateId: 'note.basic.v1',
      title: 'Harbor light',
      sections: [{ slug: 'body', plainText: 'The ferry horn carries across the harbor.' }]
    }
  },
  {
    id: 'register-contacts',
    dir: 'register/contacts',
    intent: 'Create a contacts register with two people.',
    expectedTemplateId: 'register.basic.v1',
    build: {
      templateId: 'register.basic.v1',
      title: 'Contacts',
      rows: [
        { id: 'c1', label: 'Ada Lovelace', notes: 'Analytical engine' },
        { id: 'c2', label: 'Grace Hopper', notes: 'Compiler pioneer' }
      ]
    }
  },
  {
    id: 'register-projects',
    dir: 'register/projects',
    intent: 'Register of active projects.',
    expectedTemplateId: 'register.basic.v1',
    build: {
      templateId: 'register.basic.v1',
      title: 'Projects',
      rows: [
        { id: 'p1', label: 'Pen curriculum', notes: 'Agent teaching data' },
        { id: 'p2', label: 'Feed reconcile', notes: 'Cache alignment' }
      ]
    }
  }
];

/** Synthetic bad builds — eval must reject these. */
export const BAD_FIXTURES: Array<{ id: string; build: unknown; expectCode: string }> = [
  {
    id: 'bad-unknown-template',
    build: { templateId: 'thought.legacy.v1', title: 'Nope', sections: [] },
    expectCode: 'unknown_template'
  },
  {
    id: 'bad-missing-section',
    build: { templateId: 'note.basic.v1', title: 'Empty', sections: [] },
    expectCode: 'missing_required_section'
  },
  {
    id: 'bad-unknown-slug',
    build: {
      templateId: 'note.basic.v1',
      title: 'Extra',
      sections: [
        { slug: 'body', plainText: 'ok' },
        { slug: 'sidebar', plainText: 'invented' }
      ]
    },
    expectCode: 'unknown_section'
  }
];
