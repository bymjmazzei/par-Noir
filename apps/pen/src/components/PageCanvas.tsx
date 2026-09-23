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
  PEN_SYSTEM_FONTS,
  PEN_GOOGLE_FONTS_FEATURED,
  PEN_GOOGLE_FONTS_ALL,
  PEN_FONT_SIZES_PT,
  isGooglePenFont,
  type PenFontIndexEntry,
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
  listPersonalFonts,
  pickFontFile,
  uploadPersonalFont,
  ensureOwnerFontFace,
  getBoundFontsSession
} from '../services/penFontsCloud';
import { ensureGoogleFontLoaded, ensureGoogleFontsLoaded } from '../services/penGoogleFonts';
import { GoogleFontPreviewLabel } from './GoogleFontPreviewLabel';
import {
  ColorAButton,
  RibbonIconBtn,
  RibbonItem,
  RibbonMenu,
  RibbonSep
} from './ribbon/RibbonChrome';
import {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconBulletList,
  IconClear,
  IconIndent,
  IconInsert,
  IconLink,
  IconOrderedList,
  IconOutdent,
  IconSearch,
  IconTable
} from './icons/PenIcons';

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
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [, setTick] = useState(0);
  const [myFonts, setMyFonts] = useState<PenFontIndexEntry[]>(() =>
    pnIdentifier ? listPersonalFonts(pnIdentifier) : []
  );
  const [showAllGoogle, setShowAllGoogle] = useState(false);
  const [fontUploadBusy, setFontUploadBusy] = useState(false);

  useEffect(() => {
    if (!pnIdentifier) {
      setMyFonts([]);
      return;
    }
    const refresh = () => setMyFonts(listPersonalFonts(pnIdentifier));
    refresh();
    window.addEventListener('pen-fonts-changed', refresh);
    window.addEventListener('pen-fonts-merged', refresh);
    return () => {
      window.removeEventListener('pen-fonts-changed', refresh);
      window.removeEventListener('pen-fonts-merged', refresh);
    };
  }, [pnIdentifier]);

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setFindOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setFindOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!editor) return null;
  const ed = editor;

  const fontFamily = String(ed.getAttributes('textStyle').fontFamily || '');
  const fontSize = currentFontSize(ed);
  const color = String(ed.getAttributes('textStyle').color || '#1c1917');
  const highlight = String(ed.getAttributes('highlight').color || '');
  const hLabel = headingLabel(ed);
  const imageSelected = ed.isActive('image');
  const videoSelected = ed.isActive('video');
  const mediaSelected = imageSelected || videoSelected;
  const inTable = ed.isActive('table');
  const wrap = (String(
    (imageSelected ? ed.getAttributes('image').wrap : ed.getAttributes('video').wrap) || 'none'
  ) as PenImageWrap) || 'none';

  function findNext() {
    if (!findQuery.trim()) return;
    const { doc } = ed.state;
    const q = findQuery.toLowerCase();
    let found = false;
    doc.descendants((node, pos) => {
      if (found || !node.isText || !node.text) return;
      const idx = node.text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        ed.chain()
          .focus()
          .setTextSelection({ from: pos + idx, to: pos + idx + findQuery.length })
          .run();
        found = true;
      }
    });
  }

  function replaceOne() {
    if (!findQuery.trim()) return;
    const { from, to } = ed.state.selection;
    const selected = ed.state.doc.textBetween(from, to, '');
    if (selected.toLowerCase() === findQuery.toLowerCase()) {
      ed.chain().focus().insertContent(replaceQuery).run();
    }
    findNext();
  }

  function replaceAll() {
    if (!findQuery.trim()) return;
    const { doc } = ed.state;
    const q = findQuery.toLowerCase();
    const matches: Array<{ from: number; to: number }> = [];
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      let start = 0;
      const lower = node.text.toLowerCase();
      while (true) {
        const idx = lower.indexOf(q, start);
        if (idx < 0) break;
        matches.push({ from: pos + idx, to: pos + idx + findQuery.length });
        start = idx + findQuery.length;
      }
    });
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      ed.chain()
        .focus()
        .deleteRange({ from: m.from, to: m.to })
        .insertContentAt(m.from, replaceQuery)
        .run();
    }
  }

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
        {(close) => {
          const applyFamily = (f: string | null) => {
            if (!f) {
              ed.chain().focus().unsetFontFamily().run();
            } else {
              if (isGooglePenFont(f)) ensureGoogleFontLoaded(f);
              ed.chain().focus().setFontFamily(f).run();
            }
            close();
          };
          const googleList = showAllGoogle
            ? (PEN_GOOGLE_FONTS_ALL as readonly string[])
            : (PEN_GOOGLE_FONTS_FEATURED as readonly string[]);
          return (
            <>
              <div className="pen-ribbon-font-section">My Fonts</div>
              {myFonts.map((entry) => (
                <RibbonItem
                  key={entry.fontId}
                  active={fontFamily === entry.family}
                  onClick={() => {
                    const bound = getBoundFontsSession();
                    if (bound) {
                      void ensureOwnerFontFace({
                        pnIdentifier: bound.pnIdentifier,
                        mlKemSecretKey: bound.mlKemSecretKey,
                        entry
                      }).catch(() => undefined);
                    }
                    applyFamily(entry.family);
                  }}
                >
                  <span style={{ fontFamily: entry.family }}>{entry.family}</span>
                </RibbonItem>
              ))}
              <RibbonItem
                active={false}
                onClick={() => {
                  if (fontUploadBusy) return;
                  void (async () => {
                    const bound = getBoundFontsSession();
                    if (!bound) return;
                    const file = await pickFontFile();
                    if (!file) return;
                    setFontUploadBusy(true);
                    try {
                      const entry = await uploadPersonalFont({
                        pnIdentifier: bound.pnIdentifier,
                        mlKemSecretKey: bound.mlKemSecretKey,
                        file
                      });
                      setMyFonts(listPersonalFonts(bound.pnIdentifier));
                      await ensureOwnerFontFace({
                        pnIdentifier: bound.pnIdentifier,
                        mlKemSecretKey: bound.mlKemSecretKey,
                        entry
                      });
                      applyFamily(entry.family);
                    } catch {
                      /* offline */
                    } finally {
                      setFontUploadBusy(false);
                    }
                  })();
                }}
              >
                {fontUploadBusy ? 'Uploading…' : 'Add font…'}
              </RibbonItem>

              <div className="pen-ribbon-font-section">System</div>
              <RibbonItem active={!fontFamily} onClick={() => applyFamily(null)}>
                Default
              </RibbonItem>
              {PEN_SYSTEM_FONTS.map((f) => (
                <RibbonItem key={f} active={fontFamily === f} onClick={() => applyFamily(f)}>
                  <span style={{ fontFamily: f }}>{f}</span>
                </RibbonItem>
              ))}

              <div className="pen-ribbon-font-section">Google</div>
              {googleList.map((f) => (
                <RibbonItem
                  key={f}
                  active={fontFamily === f}
                  onClick={() => applyFamily(f)}
                >
                  <GoogleFontPreviewLabel family={f} />
                </RibbonItem>
              ))}
              {!showAllGoogle ? (
                <RibbonItem
                  active={false}
                  onClick={() => {
                    // Warm featured + first screen of the full list when expanding.
                    ensureGoogleFontsLoaded([...PEN_GOOGLE_FONTS_FEATURED]);
                    setShowAllGoogle(true);
                  }}
                >
                  Show all Google fonts…
                </RibbonItem>
              ) : (
                <RibbonItem active={false} onClick={() => setShowAllGoogle(false)}>
                  Show fewer Google fonts
                </RibbonItem>
              )}
            </>
          );
        }}
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

      <RibbonSep />

      <RibbonIconBtn
        active={ed.isActive({ textAlign: 'left' })}
        title="Align left"
        onClick={() => ed.chain().focus().setTextAlign('left').run()}
      >
        <IconAlignLeft />
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive({ textAlign: 'center' })}
        title="Align center"
        onClick={() => ed.chain().focus().setTextAlign('center').run()}
      >
        <IconAlignCenter />
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive({ textAlign: 'right' })}
        title="Align right"
        onClick={() => ed.chain().focus().setTextAlign('right').run()}
      >
        <IconAlignRight />
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive({ textAlign: 'justify' })}
        title="Justify"
        onClick={() => ed.chain().focus().setTextAlign('justify').run()}
      >
        <IconAlignJustify />
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive('bulletList')}
        title="Bullet list"
        onClick={() => ed.chain().focus().toggleBulletList().run()}
      >
        <IconBulletList />
      </RibbonIconBtn>
      <RibbonIconBtn
        active={ed.isActive('orderedList')}
        title="Numbered list"
        onClick={() => ed.chain().focus().toggleOrderedList().run()}
      >
        <IconOrderedList />
      </RibbonIconBtn>
      <RibbonIconBtn
        title="Indent"
        onClick={() => ed.chain().focus().sinkListItem('listItem').run()}
      >
        <IconIndent />
      </RibbonIconBtn>
      <RibbonIconBtn
        title="Outdent"
        onClick={() => ed.chain().focus().liftListItem('listItem').run()}
      >
        <IconOutdent />
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
        <IconLink />
      </RibbonIconBtn>

      <RibbonIconBtn title="Find and replace" onClick={() => setFindOpen((v) => !v)}>
        <IconSearch />
      </RibbonIconBtn>

      {mediaSelected && (
        <>
          <RibbonSep />
          <RibbonMenu label={`Wrap · ${wrap === 'none' ? 'Full' : wrap}`} title="Image wrap">
            {(close) =>
              (['none', 'left', 'right'] as PenImageWrap[]).map((w) => (
                <RibbonItem
                  key={w}
                  active={wrap === w}
                  onClick={() => {
                    setWrap(w);
                    close();
                  }}
                >
                  {w === 'none' ? 'Full width' : w === 'left' ? 'Wrap left' : 'Wrap right'}
                </RibbonItem>
              ))
            }
          </RibbonMenu>
        </>
      )}

      {inTable && (
        <>
          <RibbonSep />
          <RibbonMenu label={<IconTable />} title="Table">
            {(close) => (
              <>
                <RibbonItem
                  onClick={() => {
                    ed.chain().focus().addRowBefore().run();
                    close();
                  }}
                >
                  Add row above
                </RibbonItem>
                <RibbonItem
                  onClick={() => {
                    ed.chain().focus().addRowAfter().run();
                    close();
                  }}
                >
                  Add row below
                </RibbonItem>
                <RibbonItem
                  onClick={() => {
                    ed.chain().focus().deleteRow().run();
                    close();
                  }}
                >
                  Delete row
                </RibbonItem>
                <RibbonItem
                  onClick={() => {
                    ed.chain().focus().addColumnBefore().run();
                    close();
                  }}
                >
                  Add column before
                </RibbonItem>
                <RibbonItem
                  onClick={() => {
                    ed.chain().focus().addColumnAfter().run();
                    close();
                  }}
                >
                  Add column after
                </RibbonItem>
                <RibbonItem
                  onClick={() => {
                    ed.chain().focus().deleteColumn().run();
                    close();
                  }}
                >
                  Delete column
                </RibbonItem>
                <RibbonItem
                  onClick={() => {
                    ed.chain().focus().toggleHeaderRow().run();
                    close();
                  }}
                >
                  Toggle header row
                </RibbonItem>
                <RibbonItem
                  onClick={() => {
                    ed.chain().focus().deleteTable().run();
                    close();
                  }}
                >
                  Delete table
                </RibbonItem>
              </>
            )}
          </RibbonMenu>
        </>
      )}

      <RibbonSep />

      <RibbonMenu label={<IconInsert />} title="Insert into flow" wide>
        {(close) => (
          <>
            <RibbonItem
              onClick={() => {
                ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                close();
              }}
            >
              Table
            </RibbonItem>
            <div className="pen-ribbon-menu-divider" />
            <div className="pen-ribbon-menu-hint">Image</div>
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
            <RibbonItem
              onClick={() => {
                attachUrl();
                close();
              }}
            >
              URL…
            </RibbonItem>
            <div className="pen-ribbon-menu-divider" />
            <div className="pen-ribbon-menu-hint">Video</div>
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

      <RibbonIconBtn
        title="Clear formatting"
        onClick={() => ed.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <IconClear />
      </RibbonIconBtn>

      {findOpen && (
        <div className="pen-ribbon-find-bar">
          <input
            className="pen-ribbon-find-input"
            placeholder="Find"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') findNext();
              if (e.key === 'Escape') setFindOpen(false);
            }}
          />
          <input
            className="pen-ribbon-find-input"
            placeholder="Replace"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') replaceOne();
              if (e.key === 'Escape') setFindOpen(false);
            }}
          />
          <button type="button" className="pen-ribbon-find-btn" onClick={findNext}>
            Find
          </button>
          <button type="button" className="pen-ribbon-find-btn" onClick={replaceOne}>
            Replace
          </button>
          <button type="button" className="pen-ribbon-find-btn" onClick={replaceAll}>
            All
          </button>
          <button
            type="button"
            className="pen-ribbon-find-btn"
            onClick={() => setFindOpen(false)}
            aria-label="Close find"
          >
            ×
          </button>
        </div>
      )}
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
        heading: { levels: [1, 2, 3] },
        // Document-level ActivityLedger owns undo (append-only / never discard).
        history: false
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
    <div className="flex h-full flex-col gap-2 overflow-y-auto bg-white p-2">
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
