/**
 * Gate: templates rail + public catalog include widget building blocks and social rows.
 */
import { describe, expect, it } from 'vitest';
import { requireTemplate } from '@par-noir/pen-protocol';
import {
  SOCIAL_TEMPLATE_RAIL_FORMS,
  buildSocialTemplateRailItems,
  isTemplatesCatalogClass
} from './services/classFeedRailItems';
import { publicWidgetCatalog } from './services/widgetCatalog';
import type { CentralIndexEntry } from '@par-noir/aggregator-domain';

describe('template catalog building blocks', () => {
  it('registers animation, transition, and text preset starters', () => {
    expect(requireTemplate('animation.v1').classId).toBe('widgets.animation');
    expect(requireTemplate('transition.v1').classId).toBe('widgets.transition');
    expect(requireTemplate('textpreset.v1').classId).toBe('widgets.text_preset');
  });

  it('exposes rail chips for widget building blocks', () => {
    expect([...SOCIAL_TEMPLATE_RAIL_FORMS]).toEqual([
      'social.note',
      'social.audio',
      'social.post',
      'social.collection',
      'social.set',
      'widgets.widget',
      'widgets.sticker',
      'widgets.animation',
      'widgets.transition',
      'widgets.text_preset'
    ]);
    const labels = buildSocialTemplateRailItems().map((item) => item.label);
    expect(labels).toContain('animation');
    expect(labels).toContain('transition');
    expect(labels).toContain('text preset');
  });

  it('public catalog keeps social templates and drops kit rows', () => {
    const note: CentralIndexEntry = {
      fileId: 'n1',
      submittedAt: '2026-01-01T00:00:00.000Z',
      metadata: {
        penClassId: 'social.note',
        penTemplateKind: 'template',
        title: 'Note tpl'
      }
    };
    const anim: CentralIndexEntry = {
      fileId: 'a1',
      submittedAt: '2026-01-01T00:00:00.000Z',
      metadata: {
        penClassId: 'widgets.animation',
        penTemplateKind: 'template',
        title: 'Rise'
      }
    };
    const kit: CentralIndexEntry = {
      fileId: 'k1',
      submittedAt: '2026-01-01T00:00:00.000Z',
      metadata: {
        penClassId: 'records.register',
        penTemplateKind: 'template',
        title: 'Register'
      }
    };
    const catalog = publicWidgetCatalog([note, anim, kit]);
    expect(catalog.templates.map((t) => t.classId).sort()).toEqual([
      'social.note',
      'widgets.animation'
    ]);
    expect(isTemplatesCatalogClass('widgets.text_preset')).toBe(true);
    expect(isTemplatesCatalogClass('records.register')).toBe(false);
  });
});
