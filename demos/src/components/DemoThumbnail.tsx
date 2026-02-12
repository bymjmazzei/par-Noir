import React from 'react';
import { Link } from 'react-router-dom';
import type { DemoTileMeta } from '@/config/demos';

interface DemoThumbnailProps {
  demo: DemoTileMeta;
}

/**
 * Compact demo card for use inside offering columns: thumbnail + title + View demo link.
 */
export function DemoThumbnail({ demo }: DemoThumbnailProps) {
  return (
    <Link
      to={`/demo/${demo.slug}`}
      className="home-offering-demo"
      aria-label={`View demo: ${demo.title}`}
    >
      <div className="home-offering-demo-preview">
        <img
          src={demo.thumbnailPath}
          alt=""
          width={320}
          height={200}
          loading="lazy"
        />
      </div>
      <div className="home-offering-demo-info">
        <span className="home-offering-demo-title">{demo.title}</span>
        <span className="home-offering-demo-cta">View demo &rarr;</span>
      </div>
    </Link>
  );
}
