/**
 * License Types for Rights & Licensing
 */

export interface LicenseInfo {
  value: string;
  label: string;
  description: string;
}

export const LICENSE_TYPES: LicenseInfo[] = [
  {
    value: 'all-rights-reserved',
    label: 'All Rights Reserved',
    description: 'Copyrighted content - no reuse without permission'
  },
  {
    value: 'cc-by',
    label: 'CC BY (Attribution)',
    description: 'Free to use with attribution to the creator'
  },
  {
    value: 'cc-by-sa',
    label: 'CC BY-SA (Attribution-ShareAlike)',
    description: 'Free to use with attribution, derivatives must use same license'
  },
  {
    value: 'cc-by-nc',
    label: 'CC BY-NC (Attribution-NonCommercial)',
    description: 'Free to use with attribution, non-commercial use only'
  },
  {
    value: 'cc-by-nc-sa',
    label: 'CC BY-NC-SA (Attribution-NonCommercial-ShareAlike)',
    description: 'Free to use with attribution, non-commercial, derivatives must use same license'
  },
  {
    value: 'cc-by-nd',
    label: 'CC BY-ND (Attribution-NoDerivs)',
    description: 'Free to use with attribution, no derivatives allowed'
  },
  {
    value: 'cc-by-nc-nd',
    label: 'CC BY-NC-ND (Attribution-NonCommercial-NoDerivs)',
    description: 'Free to use with attribution, non-commercial, no derivatives'
  },
  {
    value: 'cc0',
    label: 'CC0 (Public Domain)',
    description: 'Dedicated to public domain - no attribution required'
  },
  {
    value: 'public-domain',
    label: 'Public Domain',
    description: 'Content in the public domain - free to use'
  },
  {
    value: 'fair-use',
    label: 'Fair Use',
    description: 'Used under fair use doctrine for commentary, criticism, etc.'
  }
];

/**
 * Get license info by value
 */
export function getLicenseInfo(value: string): LicenseInfo | undefined {
  return LICENSE_TYPES.find(license => license.value === value);
}

