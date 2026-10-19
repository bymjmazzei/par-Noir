/**
 * Gate: templates rail + catalog list the curated widget library and social rows only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURATED_WIDGET_IDS, requireTemplate } from '@par-noir/pen-protocol';
import { isWidgetTemplateClass } from './components/WidgetTemplateThumb';
import {
  SOCIAL_TEMPLATE_RAIL_FORMS,
  buildSocialTemplateRailItems,
  isTemplatesCatalogClass,
  listTemplatesCatalogStarters
} from './services/classFeedRailItems';
import { publicWidgetCatalog } from './services/widgetCatalog';
import type { CentralIndexEntry } from '@par-noir/aggregator-domain';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('template catalog building blocks', () => {
  it('keeps animation, transition, and text preset blanks registered for New…', () => {
    expect(requireTemplate('animation.v1').classId).toBe('widgets.animation');
    expect(requireTemplate('transition.v1').classId).toBe('widgets.transition');
    expect(requireTemplate('textpreset.v1').classId).toBe('widgets.text_preset');
  });

  it('rail chips are the social forms plus widget', () => {
    expect([...SOCIAL_TEMPLATE_RAIL_FORMS]).toEqual([
      'social.note',
      'social.audio',
      'social.post',
      'social.collection',
      'social.set',
      'widgets.widget'
    ]);
    const labels = buildSocialTemplateRailItems().map((item) => item.label);
    expect(labels).toContain('widget');
    expect(labels).not.toContain('sticker');
    expect(labels).not.toContain('animation');
  });

  it('widget starters on /templates are exactly the curated library', () => {
    const widgetIds = listTemplatesCatalogStarters()
      .filter((t) => isWidgetTemplateClass(t.classId))
      .map((t) => t.id);
    expect(widgetIds).toEqual([...CURATED_WIDGET_IDS]);
    for (const blank of ['widget.v1', 'sticker.v1', 'animation.v1', 'transition.v1', 'textpreset.v1']) {
      expect(widgetIds).not.toContain(blank);
    }
    const ids = listTemplatesCatalogStarters().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('note.basic.portrait.v1');
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
    const kit: CentralIndexEntry = {
      fileId: 'k1',
      submittedAt: '2026-01-01T00:00:00.000Z',
      metadata: {
        penClassId: 'records.register',
        penTemplateKind: 'template',
        title: 'Register'
      }
    };
    const catalog = publicWidgetCatalog([note, kit]);
    expect(catalog.templates.map((t) => t.classId)).toEqual(['social.note']);
    expect(isTemplatesCatalogClass('records.register')).toBe(false);
  });

  it('widget templates render as posters on /templates, not layer-blind page previews', () => {
    for (const id of [
      'widgets.widget',
      'widgets.sticker',
      'widgets.animation',
      'widgets.transition',
      'widgets.text_preset'
    ]) {
      expect(isWidgetTemplateClass(id)).toBe(true);
    }
    expect(isWidgetTemplateClass('social.note')).toBe(false);
    expect(isWidgetTemplateClass(undefined)).toBe(false);

    expect(read('components/PenFeedSlideStage.tsx')).toMatch(/previewOverride/);
    for (const rel of [
      'components/TemplatesFeedScroller.tsx',
      'components/TemplateGalleryThumb.tsx',
      'components/TemplatesBrowse.tsx'
    ]) {
      expect(read(rel)).toMatch(/WidgetTemplateThumb/);
    }
  });

  it('index-published widgets stay off /templates and the picker', () => {
    const browse = read('components/TemplatesBrowse.tsx');
    expect(browse).toMatch(/listTemplatesCatalogStarters/);
    expect(browse).toMatch(/!isWidgetTemplateClass\(t\.classId\)/);
    expect(read('components/ActionLayerMenu.tsx')).not.toMatch(/fetchPublicPenTemplates/);
  });

  it('the starter mirror is gone and its copies are purged', () => {
    expect(existsSync(resolve(__dirname, 'services/penPlatformTemplates.ts'))).toBe(false);
    const app = read('App.tsx');
    expect(app).not.toMatch(/ensurePlatformTemplateRoots/);
    expect(app).toMatch(/purgeStarterMirrors/);
    expect(read('services/penPersonalTemplates.ts')).not.toMatch(/savePersonalTemplateFromCatalog/);
  });
});
