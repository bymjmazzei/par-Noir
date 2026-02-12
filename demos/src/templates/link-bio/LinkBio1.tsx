import React, { useState } from 'react';
import type { TemplateDataLinkBio } from '@/types/templateData';

interface LinkBio1Props {
  data: TemplateDataLinkBio;
}

export function LinkBio1({ data }: LinkBio1Props) {
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
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: justify === 'center' ? 'center' : justify === 'right' ? 'flex-end' : 'flex-start', width: '100%', maxWidth: 400 }}>
      <img
        src={data.logoUrl}
        alt={data.brandName}
        style={{
          width: 100,
          height: 100,
          borderRadius: 0,
          marginBottom: 'var(--flyer-spacing-lg)',
          objectFit: 'cover',
          border: `var(--flyer-border-thick) solid ${accent}`,
        }}
      />
      <h1
        style={{
          fontFamily: 'var(--flyer-heading-font)',
          fontSize: 'var(--flyer-heading-size)',
          fontWeight: 400,
          letterSpacing: '0.02em',
          color: text,
          margin: '0 0 0.25rem',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        {data.brandName}
      </h1>
      <p
        style={{
          color: 'var(--flyer-text-muted)',
          margin: '0 0 0.5rem',
          fontSize: 'var(--flyer-cta-size)',
          fontWeight: 400,
          letterSpacing: '0.05em',
        }}
      >
        {data.tagline}
      </p>
      <p
        style={{
          color: 'var(--flyer-text-muted)',
          margin: '0 0 var(--flyer-spacing-lg)',
          fontSize: 'var(--flyer-link-size)',
          lineHeight: 1.5,
          maxWidth: 400,
          textAlign: justify === 'center' ? 'center' : 'left',
          letterSpacing: '0.02em',
        }}
      >
        {data.bio}
      </p>

      <div
        data-reveal
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 'var(--flyer-spacing)',
          backgroundColor: 'var(--flyer-bg-block)',
          marginBottom: 'var(--flyer-spacing-lg)',
        }}
      >
        <p
          style={{
            color: text,
            marginBottom: 12,
            fontSize: 'var(--flyer-cta-size)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
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
            placeholder="YOUR@EMAIL.COM"
            required
            style={{
              padding: 16,
              border: 'none',
              fontSize: 'var(--flyer-cta-size)',
              backgroundColor: '#fff',
              color: '#000',
              letterSpacing: '0.05em',
            }}
          />
          <button
            type="submit"
            style={{
              padding: 16,
              backgroundColor: accent,
              color: text,
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--flyer-cta-size)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
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
          gap: 10,
          width: '100%',
          maxWidth: 400,
          alignItems: justify === 'center' ? 'stretch' : justify === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        <a
          href={data.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            padding: 18,
            backgroundColor: accent,
            color: text,
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: 'var(--flyer-link-size)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
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
              padding: 18,
              backgroundColor: 'var(--flyer-bg-block)',
              color: text,
              textDecoration: 'none',
              textAlign: 'center',
              fontSize: 'var(--flyer-link-size)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: `var(--flyer-border-thick) solid ${text}`,
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      <p
        style={{
          marginTop: 'var(--flyer-spacing-lg)',
          fontSize: 12,
          color: 'var(--flyer-text-muted)',
        }}
      >
        <a href={data.unsubscribeLink} style={{ color: 'inherit' }}>Unsubscribe</a>
      </p>
      </div>
    </div>
  );
}
