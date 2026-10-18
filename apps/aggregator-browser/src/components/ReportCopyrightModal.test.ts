import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportCopyrightModal } from './ReportCopyrightModal';

const noop = async () => undefined;

function render(link?: string) {
  return renderToStaticMarkup(
    createElement(ReportCopyrightModal, { isOpen: true, onClose: () => undefined, link, onSubmit: noop })
  );
}

describe('ReportCopyrightModal', () => {
  it('preselects unsafe link and shows the URL when opened from a Pen button', () => {
    const html = render('https://evil.example/login');
    expect(html).toContain('Link: https://evil.example/login');
    expect(html).toMatch(/<option value="unsafe_link" selected="">Phishing \/ unsafe link<\/option>/);
  });

  it('defaults to copyright without a link', () => {
    const html = render();
    expect(html).toMatch(/<option value="copyright" selected="">/);
    expect(html).toContain('Phishing / unsafe link');
  });
});
