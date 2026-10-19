import { afterEach, describe, expect, it, vi } from 'vitest';
import { sandboxEffect } from './sandboxEffect.js';

describe('test mode effects', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts votes on screen and never calls the network', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const first = sandboxEffect({ kind: 'vote', layerId: 'a', optionId: 'yes', widgetId: 'w1' }, {});
    const second = sandboxEffect({ kind: 'vote', layerId: 'b', optionId: 'no', widgetId: 'w1' }, first.widgetViews);
    const view = second.widgetViews.w1!;
    expect(view.phase).toBe('results');
    expect(view.results).toMatchObject({ kind: 'poll', total: 2 });
    const row = sandboxEffect(
      {
        kind: 'widget_row',
        widgetId: 'w1',
        row: { actionId: 'r', trigger: 'widget.stamp', actorId: '', createdAt: '' }
      },
      second.widgetViews
    );
    expect(row.notice).toMatch(/would be recorded/);
    expect(row.widgetViews).toBe(second.widgetViews);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('opens real links but only describes email and Messaging', () => {
    expect(sandboxEffect({ kind: 'open', url: 'https://shop.example/a', host: 'shop.example', warnings: [] }, {}).openUrl).toBe(
      'https://shop.example/a'
    );
    const mail = sandboxEffect({ kind: 'mailto', href: 'mailto:a@b.co', to: 'a@b.co' }, {});
    expect(mail.openUrl).toBeUndefined();
    expect(mail.notice).toContain('a@b.co');
    expect(sandboxEffect({ kind: 'messaging', title: 't', body: 'b', to: '' }, {}).notice).toMatch(/Messaging/);
  });
});
