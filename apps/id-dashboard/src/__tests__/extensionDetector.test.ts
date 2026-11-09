/**
 * @jest-environment jsdom
 */
import { ExtensionDetector } from '../utils/security/extensionDetector';

function scan() {
  ExtensionDetector.startMonitoring();
  const warnings = ExtensionDetector.getWarnings();
  ExtensionDetector.stopMonitoring();
  return warnings;
}

describe('ExtensionDetector', () => {
  afterEach(() => {
    ExtensionDetector.stopMonitoring();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('does not flag cross-origin images such as R2 feed posters', () => {
    const img = document.createElement('img');
    img.src =
      'https://0f8a70c0e2c03ad9bdbeb34082f9c2cd.r2.cloudflarestorage.com/pn-feed-previews/feed/x/poster-1?X-Amz-Expires=300';
    document.body.appendChild(img);

    expect(scan()).toEqual([]);
  });

  it('flags scripts from unknown origins', () => {
    const script = document.createElement('script');
    script.src = 'https://evil.example.com/inject.js';
    document.head.appendChild(script);

    const warnings = scan();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ type: 'suspicious-script', severity: 'high' });
  });

  it('flags elements carrying extension data attributes', () => {
    const el = document.createElement('div');
    el.setAttribute('data-chrome-extension', '1');
    document.body.appendChild(el);

    const warnings = scan();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ type: 'modified-dom', severity: 'medium' });
  });
});
