/**
 * Check if a Google Drive file's view URL is "dead" (deleted / not found).
 * Uses unauthenticated GET to https://drive.google.com/file/d/{fileId}/view.
 * No OAuth or service account required.
 *
 * - Dead (return true): 404, or HTML contains "does not exist", "has been deleted", etc.
 * - Keep (return false): 403, or "you need access" / "request access" (file exists, we just cannot open it).
 * - Keep: timeout, network error, or unknown content (fail safe).
 */
export async function isDriveFileUrlDead(fileId: string): Promise<boolean> {
  const url = `https://drive.google.com/file/d/${fileId}/view`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    const text = (await res.text()).toLowerCase();

    // Dead: 404 or page says file is gone
    if (res.status === 404) return true;
    const deadPhrases = [
      'does not exist',
      'has been deleted',
      'has been removed',
      'no longer exist',
      'could not find',
      'in the trash',
      'moved to trash',
    ];
    if (deadPhrases.some((p) => text.includes(p))) return true;

    // Keep: 403 or "need access" etc. (file exists, we just cannot open it)
    if (res.status === 403) return false;
    const keepPhrases = ['you need access', 'request access', 'ask for access', 'owner has denied'];
    if (keepPhrases.some((p) => text.includes(p))) return false;

    // Unknown: fail safe, keep
    return false;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}
