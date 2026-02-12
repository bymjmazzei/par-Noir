import React from 'react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="home-footer">
      <div className="home-container">
        <div className="home-footer-inner">
          <div className="home-footer-col">
            <h4>Offerings</h4>
            <Link to="/#offerings">Link in bio</Link>
            <Link to="/#offerings">Single-page sites</Link>
          </div>
          <div className="home-footer-col">
            <h4>Demos</h4>
            <Link to="/#offerings">View all demos</Link>
          </div>
          <div className="home-footer-col">
            <h4>Contact</h4>
            <a href="mailto:hello@parnoir.com">Get in touch</a>
          </div>
        </div>
        <div className="home-footer-bottom">
          &copy; {new Date().getFullYear()} par Noir. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
