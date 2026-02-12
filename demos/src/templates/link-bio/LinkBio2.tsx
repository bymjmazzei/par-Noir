import React, { useState } from 'react';
import type { TemplateDataLinkBio } from '@/types/templateData';

interface LinkBio2Props {
  data: TemplateDataLinkBio;
}

export function LinkBio2({ data }: LinkBio2Props) {
  const [email, setEmail] = useState('');
  const justify = data.buttonJustification ?? 'center';
  const accent = data.primaryColor ?? 'var(--flyer-accent)';
  const text = data.secondaryColor ?? 'var(--flyer-text)';
  const hasBgImage = Boolean(data.backgroundImageUrl);

  return (
    <div
      className="demo-page-root"
      style={{
        minHeight: '100vh',
        position: 'relative',
        backgroundImage: hasBgImage ? `url(${data.backgroundImageUrl})` : undefined,
        backgroundColor: hasBgImage ? undefined : 'var(--flyer-bg-dark)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: justify === 'center' ? 'center' : justify === 'right' ? 'flex-end' : 'flex-start',
        padding: 'var(--flyer-spacing-xl) var(--flyer-spacing)',
        fontFamily: 'var(--flyer-body-font)',
      }}
    >
      {hasBgImage && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: justify === 'center' ? 'center' : justify === 'right' ? 'flex-end' : 'flex-start', width: '100%', maxWidth: 420 }}>
      <h1
        style={{
          fontFamily: 'var(--flyer-heading-font)',
          fontSize: 'var(--flyer-heading-size)',
          fontWeight: 400,
          color: text,
          margin: '0 0 0.5rem',
          textTransform: 'uppercase',
          lineHeight: 0.95,
          letterSpacing: '0.02em',
        }}
      >
        {data.brandName}
      </h1>
      <p
        style={{
          color: 'var(--flyer-text-muted)',
          margin: '0 0 0.75rem',
          fontSize: 'var(--flyer-heading-size-sm)',
          fontWeight: 400,
        }}
      >
        {data.tagline}
      </p>
      <p
        style={{
          color: 'rgba(255,255,255,0.85)',
          margin: '0 0 var(--flyer-spacing-xl)',
          fontSize: 'var(--flyer-link-size)',
          lineHeight: 1.55,
          maxWidth: 420,
          textAlign: justify === 'center' ? 'center' : 'left',
        }}
      >
        {data.bio}
      </p>

      <div
        data-reveal
        style={{
          width: '100%',
          maxWidth: 420,
          padding: 'var(--flyer-spacing-lg)',
          backgroundColor: accent,
          marginBottom: 'var(--flyer-spacing)',
        }}
      >
        <p
          style={{
            color: text,
            marginBottom: 14,
            fontSize: 'var(--flyer-cta-size)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {data.emailCtaHeading}
        </p>
        <form
          className="linkbio2-email-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (data.emailSignupUrl) {
              fetch(data.emailSignupUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
              }).catch(() => {});
            }
            setEmail('');
          }}
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            style={{
              flex: 1,
              minWidth: 0,
              padding: '16px 14px',
              border: `var(--flyer-border-thick) solid ${text}`,
              fontSize: 'var(--flyer-cta-size)',
              backgroundColor: 'rgba(0,0,0,0.15)',
              color: text,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            style={{
              flexShrink: 0,
              padding: '16px 24px',
              backgroundColor: text,
              color: accent,
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--flyer-cta-size)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {data.emailCtaButtonText}
          </button>
        </form>
      </div>

      <div
        data-reveal
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          width: '100%',
          maxWidth: 420,
          alignItems: justify === 'center' ? 'stretch' : justify === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        <a
          href={data.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            width: '100%',
            padding: 20,
            backgroundColor: 'var(--flyer-bg-block)',
            color: text,
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: 'var(--flyer-link-size)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            borderBottom: `var(--flyer-border-thick) solid ${accent}`,
          }}
        >
          Website
        </a>
        {data.socialLinks.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              width: '100%',
              padding: 20,
              backgroundColor: 'var(--flyer-bg-block)',
              color: text,
              textDecoration: 'none',
              textAlign: 'center',
              fontSize: 'var(--flyer-link-size)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderBottom: `1px solid rgba(255,255,255,0.2)`,
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      <p
        style={{
          marginTop: 'var(--flyer-spacing-lg)',
          fontSize: 'var(--flyer-link-size)',
          color: 'var(--flyer-text-muted)',
        }}
      >
        <a href={data.unsubscribeLink} style={{ color: 'inherit' }}>Unsubscribe</a>
      </p>
      </div>
    </div>
  );
}
