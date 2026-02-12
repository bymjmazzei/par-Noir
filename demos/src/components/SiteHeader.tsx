import React from 'react';
import { Link } from 'react-router-dom';

export function SiteHeader() {
  return (
    <header className="home-header">
      <div className="home-container home-header-inner">
        <Link to="/" className="home-logo" aria-label="Home">
          par Noir
        </Link>
        <nav className="home-nav" aria-label="Main">
          <a href="#offerings">Offerings</a>
          <a href="#offerings">Demos</a>
          <a href="mailto:hello@parnoir.com">Contact</a>
        </nav>
      </div>
    </header>
  );
}
