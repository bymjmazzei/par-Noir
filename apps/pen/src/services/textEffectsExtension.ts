import { Extension } from '@tiptap/core';
import '@tiptap/extension-text-style';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textEffects: {
      setTextShadow: (shadow: string) => ReturnType;
      unsetTextShadow: () => ReturnType;
      setTextBlur: (blur: string) => ReturnType;
      unsetTextBlur: () => ReturnType;
    };
  }
}

/** TipTap textStyle attrs for text-shadow and CSS filter blur. */
export const TextEffects = Extension.create({
  name: 'textEffects',
  addOptions() {
    return {
      types: ['textStyle']
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textShadow: {
            default: null,
            parseHTML: (element) => element.style.textShadow || null,
            renderHTML: (attributes) => {
              if (!attributes.textShadow) return {};
              return { style: `text-shadow: ${attributes.textShadow}` };
            }
          },
          textBlur: {
            default: null,
            parseHTML: (element) => {
              const f = element.style.filter || '';
              const m = f.match(/blur\(([^)]+)\)/);
              return m?.[1] || null;
            },
            renderHTML: (attributes) => {
              if (!attributes.textBlur) return {};
              return { style: `filter: blur(${attributes.textBlur})` };
            }
          }
        }
      }
    ];
  },
  addCommands() {
    return {
      setTextShadow:
        (shadow: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { textShadow: shadow }).run(),
      unsetTextShadow:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { textShadow: null }).removeEmptyTextStyle().run(),
      setTextBlur:
        (blur: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { textBlur: blur }).run(),
      unsetTextBlur:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { textBlur: null }).removeEmptyTextStyle().run()
    };
  }
});
