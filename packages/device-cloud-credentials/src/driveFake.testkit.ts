/**
 * In-memory Google Drive + Sheets for tests. Every request yields to the event loop
 * first, so concurrent find-then-create paths interleave the way they do on real Drive.
 */

export type FakeDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  seq: number;
  content: string;
};

export type FakeDriveCall = { method: string; url: string };

const FOLDER = 'application/vnd.google-apps.folder';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unescapeQuery(value: string): string {
  return value.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function bodyText(body: BodyInit | null | undefined): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return String(body);
}

export function createFakeDrive() {
  const files = new Map<string, FakeDriveFile>();
  const calls: FakeDriveCall[] = [];
  let seq = 0;

  function add(name: string, mimeType: string, parents: string[], content = ''): FakeDriveFile {
    seq += 1;
    const file = { id: `f${seq}`, name, mimeType, parents, seq, content };
    files.set(file.id, file);
    return file;
  }

  function list(q: string): FakeDriveFile[] {
    const name = q.match(/name='((?:\\.|[^'])*)'/)?.[1];
    const parent = q.match(/'([^']+)' in parents/)?.[1];
    const mime = q.match(/mimeType='([^']+)'/)?.[1];
    return [...files.values()]
      .filter((f) => (name === undefined || f.name === unescapeQuery(name)))
      .filter((f) => (parent === undefined || f.parents.includes(parent)))
      .filter((f) => (mime === undefined || f.mimeType === mime))
      .sort((a, b) => a.seq - b.seq);
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const url = new URL(String(input));
    const method = (init?.method || 'GET').toUpperCase();
    calls.push({ method, url: url.toString() });
    const path = url.pathname;

    if (url.hostname === 'sheets.googleapis.com') {
      if (method === 'GET') return json({ sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] });
      return json({});
    }

    if (path === '/drive/v3/files' && method === 'GET') {
      const found = list(url.searchParams.get('q') || '');
      return json({ files: found.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })) });
    }

    if (path === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(bodyText(init?.body)) as { name: string; mimeType: string; parents?: string[] };
      const file = add(meta.name, meta.mimeType, meta.parents || []);
      return json({ id: file.id, name: file.name, mimeType: file.mimeType });
    }

    if (path === '/upload/drive/v3/files' && method === 'POST') {
      const raw = bodyText(init?.body);
      const parts = raw.split('\r\n\r\n');
      const meta = JSON.parse(parts[1]!.split('\r\n--')[0]!) as { name: string; parents?: string[] };
      const content = parts.slice(2).join('\r\n\r\n').replace(/\r\n--[^\r\n]*--$/, '');
      const file = add(meta.name, 'application/octet-stream', meta.parents || [], content);
      return json({ id: file.id, name: file.name });
    }

    const uploadMatch = path.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (uploadMatch && method === 'PATCH') {
      const file = files.get(decodeURIComponent(uploadMatch[1]!));
      if (!file) return json({ error: 'not_found' }, 404);
      file.content = bodyText(init?.body);
      return json({ id: file.id, name: file.name });
    }

    const fileMatch = path.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (fileMatch) {
      const file = files.get(decodeURIComponent(fileMatch[1]!));
      if (method === 'DELETE') {
        if (file) files.delete(file.id);
        return new Response(null, { status: 204 });
      }
      if (!file) return json({ error: 'not_found' }, 404);
      if (method === 'GET' && url.searchParams.get('alt') === 'media') return new Response(file.content);
      return json({ id: file.id, name: file.name, mimeType: file.mimeType, parents: file.parents });
    }

    return json({ error: 'fake_drive_unhandled', path }, 404);
  }) as typeof fetch;

  return {
    files,
    calls,
    fetchImpl,
    addFolder: (name: string, parent: string) => add(name, FOLDER, [parent]),
    children: (parent: string, name?: string) =>
      [...files.values()].filter((f) => f.parents.includes(parent) && (name === undefined || f.name === name)),
  };
}
