/**
 * Honesty gate: Firebase hosting headers must keep clickjacking / COOP / CORP /
 * HSTS baselines. Does not claim a strict script-src CSP.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIREBASE = join(ROOT, 'firebase.json');

describe('firebase.json hosting headers', () => {
  it('includes HSTS, COOP, CORP, and frame-ancestors CSP on app targets', () => {
    const raw = readFileSync(FIREBASE, 'utf8');
    const config = JSON.parse(raw) as {
      hosting: Array<{
        target?: string;
        headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
      }>;
    };

    const targets = (config.hosting || []).filter((h) =>
      ['par-noir-dashboard', 'browse', 'messaging'].includes(h.target || '')
    );
    expect(targets.length).toBeGreaterThanOrEqual(3);

    for (const site of targets) {
      const global = (site.headers || []).find((h) => h.source === '**');
      expect(global, `${site.target} missing ** headers`).toBeTruthy();
      const map = Object.fromEntries((global!.headers || []).map((h) => [h.key, h.value]));
      expect(map['Strict-Transport-Security']).toMatch(/max-age=/);
      expect(map['Cross-Origin-Opener-Policy']).toBeTruthy();
      expect(map['Cross-Origin-Resource-Policy']).toBeTruthy();
      expect(map['Content-Security-Policy']).toMatch(/frame-ancestors/);
      expect(map['Content-Security-Policy']).toMatch(/object-src 'none'/);
      // Do not require script-src — hosting CSP is intentionally thin today.
      expect(map['Content-Security-Policy']).not.toMatch(/script-src/);
    }
  });
});
