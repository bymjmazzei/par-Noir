/**
 * One HTML widget in the rectangle the user placed.
 * The SVG is the box. Text, answer buttons, expiry, and a snippet sit inside it.
 */

import type { CSSProperties } from 'react';

export type WidgetFrameElement =
  | { id: string; kind: 'svg'; svg: string }
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'button'; label: string; optionId: string }
  | { id: string; kind: 'time'; closesAt: string | null }
  | { id: string; kind: 'html'; html: string };

export type WidgetFrameModel = {
  elements: WidgetFrameElement[];
  counts?: { total: number; byOption: Record<string, number> };
  voted?: boolean;
  /** Epoch ms. Defaults to Date.now when omitted. */
  now?: number;
  countdownLabel?: string;
  closed?: boolean;
};

function svgMarkup(elements: WidgetFrameElement[]): string {
  const svg = elements.find((element) => element.kind === 'svg');
  return svg && svg.kind === 'svg' ? svg.svg : '';
}

export function WidgetFrame({
  model,
  mode,
  onText,
  onButtonLabel,
  onDuplicate,
  onClosesAt,
  onHtml,
  onVote
}: {
  model: WidgetFrameModel;
  mode: 'author' | 'voter';
  onText?: (id: string, text: string) => void;
  onButtonLabel?: (id: string, label: string) => void;
  onDuplicate?: (id: string) => void;
  onClosesAt?: (id: string, closesAt: string | null) => void;
  onHtml?: (id: string, html: string) => void;
  onVote?: (optionId: string) => void;
}) {
  const svg = svgMarkup(model.elements);
  const showCountdown = Boolean(model.countdownLabel) && !model.closed;
  const showTally = mode === 'voter' && ((model.voted && !showCountdown) || Boolean(model.closed));
  const showButtons = mode === 'author' || (!showTally && !(showCountdown && model.voted));
  const boxStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: 24,
    background: '#101418'
  };

  return (
    <div className="widget-frame" style={boxStyle} data-widget-mode={mode}>
      {svg ? (
        <div
          aria-hidden
          className="widget-frame-svg"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
      <style>{`.widget-frame-svg svg{width:100%;height:100%;display:block}`}</style>
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          height: '100%',
          padding: 12,
          boxSizing: 'border-box'
        }}
      >
        {model.elements.map((element) => {
          if (element.kind === 'svg') return null;
          if (element.kind === 'text') {
            if (mode === 'author') {
              return (
                <input
                  key={element.id}
                  aria-label="Question"
                  placeholder="ASK A QUESTION..."
                  value={element.text}
                  onChange={(event) => onText?.(element.id, event.target.value)}
                  style={{
                    border: 0,
                    borderRadius: 12,
                    background: '#141820',
                    color: '#f4f1ec',
                    padding: '10px 12px',
                    fontSize: 14
                  }}
                />
              );
            }
            return (
              <div key={element.id} style={{ color: '#f4f1ec', fontWeight: 700, fontSize: 16 }}>
                {element.text || 'ASK A QUESTION...'}
              </div>
            );
          }
          if (element.kind === 'time') {
            if (mode === 'author') {
              return (
                <label key={element.id} style={{ color: '#d6d3d1', fontSize: 12 }}>
                  Expiry
                  <input
                    aria-label="Expiry"
                    type="datetime-local"
                    value={toLocalInput(element.closesAt)}
                    onChange={(event) =>
                      onClosesAt?.(
                        element.id,
                        event.target.value ? new Date(event.target.value).toISOString() : null
                      )
                    }
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                  />
                </label>
              );
            }
            if (showCountdown) {
              return (
                <div key={element.id} aria-label="Countdown" style={{ color: '#e7c27d', fontSize: 13 }}>
                  {model.countdownLabel}
                </div>
              );
            }
            return null;
          }
          if (element.kind === 'html') {
            if (mode === 'author') {
              return (
                <textarea
                  key={element.id}
                  aria-label="HTML snippet"
                  value={element.html}
                  placeholder="HTML snippet"
                  onChange={(event) => onHtml?.(element.id, event.target.value)}
                  style={{ minHeight: 64, borderRadius: 12, border: '1px solid #444', padding: 8 }}
                />
              );
            }
            if (!element.html.trim()) return null;
            return (
              <iframe
                key={element.id}
                title="Widget snippet"
                sandbox=""
                srcDoc={element.html}
                style={{ width: '100%', height: 72, border: 0, borderRadius: 12, background: '#fff' }}
              />
            );
          }
          if (!showButtons) return null;
          if (mode === 'author') {
            return (
              <div key={element.id} style={{ display: 'flex', gap: 8 }}>
                <input
                  aria-label={`Option ${element.optionId}`}
                  value={element.label}
                  onChange={(event) => onButtonLabel?.(element.id, event.target.value)}
                  style={{
                    flex: 1,
                    border: 0,
                    borderRadius: 16,
                    background: '#e7eef2',
                    color: '#3f3f46',
                    padding: '10px 12px'
                  }}
                />
              </div>
            );
          }
          return (
            <button
              key={element.id}
              type="button"
              onClick={() => onVote?.(element.optionId)}
              style={{
                border: 0,
                borderRadius: 16,
                background: '#e7eef2',
                color: '#3f3f46',
                padding: '10px 12px',
                textAlign: 'left'
              }}
            >
              {element.label}
            </button>
          );
        })}
        {mode === 'author' && showButtons ? (
          <button
            type="button"
            onClick={() => {
              const button = [...model.elements].reverse().find((element) => element.kind === 'button');
              if (button && button.kind === 'button') onDuplicate?.(button.id);
            }}
            style={{
              border: '1px dashed #c4c4c4',
              borderRadius: 16,
              background: 'transparent',
              color: '#a1a1aa',
              padding: '10px 12px'
            }}
          >
            Add another option...
          </button>
        ) : null}
        {showTally
          ? model.elements
              .filter((element) => element.kind === 'button')
              .map((element) => {
                if (element.kind !== 'button') return null;
                const count = model.counts?.byOption[element.optionId] || 0;
                return (
                  <div key={`tally-${element.id}`} style={{ color: '#f4f1ec', fontSize: 14 }}>
                    {element.label} {count}
                  </div>
                );
              })
          : null}
      </div>
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
