/**
 * Gate: messaging vanity lands on connect, not browse creator feed.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('messaging vanity connect', () => {
  it('App routes MESSAGING_ONLY vanity to VanityConnectPage', () => {
    const app = readFileSync(resolve(here, 'App.tsx'), 'utf8');
    expect(app).toContain('VanityConnectPage');
    expect(app).toContain('parseMessagingConnectPath');
    expect(app).toContain("kind === 'pn'");
    expect(app).toContain('setVanityConnect');
    expect(app).toMatch(/MESSAGING_ONLY && vanityConnect/);
  });

  it('VanityConnectPage sends connection requests', () => {
    const page = readFileSync(resolve(here, 'pages/VanityConnectPage.tsx'), 'utf8');
    expect(page).toContain('sendConnectionRequest');
  });
});
