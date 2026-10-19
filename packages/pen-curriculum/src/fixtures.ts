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
    id: 'note-hot-take',
    dir: 'notes/hot-take',
    intent: 'Post a hot take: standups longer than ten minutes are a planning failure.',
    expectedTemplateId: 'note.hot_take.v1',
    build: {
      templateId: 'note.hot_take.v1',
      title: 'Short standups',
      sections: [
        {
          slug: 'body',
          plainText:
            'A standup over ten minutes is a planning meeting in disguise.\nSam Reyes, engineering manager\nIf it needs discussion, it needs its own slot. Standup is for blockers.'
        }
      ]
    }
  },
  {
    id: 'note-lesson-list',
    dir: 'notes/lesson-list',
    intent: 'Share five lessons from my first year running a bakery.',
    expectedTemplateId: 'note.lesson.v1',
    build: {
      templateId: 'note.lesson.v1',
      title: 'Bakery year one',
      sections: [
        {
          slug: 'body',
          plainText:
            'Five things my first bakery year taught me\n01 Price for the bad weeks, not the good ones.\n02 Bake less, sell out, and say so.\n03 Regulars want their order remembered.\n04 Close one day a week, no matter what.\n05 The oven will break in December.'
        }
      ]
    }
  },
  {
    id: 'note-announcement',
    dir: 'notes/announcement',
    intent: 'Announce that our book club moves to Thursdays at the library from next month.',
    expectedTemplateId: 'note.announcement.v1',
    build: {
      templateId: 'note.announcement.v1',
      title: 'Book club moves',
      sections: [
        {
          slug: 'body',
          plainText:
            'Book club moves to Thursdays\nFrom 5 March we meet at the Central Library, room 2, at 7pm.\nSame books, same people.\nFree parking after 6pm.\nBring your own mug.'
        }
      ]
    }
  },
  {
    id: 'note-dev-tip',
    dir: 'notes/dev-tip',
    intent: 'A quick CSS tip about centering with grid.',
    expectedTemplateId: 'note.dev_tip.v1',
    build: {
      templateId: 'note.dev_tip.v1',
      title: 'Center anything',
      sections: [
        {
          slug: 'body',
          plainText: 'Center anything in two lines\nGrid with place-items centers both axes at once.\n.box { display: grid; place-items: center; }'
        }
      ]
    }
  },
  {
    id: 'post-recipe-reel',
    dir: 'posts/recipe-reel',
    intent: 'Recipe reel for a ten-minute miso noodle soup.',
    expectedTemplateId: 'post.recipe_reel.v1',
    build: {
      templateId: 'post.recipe_reel.v1',
      title: 'Miso noodles',
      sections: [
        {
          slug: 'body',
          plainText: 'Ten-minute miso noodles\nOne pot, pantry staples, dinner before the kettle cools.\nNoodles · miso · spinach · egg · scallion'
        }
      ]
    }
  },
  {
    id: 'collection-how-to',
    dir: 'collections/how-to',
    intent: 'Three-step guide to cleaning a cast iron pan.',
    expectedTemplateId: 'collection.how_to.v1',
    build: {
      templateId: 'collection.how_to.v1',
      title: 'Clean cast iron',
      sections: [
        { slug: 'cover', plainText: 'Clean cast iron in five minutes' },
        { slug: 'step-1', plainText: 'Scrape while warm\nFood lifts easily before the pan cools. Use a flat wooden spatula.' },
        { slug: 'step-2', plainText: 'Rinse, no soap soak\nHot water and a brush. A drop of soap is fine; soaking is not.' },
        { slug: 'step-3', plainText: 'Dry and oil\nDry on the burner, then wipe a thin film of oil inside.' },
        { slug: 'recap', plainText: 'Scraped warm\nNo soaking\nOiled after drying' }
      ]
    }
  },
  {
    id: 'profile-creator-intro',
    dir: 'profiles/creator-intro',
    intent: 'Introduce me as a ceramicist who sells mugs and teaches weekend classes.',
    expectedTemplateId: 'profile.creator_intro.v1',
    build: {
      templateId: 'profile.creator_intro.v1',
      title: 'Hi, I am Noor',
      sections: [
        {
          slug: 'body',
          plainText: 'Noor Haddad\nCeramicist · mugs and weekend classes\n300 mugs sold · 40 students · 6 years\nI throw small-batch stoneware in Leeds and teach beginners on Saturdays.'
        }
      ]
    }
  },
  {
    id: 'comparison-pros-cons',
    dir: 'comparisons/pros-cons',
    intent: 'Pros and cons of switching to a standing desk.',
    expectedTemplateId: 'comparison.pros_cons.v1',
    build: {
      templateId: 'comparison.pros_cons.v1',
      title: 'Standing desk',
      sections: [
        {
          slug: 'body',
          plainText:
            'Is a standing desk worth it?\nPROS: less back stiffness, more energy after lunch, easy to alternate\nCONS: sore feet at first, costs more, cable mess\nVerdict: yes, if you alternate every hour and get a mat.'
        }
      ]
    }
  },
  {
    id: 'publish-note-before',
    dir: 'publish/note-draft',
    intent: 'Draft a hot take that will later be published (before).',
    expectedTemplateId: 'note.hot_take.v1',
    build: {
      templateId: 'note.hot_take.v1',
      title: 'Ship on Fridays',
      sections: [{ slug: 'body', plainText: 'If you are scared to ship on Friday, fix your rollback, not your calendar.' }]
    }
  },
  {
    id: 'publish-note-after',
    dir: 'publish/note-current',
    intent: 'Same hot take after publish (current tree).',
    expectedTemplateId: 'note.hot_take.v1',
    asCurrent: true,
    build: {
      templateId: 'note.hot_take.v1',
      title: 'Ship on Fridays',
      sections: [{ slug: 'body', plainText: 'If you are scared to ship on Friday, fix your rollback, not your calendar.' }]
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
    id: 'bad-retired-template',
    build: { templateId: 'note.basic.portrait.v1', title: 'Old', sections: [{ slug: 'body', plainText: 'ok' }] },
    expectCode: 'unknown_template'
  },
  {
    id: 'bad-missing-section',
    build: { templateId: 'note.hot_take.v1', title: 'Empty', sections: [] },
    expectCode: 'missing_required_section'
  },
  {
    id: 'bad-missing-cover',
    build: { templateId: 'collection.how_to.v1', title: 'No cover', sections: [{ slug: 'step-1', plainText: 'Scrape' }] },
    expectCode: 'missing_required_section'
  },
  {
    id: 'bad-unknown-slug',
    build: {
      templateId: 'note.hot_take.v1',
      title: 'Extra',
      sections: [
        { slug: 'body', plainText: 'ok' },
        { slug: 'sidebar', plainText: 'invented' }
      ]
    },
    expectCode: 'unknown_section'
  }
];
