/** Blank document setup — pick a form (or Custom), then create. */

import { useMemo, useState } from 'react';
import {
  listConsumerCategories,
  listForms,
  type PenPageLayout
} from '@par-noir/pen-protocol';
import type { BlankDocChoice } from '../services/createBlankDoc';

export function BlankDocWizard({
  busy,
  error,
  onCancel,
  onCreate
}: {
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onCreate: (choice: BlankDocChoice, pageLayout: PenPageLayout) => void | Promise<void>;
}) {
  const categories = useMemo(() => listConsumerCategories(), []);
  const [choice, setChoice] = useState<BlankDocChoice | null>(null);
  const [pageLayout, setPageLayout] = useState<PenPageLayout>('flow');

  const selectedIsSocial =
    choice?.kind === 'form' && choice.classId.startsWith('social.');

  return (
    <div
      className="pen-template-preview-overlay"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="pen-blank-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="New blank document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pen-blank-wizard-bar">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-black">Blank document</h2>
            <p className="text-xs text-neutral-500">
              Pick a form for defaults, or Custom for a freeform page.
            </p>
          </div>
          <button
            type="button"
            className="pen-template-icon-btn"
            aria-label="Close"
            title="Close"
            onClick={onCancel}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="pen-blank-wizard-body">
          <button
            type="button"
            className={`pen-blank-wizard-option ${
              choice?.kind === 'custom' ? 'is-selected' : ''
            }`}
            onClick={() => {
              setChoice({ kind: 'custom' });
              setPageLayout('flow');
            }}
          >
            <span className="font-semibold text-black">Custom</span>
            <span className="text-xs text-neutral-500">Freeform page — no form defaults</span>
          </button>

          {categories
            .filter((cat) => cat.id !== 'custom')
            .map((cat) => {
            const forms = listForms(cat.id).filter((f) => f.audience === 'consumer');
            if (!forms.length) return null;
            return (
              <div key={cat.id} className="pen-blank-wizard-group">
                <h3 className="pen-blank-wizard-group-title">{cat.title}</h3>
                <div className="pen-blank-wizard-options">
                  {forms.map((form) => (
                    <button
                      key={form.id}
                      type="button"
                      className={`pen-blank-wizard-option ${
                        choice?.kind === 'form' && choice.classId === form.id
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() => {
                        setChoice({ kind: 'form', classId: form.id });
                        setPageLayout(form.parentId === 'social' ? 'flow' : 'letter');
                      }}
                    >
                      <span className="font-semibold text-black">{form.title}</span>
                      <span className="text-xs text-neutral-500">{form.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {choice && !selectedIsSocial ? (
            <label className="pen-blank-wizard-layout">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Page layout
              </span>
              <select
                value={pageLayout}
                onChange={(e) => setPageLayout(e.target.value as PenPageLayout)}
                className="mt-1 w-full border border-neutral-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="flow">Flow</option>
                <option value="letter">Letter</option>
                <option value="a4">A4</option>
              </select>
            </label>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="pen-blank-wizard-foot">
          <button type="button" className="pen-ribbon-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="pen-ribbon-btn is-active"
            disabled={!choice || busy}
            onClick={() => {
              if (!choice) return;
              void onCreate(choice, pageLayout);
            }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
