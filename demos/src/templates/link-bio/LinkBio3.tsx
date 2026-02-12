import React, { useState } from 'react';
import type { TemplateDataLinkBio } from '@/types/templateData';

interface LinkBio3Props {
  data: TemplateDataLinkBio;
}

export function LinkBio3({ data }: LinkBio3Props) {
  const [email, setEmail] = useState('');
  const justify = data.buttonJustification ?? 'center';
  const accent = data.primaryColor ?? 'var(--flyer-accent-alt)';
  const text = data.secondaryColor ?? 'var(--flyer-text)';
  const hasBgImage = Boolean(data.backgroundImageUrl);
  const contentText = hasBgImage ? '#fff' : text;

  return (
    <div
      className="demo-page-root"
      style={{
        minHeight: '100vh',
        position: 'relative',
        backgroundImage: hasBgImage ? `url(${data.backgroundImageUrl})` : undefined,
        backgroundColor: hasBgImage ? undefined : '#0c0c0c',
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
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400 }}>
        <h1
          style={{
            fontFamily: 'var(--flyer-heading-font)',
            fontSize: 'var(--flyer-heading-size)',
            fontWeight: 400,
            color: contentText,
            margin: '0 0 0.5rem',
            textTransform: 'uppercase',
            lineHeight: 0.9,
            letterSpacing: '0.04em',
          }}
        >
          {data.brandName}
        </h1>
        <p
          style={{
            color: 'var(--flyer-text-muted)',
            margin: '0 0 0.75rem',
            fontSize: '1rem',
            fontWeight: 400,
            letterSpacing: '0.02em',
          }}
        >
          {data.tagline}
        </p>
        <p
          style={{
            color: 'var(--flyer-text-muted)',
            margin: '0 0 var(--flyer-spacing-xl)',
            fontSize: 'var(--flyer-link-size)',
            lineHeight: 1.55,
            letterSpacing: '0.02em',
          }}
        >
          {data.bio}
        </p>

        <div
          data-reveal
          style={{
            padding: 'var(--flyer-spacing) 0',
            borderTop: `var(--flyer-border-thick) solid ${accent}`,
            borderBottom: `var(--flyer-border-thick) solid ${accent}`,
            marginBottom: 'var(--flyer-spacing-lg)',
          }}
        >
          <p
            style={{
              color: contentText,
              marginBottom: 12,
              fontSize: 'var(--flyer-cta-size)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
            }}
          >
            {data.emailCtaHeading}
          </p>
          <form
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
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                padding: 14,
                border: `var(--flyer-border-thick) solid ${text}`,
                fontSize: 'var(--flyer-cta-size)',
                backgroundColor: 'transparent',
                color: contentText,
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              style={{
                padding: 14,
                backgroundColor: accent,
                color: '#000',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--flyer-cta-size)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'inherit',
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
            alignItems: justify === 'center' ? 'stretch' : justify === 'right' ? 'flex-end' : 'flex-start',
          }}
        >
          <a
            href={data.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              padding: '16px 0',
              color: contentText,
              textDecoration: 'none',
              fontSize: 'var(--flyer-link-size)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              borderBottom: '1px solid rgba(255,255,255,0.2)',
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
                padding: '16px 0',
                color: contentText,
                textDecoration: 'none',
                fontSize: 'var(--flyer-link-size)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                borderBottom: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <p
        style={{
          marginTop: 'var(--flyer-spacing-lg)',
          fontSize: 'var(--flyer-link-size)',
          color: 'var(--flyer-text-muted)',
          letterSpacing: '0.05em',
        }}
      >
        <a href={data.unsubscribeLink} style={{ color: 'inherit' }}>Unsubscribe</a>
      </p>
    </div>
  );
}
