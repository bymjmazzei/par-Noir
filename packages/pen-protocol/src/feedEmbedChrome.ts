/**
 * L5 page chrome: Community Landing / Home / Site wraps a feed_embed iframe slot.
 * Feed embed ≠ longform — live aggregator stream inside a Pen page.
 */

export type FeedEmbedSlot = {
  /** Community feed doc id or public stream URL key. */
  feedDocId?: string;
  /** Framed stream URL when resolved (iframe src). */
  streamUrl?: string;
  /** Display title for the chrome header. */
  title?: string;
};

export type L5PageChrome = {
  header?: string;
  footer?: string;
  toolbarLinks?: Array<{ label: string; href?: string }>;
  /** Single community.feed_embed slot. */
  feedEmbed: FeedEmbedSlot;
};

/** Default L5 chrome around an empty feed embed. */
export function defaultL5PageChrome(partial?: Partial<L5PageChrome>): L5PageChrome {
  return {
    header: partial?.header ?? 'Community',
    footer: partial?.footer ?? 'Powered by par Noir',
    toolbarLinks: partial?.toolbarLinks ?? [
      { label: 'Home' },
      { label: 'Feed' },
      { label: 'About' }
    ],
    feedEmbed: {
      title: 'Live stream',
      ...(partial?.feedEmbed || {})
    }
  };
}

/** HTML shell for L5 preview (no vote runtime). iframe when streamUrl set. */
export function renderFeedEmbedChromeHtml(chrome: L5PageChrome): string {
  const links = (chrome.toolbarLinks || [])
    .map((l) => `<a href="${escapeAttr(l.href || '#')}">${escapeHtml(l.label)}</a>`)
    .join(' · ');
  const slot = chrome.feedEmbed.streamUrl
    ? `<iframe title="${escapeAttr(chrome.feedEmbed.title || 'Feed')}" src="${escapeAttr(chrome.feedEmbed.streamUrl)}" loading="lazy" style="width:100%;min-height:420px;border:0;background:#0a0a0a"></iframe>`
    : `<div data-feed-embed-slot="${escapeAttr(chrome.feedEmbed.feedDocId || '')}" style="min-height:420px;display:flex;align-items:center;justify-content:center;background:#18181b;color:#a1a1aa">Feed embed — bind community.feed</div>`;
  return [
    `<header style="padding:12px 16px;border-bottom:1px solid #27272a">${escapeHtml(chrome.header || '')}</header>`,
    `<nav style="padding:8px 16px;font-size:13px">${links}</nav>`,
    `<main style="padding:12px 16px">${slot}</main>`,
    `<footer style="padding:12px 16px;border-top:1px solid #27272a;font-size:12px;color:#71717a">${escapeHtml(chrome.footer || '')}</footer>`
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
