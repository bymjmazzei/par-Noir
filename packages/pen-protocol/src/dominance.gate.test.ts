/** Dominance + orientation + cloud table foundation gates. */

import { describe, expect, it } from 'vitest';
import {
  assertInteractiveLayer,
  assertEmbedLayer,
  assertTemplateClassInvariants,
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

  it('hard-cuts flat note/post media ids; ships orientation-split Social', () => {
    const ids = new Set(listStarterTemplates().map((t) => t.id));
    expect(ids.has('note.basic.v1')).toBe(false);
    expect(ids.has('post.media.v1')).toBe(false);
    expect(ids.has('post.video.v1')).toBe(false);
    expect(ids.has('note.basic.portrait.v1')).toBe(true);
    expect(ids.has('note.basic.landscape.v1')).toBe(true);
    expect(ids.has('post.image.portrait.v1')).toBe(true);
    expect(ids.has('post.image.landscape.v1')).toBe(true);
    expect(ids.has('post.image.square.v1')).toBe(true);
    expect(ids.has('post.video.portrait.v1')).toBe(true);
    expect(ids.has('post.video.landscape.v1')).toBe(true);
    expect(ids.has('post.video.square.v1')).toBe(true);
  });

  it('Note on Media keeps a dominant text card layer; Video Post keeps media primary', () => {
    const noteMedia = requireTemplate('note.media.portrait.v1');
    const body = noteMedia.seedSections?.find((s) => s.slug === 'body');
    const layers = body?.layers || [];
    const textCard = layers.find((l) => l.id === 'layer_card' && l.kind === 'text');
    const backdrop = layers.find((l) => l.kind === 'image');
    expect(textCard).toBeTruthy();
    expect(backdrop).toBeTruthy();
    expect((textCard!.zIndex || 0) > (backdrop!.zIndex || 0)).toBe(true);
    expect((textCard!.h || 0) >= 120).toBe(true);

    const video = requireTemplate('post.video.portrait.v1');
    const att = video.seedSections?.find((s) => s.slug === 'attachments');
    const media = (att?.layers || []).find((l) => l.kind === 'video');
    expect(media).toBeTruthy();
    expect((media!.h || 0) >= 400).toBe(true);
  });

  it('hides primitives.table from consumer New… catalog', () => {
    expect(getClass('primitives.table')?.audience).toBe('kit');
    expect(listConsumerClasses().some((c) => c.id === 'primitives.table')).toBe(false);
  });

  it('ships feed embed + poll + frame forms', () => {
    expect(requireTemplate('feed.embed.v1').classId).toBe('community.feed_embed');
    expect(requireTemplate('poll.basic.v1').classId).toBe('social.poll');
    expect(requireTemplate('frame.basic.v1').classId).toBe('social.frame');
    expect(requireTemplate('table.basic.v1').classId).toBe('primitives.table');
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
    const poll = requireTemplate('poll.basic.v1');
    const sections = poll.seedSections || [];
    expect(sectionNeedsSeedTable(sections)).toBe(true);
    const rewritten = rewriteSeedTablePlaceholders(sections, 'pen_table_abc');
    expect(sectionNeedsSeedTable(rewritten)).toBe(false);
    const layers = rewritten[0]?.layers || [];
    const embed = layers.find((l) => l.kind === 'embed');
    const sticker = layers.find((l) => l.kind === 'interactive');
    expect(embed?.refDocId).toBe('pen_table_abc');
    expect(sticker?.bindDocId).toBe('pen_table_abc');
    expect(sticker?.behavior).toBe('poll.vote');
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
});
