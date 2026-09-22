import { Node, mergeAttributes } from '@tiptap/core';

export type PenMediaWrap = 'none' | 'left' | 'right';

/** Block video embed with Docs-like wrap attrs (same as PenImage). */
export const PenVideo = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('src') || element.querySelector('source')?.getAttribute('src'),
        renderHTML: (attributes) => {
          if (!attributes.src) return {};
          return { src: attributes.src };
        }
      },
      wrap: {
        default: 'none',
        parseHTML: (element) => element.getAttribute('data-wrap') || 'none',
        renderHTML: (attributes) => {
          if (!attributes.wrap || attributes.wrap === 'none') return {};
          return { 'data-wrap': attributes.wrap };
        }
      }
    };
  },

  parseHTML() {
    return [{ tag: 'video[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(HTMLAttributes, {
        controls: 'true',
        class: 'pen-flow-video'
      })
    ];
  }
});
