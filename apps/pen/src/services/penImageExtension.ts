import Image from '@tiptap/extension-image';

/** TipTap Image with Docs-like wrap: none | left | right. */
export const PenImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      wrap: {
        default: 'none',
        parseHTML: (element) => element.getAttribute('data-wrap') || 'none',
        renderHTML: (attributes) => {
          if (!attributes.wrap || attributes.wrap === 'none') return {};
          return { 'data-wrap': attributes.wrap };
        }
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
        renderHTML: (attributes) => {
          if (!attributes.title) return {};
          return { title: attributes.title };
        }
      }
    };
  }
});

export type PenImageWrap = 'none' | 'left' | 'right';
