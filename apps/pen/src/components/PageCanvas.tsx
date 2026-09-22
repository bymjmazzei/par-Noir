import React, { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  PEN_FONT_FAMILIES,
  PEN_FONT_SIZES_PT,
  type PenPageLayout,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { FontSize } from '../services/fontSizeExtension';
import { sectionToTipTapDoc, tipTapDocToSection } from '../services/penBlocks';

function ribbonBtn(
  active: boolean,
  onClick: () => void,
  label: React.ReactNode,
  title: string
) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-[13px] ${
        active ? 'bg-sky-100 text-sky-900' : 'text-stone-700 hover:bg-stone-200/80'
      }`}
    >
      {label}
    </button>
  );
}

function currentFontSize(editor: Editor): string {
  const attrs = editor.getAttributes('textStyle');
  return attrs.fontSize ? String(attrs.fontSize).replace(/pt$/i, '') : '';
}

export function FormatRibbon({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const fontFamily = String(editor.getAttributes('textStyle').fontFamily || '');
  const fontSize = currentFontSize(editor);
  const color = String(editor.getAttributes('textStyle').color || '#1c1917');
  const highlight = String(editor.getAttributes('highlight').color || '');

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-300 bg-stone-100 px-2 py-1">
      <select
        className="mr-1 h-7 rounded border border-stone-300 bg-white px-1.5 text-[12px] text-stone-800"
        value={
          editor.isActive('heading', { level: 1 })
            ? 'h1'
            : editor.isActive('heading', { level: 2 })
              ? 'h2'
              : editor.isActive('heading', { level: 3 })
                ? 'h3'
                : 'p'
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
          else if (v === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
          else if (v === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
          else editor.chain().focus().setParagraph().run();
        }}
      >
        <option value="p">Body</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <select
        className="h-7 max-w-[9rem] rounded border border-stone-300 bg-white px-1 text-[12px]"
        value={fontFamily}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
        title="Font"
      >
        <option value="">Font</option>
        {PEN_FONT_FAMILIES.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>

      <select
        className="h-7 rounded border border-stone-300 bg-white px-1 text-[12px]"
        value={fontSize}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(`${v}pt`).run();
        }}
        title="Size"
      >
        <option value="">Size</option>
        {PEN_FONT_SIZES_PT.map((s) => (
          <option key={s} value={String(s)}>
            {s}
          </option>
        ))}
      </select>

      <span className="mx-1 h-5 w-px bg-stone-300" />

      {ribbonBtn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <b>B</b>, 'Bold')}
      {ribbonBtn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <i>I</i>, 'Italic')}
      {ribbonBtn(
        editor.isActive('underline'),
        () => editor.chain().focus().toggleUnderline().run(),
        <span className="underline">U</span>,
        'Underline'
      )}
      {ribbonBtn(
        editor.isActive('strike'),
        () => editor.chain().focus().toggleStrike().run(),
        <span className="line-through">S</span>,
        'Strikethrough'
      )}

      <label className="ml-1 inline-flex h-7 items-center gap-1 rounded border border-stone-300 bg-white px-1 text-[11px] text-stone-600">
        A
        <input
          type="color"
          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
          value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#1c1917'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          title="Text color"
        />
      </label>
      <label className="inline-flex h-7 items-center gap-1 rounded border border-stone-300 bg-white px-1 text-[11px] text-stone-600">
        H
        <input
          type="color"
          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
          value={/^#[0-9a-fA-F]{6}$/.test(highlight) ? highlight : '#fef08a'}
          onChange={(e) =>
            editor.chain().focus().toggleHighlight({ color: e.target.value }).run()
          }
          title="Highlight"
        />
      </label>

      <span className="mx-1 h-5 w-px bg-stone-300" />

      {ribbonBtn(
        editor.isActive({ textAlign: 'left' }),
        () => editor.chain().focus().setTextAlign('left').run(),
        '☰',
        'Align left'
      )}
      {ribbonBtn(
        editor.isActive({ textAlign: 'center' }),
        () => editor.chain().focus().setTextAlign('center').run(),
        '≡',
        'Align center'
      )}
      {ribbonBtn(
        editor.isActive({ textAlign: 'right' }),
        () => editor.chain().focus().setTextAlign('right').run(),
        '☰',
        'Align right'
      )}
      {ribbonBtn(
        editor.isActive({ textAlign: 'justify' }),
        () => editor.chain().focus().setTextAlign('justify').run(),
        '≣',
        'Justify'
      )}

      <span className="mx-1 h-5 w-px bg-stone-300" />

      {ribbonBtn(
        editor.isActive('bulletList'),
        () => editor.chain().focus().toggleBulletList().run(),
        '•',
        'Bullet list'
      )}
      {ribbonBtn(
        editor.isActive('orderedList'),
        () => editor.chain().focus().toggleOrderedList().run(),
        '1.',
        'Numbered list'
      )}
      {ribbonBtn(
        editor.isActive('blockquote'),
        () => editor.chain().focus().toggleBlockquote().run(),
        '“”',
        'Quote'
      )}
      {ribbonBtn(false, () => editor.chain().focus().setHorizontalRule().run(), '—', 'Horizontal rule')}

      <span className="mx-1 h-5 w-px bg-stone-300" />

      <button
        type="button"
        title="Link"
        className="h-7 rounded px-2 text-[12px] text-stone-700 hover:bg-stone-200/80"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          const href = window.prompt('Link URL');
          if (href?.trim()) {
            editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
          }
        }}
      >
        Link
      </button>
      <button
        type="button"
        title="Insert table"
        className="h-7 rounded px-2 text-[12px] text-stone-700 hover:bg-stone-200/80"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        Table
      </button>
      <button
        type="button"
        title="Insert image"
        className="h-7 rounded px-2 text-[12px] text-stone-700 hover:bg-stone-200/80"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const src = window.prompt('Image URL');
          if (src?.trim()) editor.chain().focus().setImage({ src: src.trim() }).run();
        }}
      >
        Image
      </button>
      <button
        type="button"
        title="Clear formatting"
        className="h-7 rounded px-2 text-[12px] text-stone-700 hover:bg-stone-200/80"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        Clear
      </button>
    </div>
  );
}

const PAGE_LAYOUT_CLASS: Record<PenPageLayout, string> = {
  flow: 'max-w-[40rem]',
  letter: 'pen-page-letter',
  a4: 'pen-page-a4'
};

/** Word-like text input for one template section. */
export function PageCanvas({
  section,
  sectionTitle,
  onChange,
  readOnly,
  onEditorReady,
  pageLayout = 'flow'
}: {
  section: PenSectionContent;
  sectionTitle?: string;
  onChange: (next: PenSectionContent) => void;
  readOnly?: boolean;
  onEditorReady?: (editor: Editor | null) => void;
  pageLayout?: PenPageLayout;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] }
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({
        placeholder: sectionTitle ? `Write ${sectionTitle.toLowerCase()}…` : 'Start typing…'
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] })
    ],
    editable: !readOnly,
    content: sectionToTipTapDoc(section),
    editorProps: {
      attributes: {
        class: 'pen-word-prose outline-none min-h-[18rem]'
      }
    },
    onUpdate: ({ editor: ed }) => {
      onChange(tipTapDocToSection(section.slug, ed.getJSON()));
    }
  });

  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const next = sectionToTipTapDoc(section);
    const cur = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(next);
    if (cur !== incoming) {
      editor.commands.setContent(next, false);
    }
  }, [section.slug, editor]);

  const sheetClass = PAGE_LAYOUT_CLASS[pageLayout] || PAGE_LAYOUT_CLASS.flow;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f3f3f3]">
      <div className="shrink-0 border-b border-stone-300 bg-white px-4 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
          Writing
        </div>
        <div className="text-sm font-medium text-stone-800">{sectionTitle || section.slug}</div>
      </div>
      <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
        <div
          className={`mx-auto min-h-full rounded-sm bg-white px-10 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] ${sheetClass}`}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

export function PageThumbGrid({
  toc,
  active,
  previews,
  onSelect
}: {
  toc: string[];
  active: string;
  previews: Record<string, string>;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto bg-stone-200/80 p-2">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        Pages
      </div>
      {toc.map((slug, i) => (
        <button
          key={slug}
          type="button"
          onClick={() => onSelect(slug)}
          className={`w-full rounded border bg-white p-1.5 text-left shadow-sm transition ${
            active === slug ? 'border-sky-500 ring-1 ring-sky-400' : 'border-stone-300 hover:border-stone-400'
          }`}
        >
          <div
            className="mx-auto aspect-[8.5/11] w-full overflow-hidden bg-white text-[7px] leading-tight text-stone-600"
            style={{ padding: '8%' }}
          >
            <div className="line-clamp-[14] whitespace-pre-wrap">
              {previews[slug]?.trim() || slug}
            </div>
          </div>
          <div className="mt-1 truncate text-center text-[10px] text-stone-500">
            {i + 1}. {slug}
          </div>
        </button>
      ))}
    </div>
  );
}
