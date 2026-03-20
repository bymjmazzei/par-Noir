import React from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { Footer } from '@/components/Footer';
import { DemoThumbnail } from '@/components/DemoThumbnail';
import { LINK_IN_BIO_TILES, ONE_PAGE_TILES } from '@/config/demos';
import '@/styles/home.css';

export function HomePage() {
  return (
    <div className="home-page">
      <SiteHeader />

      <section className="home-hero">
        <div className="home-container">
          <div className="home-hero-inner">
            <h1 className="home-headline">Own your audience.</h1>
            <p className="home-lead">
              Insulate your brand from platforms. Build your audience off-platform through email
              capture. Own your audience.
            </p>
          </div>
        </div>
      </section>

      <section id="offerings" className="home-offerings home-container">
        <div className="home-offerings-intro">
          <h2 className="home-section-title">What we offer</h2>
          <p className="home-section-lead">
            One-time design and build. No monthly fees. You own the site; you only pay for your
            domain each year.
          </p>
        </div>
        <div className="home-offerings-grid">
          <div className="home-offering-column">
            <div className="home-offering-price">$250</div>
            <div className="home-offering-note">Link in bio — no monthly fees, only yearly domain fees.</div>
            <p className="home-offering-desc">
              One link hub with email capture. Perfect for creators and brands who want a single
              destination off-platform.
            </p>
            <div className="home-offering-demos">
              {LINK_IN_BIO_TILES.map((demo) => (
                <DemoThumbnail key={demo.slug} demo={demo} />
              ))}
            </div>
          </div>
          <div className="home-offering-column">
            <div className="home-offering-price">$500</div>
            <div className="home-offering-note">Single-page site.</div>
            <p className="home-offering-desc">
              Full one-page site with hero, email capture, and sections. Your brand, your
              audience, off-platform.
            </p>
            <div className="home-offering-demos">
              {ONE_PAGE_TILES.map((demo) => (
                <DemoThumbnail key={demo.slug} demo={demo} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
