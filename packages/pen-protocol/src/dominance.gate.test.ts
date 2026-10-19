/** Dominance + orientation + cloud table foundation gates. */

import { describe, expect, it } from 'vitest';
import {
  assertInteractiveLayer,
  assertEmbedLayer,
  assertTemplateClassInvariants,
  createBoundEmbedLayer,
  createBoundInteractiveLayer,
  createEmbedLayer,
  createInteractiveLayer,
  emptyPollTable,
  getClass,
  listConsumerClasses,
  listStarterTemplates,
  parseTablePayloadFromTipTap,
  requireTemplate,
  rewriteSeedTablePlaceholders,
  sectionNeedsSeedTable,
  SEED_TABLE_DOC_PLACEHOLDER,
  tablePayloadToTipTap,
  tableSectionFromPayload,
  validateTablePayload
} from './index.js';

describe('template dominance + orientations', () => {
  it('registers class invariants for all starters', () => {
    assertTemplateClassInvariants(listStarterTemplates());
  });

  it('hard-cuts generic orientation starters; ships purpose-built social posts', () => {
    const ids = new Set(listStarterTemplates().map((t) => t.id));
    for (const retired of ['note.basic.portrait.v1', 'note.media.portrait.v1', 'post.image.portrait.v1', 'post.video.portrait.v1', 'collection.basic.v1', 'profile.basic.v1', 'comparison.basic.v1']) {
      expect(ids.has(retired)).toBe(false);
    }
    expect(ids.has('note.hot_take.v1')).toBe(true);
    expect(ids.has('post.product_drop.v1')).toBe(true);
    expect(ids.has('collection.how_to.v1')).toBe(true);
    expect(ids.has('profile.creator_intro.v1')).toBe(true);
    expect(ids.has('comparison.pricing.v1')).toBe(true);
  });

  it('quote, link, metric, code, audio, and frame are layers, not forms', () => {
    for (const id of ['social.quote', 'social.link', 'social.metric', 'social.code', 'social.audio', 'social.frame']) {
      expect(getClass(id)).toBeUndefined();
    }
    for (const id of ['quote.basic.v1', 'link.basic.v1', 'metric.basic.v1', 'code.basic.v1', 'audio.basic.v1', 'frame.basic.v1']) {
      expect(() => requireTemplate(id)).toThrow(/unknown_pen_template/);
    }
  });

  it('hides primitives.table from consumer New… catalog', () => {
    expect(getClass('primitives.table')?.audience).toBe('kit');
    expect(listConsumerClasses().some((c) => c.id === 'primitives.table')).toBe(false);
  });

  it('the poll is a widget; community feed embed starter retired', () => {
    expect(() => requireTemplate('feed.embed.v1')).toThrow(/unknown_pen_template/);
    expect(() => requireTemplate('poll.basic.v1')).toThrow(/unknown_pen_template/);
    expect(requireTemplate('widget.v1').classId).toBe('widgets.widget');
    expect(getClass('social.poll')).toBeUndefined();
    expect(getClass('social.comparison')?.parentId).toBe('social');
    expect(requireTemplate('table.basic.v1').classId).toBe('primitives.table');
    expect(getClass('community.feed_embed')?.audience).toBe('kit');
  });
});

describe('cloud table primitive IR', () => {
  it('round-trips table.v1 payload through TipTap section SoT', () => {
    const payload = emptyPollTable([
      { id: 'opt_a', label: 'Alpha', tally: 3 },
      { id: 'opt_b', label: 'Beta', tally: 1 }
    ]);
    expect(validateTablePayload(payload)).toBe(true);
    const sec = tableSectionFromPayload('grid', payload);
    const parsed = parseTablePayloadFromTipTap(sec.doc);
    expect(parsed).toEqual(payload);
    expect(tablePayloadToTipTap(payload).content?.[0]?.type).toBe('codeBlock');
  });

  it('rewrites seed table placeholders on embed + sticker binds', () => {
    const sections = [
      {
        slug: 'body',
        doc: { type: 'doc', content: [] },
        layers: [
          { ...createEmbedLayer(SEED_TABLE_DOC_PLACEHOLDER), id: 'embed' },
          { ...createInteractiveLayer({ behavior: 'cta.open', bindDocId: SEED_TABLE_DOC_PLACEHOLDER, label: 'Open' }), id: 'sticker' }
        ]
      }
    ];
    expect(sectionNeedsSeedTable(sections)).toBe(true);
    const rewritten = rewriteSeedTablePlaceholders(sections, 'pen_table_abc');
    expect(sectionNeedsSeedTable(rewritten)).toBe(false);
    const layers = rewritten[0]?.layers || [];
    const embed = layers.find((l) => l.kind === 'embed');
    const sticker = layers.find((l) => l.kind === 'interactive');
    expect(embed?.refDocId).toBe('pen_table_abc');
    expect(sticker?.bindDocId).toBe('pen_table_abc');
    expect(sticker?.behavior).toBe('cta.open');
    expect(layers.every((l) => l.refDocId !== SEED_TABLE_DOC_PLACEHOLDER)).toBe(true);
  });

  it('validates embed and interactive layer contracts', () => {
    const embed = createEmbedLayer('pen_ref');
    assertEmbedLayer(embed);
    const sticker = createInteractiveLayer({
      behavior: 'poll.vote',
      bindDocId: 'pen_ref',
      bindRowId: 'opt_a',
      label: 'A'
    });
    assertInteractiveLayer(sticker);
    expect(() => assertEmbedLayer({ ...embed, refDocId: '' })).toThrow(/embed_missing/);
    expect(() =>
      assertInteractiveLayer({ ...sticker, bindDocId: '' })
    ).toThrow(/interactive_missing/);
  });

  it('refuses action layers with an empty or placeholder bind id', () => {
    expect(() =>
      createBoundInteractiveLayer({
        behavior: 'poll.vote',
        bindDocId: '  ',
        label: 'Vote'
      })
    ).toThrow(/interactive_missing_bindDocId/);
    expect(() => createBoundEmbedLayer('')).toThrow(/embed_missing_refDocId/);
    expect(() => createBoundEmbedLayer(SEED_TABLE_DOC_PLACEHOLDER)).toThrow(
      /embed_missing_refDocId/
    );
    const bound = createBoundInteractiveLayer({
      behavior: 'poll.vote',
      bindDocId: 'pen_table',
      bindRowId: 'opt_a',
      label: 'A'
    });
    expect(bound.bindDocId).toBe('pen_table');
    expect(bound.positionLocked).toBe(false);
    assertInteractiveLayer(bound);
  });
});
