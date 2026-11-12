/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManifestSummary } from '@par-noir/pn-provenance';
import { ContentCredentialsBadge, type PostCredentials } from './ContentCredentialsBadge.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function summary(over: Partial<ManifestSummary>): ManifestSummary {
  return {
    v: 1,
    label: 'urn:c2pa:x',
    trust: 'trusted',
    signer: { commonName: 'par Noir Pen', issuer: null, alg: null, time: null },
    claimGenerator: { name: 'par Noir Pen', version: '1.0.0' },
    pnAuthor: null,
    creator: null,
    ingredients: [],
    trainingMining: null,
    workLicense: null,
    penDoc: null,
    failures: [],
    ...over
  };
}

function render(credentials: PostCredentials | undefined, onOpenHandle?: (h: string) => void) {
  act(() => root.render(<ContentCredentialsBadge credentials={credentials} onOpenHandle={onOpenHandle} />));
}

function button(text: string) {
  return Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) || null;
}

describe('ContentCredentialsBadge', () => {
  it('renders nothing without verified credentials', () => {
    render(undefined);
    expect(host.innerHTML).toBe('');
    render({ c2pa: summary({ trust: 'invalid' }) });
    expect(host.innerHTML).toBe('');
  });

  it('shows the signer, then the creator and ingredients when opened', () => {
    const onOpenHandle = vi.fn();
    render(
      {
        c2pa: summary({
          creator: { kind: 'pn', handle: 'bymjmazzei', authorKeyId: 'k' },
          ingredients: [
            {
              title: 'Attached image',
              format: 'image/jpeg',
              relationship: 'componentOf',
              manifestLabel: 'urn:c2pa:a',
              trust: 'trusted',
              signer: 'Adobe Inc.',
              generator: 'Adobe Photoshop',
              creator: { kind: 'cawg', display: 'Ada (Instagram)' },
              workLicense: null
            }
          ]
        })
      },
      onOpenHandle
    );
    expect(host.textContent).toContain('Made in Pen');
    expect(host.textContent).not.toContain('Ada');

    act(() => button('Made in Pen')!.click());
    expect(host.textContent).toContain('Signature from a trusted signer');
    expect(host.textContent).toContain('Attached image by Ada (Instagram) · Made with Adobe Photoshop');
    act(() => button('@bymjmazzei')!.click());
    expect(onOpenHandle).toHaveBeenCalledWith('bymjmazzei');
    expect(button('Ada')).toBeNull();
  });

  it('names the original creator on a copy and flags an untrusted signer', () => {
    render({
      c2pa: summary({ trust: 'untrusted', creator: { kind: 'cawg', display: 'Ada (Instagram)' } }),
      originality: {
        kind: 'copy',
        creator: { kind: 'cawg', display: 'Ada (Instagram)' },
        verifiedOriginal: false,
        reason: 'license_forbids_reuse'
      }
    });
    expect(host.textContent).toContain('unverified');
    expect(host.querySelector('.pen-content-credentials-original')?.textContent).toBe('Original by Ada (Instagram)');
  });
});
