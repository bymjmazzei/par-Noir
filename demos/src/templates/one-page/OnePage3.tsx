import React, { useState } from 'react';
import type { TemplateDataOnePage } from '@/types/templateData';

interface OnePage3Props {
  data: TemplateDataOnePage;
}

export function OnePage3({ data }: OnePage3Props) {
  const [email, setEmail] = useState('');
  const [productModal, setProductModal] = useState<typeof data.products[0] | null>(null);

  return (
    <div className="demo-page-root" style={{ fontFamily: 'var(--flyer-body-font)' }}>
      {/* Hero: full-bleed with overlay for contrast */}
      <section
        style={{
          position: 'relative',
          minHeight: '55vh',
          backgroundImage: `url(${data.heroImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--flyer-spacing-xl) var(--flyer-spacing)',
          color: 'var(--flyer-text)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.75) 100%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, textShadow: '0 2px 14px rgba(0,0,0,0.9)' }}>
          <h1
            style={{
              fontFamily: 'var(--flyer-heading-font)',
              fontSize: 'var(--flyer-heading-size)',
              fontWeight: 400,
              margin: '0 0 0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              lineHeight: 0.95,
            }}
          >
            {data.brandName}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--flyer-heading-size-sm)',
              color: 'var(--flyer-text-muted)',
              letterSpacing: '0.08em',
            }}
          >
            {data.tagline}
          </p>
        </div>
      </section>

      {/* Email: distinct card block with border accent (editorial) */}
      <section
        data-reveal
        className="demo-section"
        style={{
          paddingTop: 'var(--flyer-spacing-xl)',
          paddingBottom: 'var(--flyer-spacing-xl)',
          backgroundColor: 'var(--flyer-bg-dark)',
          color: 'var(--flyer-text)',
        }}
      >
        <div
          style={{
            maxWidth: 520,
            margin: '0 auto',
            padding: 'var(--flyer-spacing-lg)',
            borderTop: 'var(--flyer-border-thick) solid var(--flyer-accent-alt)',
            borderBottom: 'var(--flyer-border-thick) solid var(--flyer-accent-alt)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--flyer-heading-font)',
              fontSize: 'var(--flyer-heading-size-sm)',
              fontWeight: 400,
              margin: '0 0 var(--flyer-spacing)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textAlign: 'center',
            }}
          >
            {data.emailCtaHeading}
          </h2>
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
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="YOUR@EMAIL.COM"
              required
              style={{
                padding: 18,
                border: 'var(--flyer-border-thick) solid var(--flyer-text)',
                fontSize: 'var(--flyer-cta-size)',
                backgroundColor: 'transparent',
                color: 'var(--flyer-text)',
                letterSpacing: '0.05em',
              }}
            />
            <button
              type="submit"
              style={{
                padding: 18,
                backgroundColor: 'var(--flyer-accent-alt)',
                color: '#000',
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
          <p style={{ margin: 'var(--flyer-spacing) 0 0', fontSize: 'var(--flyer-link-size)', color: 'var(--flyer-text-muted)', textAlign: 'center' }}>
            <a href={data.unsubscribeLink} style={{ color: 'inherit' }}>Unsubscribe</a>
          </p>
        </div>
      </section>

      {/* About: brand story */}
      <section
        data-reveal
        className="demo-section"
        style={{
          paddingTop: 'var(--flyer-spacing-xl)',
          paddingBottom: 'var(--flyer-spacing-xl)',
          backgroundColor: 'var(--flyer-bg-dark)',
          color: 'var(--flyer-text)',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontFamily: 'var(--flyer-heading-font)',
              fontSize: 'var(--flyer-heading-size-sm)',
              fontWeight: 400,
              margin: '0 0 var(--flyer-spacing)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            About
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--flyer-cta-size)',
              lineHeight: 1.65,
              color: 'var(--flyer-text-muted)',
              letterSpacing: '0.02em',
            }}
          >
            {data.bio}
          </p>
        </div>
      </section>

      {/* Products: responsive grid */}
      <section
        data-reveal
        className="demo-section"
        style={{
          paddingTop: 'var(--flyer-spacing-xl)',
          paddingBottom: 'var(--flyer-spacing-xl)',
          backgroundColor: 'var(--flyer-bg-dark)',
          color: 'var(--flyer-text)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--flyer-heading-font)',
            fontSize: 'var(--flyer-heading-size-sm)',
            fontWeight: 400,
            margin: '0 0 var(--flyer-spacing)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            textAlign: 'center',
          }}
        >
          Products
        </h2>
        <div className="demo-products-grid">
          {data.products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => setProductModal(product)}
              className="demo-product-card"
              style={{
                padding: 0,
                border: 'var(--flyer-border-thick) solid var(--flyer-accent-alt)',
                overflow: 'hidden',
                cursor: 'pointer',
                backgroundColor: 'var(--flyer-bg-block)',
              }}
            >
              <img
                src={product.imageUrl}
                alt={product.name}
                style={{ width: '100%', height: 200, objectFit: 'cover' }}
              />
              <p
                style={{
                  margin: '20px 20px 6px',
                  fontSize: 'var(--flyer-cta-size)',
                  fontWeight: 700,
                  textAlign: 'left',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {product.name}
              </p>
              {product.description && (
                <p
                  style={{
                    margin: '0 20px 20px',
                    fontSize: 'var(--flyer-link-size)',
                    color: 'var(--flyer-text-muted)',
                    lineHeight: 1.4,
                    textAlign: 'left',
                  }}
                >
                  {product.description}
                </p>
              )}
            </button>
          ))}
        </div>
      </section>

      {productModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
          onClick={() => setProductModal(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--flyer-bg-dark)',
              color: 'var(--flyer-text)',
              maxWidth: 480,
              width: '100%',
              padding: 'var(--flyer-spacing-lg)',
              border: 'var(--flyer-border-thick) solid var(--flyer-accent-alt)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={productModal.imageUrl}
              alt={productModal.name}
              style={{ width: '100%', height: 280, objectFit: 'cover', marginBottom: 24 }}
            />
            <h3
              style={{
                margin: '0 0 14px',
                fontFamily: 'var(--flyer-heading-font)',
                fontSize: 'var(--flyer-heading-size-sm)',
                fontWeight: 400,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {productModal.name}
            </h3>
            {productModal.description && (
              <p style={{ margin: '0 0 24px', fontSize: 'var(--flyer-cta-size)', color: 'var(--flyer-text-muted)', lineHeight: 1.5 }}>
                {productModal.description}
              </p>
            )}
            {productModal.url && (
              <a
                href={productModal.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: 'var(--flyer-accent-alt)',
                  color: '#000',
                  textDecoration: 'none',
                  fontSize: 'var(--flyer-link-size)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Learn more
              </a>
            )}
            <button
              type="button"
              onClick={() => setProductModal(null)}
              style={{
                marginTop: 28,
                padding: '12px 24px',
                backgroundColor: 'transparent',
                color: 'var(--flyer-text)',
                border: 'var(--flyer-border-thick) solid var(--flyer-text)',
                cursor: 'pointer',
                fontSize: 'var(--flyer-link-size)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Media: responsive grid */}
      <section
        data-reveal
        className="demo-section"
        style={{
          paddingTop: 'var(--flyer-spacing-xl)',
          paddingBottom: 'var(--flyer-spacing-xl)',
          backgroundColor: 'var(--flyer-bg-dark)',
          color: 'var(--flyer-text)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--flyer-heading-font)',
            fontSize: 'var(--flyer-heading-size-sm)',
            fontWeight: 400,
            margin: '0 0 var(--flyer-spacing)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            textAlign: 'center',
          }}
        >
          Recent media
        </h2>
        <div className="demo-media-grid">
          {data.mediaPosts.slice(0, 5).map((post) => (
            <a
              key={post.id}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                overflow: 'hidden',
                backgroundColor: 'var(--flyer-bg-block)',
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              {post.thumbnailUrl && (
                <img
                  src={post.thumbnailUrl}
                  alt={post.title ?? post.type}
                  style={{ width: '100%', height: 200, objectFit: 'cover' }}
                />
              )}
              {post.title && (
                <p
                  style={{
                    margin: 14,
                    fontSize: 'var(--flyer-link-size)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--flyer-text-muted)',
                  }}
                >
                  {post.title}
                </p>
              )}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
