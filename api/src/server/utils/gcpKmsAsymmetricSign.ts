/**
 * GCP Cloud KMS asymmetricSign over a precomputed SHA-256 digest (RFC 4648 base64 digest bytes).
 * Used for JWT signing (OAuth) and creator-fund period attestations when configured.
 */

import { GoogleAuth } from 'google-auth-library';

export async function gcpKmsAsymmetricSignSha256Digest(
  kmsKeyVersionResource: string,
  sha256DigestBase64: string
): Promise<string> {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const url = `https://cloudkms.googleapis.com/v1/${kmsKeyVersionResource}:asymmetricSign`;
  const res = await client.request<{ signature?: string }>({
    url,
    method: 'POST',
    data: { digest: { sha256: sha256DigestBase64 } }
  });
  const sig = res.data.signature;
  if (!sig) throw new Error('KMS asymmetricSign returned no signature');
  return sig;
}
