/**
 * Gate: any site may iframe /embed/post and /embed/feed, and nothing else on browse.
 * Embeds play posts through the feed's own player; signed actions leave for par Noir.
 * Falsifies: the whole browse site frameable, /embed/post swallowed by the messaging embed,
 * a title-card feed embed, a second post-loading path.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname);
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

function browseHeaderRules(): HeaderRule[] {
  const config = JSON.parse(readFileSync(resolve(root, '../../../firebase.json'), 'utf8')) as {
    hosting: Array<{ target: string; headers: HeaderRule[] }>;
  };
  const browse = config.hosting.find((h) => h.target === 'browse');
  if (!browse) throw new Error('browse hosting target missing');
  return browse.headers;
}

const csp = (rule: HeaderRule) => rule.headers.find((h) => h.key === 'Content-Security-Policy')?.value || '';

describe('embeddable posts', () => {
  it('only /embed/post and /embed/feed may be framed by any site, and that rule comes last', () => {
    const rules = browseHeaderRules();
    const open = rules.filter((r) => /frame-ancestors \*/.test(csp(r)));
    expect(open.map((r) => r.source)).toEqual(['/embed/@(post|feed)']);
    const catchAll = rules.findIndex((r) => r.source === '**');
    expect(csp(rules[catchAll]!)).toMatch(/frame-ancestors 'self' https:\/\/parnoir\.com/);
    expect(rules.indexOf(open[0]!)).toBeGreaterThan(catchAll);
  });

  it('App routes /embed/post before the messaging embed catch-all', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/const isMessagingEmbed =\s*!isFeedEmbed && !isPostEmbed &&/);
    expect(app.indexOf('if (isPostEmbed)')).toBeLessThan(app.indexOf('if (isMessagingEmbed)'));
    expect(app).toMatch(/<EmbedPostPage \/>/);
  });

  it('the feed embed plays each post through EmbedPostTile, not title cards', () => {
    const feed = read('pages/EmbedFeedPage.tsx');
    expect(feed).toMatch(/<EmbedPostTile/);
    expect(feed).toMatch(/active=\{index === activeIndex\}/);
    expect(feed).not.toMatch(/line-clamp-3/);
  });

  it('the share menu offers embed code only for posts that can be embedded', () => {
    const menu = read('components/ShareMenu.tsx');
    expect(menu).toMatch(/const canEmbed = embedPostRefusal\(/);
    expect(menu).toMatch(/\{canEmbed && \(/);
    expect(menu).toMatch(/copyPostEmbedCode\(file\)/);
    expect(menu.match(/const handleEmbed = async \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? '').not.toMatch(/onShared/);
  });

  it('embeds use the feed player and the shared metadata loader', () => {
    const tile = read('components/EmbedPostTile.tsx');
    expect(tile).toMatch(/<PenFeedTilePlayer/);
    expect(tile).toMatch(/interceptEffect=\{interceptEffect\}/);
    expect(tile).toMatch(/muted\b/);
    expect(read('hooks/useEmbedPost.ts')).toMatch(/from '\.\.\/services\/feedMemberMeta'/);
    const feed = read('components/FullScreenFeed.tsx');
    expect(feed).toMatch(/from '\.\.\/services\/feedMemberMeta'/);
    expect(feed).not.toMatch(/async function loadMemberFeedMeta/);
  });
});
