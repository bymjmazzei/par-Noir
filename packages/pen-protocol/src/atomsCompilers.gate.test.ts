import { describe, expect, it } from 'vitest';
import {
  assertKnowledgePayloadSafe,
  attachGeoProofToManifest,
  canvasSizeForAspect,
  collectActionOverlays,
  defaultL5PageChrome,
  formatEventFieldLines,
  normalizeGalleryAspect,
  parseEventFieldLines,
  partitionLayersForCompose,
  remapSectionsForAspect,
  renderFeedEmbedChromeHtml,
  sectionsToLongformUnits,
  adjacentUnit,
  type PenSectionContent
} from './index.js';

describe('actionPartition', () => {
  it('keeps interactive stickers out of inert flatten set', () => {
    const part = partitionLayersForCompose([
      {
        id: 't1',
        kind: 'text',
        x: 0,
        y: 0,
        w: 100,
        h: 40,
        zIndex: 1
      },
      {
        id: 'v1',
        kind: 'interactive',
        x: 10,
        y: 20,
        w: 80,
        h: 32,
        zIndex: 2,
        behavior: 'poll.vote',
        bindDocId: 'table_1',
        label: 'Vote'
      }
    ]);
    expect(part.inert).toHaveLength(1);
    expect(part.action).toHaveLength(1);
    expect(part.overlays[0]?.behavior).toBe('poll.vote');
    expect(collectActionOverlays([{ slug: 'body', doc: { type: 'doc', content: [] }, layers: part.action }])).toHaveLength(
      1
    );
  });
});

describe('aspectRemap', () => {
  it('scales layer rects when aspect changes', () => {
    expect(canvasSizeForAspect('9/16')).toEqual({ w: 360, h: 640 });
    const sections: PenSectionContent[] = [
      {
        slug: 'body',
        doc: { type: 'doc', content: [] },
        layers: [{ id: 'a', kind: 'text', x: 36, y: 64, w: 180, h: 80, zIndex: 1 }]
      }
    ];
    const next = remapSectionsForAspect(sections, '9/16', '16/9');
    expect(next[0]!.layers![0]!.x).toBe(64);
    expect(normalizeGalleryAspect('nope')).toBe('9/16');
  });
});

describe('knowledge', () => {
  it('rejects raw coords / PII keys', () => {
    expect(() =>
      assertKnowledgePayloadSafe({
        claims: [{ dataPointId: 'email', proofRef: 'x' }]
      })
    ).toThrow(/knowledge_raw_pii/);
    expect(() =>
      assertKnowledgePayloadSafe({
        claims: [{ dataPointId: 'age_over_18', proofRef: '40.7,-74.0' }]
      })
    ).toThrow(/knowledge_raw_coords/);
    const m = attachGeoProofToManifest(
      {
        docId: 'd1',
        title: 't',
        docType: 'note',
        classId: 'social.note',
        templateId: 'note.basic.portrait.v1',
        templateVersion: '1',
        toc: ['body'],
        createdAt: '',
        updatedAt: ''
      },
      { proofRef: 'geo_proof_abc', precision: 'city' }
    );
    expect(m.attestations?.geoProofs?.[0]?.proofRef).toBe('geo_proof_abc');
  });
});

describe('longform + time + L5 chrome', () => {
  it('builds unit sequence and adjacent nav', () => {
    const seq = sectionsToLongformUnits('Book', [
      { slug: 'c1', doc: { type: 'doc', content: [] } },
      { slug: 'c2', doc: { type: 'doc', content: [] } }
    ]);
    expect(seq.withinUnitAxis).toBe('y');
    expect(adjacentUnit(seq, 'c1', 'next')?.unitId).toBe('c2');
  });

  it('formats and parses event fields', () => {
    const lines = formatEventFieldLines({
      title: 'Launch',
      startAt: '2026-10-01T19:00:00-04:00',
      timeZone: 'America/New_York',
      placeLabel: 'Hall'
    });
    const parsed = parseEventFieldLines(lines);
    expect(parsed.title).toBe('Launch');
    expect(parsed.placeLabel).toBe('Hall');
  });

  it('renders feed embed chrome with iframe slot', () => {
    const html = renderFeedEmbedChromeHtml(
      defaultL5PageChrome({
        feedEmbed: { streamUrl: 'https://example.test/feed', title: 'Live' }
      })
    );
    expect(html).toContain('iframe');
    expect(html).toContain('https://example.test/feed');
  });
});
