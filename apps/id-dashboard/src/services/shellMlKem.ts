/** ML-KEM secret from the current shell unlock. Lock clears it. It never goes to the API. */
const secrets = new Map<string, string>();

export function rememberShellMlKem(ids: Array<string | null | undefined>, secret: string): void {
  if (!secret) return;
  for (const id of ids) {
    if (id) secrets.set(id, secret);
  }
}

export function readShellMlKem(id: string | null | undefined): string | null {
  if (!id) return null;
  return secrets.get(id) || null;
}

export function clearShellMlKem(): void {
  secrets.clear();
}
