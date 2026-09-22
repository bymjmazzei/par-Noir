import React, { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import type { PenSectionContent } from '@par-noir/pen-protocol';
import { sectionToTipTapDoc, tipTapDocToSection } from '../services/penBlocks';

export function FormatRibbon({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, label: React.ReactNode, title: string) => (
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

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-300 bg-stone-100 px-2 py-1">
      <select
        className="mr-1 h-7 rounded border border-stone-300 bg-white px-1.5 text-[12px] text-stone-800"
        value={
          editor.isActive('heading', { level: 1 })
            ? 'h1'
            : editor.isActive('heading', { level: 2 })
              ? 'h2'
              : 'p'
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
          else if (v === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
          else editor.chain().focus().setParagraph().run();
        }}
      >
        <option value="p">Body</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
      </select>

      <span className="mx-1 h-5 w-px bg-stone-300" />

      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <b>B</b>, 'Bold')}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <i>I</i>, 'Italic')}
      {btn(
        editor.isActive('underline'),
        () => editor.chain().focus().toggleUnderline().run(),
        <span className="underline">U</span>,
        'Underline'
      )}

      <span className="mx-1 h-5 w-px bg-stone-300" />

      {btn(
        editor.isActive({ textAlign: 'left' }),
        () => editor.chain().focus().setTextAlign('left').run(),
        '☰',
        'Align left'
      )}
      {btn(
        editor.isActive({ textAlign: 'center' }),
        () => editor.chain().focus().setTextAlign('center').run(),
        '≡',
        'Align center'
      )}
      {btn(
        editor.isActive({ textAlign: 'right' }),
        () => editor.chain().focus().setTextAlign('right').run(),
        '☰',
        'Align right'
      )}
      {btn(
        editor.isActive({ textAlign: 'justify' }),
        () => editor.chain().focus().setTextAlign('justify').run(),
        '≣',
        'Justify'
      )}

      <span className="mx-1 h-5 w-px bg-stone-300" />

      {btn(
        editor.isActive('bulletList'),
        () => editor.chain().focus().toggleBulletList().run(),
        '• List',
        'Bullet list'
      )}
      {btn(
        editor.isActive('blockquote'),
        () => editor.chain().focus().toggleBlockquote().run(),
        '“”',
        'Quote'
      )}

      <span className="mx-1 h-5 w-px bg-stone-300" />

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
    </div>
  );
}

/** Letter-sized page canvas with TipTap flow (Word/Quark-style). */
export function PageCanvas({
  section,
  onChange,
  readOnly,
  onEditorReady
}: {
  section: PenSectionContent;
  onChange: (next: PenSectionContent) => void;
  readOnly?: boolean;
  onEditorReady?: (editor: Editor | null) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] }
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: 'Start typing…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] })
    ],
    editable: !readOnly,
    content: sectionToTipTapDoc(section),
    editorProps: {
      attributes: {
        class: 'pen-page-prose outline-none min-h-full'
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

  // Reload when switching sections
  useEffect(() => {
    if (!editor) return;
    const next = sectionToTipTapDoc(section);
    const cur = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(next);
    if (cur !== incoming) {
      editor.commands.setContent(next, false);
    }
  }, [section.slug, editor]);

  return (
    <div className="pen-pasteboard flex flex-1 justify-center overflow-auto px-4 py-8">
      <div className="pen-letter-page relative bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]">
        {/* margin guides */}
        <div className="pointer-events-none absolute inset-0 border border-transparent [border-width:0.75in] [border-color:transparent]">
          <div className="h-full w-full border border-dashed border-sky-200/60" />
        </div>
        <div className="pen-letter-margins relative">
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
