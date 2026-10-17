/**
 * Gate: layer fields hold refs only; stray data:/blob: never reaches localStorage JSON.
 */

import { describe, it, expect } from 'vitest';
import { stripInlineMediaFromBundle } from './services/penLocalStoreSanitize';
import type { LocalDocBundle } from './services/penLocalStore';

describe('stripInlineMediaFromBundle', () => {
  it('strips data: from layer and page fields and keeps refs', () => {
    const huge = `data:image/png;base64,${'A'.repeat(5000)}`;
    const bundle = {
      manifest: {
        docId: 'doc1',
        title: 't',
        docType: 'note',
        classId: 'social.note',
        templateId: 'social.note.basic',
        templateVersion: '1',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        toc: [],
        pagePresentation: { backgroundImage: huge, backgroundVideo: 'penmedia:bg' }
      },
      sections: [
        {
          slug: 'main',
          doc: { type: 'doc', content: [] },
          layers: [
            { id: 'l1', kind: 'video', x: 0, y: 0, w: 100, h: 100, zIndex: 1, videoSrc: huge },
            { id: 'l2', kind: 'image', x: 0, y: 0, w: 100, h: 100, zIndex: 2, imageSrc: 'penlocal:m1' }
          ]
        }
      ],
      chain: { docId: 'doc1', genesis: {}, links: [] }
    } as unknown as LocalDocBundle;
    const stripped = stripInlineMediaFromBundle(bundle);
    expect(JSON.stringify(stripped).length).toBeLessThan(2000);
    expect(stripped.sections[0]?.layers?.[0]?.videoSrc).toBeUndefined();
    expect(stripped.sections[0]?.layers?.[1]?.imageSrc).toBe('penlocal:m1');
    expect(stripped.manifest.pagePresentation?.backgroundImage).toBeUndefined();
    expect(stripped.manifest.pagePresentation?.backgroundVideo).toBe('penmedia:bg');
  });
});
