/**
 * DID resolution endpoint.
 */

import type { Application } from 'express';

export function registerDidResolveRoute(app: Application): void {
    app.get('/api/did/:did', (req, res) => {
      // Resolve DID document
      const { did } = req.params;

      // In production, implement proper DID resolution
      res.json({
        '@context': 'https://www.w3.org/ns/did/v1',
        id: did,
        publicKey: [{
          id: `${did}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
        }]
      });
    });
}
