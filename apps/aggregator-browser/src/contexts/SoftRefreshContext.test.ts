/**
 * Soft refresh registry — no React Testing Library dependency.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import {
  SoftRefreshProvider,
  useRegisterSoftRefresh,
  useSoftRefresh,
} from './SoftRefreshContext';

function mount(handler: () => void | Promise<void>) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  let api: ReturnType<typeof useSoftRefresh> | null = null;

  function Probe() {
    useRegisterSoftRefresh(handler);
    api = useSoftRefresh();
    useEffect(() => undefined, []);
    return null;
  }

  act(() => {
    root.render(createElement(SoftRefreshProvider, null, createElement(Probe)));
  });

  return {
    run: async () => {
      if (!api) throw new Error('soft refresh api missing');
      await act(async () => {
        await api!.runSoftRefresh();
      });
    },
    unmount: () => {
      act(() => root.unmount());
      el.remove();
    },
  };
}

describe('SoftRefreshContext', () => {
  it('runs the registered handler', async () => {
    const handler = vi.fn(async () => undefined);
    const m = mount(handler);
    await m.run();
    expect(handler).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('ignores a second run while the first is in flight', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    const handler = vi.fn(async () => gate);
    const m = mount(handler);
    const first = m.run();
    await m.run();
    expect(handler).toHaveBeenCalledTimes(1);
    resolve();
    await first;
    m.unmount();
  });
});
