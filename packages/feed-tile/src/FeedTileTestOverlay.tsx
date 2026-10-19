import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PenActionEffect, WidgetViewPayload } from '@par-noir/pen-protocol';
import { FeedTileSurface, type FeedTileViewModel } from './FeedTileSurface.js';
import { sandboxEffect } from './sandboxEffect.js';

/** Full-screen sandbox: every button works on this screen; nothing is saved or sent. */
export function FeedTileTestOverlay({
  model,
  aspectRatio = '9/16',
  onClose
}: {
  model: FeedTileViewModel;
  aspectRatio?: '9/16' | '16/9' | '1/1';
  onClose: () => void;
}) {
  const [widgetViews, setWidgetViews] = useState<Record<string, WidgetViewPayload>>({});
  const viewsRef = useRef(widgetViews);
  viewsRef.current = widgetViews;
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const onEffect = (effect: PenActionEffect) => {
    const outcome = sandboxEffect(effect, viewsRef.current);
    setWidgetViews(outcome.widgetViews);
    if (outcome.notice) setNotice(outcome.notice);
    if (outcome.openUrl) window.open(outcome.openUrl, '_blank', 'noopener,noreferrer');
  };

  const tileModel = useMemo(() => ({ ...model, widgetViews }), [model, widgetViews]);
  const widthClass = aspectRatio === '16/9' ? 'w-[min(90vw,48rem)]' : aspectRatio === '1/1' ? 'w-[min(80vw,28rem)]' : 'w-[min(80vw,22rem)]';

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Test mode"
      data-feed-tile-test="overlay"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md items-center justify-between gap-3 text-xs text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="rounded bg-amber-400 px-2 py-1 font-semibold text-black">
          Test mode: nothing is saved
        </span>
        <button
          type="button"
          aria-label="Close test"
          className="rounded border border-white/40 px-2 py-1 font-semibold hover:bg-white/10"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className={`relative ${widthClass}`} onClick={(event) => event.stopPropagation()}>
        <FeedTileSurface model={tileModel} mode="live" aspectRatio={aspectRatio} onEffect={onEffect} />
        {notice ? (
          <p
            role="status"
            className="pointer-events-none absolute inset-x-3 top-3 z-30 rounded bg-black/80 px-3 py-2 text-center text-xs text-white"
          >
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}
