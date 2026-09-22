/**
 * Escape + serialize TipTap JSON to safe HTML for preview / optional browse.
 * No React dependency — apps wrap with dangerouslySetInnerHTML or parse.
 */

import type { PenTipTapMark, PenTipTapNode } from './types.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styleFromMarks(marks: PenTipTapMark[] | undefined): {
  open: string[];
  close: string[];
  style: string;
} {
  const open: string[] = [];
  const close: string[] = [];
  const styles: string[] = [];
  if (!marks?.length) return { open, close, style: '' };

  for (const m of marks) {
    switch (m.type) {
      case 'bold':
        open.push('<strong>');
        close.unshift('</strong>');
        break;
      case 'italic':
        open.push('<em>');
        close.unshift('</em>');
        break;
      case 'underline':
        open.push('<u>');
        close.unshift('</u>');
        break;
      case 'strike':
        open.push('<s>');
        close.unshift('</s>');
        break;
      case 'code':
        open.push('<code>');
        close.unshift('</code>');
        break;
      case 'link': {
        const href = esc(String(m.attrs?.href || '#'));
        open.push(`<a href="${href}" rel="noopener noreferrer" target="_blank">`);
        close.unshift('</a>');
        break;
      }
      case 'textStyle': {
        const fontFamily = m.attrs?.fontFamily ? String(m.attrs.fontFamily) : '';
        const fontSize = m.attrs?.fontSize ? String(m.attrs.fontSize) : '';
        const color = m.attrs?.color ? String(m.attrs.color) : '';
        const textShadow = m.attrs?.textShadow ? String(m.attrs.textShadow) : '';
        const textBlur = m.attrs?.textBlur ? String(m.attrs.textBlur) : '';
        if (fontFamily) styles.push(`font-family:${esc(fontFamily)}`);
        if (fontSize) styles.push(`font-size:${esc(fontSize)}`);
        if (color) styles.push(`color:${esc(color)}`);
        if (textShadow) styles.push(`text-shadow:${esc(textShadow)}`);
        if (textBlur) styles.push(`filter:blur(${esc(textBlur)})`);
        break;
      }
      case 'highlight': {
        const color = m.attrs?.color ? String(m.attrs.color) : '#fef08a';
        styles.push(`background-color:${esc(color)}`);
        break;
      }
      default:
        break;
    }
  }
  return { open, close, style: styles.join(';') };
}

function renderInline(nodes: PenTipTapNode[] | undefined): string {
  if (!nodes?.length) return '';
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '<br/>';
      if (n.type === 'text') {
        const { open, close, style } = styleFromMarks(n.marks);
        const inner = esc(n.text || '');
        const wrapped = style
          ? `${open.join('')}<span style="${style}">${inner}</span>${close.join('')}`
          : `${open.join('')}${inner}${close.join('')}`;
        return wrapped;
      }
      if (n.content) return renderInline(n.content);
      return '';
    })
    .join('');
}

function alignAttr(attrs?: Record<string, unknown>): string {
  const a = attrs?.textAlign ? String(attrs.textAlign) : '';
  if (!a || a === 'left') return '';
  return ` style="text-align:${esc(a)}"`;
}

function renderNode(node: PenTipTapNode): string {
  switch (node.type) {
    case 'doc':
      return (node.content || []).map(renderNode).join('');
    case 'paragraph': {
      const inner = renderInline(node.content);
      if (!inner.trim()) return '<p><br/></p>';
      return `<p${alignAttr(node.attrs)}>${inner}</p>`;
    }
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1));
      return `<h${level}${alignAttr(node.attrs)}>${renderInline(node.content)}</h${level}>`;
    }
    case 'blockquote':
      return `<blockquote>${(node.content || []).map(renderNode).join('')}</blockquote>`;
    case 'bulletList':
      return `<ul>${(node.content || []).map(renderNode).join('')}</ul>`;
    case 'orderedList':
      return `<ol>${(node.content || []).map(renderNode).join('')}</ol>`;
    case 'listItem':
      return `<li>${(node.content || []).map(renderNode).join('')}</li>`;
    case 'horizontalRule':
      return '<hr/>';
    case 'image': {
      const src = esc(String(node.attrs?.src || ''));
      const alt = esc(String(node.attrs?.alt || ''));
      const wrap = String(node.attrs?.wrap || 'none');
      if (!src) return '';
      const wrapAttr = wrap === 'left' || wrap === 'right' ? ` data-wrap="${esc(wrap)}"` : '';
      const style =
        wrap === 'left'
          ? ' style="float:left;margin:0 1em 0.5em 0;max-width:45%"'
          : wrap === 'right'
            ? ' style="float:right;margin:0 0 0.5em 1em;max-width:45%"'
            : '';
      return `<figure${wrapAttr}${style}><img src="${src}" alt="${alt}"/></figure>`;
    }
    case 'video': {
      const src = esc(String(node.attrs?.src || ''));
      const wrap = String(node.attrs?.wrap || 'none');
      if (!src) return '';
      const wrapAttr = wrap === 'left' || wrap === 'right' ? ` data-wrap="${esc(wrap)}"` : '';
      const style =
        wrap === 'left'
          ? ' style="float:left;margin:0 1em 0.5em 0;max-width:45%"'
          : wrap === 'right'
            ? ' style="float:right;margin:0 0 0.5em 1em;max-width:45%"'
            : ' style="max-width:100%;height:auto"';
      return `<video${wrapAttr}${style} src="${src}" controls></video>`;
    }
    case 'table':
      return `<table>${(node.content || []).map(renderNode).join('')}</table>`;
    case 'tableRow':
      return `<tr>${(node.content || []).map(renderNode).join('')}</tr>`;
    case 'tableHeader':
      return `<th>${(node.content || []).map(renderNode).join('')}</th>`;
    case 'tableCell':
      return `<td>${(node.content || []).map(renderNode).join('')}</td>`;
    default:
      if (node.content) return (node.content || []).map(renderNode).join('');
      return '';
  }
}

export function docToHtml(doc: PenTipTapNode | undefined): string {
  if (!doc) return '';
  return renderNode(doc);
}
