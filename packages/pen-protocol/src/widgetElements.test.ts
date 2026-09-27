import { describe, expect, it } from 'vitest';
import { copyWidgetLayersIntoSection, upsertLayer } from './layers.js';
import { partitionLayersForCompose } from './actionPartition.js';
import { emptySection } from './richDoc.js';
import { PEN_POLL_VOTE_KIND } from './outbox.js';
import { requireTemplate } from './templates.js';
import { structureFromLayers } from './pollSheet.js';
import {
  allocateSplit,
  applyToggle,
  buildWidgetActionRow,
  duplicateButton,
  placeWidgetLayer,
  rankOrder,
  revealSibling,
  sanitizeWidgetMarkup,
  seedWidget,
  setButtonTrigger,
  setVoteCorrect,
  setWidgetClosesAt,
  voteFace
} from './widgetElements.js';
import type { PenPageLayer } from './types.js';

function button(partial: Partial<PenPageLayer> & Pick<PenPageLayer, 'id' | 'x' | 'y'>): PenPageLayer {
  return {
    kind: 'interactive',
    w: 80,
    h: 32,
    zIndex: 1,
    label: partial.id,
    ...partial
  };
}

describe('widget placement and triggers', () => {
  it('opens an empty template and a new button has no vote trigger', () => {
    const widget = requireTemplate('widget.v1');
    expect(widget.seedSections?.[0]?.layers || []).toEqual([]);
    const placed = placeWidgetLayer(emptySection('card'), null, 'button');
    const layer = placed.section.layers?.find((item) => item.id === placed.layerId);
    expect(layer?.behavior).toBeUndefined();
    expect(layer?.kind).toBe('interactive');
  });

  it('keeps two buttons where they were dropped, including on an image', () => {
    let section = emptySection('card');
    const image = placeWidgetLayer(section, null, 'image');
    section = image.section;
    const first = placeWidgetLayer(section, null, 'button');
    section = upsertLayer(first.section, {
      ...first.section.layers!.find((layer) => layer.id === first.layerId)!,
      x: 10,
      y: 20
    });
    const second = placeWidgetLayer(section, null, 'button');
    section = upsertLayer(second.section, {
      ...second.section.layers!.find((layer) => layer.id === second.layerId)!,
      x: 140,
      y: 20
    });
    const img = section.layers!.find((layer) => layer.id === image.layerId)!;
    section = upsertLayer(section, {
      ...section.layers!.find((layer) => layer.id === second.layerId)!,
      x: img.x + 8,
      y: img.y + 8
    });
    const a = section.layers!.find((layer) => layer.id === first.layerId)!;
    const b = section.layers!.find((layer) => layer.id === second.layerId)!;
    expect(a.x).toBe(10);
    expect(b.x).toBe(img.x + 8);
    expect(b.y).toBe(img.y + 8);
    expect(a.x).not.toBe(b.x);
    const part = partitionLayersForCompose(section.layers);
    expect(part.inert.some((layer) => layer.id === image.layerId)).toBe(true);
    expect(part.action.map((layer) => layer.id).sort()).toEqual([a.id, b.id].sort());
    expect(part.overlays).toEqual([]);
  });

  it('copies the trigger when a button is duplicated', () => {
    let section = placeWidgetLayer(emptySection('card'), null, 'button').section;
    const id = section.layers![0]!.id;
    section = setButtonTrigger(section, id, 'widget.stamp');
    const copy = duplicateButton(section, id);
    const clones = (copy.layers || []).filter((layer) => layer.behavior === 'widget.stamp');
    expect(clones).toHaveLength(2);
    expect(new Set(clones.map((layer) => layer.id)).size).toBe(2);
  });

  it('vote writes the option id, a correct mark is pass or fail, and time hides the result', () => {
    let section = emptySection('card');
    const text = placeWidgetLayer(section, null, 'text');
    section = text.section;
    const yes = placeWidgetLayer(section, null, 'button');
    section = setButtonTrigger(yes.section, yes.layerId, 'poll.vote');
    const no = placeWidgetLayer(section, null, 'button');
    section = setButtonTrigger(no.section, no.layerId, 'poll.vote');
    const yesId = (section.layers || []).find((layer) => layer.id === yes.layerId)!.bindRowId!;
    section = setVoteCorrect(section, yes.layerId, true);
    const time = placeWidgetLayer(section, null, 'time');
    const closesAt = '2026-06-01T00:00:00.000Z';
    section = setWidgetClosesAt(time.section, time.layerId, closesAt);
    const structure = structureFromLayers(section);
    expect(structure.options.map((option) => option.id)).toContain(yesId);
    expect(structure.correctOptionId).toBe(yesId);
    expect(structure.closesAt).toBe(closesAt);

    const hidden = voteFace({
      optionId: yesId,
      label: 'Yes',
      counts: { total: 1, byOption: { [yesId]: 1 } },
      correctOptionId: yesId,
      closesAt,
      votedOptionId: yesId,
      now: Date.parse('2026-05-01T00:00:00.000Z')
    });
    expect(hidden.kind).toBe('countdown');

    const withoutTime = {
      ...section,
      layers: (section.layers || []).filter((layer) => layer.id !== time.layerId)
    };
    expect(structureFromLayers(withoutTime).closesAt).toBeNull();
    const passed = voteFace({
      optionId: yesId,
      label: 'Yes',
      counts: { total: 1, byOption: { [yesId]: 1 } },
      correctOptionId: structureFromLayers(withoutTime).correctOptionId || null,
      closesAt: null,
      votedOptionId: yesId
    });
    expect(passed).toEqual({ kind: 'passfail', text: 'Correct' });
    const failed = voteFace({
      optionId: 'other',
      label: 'No',
      counts: null,
      correctOptionId: yesId,
      closesAt: null,
      votedOptionId: 'other'
    });
    expect(failed).toEqual({ kind: 'passfail', text: 'Incorrect' });
    const tally = voteFace({
      optionId: yesId,
      label: 'Yes',
      counts: { total: 2, byOption: { [yesId]: 2 } },
      correctOptionId: null,
      closesAt: null,
      votedOptionId: yesId
    });
    expect(tally).toEqual({ kind: 'tally', text: 'Yes 2' });
  });

  it('submit, toggle, and stamp are widget actions, and rank and allocate store their row', () => {
    const submit = buildWidgetActionRow({
      trigger: 'widget.submit',
      actorId: 'pn_a',
      actionId: 'a1',
      fields: { Text: 'hello' }
    });
    const stamp = buildWidgetActionRow({
      trigger: 'widget.stamp',
      actorId: 'pn_a',
      actionId: 'a2',
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    expect(submit.kind).toBe('pen.widget_action');
    expect(stamp.kind).toBe('pen.widget_action');
    expect(submit.kind).not.toBe(PEN_POLL_VOTE_KIND);
    expect(stamp.row.trigger).toBe('widget.stamp');
    expect(stamp.row.actorId).toBe('pn_a');

    const once = applyToggle([], 'pn_a', 't1', '2026-01-01T00:00:00.000Z');
    expect(once).toHaveLength(1);
    expect(once[0]?.present).toBe(true);
    expect(applyToggle(once, 'pn_a', 't2', '2026-01-01T00:01:00.000Z')).toEqual([]);

    let section = emptySection('card');
    const low = button({ id: 'b', x: 10, y: 40, behavior: 'widget.rank' });
    const high = button({ id: 'a', x: 10, y: 8, behavior: 'widget.rank' });
    section = { ...section, layers: [low, high] };
    const order = rankOrder(section, null);
    const ranked = buildWidgetActionRow({
      trigger: 'widget.rank',
      actorId: 'pn_a',
      actionId: 'r1',
      order
    });
    expect(ranked.row.order).toEqual(['a', 'b']);

    const left = button({ id: 'l', x: 0, y: 0, behavior: 'widget.allocate' });
    const right = button({ id: 'r', x: 40, y: 0, behavior: 'widget.allocate' });
    const split = allocateSplit({ ...emptySection('card'), layers: [left, right] }, null, 100);
    const allocated = buildWidgetActionRow({
      trigger: 'widget.allocate',
      actorId: 'pn_a',
      actionId: 's1',
      split
    });
    expect(allocated.row.split).toEqual({ l: 50, r: 50 });
    expect(allocated.kind).not.toBe(PEN_POLL_VOTE_KIND);
  });

  it('reveal shows a hidden sibling and does not write a poll vote', () => {
    const host = emptySection('card');
    const shown = button({ id: 'go', x: 0, y: 0, behavior: 'widget.reveal' });
    const hidden = button({ id: 'secret', x: 0, y: 40, visible: false });
    const next = revealSibling({ ...host, layers: [shown, hidden] }, 'go');
    expect(next.layers?.find((layer) => layer.id === 'secret')?.visible).toBe(true);
  });

  it('strips scripts from an uploaded SVG', () => {
    const clean = sanitizeWidgetMarkup('<svg onload="alert(1)"><script>bad</script><rect /></svg>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onload');
    expect(clean).toContain('<rect');
  });

  it('an empty widget copy is a group with no poll buttons', () => {
    const copied = copyWidgetLayersIntoSection(emptySection('body'), seedWidget().seedSections[0]!.layers || [], 'Widget', 'widget.v1');
    const group = copied.section.layers?.find((layer) => layer.id === copied.groupId);
    expect(group?.widgetTemplateId).toBe('widget.v1');
    expect(structureFromLayers(copied.section, copied.groupId).options).toEqual([]);
  });
});
