import { describe, it, expect } from 'vitest';
import {
  docToHtml,
  docToPlainText,
  emptyTipTapDoc,
  normalizeSection
} from '@par-noir/pen-protocol';
import { tipTapDocToSection, sectionToTipTapDoc } from './penBlocks';

describe('penBlocks TipTap SoT', () => {
  it('round-trips rich marks through section.doc', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [
            {
              type: 'text',
              text: 'Hello',
              marks: [
                { type: 'bold' },
                {
                  type: 'textStyle',
                  attrs: { fontFamily: 'Georgia', fontSize: '18pt', color: '#ff0000' }
                }
              ]
            },
            { type: 'text', text: ' world', marks: [{ type: 'underline' }] }
          ]
        }
      ]
    };
    const section = tipTapDocToSection('body', doc as never);
    expect(section.doc.type).toBe('doc');
    const back = sectionToTipTapDoc(section);
    expect(JSON.stringify(back)).toBe(JSON.stringify(doc));
    expect(docToPlainText(section.doc)).toBe('Hello world');
    const html = docToHtml(section.doc);
    expect(html).toContain('<strong>');
    expect(html).toContain('font-family:Georgia');
    expect(html).toContain('<u>');
  });

  it('normalizes legacy blocks on load', () => {
    const sec = normalizeSection({
      slug: 'body',
      blocks: [{ id: '1', type: 'paragraph', text: '**Hi**' }]
    } as never);
    expect(sec.doc.type).toBe('doc');
    expect(docToHtml(sec.doc)).toContain('<strong>Hi</strong>');
  });

  it('emptyTipTapDoc is valid', () => {
    expect(emptyTipTapDoc().type).toBe('doc');
  });
});
