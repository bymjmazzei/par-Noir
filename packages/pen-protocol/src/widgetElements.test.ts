import { describe, expect, it } from 'vitest';
import { copyWidgetLayersIntoSection, upsertLayer } from './layers.js';
import { partitionLayersForCompose } from './actionPartition.js';
import { emptySection } from './richDoc.js';
import { requireTemplate } from './templates.js';
import {
  addWidgetElement,
  duplicateAnswerButton,
  formatCountdown,
  sanitizeWidgetMarkup,
  seedWidget
} from './widgetElements.js';
import { structureFromLayers } from './pollSheet.js';

describe('widget elements', () => {
  it('duplicate answer adds a second poll.vote row and the group stays an action overlay', () => {
    const seed = seedWidget();
    const host = emptySection('body');
    const copied = copyWidgetLayersIntoSection(
      host,
      seed.seedSections[0]!.layers || [],
      'Widget',
      'widget.v1'
    );
    const button = (copied.section.layers || []).find((layer) => layer.widgetElement === 'button');
    expect(button?.behavior).toBe('poll.vote');
    const withTime = addWidgetElement(copied.section, copied.groupId, 'time');
    const duplicated = duplicateAnswerButton(withTime, button!.id);
    const structure = structureFromLayers(duplicated, copied.groupId);
    expect(structure.options).toHaveLength(2);
    expect(structure.options.every((option) => option.id)).toBe(true);
    expect(structure.closesAt).toBeNull();

    const part = partitionLayersForCompose(duplicated.layers);
    const group = (duplicated.layers || []).find((layer) => layer.id === copied.groupId);
    expect(part.inert.some((layer) => layer.id === group?.id || layer.widgetElement)).toBe(false);
    expect(part.action.some((layer) => layer.id === copied.groupId)).toBe(true);
    expect(part.overlays).toEqual([
      expect.objectContaining({
        layerId: copied.groupId,
        kind: 'interactive',
        behavior: 'poll.vote'
      })
    ]);
    expect(part.action.filter((layer) => layer.widgetElement === 'button')).toHaveLength(2);
  });

  it('countdown reaches zero when the time element has closed', () => {
    const closesAt = '2026-01-01T00:00:00.000Z';
    expect(formatCountdown(closesAt, Date.parse('2026-01-01T01:00:00.000Z'))).toBe('00:00:00');
    expect(formatCountdown(closesAt, Date.parse('2025-12-31T22:00:00.000Z'))).toBe('2h 00m 00s');
  });

  it('strips scripts from an uploaded SVG', () => {
    const clean = sanitizeWidgetMarkup('<svg onload="alert(1)"><script>bad</script><rect /></svg>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onload');
    expect(clean).toContain('<rect');
  });

  it('starter template is the only widget', () => {
    const widget = requireTemplate('widget.v1');
    const layers = widget.seedSections?.[0]?.layers || [];
    const section = upsertLayer(emptySection('card'), {
      id: 'g',
      kind: 'group',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      zIndex: 1,
      widgetTemplateId: 'widget.v1'
    });
    expect(layers.some((layer) => layer.widgetElement === 'svg')).toBe(true);
    expect(section.layers?.[0]?.widgetTemplateId).toBe('widget.v1');
  });
});
