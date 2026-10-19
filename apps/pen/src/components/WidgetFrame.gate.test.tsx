/** The trigger panel sets a preset. It does not arrange layers. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WidgetEditorPanel, goToOptions } from './WidgetEditorPanel';
import type { PenPageLayer, PenSectionContent } from '@par-noir/pen-protocol';

const button: PenPageLayer = {
  id: 'yes',
  kind: 'interactive',
  x: 12,
  y: 48,
  w: 96,
  h: 36,
  zIndex: 2,
  label: 'Yes'
};

const section: PenSectionContent = {
  slug: 'card',
  doc: { type: 'doc', content: [] },
  layers: [
    button,
    {
      id: 'no',
      kind: 'interactive',
      x: 120,
      y: 48,
      w: 96,
      h: 36,
      zIndex: 2,
      label: 'No'
    }
  ]
};

describe('widget trigger panel', () => {
  it('sets a trigger on the selected button and does not lay the group out', () => {
    const html = renderToStaticMarkup(
      <WidgetEditorPanel layer={button} section={section} onSectionChange={() => undefined} />
    );
    expect(html).toContain('Button trigger');
    expect(html).toContain('Vote');
    expect(html).toContain('Send');
    expect(html).toContain('Allocate');
    expect(html).not.toContain('Add another option');
    expect(html).not.toContain('ASK A QUESTION');
  });

  it('offers the correct-answer mark only on a vote button', () => {
    const vote: PenPageLayer = { ...button, behavior: 'poll.vote', bindRowId: 'yes' };
    const html = renderToStaticMarkup(
      <WidgetEditorPanel layer={vote} section={section} onSectionChange={() => undefined} />
    );
    expect(html).toContain('Correct answer');
    expect(html).toContain('>Fill<');
    expect(html).toMatch(/#0f766e|rgba\(15,\s*118,\s*110/);
    expect(html).toContain('>Opacity<');
    expect(html).toContain('100%');
    expect(html).not.toContain('Your claim of the content fund');
  });

  it('shows the fields each trigger needs', () => {
    const link = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'cta.open', openUrl: 'https://example.com' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(link).toContain('Link');
    const send = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'widget.submit', submitTo: 'a@b.co' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(send).toContain('Submit destination');
    const piles = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'widget.allocate' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(piles).toContain('Allocate amount');
    const reveal = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'widget.reveal' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(reveal).toContain('Reveal target');
  });

  it('checks the link while the author types', () => {
    const render = (openUrl: string, label = 'Go') =>
      renderToStaticMarkup(
        <WidgetEditorPanel
          layer={{ ...button, label, behavior: 'cta.open', openUrl }}
          section={section}
          onSectionChange={() => undefined}
        />
      );
    expect(render('https://example.com')).toContain('Opens example.com');
    expect(render('http://example.com')).toContain('data-widget-link-block="not_https"');
    expect(render('https://parnoir.com@evil.com')).toContain('data-widget-link-block="credentials"');
    expect(render('https://example.com/setup.exe')).toContain('data-widget-link-warning="download"');
    expect(render('https://evil.example', 'Sign in to par Noir')).toContain(
      'data-widget-link-warning="label_mismatch"'
    );
  });

  it('offers Go to page only on multipage docs, as a page dropdown of slug targets', () => {
    const single = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={button}
        section={section}
        pages={[{ slug: 'card', title: 'Card' }]}
        onSectionChange={() => undefined}
      />
    );
    expect(single).not.toContain('Go to page');
    const pages = [
      { slug: 'cover', title: 'Cover' },
      { slug: 'menu', title: 'Pick a product' }
    ];
    const multi = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...button, behavior: 'page.go', goTo: 'slug:menu' }}
        section={section}
        pages={pages}
        onSectionChange={() => undefined}
      />
    );
    expect(multi).toContain('<select aria-label="Go to page"');
    expect(multi).toContain('value="slug:menu" selected=""');
    expect(multi).toContain('>Pick a product<');
    expect(multi).toContain('>Next page<');
    expect(multi).not.toContain('placeholder="next, page:0, slug:home"');
    expect(goToOptions(pages, 'page:3').at(-1)).toEqual({ value: 'page:3', label: 'page:3' });
  });

  it('warns that a form asking for a secret will not send', () => {
    const send: PenPageLayer = { ...button, parentGroupId: 'g', behavior: 'widget.submit', submitTo: 'a@b.co' };
    const input: PenPageLayer = {
      id: 'in',
      kind: 'text',
      widgetElement: 'input',
      name: 'Passcode',
      parentGroupId: 'g',
      x: 0,
      y: 0,
      w: 40,
      h: 20,
      zIndex: 2
    };
    const html = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={send}
        section={{ ...section, layers: [send, input] }}
        onSectionChange={() => undefined}
      />
    );
    expect(html).toContain('data-widget-secret-block');
  });
});
