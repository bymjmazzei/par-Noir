/** TipTap extensions for Pen's writing editor. Live co-editing uses the same schema. */

import { getSchema, type Extensions } from '@tiptap/react';
import type { Schema } from '@tiptap/pm/model';
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
import { checkLink } from '@par-noir/pen-protocol';
import { FontSize } from './fontSizeExtension';
import { TextEffects } from './textEffectsExtension';
import { PenImage } from './penImageExtension';
import { PenVideo } from './penVideoExtension';
import { PenEmbed } from './penEmbedExtension';

function proseLinkAllowed(url: string): boolean {
  if (/^mailto:/i.test(url.trim())) return true;
  return checkLink(url).ok;
}

export function penEditorExtensions(opts: {
  pnIdentifier?: string;
  sectionTitle?: string;
} = {}): Extensions {
  return [
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
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      isAllowedUri: (url) => proseLinkAllowed(url)
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    PenImage.configure({ inline: false, allowBase64: true }),
    PenVideo,
    PenEmbed.configure({ pnIdentifier: opts.pnIdentifier || '' }),
    Placeholder.configure({
      placeholder: opts.sectionTitle
        ? `Write ${opts.sectionTitle.toLowerCase()}…`
        : 'Start typing…'
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] })
  ];
}

let schema: Schema | null = null;

export function penEditorSchema(): Schema {
  if (!schema) schema = getSchema(penEditorExtensions());
  return schema;
}
