import React, { useState } from 'react';
import { Link } from 'react-router-dom';

/** Placeholder URL until Apps Script unsubscribe endpoint is set. */
const UNSUBSCRIBE_URL = 'https://script.google.com/macros/s/PLACEHOLDER_UNSUB/exec';

export function UnsubscribePage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('submitting');
    fetch(UNSUBSCRIBE_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  };

  if (status === 'success') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'system-ui',
        }}
      >
        <h1 style={{ marginBottom: 12, fontSize: 22 }}>You’ve been unsubscribed</h1>
        <p style={{ margin: '0 0 24px', color: '#666' }}>
          You won’t receive further emails from this list.
        </p>
        <Link
          to="/"
          style={{
            padding: '12px 20px',
            backgroundColor: '#000',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 6,
            fontSize: 16,
          }}
        >
          Back to demos
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ marginBottom: 8, fontSize: 22 }}>Unsubscribe</h1>
      <p style={{ margin: '0 0 24px', color: '#666', fontSize: 14 }}>
        Enter your email to unsubscribe from this list.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: '100%',
          maxWidth: 320,
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          disabled={status === 'submitting'}
          style={{
            padding: 12,
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          style={{
            padding: 12,
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
            fontSize: 16,
          }}
        >
          {status === 'submitting' ? 'Submitting…' : 'Unsubscribe'}
        </button>
        {status === 'error' && (
          <p style={{ margin: 0, color: '#c00', fontSize: 14 }}>
            Something went wrong. Please try again.
          </p>
        )}
      </form>
      <Link
        to="/"
        style={{
          marginTop: 24,
          fontSize: 14,
          color: '#666',
          textDecoration: 'none',
        }}
      >
        ← Back to demos
      </Link>
    </div>
  );
}
