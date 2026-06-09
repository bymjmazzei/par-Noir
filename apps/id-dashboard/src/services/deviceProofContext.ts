/**
 * Module-level device proof signer wired by useDeviceAuthState after unlock.
 */

export type DeviceProofSigner = (
  method: string,
  path: string,
  body?: unknown
) => Promise<Record<string, string>>;

let signer: DeviceProofSigner | null = null;

export function setDeviceProofSigner(fn: DeviceProofSigner | null): void {
  signer = fn;
}

export async function deviceProofHeaders(
  method: string,
  path: string,
  body?: unknown
): Promise<Record<string, string>> {
  if (!signer) return {};
  return signer(method, path, body);
}
