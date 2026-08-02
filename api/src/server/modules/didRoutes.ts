/**
 * DID creation and resolution endpoints.
 */

import type { Application } from 'express';
import { generateDID } from '../utils/identifierGenerators';

/** DID management endpoints */
export function registerDidCreateRoute(app: Application): void {
    app.post('/api/did/create', (req, res) => {
      // Create new DID
      const { username, publicKey } = req.body;

      if (!username || !publicKey) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const did = `did:key:${generateDID(username, publicKey)}`;
      return res.json({ did, createdAt: new Date().toISOString() });
    });
}

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
