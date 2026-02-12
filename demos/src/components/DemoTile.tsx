import React from 'react';
import { Link } from 'react-router-dom';
import type { DemoTileMeta } from '@/config/demos';

interface DemoTileProps {
  demo: DemoTileMeta;
}

export function DemoTile({ demo }: DemoTileProps) {
  return (
    <Link
      to={`/demo/${demo.slug}`}
      className="home-card"
      aria-label={`View demo: ${demo.title}`}
    >
      <div className="home-card-preview">
        <img
          src={demo.thumbnailPath}
          alt=""
          width={320}
          height={200}
          loading="lazy"
          className="home-card-preview-img"
        />
      </div>
      <div className="home-card-body">
        <div className="home-card-category">{demo.category}</div>
        <h3 className="home-card-title">{demo.title}</h3>
        <div className="home-card-price">${demo.price}</div>
        <span className="home-card-cta">View demo &rarr;</span>
      </div>
    </Link>
  );
}
