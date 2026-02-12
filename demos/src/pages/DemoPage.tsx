import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { isValidSlug } from '@/constants/slugs';
import type { DemoSlug } from '@/constants/slugs';
import { getMockData } from '@/data/mockData';
import { getTemplateComponent } from '@/templates';

export function DemoPage() {
  const { slug } = useParams<{ slug: string }>();

  if (!slug || !isValidSlug(slug)) {
    return <Navigate to="/" replace />;
  }

  const data = getMockData(slug as DemoSlug);
  const Template = getTemplateComponent(slug as DemoSlug);

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)' }}>
      <Template data={data} />
    </div>
  );
}
