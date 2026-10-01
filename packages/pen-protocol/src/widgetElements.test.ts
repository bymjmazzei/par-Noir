import { describe, expect, it } from 'vitest';
import { copyWidgetLayersIntoSection, setTextLayerDoc, upsertLayer } from './layers.js';
import { partitionLayersForCompose } from './actionPartition.js';
import { emptySection } from './richDoc.js';
import { PEN_POLL_VOTE_KIND } from './outbox.js';
import { requireTemplate } from './templates.js';
import { structureFromLayers } from './pollSheet.js';
import { upsertUserRow, voteDataHeaders, voteMatrixRow } from './pollSheet.js';
import {
  allocateTotal,
  applyWidgetSheetRows,
  buildWidgetActionRow,
  cellsForAmounts,
  cellsForInputs,
  cellsForRanks,
  formCollectsToSheet,
  groupNeedsTrackingSheet,
  inputColumnKeys,
  submitFields,
  cornerRadiusFromPull,
  duplicateButton,
  nextAllocatePress,
  nextRankPress,
  placeWidgetLayer,
  revealSibling,
  sanitizeWidgetMarkup,
  seedWidget,
  setAllocateTotal,
  setButtonTrigger,
  setOpenUrl,
  setRevealTarget,
  setSubmitTo,
  setVoteCorrect,
  layerOpensWidgetEditor,
  setWidgetClosesAt,
  timeLayerCaption,
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

  it('each trigger writes its own sheet shape', () => {
    const headers = voteDataHeaders([{ label: 'Yes' }, { label: 'No' }]);
    expect(headers).toEqual(['user', 'Yes', 'No']);
    const row = voteMatrixRow({
      user: 'pn_a',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' }
      ],
      optionId: 'yes'
    });
    const again = voteMatrixRow({
      user: 'pn_a',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' }
      ],
      optionId: 'no'
    });
    expect(upsertUserRow([row], again)).toEqual([again]);

    let section = emptySection('card');
    const open = placeWidgetLayer(section, null, 'button');
    section = setButtonTrigger(open.section, open.layerId, 'cta.open');
    section = setOpenUrl(section, open.layerId, 'https://example.com');
    expect(section.layers?.find((layer) => layer.id === open.layerId)?.openUrl).toBe('https://example.com');

    const submit = placeWidgetLayer(section, null, 'button');
    section = setButtonTrigger(submit.section, submit.layerId, 'widget.submit');
    section = setSubmitTo(section, submit.layerId, 'a@b.co');
    expect(section.layers?.find((layer) => layer.id === submit.layerId)?.submitTo).toBe('a@b.co');

    const toggled = applyWidgetSheetRows({
      trigger: 'widget.toggle',
      user: 'pn_a',
      createdAt: '2026-01-01T00:00:00.000Z',
      present: true,
      headers: [],
      existing: []
    });
    expect(toggled.tab).toBe('Toggle');
    expect(toggled.rows).toEqual([['pn_a', '1']]);
    expect(
      applyWidgetSheetRows({
        trigger: 'widget.toggle',
        user: 'pn_a',
        createdAt: '2026-01-01T00:00:00.000Z',
        present: false,
        headers: [],
        existing: toggled.rows
      }).rows
    ).toEqual([]);

    const stamped = applyWidgetSheetRows({
      trigger: 'widget.stamp',
      user: 'pn_a',
      createdAt: '2026-01-01T00:00:00.000Z',
      headers: [],
      existing: []
    });
    expect(stamped.headers).toEqual(['user', 'stamped_at']);
    expect(stamped.rows).toHaveLength(1);
    expect(
      applyWidgetSheetRows({
        trigger: 'widget.stamp',
        user: 'pn_a',
        createdAt: '2026-01-02T00:00:00.000Z',
        headers: [],
        existing: stamped.rows
      }).rows
    ).toHaveLength(2);

    const low = button({ id: 'b', x: 10, y: 40, behavior: 'widget.rank', label: 'B' });
    const high = button({ id: 'a', x: 10, y: 8, behavior: 'widget.rank', label: 'A' });
    section = { ...emptySection('card'), layers: [low, high] };
    const ranks = nextRankPress(nextRankPress({}, 'b'), 'a');
    expect(ranks).toEqual({ b: 1, a: 2 });
    expect(nextRankPress(ranks, 'b')).toEqual({ b: 1 });
    const ranked = applyWidgetSheetRows({
      trigger: 'widget.rank',
      user: 'pn_a',
      createdAt: '2026-01-01T00:00:00.000Z',
      headers: ['B', 'A'],
      cells: cellsForRanks(section, null, ranks),
      existing: []
    });
    expect(ranked.headers).toEqual(['user', 'B', 'A']);
    expect(ranked.rows).toEqual([['pn_a', '1', '2']]);

    const left = button({ id: 'l', x: 0, y: 0, behavior: 'widget.allocate', label: 'Left' });
    const right = button({ id: 'r', x: 40, y: 0, behavior: 'widget.allocate', label: 'Right' });
    section = setAllocateTotal({ ...emptySection('card'), layers: [left, right] }, null, 3);
    expect(allocateTotal(section, null)).toBe(3);
    let amounts: Record<string, number> = {};
    let remaining = 3;
    let complete = false;
    for (const id of ['l', 'l', 'r']) {
      const step = nextAllocatePress(amounts, id, 3);
      amounts = step.amounts;
      remaining = step.remaining;
      complete = step.complete;
    }
    expect(remaining).toBe(0);
    expect(complete).toBe(true);
    expect(amounts).toEqual({ l: 2, r: 1 });
    const allocated = applyWidgetSheetRows({
      trigger: 'widget.allocate',
      user: 'pn_a',
      createdAt: '2026-01-01T00:00:00.000Z',
      headers: ['Left', 'Right'],
      cells: cellsForAmounts(section, null, amounts),
      existing: []
    });
    expect(allocated.tab).toBe('Allocate');
    expect(allocated.rows).toEqual([['pn_a', '2', '1']]);
    expect(buildWidgetActionRow({
      trigger: 'widget.stamp',
      actorId: 'pn_a',
      actionId: 'a2'
    }).kind).not.toBe(PEN_POLL_VOTE_KIND);
    expect(cornerRadiusFromPull(0, 12, 4, 120, 40)).toBe(12);
    expect(cornerRadiusFromPull(12, -20, -20, 120, 40)).toBe(0);
    expect(cornerRadiusFromPull(0, 80, 80, 120, 40)).toBe(20);
  });

  it('reveal shows the layer the author picked', () => {
    const host = emptySection('card');
    const shown = button({ id: 'go', x: 0, y: 0, behavior: 'widget.reveal' });
    const hidden = button({ id: 'secret', x: 0, y: 40, visible: true });
    const picked = setRevealTarget({ ...host, layers: [shown, hidden] }, 'go', 'secret');
    expect(picked.layers?.find((layer) => layer.id === 'secret')?.visible).toBe(false);
    const next = revealSibling(picked, 'go');
    expect(next.layers?.find((layer) => layer.id === 'secret')?.visible).toBe(true);
  });

  it('strips scripts from an uploaded SVG', () => {
    const clean = sanitizeWidgetMarkup('<svg onload="alert(1)"><script>bad</script><rect /></svg>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onload');
    expect(clean).toContain('<rect');
  });

  it('saving a button doc keeps the doc and updates the label', () => {
    const placed = placeWidgetLayer(emptySection('card'), null, 'button');
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes' }] }]
    };
    const next = setTextLayerDoc(placed.section, placed.layerId, doc, { syncDoc: false });
    const button = next.layers?.find((layer) => layer.id === placed.layerId);
    expect(button?.textDoc).toEqual(doc);
    expect(button?.label).toBe('Yes');
    expect(next.doc).toEqual(emptySection('card').doc);
  });

  it('an input is an action layer and Send either records a row or sends the typed values', () => {
    let section = emptySection('card');
    const field = placeWidgetLayer(section, null, 'input');
    section = field.section;
    const label = placeWidgetLayer(section, null, 'text');
    section = upsertLayer(label.section, {
      ...label.section.layers!.find((layer) => layer.id === label.layerId)!,
      name: 'Prompt',
      textDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Your name' }] }] }
    });
    const input = section.layers!.find((layer) => layer.id === field.layerId)!;
    expect(input.widgetElement).toBe('input');
    expect(input.textDoc).toBeUndefined();
    const part = partitionLayersForCompose(section.layers);
    expect(part.action.map((layer) => layer.id)).toContain(field.layerId);
    expect(part.inert.map((layer) => layer.id)).not.toContain(field.layerId);

    const send = placeWidgetLayer(section, null, 'button');
    section = setButtonTrigger(send.section, send.layerId, 'widget.submit');
    const values = { [field.layerId]: 'Ada' };
    expect(formCollectsToSheet(section, null)).toBe(true);
    expect(groupNeedsTrackingSheet(section, null)).toBe(true);
    expect(submitFields(section, null, values)).toEqual({ Field: 'Ada' });
    expect(submitFields(section, null, values)).not.toEqual({ Prompt: 'Your name' });
    const headers = inputColumnKeys(section, null);
    const first = applyWidgetSheetRows({
      trigger: 'widget.submit',
      user: 'pn_a',
      createdAt: '2026-01-01T00:00:00.000Z',
      headers,
      cells: cellsForInputs(section, null, values),
      existing: []
    });
    expect(first.tab).toBe('Submit');
    expect(first.headers).toEqual(['user', 'Field']);
    expect(first.rows).toEqual([['pn_a', 'Ada']]);
    const second = applyWidgetSheetRows({
      trigger: 'widget.submit',
      user: 'pn_a',
      createdAt: '2026-01-02T00:00:00.000Z',
      headers,
      cells: ['Grace'],
      existing: first.rows
    });
    expect(second.rows).toEqual([
      ['pn_a', 'Ada'],
      ['pn_a', 'Grace']
    ]);

    section = setSubmitTo(section, send.layerId, 'a@b.co');
    expect(formCollectsToSheet(section, null)).toBe(false);
    expect(groupNeedsTrackingSheet(section, null)).toBe(false);
    expect(submitFields(section, null, values)).toEqual({ Field: 'Ada' });
  });

  it('an empty widget copy is a group with no poll buttons', () => {
    const copied = copyWidgetLayersIntoSection(emptySection('body'), seedWidget().seedSections[0]!.layers || [], 'Widget', 'widget.v1');
    const group = copied.section.layers?.find((layer) => layer.id === copied.groupId);
    expect(group?.widgetTemplateId).toBe('widget.v1');
    expect(structureFromLayers(copied.section, copied.groupId).options).toEqual([]);
  });

  it('opens the widget editor for a widget layer and leaves media and prose alone', () => {
    expect(layerOpensWidgetEditor({ id: 't', kind: 'text', widgetElement: 'time', x: 0, y: 0, w: 1, h: 1, zIndex: 1 })).toBe(true);
    expect(layerOpensWidgetEditor({ id: 'b', kind: 'interactive', x: 0, y: 0, w: 1, h: 1, zIndex: 1 })).toBe(true);
    expect(layerOpensWidgetEditor({ id: 'g', kind: 'group', widgetTemplateId: 'widget.v1', x: 0, y: 0, w: 1, h: 1, zIndex: 1 })).toBe(true);
    expect(layerOpensWidgetEditor({ id: 'img', kind: 'image', x: 0, y: 0, w: 1, h: 1, zIndex: 1 })).toBe(false);
    expect(layerOpensWidgetEditor({ id: 'prose', kind: 'text', x: 0, y: 0, w: 1, h: 1, zIndex: 1 })).toBe(false);
  });

  it('shows a clock string, a countdown, or nothing', () => {
    expect(timeLayerCaption({ timeFace: 'clock', clockTime: '14:30' })).toBe('14:30');
    expect(timeLayerCaption({ timeFace: 'blank', closesAt: '2099-01-01T00:00:00.000Z' })).toBe('');
    expect(timeLayerCaption({ closesAt: null })).toBe('');
    expect(timeLayerCaption({ closesAt: '2000-01-01T00:00:00.000Z' })).toBe('00:00:00');
  });
});
