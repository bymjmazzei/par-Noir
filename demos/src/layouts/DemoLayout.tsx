import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { DemoHeader } from '@/components/DemoHeader';
import '@/styles/demo-responsive.css';
import '@/styles/reveal.css';

export function DemoLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!elements.length) return;

    // Reset on route changes so each demo animates once.
    for (const el of elements) el.classList.remove('reveal-in');

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).classList.add('reveal-in');
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );

    for (const el of elements) io.observe(el);
    return () => io.disconnect();
  }, [pathname]);

  return (
    <>
      <DemoHeader />
      <main
        style={{
          paddingTop: 48,
          minHeight: '100vh',
          overflowX: 'hidden',
        }}
      >
        <Outlet />
      </main>
    </>
  );
}
