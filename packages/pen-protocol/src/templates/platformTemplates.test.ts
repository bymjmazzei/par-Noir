import { describe, expect, it } from 'vitest';
import type { PenPageLayer } from '../types.js';
import type { PenTemplate } from '../templates.js';
import {
  compileDocumentToNote,
  docToPlainText,
  listStarterTemplates,
  plainTextToTipTapDoc,
  structureFromLayers,
  templateForDoc
} from '../index.js';
import { feedChromeZones, frameOf, platformPostTemplates } from './index.js';

const FORMS = ['social.note', 'social.post', 'social.collection', 'social.profile', 'social.comparison'] as const;
const templates = platformPostTemplates();

const pages = (t: PenTemplate) => t.seedSections ?? [];
const layersOf = (t: PenTemplate) => pages(t).flatMap((s) => s.layers ?? []);
const area = (l: PenPageLayer) => l.w * l.h;
const isSlot = (l: PenPageLayer) => l.widgetElement === 'html' && /^(Photo|Clip|Avatar|Track)/.test(l.name || '');
const isControl = (l: PenPageLayer) => l.visible !== false && (l.kind === 'interactive' || l.widgetElement === 'input');
const copyOf = (l: PenPageLayer) => [l.textDoc ? docToPlainText(l.textDoc) : '', l.label || ''].join('\n');

function overlaps(a: PenPageLayer, b: PenPageLayer): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Seeded text boxes carry 8px of editor padding around the words. */
function inkBox(l: PenPageLayer) {
  const pad = l.widgetElement === 'text' && l.backgroundColor === 'transparent' ? 8 : 0;
  return { x: l.x + pad, y: l.y + pad, w: l.w - 2 * pad, h: l.h - 2 * pad };
}

function each(fn: (t: PenTemplate) => void) {
  for (const t of templates) fn(t);
}

describe('platform post templates', () => {
  it('ships five per form plus two navigable collections, registered ahead of the kit', () => {
    for (const form of FORMS) {
      expect(templates.filter((t) => t.classId === form).length, form).toBe(form === 'social.collection' ? 7 : 5);
    }
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
    const registered = listStarterTemplates().map((t) => t.id);
    expect(registered.slice(0, templates.length)).toEqual(templates.map((t) => t.id));
  });

  it('features three per form in Pen Mini', () => {
    for (const form of FORMS) {
      expect(templates.filter((t) => t.classId === form && t.browseFeatured).length, form).toBe(3);
    }
  });

  it('draws unique art on every page', () => {
    const seen = new Map<string, string>();
    each((t) => {
      for (const page of pages(t)) {
        const art = (page.layers ?? []).find((l) => l.widgetElement === 'html');
        expect(art?.htmlSource, `${t.id}/${page.slug}`).toBeTruthy();
        const prior = seen.get(art!.htmlSource!);
        expect(prior, `${t.id}/${page.slug} repeats ${prior}`).toBeUndefined();
        seen.set(art!.htmlSource!, `${t.id}/${page.slug}`);
      }
    });
  });

  it('writes real copy, never placeholders or the template name', () => {
    const banned = /lorem|ipsum|your text|placeholder|add your|tap to edit|title here|caption here|option [abc]\b/i;
    each((t) => {
      for (const layer of layersOf(t)) {
        const copy = copyOf(layer);
        expect(copy, `${t.id}/${layer.id}`).not.toMatch(banned);
        expect(copy.trim().toLowerCase(), `${t.id}/${layer.id}`).not.toBe(t.title.toLowerCase());
      }
    });
  });

  it('keeps every layer inside its frame', () => {
    each((t) => {
      const f = frameOf(t);
      for (const layer of layersOf(t)) {
        if (layer.kind === 'group') continue;
        const id = `${t.id}/${layer.id}`;
        expect(layer.x, id).toBeGreaterThanOrEqual(0);
        expect(layer.y, id).toBeGreaterThanOrEqual(0);
        expect(layer.x + layer.w, id).toBeLessThanOrEqual(f.w + 0.5);
        expect(layer.y + layer.h, id).toBeLessThanOrEqual(f.h + 0.5);
      }
    });
  });

  it('keeps text and controls out of feed chrome', () => {
    const covered: string[] = [];
    each((t) => {
      const zones = feedChromeZones(frameOf(t));
      for (const page of pages(t)) {
        for (const layer of page.layers ?? []) {
          if (layer.kind === 'group' || layer.widgetElement === 'html' || layer.visible === false) continue;
          const ink = inkBox(layer);
          for (const zone of zones) {
            const hit = ink.x < zone.x + zone.w && zone.x < ink.x + ink.w && ink.y < zone.y + zone.h && zone.y < ink.y + ink.h;
            if (hit) covered.push(`${t.id}/${page.slug}: ${layer.id} under the ${zone.name}`);
          }
        }
      }
    });
    expect(covered).toEqual([]);
  });

  it('hands title and caption to the feed', () => {
    each((t) => {
      const caption = t.feedCaption;
      expect(caption?.title.trim(), t.id).toBeTruthy();
      expect(caption!.title.toLowerCase(), t.id).not.toBe(t.title.toLowerCase());
      expect(`${caption!.title}\n${caption!.body ?? ''}`, t.id).not.toMatch(/lorem|ipsum|placeholder|caption here|title here/i);
    });
  });

  it('never stacks two visible controls', () => {
    each((t) => {
      for (const page of pages(t)) {
        const controls = (page.layers ?? []).filter(isControl);
        for (let i = 0; i < controls.length; i += 1) {
          for (let j = i + 1; j < controls.length; j += 1) {
            const a = controls[i]!;
            const b = controls[j]!;
            const sameFrame = a.stepFrame == null || b.stepFrame == null || a.stepFrame === b.stepFrame;
            expect(sameFrame && overlaps(a, b), `${t.id}/${page.slug}: ${a.id} over ${b.id}`).toBe(false);
          }
        }
      }
    });
  });

  it('moves: every template animates at least one layer', () => {
    each((t) => {
      expect(layersOf(t).some((l) => l.motion?.animation?.in), t.id).toBe(true);
    });
  });

  it('carries no stock media', () => {
    expect(JSON.stringify(templates)).not.toMatch(/starter-assets|pexels|\.mp4|\.jpe?g/i);
    each((t) => {
      expect(layersOf(t).some((l) => l.kind === 'image' || l.kind === 'video'), t.id).toBe(false);
    });
  });

  it('does not repeat one layout across templates', () => {
    const counts = new Map<string, number>();
    each((t) => {
      const behaviors = [...new Set(layersOf(t).map((l) => l.behavior).filter(Boolean))].sort().join(',');
      const key = `${behaviors}|${layersOf(t).length}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    for (const [key, n] of counts) expect(n, key).toBeLessThanOrEqual(3);
  });

  it('starts reveal targets hidden, except one open tab', () => {
    each((t) => {
      for (const page of pages(t)) {
        const layers = page.layers ?? [];
        const reveals = layers.filter((l) => l.behavior === 'widget.reveal');
        const openTabs = new Set<string>();
        for (const button of reveals) {
          const target = layers.find((l) => l.id === button.revealLayerId);
          expect(target, `${t.id}/${button.id}`).toBeTruthy();
          if (button.revealMode === 'tab') {
            if (target!.visible !== false) openTabs.add(target!.id);
          } else {
            expect(target!.visible, `${t.id}/${target!.id}`).toBe(false);
          }
        }
        expect(openTabs.size, `${t.id}/${page.slug}`).toBeLessThanOrEqual(1);
      }
    });
  });

  it('compiles straight from the seed, one page per section', () => {
    each((t) => {
      expect(pages(t).map((p) => p.slug), t.id).toEqual(t.sections.map((s) => s.slug));
      const out = compileDocumentToNote({ templateId: t.id, title: t.title, sections: pages(t), template: t });
      expect(out.pages.length, t.id).toBe(pages(t).length);
    });
  });

  it('wires poll templates so the first page group mints a sheet', () => {
    for (const t of templates.filter((x) => layersOf(x).some((l) => l.behavior === 'poll.vote'))) {
      const first = pages(t)[0]!;
      const group = (first.layers ?? []).find(
        (l) => l.kind === 'group' && (first.layers ?? []).some((c) => c.parentGroupId === l.id && c.behavior === 'poll.vote')
      );
      expect(group, t.id).toBeTruthy();
      const poll = structureFromLayers(first, group!.id);
      expect(poll.question.length, t.id).toBeGreaterThan(5);
      expect(poll.options.length, t.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives each template its own agent brief', () => {
    const briefs = templates.map((t) => t.agentStarter);
    expect(new Set(briefs).size).toBe(briefs.length);
  });
});

describe('docs made from retired templates', () => {
  it('still compile from their own pages under their form', () => {
    const sections = [
      { slug: 'slide-1', doc: plainTextToTipTapDoc('One') },
      { slug: 'slide-2', doc: plainTextToTipTapDoc('Two') }
    ];
    const t = templateForDoc({ templateId: 'collection.basic.v1', classId: 'social.collection' }, sections);
    expect(t.publishContentClass).toBe('collection');
    const out = compileDocumentToNote({ templateId: t.id, template: t, title: 'Old', sections });
    expect(out.pages.map((p) => p.content)).toEqual(['One', 'Two']);
    expect(templateForDoc({ templateId: 'note.hot_take.v1', classId: 'social.note' }, []).id).toBe('note.hot_take.v1');
  });
});

describe('each form does its job', () => {
  const byForm = (form: (typeof FORMS)[number]) => templates.filter((t) => t.classId === form);

  it('notes lead with words, not media', () => {
    for (const t of byForm('social.note')) {
      const layers = layersOf(t);
      const slot = layers.filter(isSlot).reduce((sum, l) => sum + area(l), 0);
      const text = layers.filter((l) => l.widgetElement === 'text' && copyOf(l).trim()).reduce((sum, l) => sum + area(l), 0);
      expect(slot, t.id).toBeLessThan(text);
    }
  });

  it('posts give the photo or clip at least 40% of the frame', () => {
    for (const t of byForm('social.post')) {
      const f = frameOf(t);
      const media = layersOf(t).filter((l) => isSlot(l) && /^(Photo|Clip)/.test(l.name || ''));
      expect(Math.max(0, ...media.map(area)) / (f.w * f.h), t.id).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('collections swipe from a cover through mixed pages', () => {
    for (const t of byForm('social.collection')) {
      const ps = pages(t);
      expect(ps.length, t.id).toBeGreaterThanOrEqual(3);
      expect(ps[0]?.slug, t.id).toBe('cover');
      expect(t.seedPageSwipeAxis, t.id).toBe('x');
      expect(t.publishContentClass, t.id).toBe('collection');
      expect(ps.some((p) => (p.layers ?? []).some(isSlot)), t.id).toBe(true);
      expect(ps.some((p) => !(p.layers ?? []).some(isSlot)), t.id).toBe(true);
    }
  });

  it('collection page links land on a real page, and navigable ones reach every page', () => {
    for (const t of byForm('social.collection')) {
      const slugs = new Set(pages(t).map((p) => p.slug));
      const targets = layersOf(t).flatMap((l) => (l.goTo?.startsWith('slug:') ? [l.goTo.slice(5)] : []));
      for (const slug of targets) expect(slugs.has(slug), `${t.id} → ${slug}`).toBe(true);
    }
    for (const id of ['collection.promo_hub.v1', 'collection.pick_path.v1']) {
      const t = templates.find((x) => x.id === id)!;
      const targets = new Set(layersOf(t).flatMap((l) => (l.goTo?.startsWith('slug:') ? [l.goTo.slice(5)] : [])));
      for (const p of pages(t).slice(1)) expect(targets.has(p.slug), `${id} reaches ${p.slug}`).toBe(true);
    }
  });

  it('profiles show a face, a name, and something to tap', () => {
    for (const t of byForm('social.profile')) {
      const layers = layersOf(t);
      expect(layers.some((l) => isSlot(l) && l.name === 'Avatar'), t.id).toBe(true);
      expect(layers.some((l) => l.name === 'Name' && copyOf(l).trim()), t.id).toBe(true);
      expect(layers.some((l) => l.kind === 'interactive' && l.behavior), t.id).toBe(true);
    }
  });

  it('comparisons line options up side by side', () => {
    for (const t of byForm('social.comparison')) {
      const columns = layersOf(t).filter((l) => l.name === 'Column');
      expect(columns.length, t.id).toBeGreaterThanOrEqual(2);
      const [first] = columns;
      expect(columns.every((c) => c.y === first!.y && c.h === first!.h), t.id).toBe(true);
    }
  });
});
