import { useEffect, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
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
import { TextEffects } from '../services/textEffectsExtension';
import { PenImage, type PenImageWrap } from '../services/penImageExtension';
import { PenVideo } from '../services/penVideoExtension';
import { PenEmbed } from '../services/penEmbedExtension';
import { sectionToTipTapDoc, tipTapDocToSection } from '../services/penBlocks';
import { PEN_STICKERS } from '../services/stickerPack';
import {
  downloadCloudImageAsDataUrl,
  fileToDataUrl,
  listCloudImages,
  pickDeviceImageFile,
  uploadDeviceImageToDrive,
  type CloudImageItem
} from '../services/penAttach';
import { listLocalDocs, loadLocalDoc, type LocalDocSummary } from '../services/penLocalStore';
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

function insertImage(
  editor: Editor,
  src: string,
  alt: string,
  onImageInserted?: (src: string, alt?: string) => void
) {
  editor.chain().focus().setImage({ src, alt, title: alt }).run();
  onImageInserted?.(src, alt);
}

function AttachPaperclipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.4 11.6l-8.5 8.5a5.5 5.5 0 01-7.8-7.8l9.2-9.2a3.5 3.5 0 015 5l-9.2 9.2a1.5 1.5 0 01-2.1-2.1l8.1-8.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FormatRibbon({
  editor,
  accessToken,
  onImageInserted,
  pnIdentifier,
  excludeDocId
}: {
  editor: Editor | null;
  accessToken?: string;
  onImageInserted?: (src: string, alt?: string) => void;
  /** Required for Attach → From Pen live embeds. */
  pnIdentifier?: string;
  /** Current doc — excluded from embed picker (no self-embed). */
  excludeDocId?: string;
}) {
  const [cloudFiles, setCloudFiles] = useState<CloudImageItem[] | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [penDocs, setPenDocs] = useState<LocalDocSummary[] | null>(null);
  const [penPickDocId, setPenPickDocId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((n) => n + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);

  if (!editor) return null;
  const ed = editor;

  const fontFamily = String(ed.getAttributes('textStyle').fontFamily || '');
  const fontSize = currentFontSize(ed);
  const color = String(ed.getAttributes('textStyle').color || '#1c1917');
  const highlight = String(ed.getAttributes('highlight').color || '');
  const textShadow = String(ed.getAttributes('textStyle').textShadow || '');
  const textBlur = String(ed.getAttributes('textStyle').textBlur || '');
  const hLabel = headingLabel(ed);
  const imageSelected = ed.isActive('image');
  const videoSelected = ed.isActive('video');
  const mediaSelected = imageSelected || videoSelected;
  const wrap = (String(
    (imageSelected ? ed.getAttributes('image').wrap : ed.getAttributes('video').wrap) || 'none'
  ) as PenImageWrap) || 'none';

  async function loadCloud() {
    if (!accessToken) {
      setCloudError('Unlock required');
      return;
    }
    setCloudLoading(true);
    setCloudError(null);
    try {
      setCloudFiles(await listCloudImages(accessToken));
    } catch {
      setCloudError('Could not list Drive images');
      setCloudFiles([]);
    } finally {
      setCloudLoading(false);
    }
  }

  async function attachDevice() {
    const file = await pickDeviceImageFile();
    if (!file) return;
    const src = await fileToDataUrl(file);
    if (!src) return;
    insertImage(ed, src, file.name || 'image', onImageInserted);
    if (accessToken) void uploadDeviceImageToDrive(accessToken, file);
  }

  async function attachCloud(fileId: string, name: string) {
    if (!accessToken) return;
    const src = await downloadCloudImageAsDataUrl(accessToken, fileId);
    insertImage(ed, src, name, onImageInserted);
  }

  function attachUrl() {
    const src = window.prompt('Image URL');
    if (src?.trim()) insertImage(ed, src.trim(), 'image', onImageInserted);
  }

  function setWrap(next: PenImageWrap) {
    if (imageSelected) {
      ed.chain().focus().updateAttributes('image', { wrap: next }).run();
      return;
    }
    if (videoSelected) {
      ed.chain().focus().updateAttributes('video', { wrap: next }).run();
    }
  }

  function insertVideoFromUrl() {
    const src = window.prompt('Video URL (mp4 / webm / https)');
    if (!src?.trim()) return;
    ed.chain()
      .focus()
      .insertContent({ type: 'video', attrs: { src: src.trim(), wrap: 'none' } })
      .run();
  }

  async function insertVideoFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const src = await fileToDataUrl(file);
      if (!src) return;
      ed.chain()
        .focus()
        .insertContent({ type: 'video', attrs: { src, wrap: 'none' } })
        .run();
    };
    input.click();
  }

  return (
    <div className="pen-ribbon">
      <RibbonMenu label={<span className="pen-ribbon-h-label">{hLabel}</span>} title="Styles">
        {(close) => (
          <>
            <RibbonItem
              active={hLabel === 'H'}
              onClick={() => {
                ed.chain().focus().setParagraph().run();
                close();
              }}
            >
              Body
            </RibbonItem>
            <RibbonItem
              active={hLabel === 'H1'}
              onClick={() => {
                ed.chain().focus().toggleHeading({ level: 1 }).run();
                close();
              }}
            >
              Heading 1
            </RibbonItem>
            <RibbonItem
              active={hLabel === 'H2'}
              onClick={() => {
                ed.chain().focus().toggleHeading({ level: 2 }).run();
                close();
              }}
            >
              Heading 2
            </RibbonItem>
            <RibbonItem
              active={hLabel === 'H3'}
              onClick={() => {
                ed.chain().focus().toggleHeading({ level: 3 }).run();
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
          <span className="pen-ribbon-font-label" style={{ fontFamily: fontFamily || 'Source Serif 4' }}>
            {fontFamily || 'Source Serif 4'}
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
                ed.chain().focus().unsetFontFamily().run();
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
                  ed.chain().focus().setFontFamily(f).run();
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
                ed.chain().focus().setFontSize(`${s}pt`).run();
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
        active={ed.isActive('bold')}
        title="Bold"
        onClick={() => ed.chain().focus().toggleBold().run()}
      >
        <b>B</b>
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive('italic')}
        title="Italic"
        onClick={() => ed.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive('underline')}
        title="Underline"
        onClick={() => ed.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive('strike')}
        title="Strikethrough"
        onClick={() => ed.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </RibbonIconBtn>

      <ColorAButton
        mode="text"
        color={color}
        title="Text color"
        onChange={(hex) => ed.chain().focus().setColor(hex).run()}
      />
      <ColorAButton
        mode="highlight"
        color={highlight || '#fef08a'}
        title="Highlight"
        onChange={(hex) => ed.chain().focus().toggleHighlight({ color: hex }).run()}
      />

      <RibbonMenu label={textShadow ? 'Sh' : 'Sh'} title="Text shadow">
        {(close) => (
          <>
            <RibbonItem
              active={!textShadow}
              onClick={() => {
                ed.chain().focus().unsetTextShadow().run();
                close();
              }}
            >
              None
            </RibbonItem>
            <RibbonItem
              active={textShadow.includes('1px 2px')}
              onClick={() => {
                ed.chain().focus().setTextShadow('0 1px 2px rgba(0,0,0,0.45)').run();
                close();
              }}
            >
              Soft
            </RibbonItem>
            <RibbonItem
              active={textShadow.includes('2px 4px')}
              onClick={() => {
                ed.chain().focus().setTextShadow('0 2px 4px rgba(0,0,0,0.55)').run();
                close();
              }}
            >
              Strong
            </RibbonItem>
          </>
        )}
      </RibbonMenu>

      <RibbonMenu label={textBlur ? `Bl ${textBlur}` : 'Bl'} title="Text blur">
        {(close) => (
          <>
            {(['', '0.5px', '1px', '2px', '4px'] as const).map((b) => (
              <RibbonItem
                key={b || 'none'}
                active={(textBlur || '') === b}
                onClick={() => {
                  if (!b) ed.chain().focus().unsetTextBlur().run();
                  else ed.chain().focus().setTextBlur(b).run();
                  close();
                }}
              >
                {b || 'None'}
              </RibbonItem>
            ))}
          </>
        )}
      </RibbonMenu>

      <RibbonSep />

      <RibbonIconBtn
        active={ed.isActive({ textAlign: 'left' })}
        title="Align left"
        onClick={() => ed.chain().focus().setTextAlign('left').run()}
      >
        ☰
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive({ textAlign: 'center' })}
        title="Align center"
        onClick={() => ed.chain().focus().setTextAlign('center').run()}
      >
        ≡
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive({ textAlign: 'right' })}
        title="Align right"
        onClick={() => ed.chain().focus().setTextAlign('right').run()}
      >
        ☰
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive({ textAlign: 'justify' })}
        title="Justify"
        onClick={() => ed.chain().focus().setTextAlign('justify').run()}
      >
        ≣
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive('bulletList')}
        title="Bullet list"
        onClick={() => ed.chain().focus().toggleBulletList().run()}
      >
        •
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive('orderedList')}
        title="Numbered list"
        onClick={() => ed.chain().focus().toggleOrderedList().run()}
      >
        1.
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive('blockquote')}
        title="Quote"
        onClick={() => ed.chain().focus().toggleBlockquote().run()}
      >
        “”
      </RibbonIconBtn>
      <RibbonIconBtn
        title="Horizontal rule"
        onClick={() => ed.chain().focus().setHorizontalRule().run()}
      >
        —
      </RibbonIconBtn>

      <RibbonSep />

      <RibbonIconBtn
        active={ed.isActive('link')}
        title="Link"
        onClick={() => {
          if (ed.isActive('link')) {
            ed.chain().focus().unsetLink().run();
            return;
          }
          const href = window.prompt('Link URL');
          if (href?.trim()) {
            ed.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
          }
        }}
      >
        Link
      </RibbonIconBtn>
      <RibbonIconBtn
        title="Insert table"
        onClick={() =>
          ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        Table
      </RibbonIconBtn>

      <RibbonMenu label={<AttachPaperclipIcon />} title="Attach" wide>
        {(close) => (
          <>
            <RibbonItem
              onClick={() => {
                void attachDevice().then(close);
              }}
            >
              Device…
            </RibbonItem>
            <RibbonItem
              onClick={() => {
                void loadCloud();
              }}
            >
              Cloud{accessToken ? '' : ' (unlock)'}…
            </RibbonItem>
            {cloudLoading && <div className="pen-ribbon-menu-hint">Loading…</div>}
            {cloudError && <div className="pen-ribbon-menu-hint is-error">{cloudError}</div>}
            {cloudFiles &&
              cloudFiles.slice(0, 20).map((f) => (
                <RibbonItem
                  key={f.id}
                  onClick={() => {
                    void attachCloud(f.id, f.name).then(close);
                  }}
                >
                  {f.name}
                </RibbonItem>
              ))}
            {cloudFiles && cloudFiles.length === 0 && !cloudLoading && (
              <div className="pen-ribbon-menu-hint">No images found</div>
            )}
            <RibbonItem
              onClick={() => {
                attachUrl();
                close();
              }}
            >
              URL…
            </RibbonItem>
            <div className="pen-ribbon-menu-divider" />
            <RibbonItem
              onClick={() => {
                if (!pnIdentifier) return;
                setPenPickDocId(null);
                setPenDocs(
                  listLocalDocs(pnIdentifier).filter((d) => d.docId !== excludeDocId)
                );
              }}
            >
              From Pen…
            </RibbonItem>
            {penDocs && !penPickDocId && (
              <>
                {penDocs.length === 0 && (
                  <div className="pen-ribbon-menu-hint">No other documents</div>
                )}
                {penDocs.slice(0, 24).map((d) => (
                  <RibbonItem
                    key={d.docId}
                    onClick={() => {
                      setPenPickDocId(d.docId);
                    }}
                  >
                    {d.title || 'Untitled'}
                  </RibbonItem>
                ))}
              </>
            )}
            {penDocs && penPickDocId && pnIdentifier && (
              <>
                <RibbonItem
                  onClick={() => {
                    setPenPickDocId(null);
                  }}
                >
                  ← Back
                </RibbonItem>
                <RibbonItem
                  onClick={() => {
                    const d = penDocs.find((x) => x.docId === penPickDocId);
                    ed.chain()
                      .focus()
                      .insertPenEmbed({
                        docId: penPickDocId,
                        title: d?.title || null,
                        sectionSlug: null
                      })
                      .run();
                    setPenDocs(null);
                    setPenPickDocId(null);
                    close();
                  }}
                >
                  Whole document
                </RibbonItem>
                {(loadLocalDoc(pnIdentifier, penPickDocId)?.sections || []).map((s) => (
                  <RibbonItem
                    key={s.slug}
                    onClick={() => {
                      const d = penDocs.find((x) => x.docId === penPickDocId);
                      ed.chain()
                        .focus()
                        .insertPenEmbed({
                          docId: penPickDocId,
                          title: d?.title || null,
                          sectionSlug: s.slug
                        })
                        .run();
                      setPenDocs(null);
                      setPenPickDocId(null);
                      close();
                    }}
                  >
                    Section: {s.slug}
                  </RibbonItem>
                ))}
              </>
            )}
            <div className="pen-ribbon-menu-divider" />
            <div className="pen-ribbon-sticker-grid">
              {PEN_STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.label}
                  className="pen-ribbon-sticker"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    insertImage(ed, s.src, s.label, onImageInserted);
                    close();
                  }}
                >
                  <img src={s.src} alt={s.label} />
                </button>
              ))}
            </div>
          </>
        )}
      </RibbonMenu>

      <RibbonMenu
        label="Wrap"
        title={mediaSelected ? 'Wrap text' : 'Select an image or video to wrap'}
      >
        {(close) => (
          <>
            {(['none', 'left', 'right'] as PenImageWrap[]).map((w) => (
              <RibbonItem
                key={w}
                active={mediaSelected && wrap === w}
                onClick={() => {
                  setWrap(w);
                  close();
                }}
              >
                {w === 'none' ? 'Full width' : w === 'left' ? 'Wrap left' : 'Wrap right'}
              </RibbonItem>
            ))}
          </>
        )}
      </RibbonMenu>

      <RibbonMenu label="Video" title="Insert video">
        {(close) => (
          <>
            <RibbonItem
              onClick={() => {
                void insertVideoFromFile();
                close();
              }}
            >
              From device…
            </RibbonItem>
            <RibbonItem
              onClick={() => {
                insertVideoFromUrl();
                close();
              }}
            >
              URL…
            </RibbonItem>
          </>
        )}
      </RibbonMenu>

      <RibbonIconBtn
        title="Clear formatting"
        onClick={() => ed.chain().focus().unsetAllMarks().clearNodes().run()}
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
  pageLayout = 'flow',
  pnIdentifier = ''
}: {
  section: PenSectionContent;
  sectionTitle?: string;
  onChange: (next: PenSectionContent) => void;
  readOnly?: boolean;
  onEditorReady?: (editor: Editor | null) => void;
  pageLayout?: PenPageLayout;
  /** Unlocks live Pen embeds inside TipTap. */
  pnIdentifier?: string;
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
      TextEffects,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      PenImage.configure({ inline: false, allowBase64: true }),
      PenVideo,
      PenEmbed.configure({ pnIdentifier }),
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
