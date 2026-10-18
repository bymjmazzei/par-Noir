/**
 * Add-menu page tools: text looks, sticker editor, whole widgets, GIPHY, sound.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createTextLookLayer,
  emptySection,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { buildSocialTemplateRailItems } from './classFeedRailItems';
import { placeGiphySticker } from './giphyStickers';
import { attachCatalogTrack, attachOwnAudioTrack, soundHostLayer } from './soundCatalog';
import { WidgetEditorPanel } from '../components/WidgetEditorPanel';
import { SoundCatalogMenu } from '../components/SoundCatalogMenu';

describe('page objects', () => {
  it('adds text from the flat Add menu; looks live in the ribbon; picker lists whole widgets', () => {
    const menu = readFileSync(resolve(__dirname, '../components/LayersPanel.tsx'), 'utf8');
    const presets = readFileSync(resolve(__dirname, '../components/layersAddMenu.ts'), 'utf8');
    const picker = readFileSync(resolve(__dirname, '../components/ActionLayerMenu.tsx'), 'utf8');
    const ribbon = readFileSync(resolve(__dirname, '../components/PageCanvas.tsx'), 'utf8');
    for (const label of ['Text', 'Image', 'Video', 'Audio', 'Widgets', 'Stickers']) {
      expect(menu).toContain(label);
    }
    expect(menu).toContain('Select from device');
    expect(menu).toContain('Use licensed audio');
    expect(menu).not.toContain('Browse widgets');
    expect(menu).not.toMatch(/LAYERS_PAGE_WIDGET_PRESETS/);
    for (const label of ['Title', 'Caption', 'Quote']) {
      expect(presets).toContain(label);
    }
    expect(ribbon).toMatch(/LAYERS_TEXT_LOOK_PRESETS/);
    expect(ribbon).toMatch(/textLookStyle/);
    expect(picker).not.toMatch(/placePageWidget|LAYERS_WIDGET_ELEMENTS/);
    expect(picker).toMatch(/curatedWidgetPosterSrc/);
    expect(presets).not.toMatch(/look: 'label'/);
    const title = createTextLookLayer('title');
    expect(title.name).toBe('Title');
    expect(JSON.stringify(title.textDoc)).toContain('Source Serif 4');
    expect(JSON.stringify(title.textDoc)).toContain('42px');
    expect(JSON.stringify(title.textDoc)).toContain('Title');
    const quote = createTextLookLayer('quote');
    expect(JSON.stringify(quote.textDoc)).toContain('A short quote');
  });

  it('puts a sticker chip on the templates rail and hides triggers in the shared editor', () => {
    const rail = buildSocialTemplateRailItems();
    expect(rail.some((item) => item.id === 'widgets.sticker' && item.label === 'sticker')).toBe(true);
    const html = renderToStaticMarkup(
      <WidgetEditorPanel
        hideTriggers
        layer={null}
        section={{ ...emptySection('card'), layers: [] }}
        onSectionChange={() => undefined}
      />
    );
    expect(html).toContain('SVG');
    expect(html).toContain('Image');
    expect(html).toContain('Text');
    expect(html).not.toContain('Button trigger');
    expect(html).not.toContain('HTML snippet');
  });

  it('places a GIPHY result as an image layer', () => {
    const placed = placeGiphySticker(emptySection('body'), {
      id: 'gif-1',
      title: 'Spark',
      url: 'https://media.giphy.com/media/spark.gif'
    });
    const layer = placed.section.layers?.find((item) => item.id === placed.layerId);
    expect(layer?.kind).toBe('image');
    expect(layer?.name).toBe('Spark');
    expect(layer?.imageSrc).toBe('https://media.giphy.com/media/spark.gif');
  });

  it('attaches a catalog track on the media layer audio lane', () => {
    const bare = emptySection('body');
    expect(soundHostLayer(bare, null)).toBeNull();
    const quiet = renderToStaticMarkup(
      <SoundCatalogMenu
        section={bare}
        activeLayerId={null}
        onSectionChange={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(quiet).toContain('Nothing on this page can hold a sound.');
    const section: PenSectionContent = {
      ...bare,
      layers: [
        {
          id: 'photo',
          kind: 'image',
          x: 0,
          y: 0,
          w: 80,
          h: 80,
          zIndex: 1,
          imageSrc: 'https://example.com/a.jpg'
        }
      ]
    };
    const next = attachCatalogTrack(section, 'photo', { id: 'track-9' });
    expect(next.layers?.[0]?.audioTracks).toEqual([{ id: 'track-9', licensedDocId: 'track-9' }]);
  });

  it('appends an own audio lane on the media layer', () => {
    const section: PenSectionContent = {
      ...emptySection('body'),
      layers: [
        {
          id: 'photo',
          kind: 'image',
          x: 0,
          y: 0,
          w: 80,
          h: 80,
          zIndex: 1,
          imageSrc: 'https://example.com/a.jpg'
        }
      ]
    };
    const next = attachOwnAudioTrack(section, 'photo', 'penmedia:file-1');
    const tracks = next.layers?.[0]?.audioTracks || [];
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.src).toBe('penmedia:file-1');
    expect(tracks[0]?.gain).toBe(100);
  });
});
