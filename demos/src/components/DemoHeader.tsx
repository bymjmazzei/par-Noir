import React from 'react';
import { Link } from 'react-router-dom';

export function DemoHeader() {
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        zIndex: 100,
      }}
    >
      <Link
        to="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#fff',
          textDecoration: 'none',
          fontSize: 14,
        }}
      >
        <span aria-hidden="true">←</span>
        <span>Back</span>
      </Link>
    </header>
  );
}
