import { createPortal } from 'react-dom';
import { LINK_WARNING_MESSAGES, type PenActionEffect } from '@par-noir/pen-protocol';

export type LeaveEffect = Extract<PenActionEffect, { kind: 'open' | 'mailto' | 'messaging' }>;

export function needsLeaveSheet(effect: PenActionEffect): effect is LeaveEffect {
  return effect.kind === 'open' || effect.kind === 'mailto' || effect.kind === 'messaging';
}

function destination(effect: LeaveEffect): string {
  if (effect.kind === 'open') return effect.host;
  if (effect.kind === 'mailto') return effect.to;
  return effect.to ? `${effect.to} in Messaging` : 'the creator in Messaging';
}

/**
 * Shown before every external link or form send. Nothing leaves until Continue.
 * Portaled to body: host feeds stack captions and rails above the tile.
 */
export function LeaveSheet({
  effect,
  onContinue,
  onCancel,
  onReportLink
}: {
  effect: LeaveEffect;
  onContinue: () => void;
  onCancel: () => void;
  onReportLink?: (url: string) => void;
}) {
  const open = effect.kind === 'open' ? effect : null;
  const warned = Boolean(open?.warnings.length);
  const sheet = (
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-black/70 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={open ? 'Leaving par Noir' : 'Send your answers'}
      data-pen-leave-sheet={effect.kind}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-neutral-950 p-4 text-left text-white shadow-xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          {open ? 'You are leaving par Noir' : 'Your answers will be sent to'}
        </p>
        <p className="mt-1 break-all text-lg font-semibold" data-pen-leave-host>
          {destination(effect)}
        </p>
        {open ? <p className="mt-1 break-all text-xs text-neutral-500">{open.url}</p> : null}
        {open?.warnings.map((warning) => (
          <p key={warning} className="mt-2 text-sm text-red-400" data-pen-leave-warning={warning}>
            {LINK_WARNING_MESSAGES[warning]}
          </p>
        ))}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
              warned ? 'bg-red-600 text-white' : 'bg-white text-black'
            }`}
            onClick={onContinue}
          >
            Continue
          </button>
        </div>
        {open && onReportLink ? (
          <button
            type="button"
            className="mt-3 w-full text-center text-xs text-neutral-400 underline"
            onClick={() => onReportLink(open.url)}
          >
            Report link
          </button>
        ) : null}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body);
}
