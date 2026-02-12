import React from 'react';
import { LinkBio1 } from '@/templates/link-bio/LinkBio1';
import { LinkBio2 } from '@/templates/link-bio/LinkBio2';
import { LinkBio3 } from '@/templates/link-bio/LinkBio3';
import { OnePage1 } from '@/templates/one-page/OnePage1';
import { OnePage2 } from '@/templates/one-page/OnePage2';
import { OnePage3 } from '@/templates/one-page/OnePage3';
import type { TemplateDataLinkBio, TemplateDataOnePage } from '@/types/templateData';
import type { DemoSlug } from '@/constants/slugs';

type TemplateData = TemplateDataLinkBio | TemplateDataOnePage;

const LINK_BIO = [
  LinkBio1,
  LinkBio2,
  LinkBio3,
] as const;

const ONE_PAGE = [
  OnePage1,
  OnePage2,
  OnePage3,
] as const;

export function getTemplateComponent(slug: DemoSlug): React.ComponentType<{ data: TemplateData }> {
  switch (slug) {
    case 'link-bio-1':
      return LinkBio1 as React.ComponentType<{ data: TemplateData }>;
    case 'link-bio-2':
      return LinkBio2 as React.ComponentType<{ data: TemplateData }>;
    case 'link-bio-3':
      return LinkBio3 as React.ComponentType<{ data: TemplateData }>;
    case 'one-page-1':
      return OnePage1 as React.ComponentType<{ data: TemplateData }>;
    case 'one-page-2':
      return OnePage2 as React.ComponentType<{ data: TemplateData }>;
    case 'one-page-3':
      return OnePage3 as React.ComponentType<{ data: TemplateData }>;
    default:
      return LinkBio1 as React.ComponentType<{ data: TemplateData }>;
  }
}
