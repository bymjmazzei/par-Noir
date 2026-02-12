import React from 'react';

/**
 * SVG divider at the bottom of the hero. Wavy edge into the next section.
 */
export function HeroDecoration() {
  return (
    <div className="home-hero-divider" aria-hidden>
      <svg
        viewBox="0 0 1200 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        {/* Single clean fill shape (no extra stroke/shadow) */}
        <path
          d="M0 0 C260 22 520 0 760 0 C980 0 1080 22 1200 0 L1200 36 L0 36 Z"
          fill="var(--home-bg)"
        />
      </svg>
    </div>
  );
}
