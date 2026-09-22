import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { PenEmbedView } from '../components/PenEmbedView';

export interface PenEmbedAttrs {
  docId: string | null;
  sectionSlug: string | null;
  title: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    penEmbed: {
      insertPenEmbed: (attrs: {
        docId: string;
        sectionSlug?: string | null;
        title?: string | null;
      }) => ReturnType;
    };
  }
}

/** Live by-reference embed of another Pen doc (or section). */
export const PenEmbed = Node.create<{ pnIdentifier: string }>({
  name: 'penEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      pnIdentifier: ''
    };
  },

  addAttributes() {
    return {
      docId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-doc-id'),
        renderHTML: (attrs) => (attrs.docId ? { 'data-doc-id': attrs.docId } : {})
      },
      sectionSlug: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-section-slug'),
        renderHTML: (attrs) =>
          attrs.sectionSlug ? { 'data-section-slug': attrs.sectionSlug } : {}
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-title'),
        renderHTML: (attrs) => (attrs.title ? { 'data-title': attrs.title } : {})
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-pen-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-pen-embed': '',
        class: 'pen-embed'
      })
    ];
  },

  addCommands() {
    return {
      insertPenEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              docId: attrs.docId,
              sectionSlug: attrs.sectionSlug || null,
              title: attrs.title || null
            }
          })
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(PenEmbedView);
  }
});
