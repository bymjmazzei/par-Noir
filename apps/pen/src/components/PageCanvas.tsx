import { useEffect } from 'react';
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
import { PEN_STICKERS } from '../services/stickerPack';
import {
  ColorAButton,
  RibbonIconBtn,
  RibbonItem,
  RibbonMenu,
  RibbonSep
} from './ribbon/RibbonChrome';

function currentFontSize(editor: Editor): string {
  const attrs = editor.getAttributes('textStyle');
  return attrs.fontSize ? String(attrs.fontSize).replace(/pt$/i, '') : '';
}

function headingLabel(editor: Editor): string {
  if (editor.isActive('heading', { level: 1 })) return 'H1';
  if (editor.isActive('heading', { level: 2 })) return 'H2';
  if (editor.isActive('heading', { level: 3 })) return 'H3';
  return 'H';
}

export function FormatRibbon({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const fontFamily = String(editor.getAttributes('textStyle').fontFamily || '');
  const fontSize = currentFontSize(editor);
  const color = String(editor.getAttributes('textStyle').color || '#1c1917');
  const highlight = String(editor.getAttributes('highlight').color || '');
  const hLabel = headingLabel(editor);

  return (
    <div className="pen-ribbon">
      <RibbonMenu label={<span className="pen-ribbon-h-label">{hLabel}</span>} title="Styles">
        {(close) => (
          <>
            <RibbonItem
              active={hLabel === 'H'}
              onClick={() => {
                editor.chain().focus().setParagraph().run();
                close();
              }}
            >
              Body
            </RibbonItem>
            <RibbonItem
              active={hLabel === 'H1'}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 1 }).run();
                close();
              }}
            >
              Heading 1
            </RibbonItem>
            <RibbonItem
              active={hLabel === 'H2'}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 2 }).run();
                close();
              }}
            >
              Heading 2
            </RibbonItem>
            <RibbonItem
              active={hLabel === 'H3'}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 3 }).run();
                close();
              }}
            >
              Heading 3
            </RibbonItem>
          </>
        )}
      </RibbonMenu>

      <RibbonMenu
        label={
          <span className="pen-ribbon-font-label" style={{ fontFamily: fontFamily || undefined }}>
            {fontFamily || 'Font'}
          </span>
        }
        title="Font"
        wide
      >
        {(close) => (
          <>
            <RibbonItem
              active={!fontFamily}
              onClick={() => {
                editor.chain().focus().unsetFontFamily().run();
                close();
              }}
            >
              Default
            </RibbonItem>
            {PEN_FONT_FAMILIES.map((f) => (
              <RibbonItem
                key={f}
                active={fontFamily === f}
                onClick={() => {
                  editor.chain().focus().setFontFamily(f).run();
                  close();
                }}
              >
                <span style={{ fontFamily: f }}>{f}</span>
              </RibbonItem>
            ))}
          </>
        )}
      </RibbonMenu>

      <RibbonMenu label={fontSize || '11'} title="Size">
        {(close) =>
          PEN_FONT_SIZES_PT.map((s) => (
            <RibbonItem
              key={s}
              active={fontSize === String(s)}
              onClick={() => {
                editor.chain().focus().setFontSize(`${s}pt`).run();
                close();
              }}
            >
              {s}
            </RibbonItem>
          ))
        }
      </RibbonMenu>

      <RibbonSep />

      <RibbonIconBtn
        active={editor.isActive('bold')}
        title="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <b>B</b>
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive('italic')}
        title="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive('underline')}
        title="Underline"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive('strike')}
        title="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </RibbonIconBtn>

      <ColorAButton
        mode="text"
        color={color}
        title="Text color"
        onChange={(hex) => editor.chain().focus().setColor(hex).run()}
      />
      <ColorAButton
        mode="highlight"
        color={highlight || '#fef08a'}
        title="Highlight"
        onChange={(hex) => editor.chain().focus().toggleHighlight({ color: hex }).run()}
      />

      <RibbonSep />

      <RibbonIconBtn
        active={editor.isActive({ textAlign: 'left' })}
        title="Align left"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        ☰
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive({ textAlign: 'center' })}
        title="Align center"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        ≡
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive({ textAlign: 'right' })}
        title="Align right"
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        ☰
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive({ textAlign: 'justify' })}
        title="Justify"
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      >
        ≣
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive('bulletList')}
        title="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive('orderedList')}
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </RibbonIconBtn>
      <RibbonIconBtn
        active={editor.isActive('blockquote')}
        title="Quote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        “”
      </RibbonIconBtn>
      <RibbonIconBtn
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        —
      </RibbonIconBtn>

      <RibbonSep />

      <RibbonIconBtn
        active={editor.isActive('link')}
        title="Link"
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
      </RibbonIconBtn>
      <RibbonIconBtn
        title="Insert table"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        Table
      </RibbonIconBtn>
      <RibbonIconBtn
        title="Insert image"
        onClick={() => {
          const src = window.prompt('Image URL');
          if (src?.trim()) editor.chain().focus().setImage({ src: src.trim() }).run();
        }}
      >
        Image
      </RibbonIconBtn>
      <RibbonMenu label="Stickers" title="Stickers" wide>
        {(close) => (
          <div className="pen-ribbon-sticker-grid">
            {PEN_STICKERS.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.label}
                className="pen-ribbon-sticker"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: s.src, alt: s.label, title: 'sticker' })
                    .run();
                  close();
                }}
              >
                <img src={s.src} alt={s.label} />
              </button>
            ))}
          </div>
        )}
      </RibbonMenu>
      <RibbonIconBtn
        title="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        Clear
      </RibbonIconBtn>
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
