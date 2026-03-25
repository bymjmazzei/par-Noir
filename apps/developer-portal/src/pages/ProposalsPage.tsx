import { useEffect, useState } from 'react';
import { UnlockButton } from '@par-noir/oauth-ui';
import { usePortal } from '../context/PortalContext';

const CATEGORIES = [
  ['verification', 'Core verification'],
  ['preferences', 'Preferences'],
  ['compliance', 'Compliance'],
  ['location', 'Location']
] as const;

export function ProposalsPage() {
  const {
    signedIn,
    loadingSession,
    authHeaders,
    setError,
    error,
    handleBeforeUnlock,
    onPopupResult,
    apiEndpoint,
    clientId
  } = usePortal();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>('verification');
  const [dataType, setDataType] = useState<'string' | 'number' | 'boolean' | 'date' | 'object'>('string');
  const [requiredFields, setRequiredFields] = useState('fieldOne');
  const [examples, setExamples] = useState('Example use');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Record<string, unknown>[]>([]);

  const loadProposals = async () => {
    const t = sessionStorage.getItem('dev_portal_access_token')?.trim();
    if (!t) return;
    try {
      const res = await fetch(`${apiEndpoint}/api/developer/data-point-proposals`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProposals(Array.isArray((data as { proposals?: unknown }).proposals) ? (data as { proposals: Record<string, unknown>[] }).proposals : []);
      }
    } catch {
      /* ignore list errors */
    }
  };

  useEffect(() => {
    if (signedIn) void loadProposals();
  }, [signedIn]);

  const submit = async () => {
    setError(null);
    setLocalMsg(null);
    const t = sessionStorage.getItem('dev_portal_access_token')?.trim();
    if (!t) {
      setError('Unlock your pN first.');
      return;
    }
    const rf = requiredFields
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const ex = examples
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() || !description.trim() || !useCase.trim() || rf.length === 0 || ex.length === 0) {
      setError('Fill name, description, use case, and at least one required field and example.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiEndpoint}/api/developer/data-point-proposals`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category,
          dataType,
          requiredFields: rf,
          examples: ex,
          useCase: useCase.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error_description?: string }).error_description || 'Submit failed');
        return;
      }
      setLocalMsg(`Submitted proposal ${(data as { proposalId?: string }).proposalId || ''}.`);
      setName('');
      setDescription('');
      setUseCase('');
      await loadProposals();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Propose a standard data point</h2>
        <p>
          Submissions are recorded for review (audit log). They do not automatically change the public catalog; approved
          changes are published in the monorepo and API.
        </p>
      </section>

      {error && <div className="dev-alert dev-alert--error">{error}</div>}
      {localMsg && <div className="dev-alert dev-alert--success">{localMsg}</div>}

      {!signedIn && !loadingSession && (
        <section className="dev-unlock-hero">
          <UnlockButton
            config={{
              clientId,
              apiEndpoint,
              redirectUri: `${window.location.origin}/oauth-callback.html`,
              scope: ['openid', 'profile']
            }}
            onBeforeUnlock={handleBeforeUnlock}
            onPopupResult={onPopupResult}
            onPopupFlowFailed={(msg) => setError(msg)}
            className="dev-btn dev-btn-unlock dev-btn-unlock--large"
          >
            Unlock to propose
          </UnlockButton>
        </section>
      )}

      {signedIn && (
        <>
          <section className="dev-card">
            <h3>New proposal</h3>
            <div className="dev-field">
              <label htmlFor="prop-name">Name</label>
              <input id="prop-name" className="dev-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="dev-field">
              <label htmlFor="prop-desc">Description</label>
              <textarea id="prop-desc" className="dev-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="dev-field">
              <label htmlFor="prop-cat">Category</label>
              <select id="prop-cat" className="dev-input" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number][0])}>
                {CATEGORIES.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="dev-field">
              <label htmlFor="prop-dt">Data type</label>
              <select id="prop-dt" className="dev-input" value={dataType} onChange={(e) => setDataType(e.target.value as typeof dataType)}>
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="date">date</option>
                <option value="object">object</option>
              </select>
            </div>
            <div className="dev-field">
              <label htmlFor="prop-rf">Required fields (comma or newline separated)</label>
              <textarea id="prop-rf" className="dev-textarea" value={requiredFields} onChange={(e) => setRequiredFields(e.target.value)} rows={2} />
            </div>
            <div className="dev-field">
              <label htmlFor="prop-ex">Examples (comma or newline separated)</label>
              <textarea id="prop-ex" className="dev-textarea" value={examples} onChange={(e) => setExamples(e.target.value)} rows={2} />
            </div>
            <div className="dev-field">
              <label htmlFor="prop-uc">Detailed use case</label>
              <textarea id="prop-uc" className="dev-textarea" value={useCase} onChange={(e) => setUseCase(e.target.value)} rows={4} />
            </div>
            <button type="button" className="dev-btn" disabled={submitting} onClick={submit}>
              {submitting ? 'Submitting…' : 'Submit proposal'}
            </button>
          </section>

          <section className="dev-summary" style={{ marginTop: '2rem' }}>
            <h2 className="dev-section-label">Your recent submissions (this console)</h2>
            {proposals.length === 0 ? (
              <p className="dev-muted">None yet, or audit storage unavailable.</p>
            ) : (
              <ul className="dev-summary-list">
                {proposals.map((row, i) => (
                  <li key={i}>
                    <strong>{String(row.name ?? '—')}</strong> — {String(row.proposalId ?? '')}{' '}
                    <span className="dev-muted">{String(row.recordedAt ?? row.proposedAt ?? '')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
