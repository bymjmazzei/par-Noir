/**
 * In-memory Google Sheets + Drive for conversation-sheet tests.
 * Unknown tabs answer 400 like Google ("Unable to parse range").
 */

type FakeFile = { name: string; parents: string[]; tabs: Record<string, string[][]> };

export type FakeGoogle = {
  files: Record<string, FakeFile>;
  calls: Array<{ url: string; method: string; body?: unknown }>;
  fetch: typeof fetch;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function rowsFrom(range: string): { tab: string; startRow: number } {
  const [tab, cells = 'A1'] = range.split('!');
  const start = cells.split(':')[0] || 'A1';
  const digits = start.replace(/[A-Z]/gi, '');
  return { tab, startRow: digits ? Number(digits) : 1 };
}

export function createFakeGoogle(
  files: Record<string, FakeFile>,
  onOther?: (url: string, init?: RequestInit) => Response | Promise<Response>
): FakeGoogle {
  const calls: FakeGoogle['calls'] = [];
  let created = 0;

  const handler = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();
    const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const u = new URL(url);

    if (u.hostname === 'sheets.googleapis.com') {
      const path = decodeURIComponent(u.pathname.replace(/^\/v4\/spreadsheets\/?/, ''));
      if (!path) return json({ error: 'spreadsheets.create lands in My Drive root' }, 400);
      const [id, ...restParts] = path.split('/');
      const rest = restParts.join('/');
      const batch = id.endsWith(':batchUpdate');
      const sheetId = batch ? id.slice(0, -':batchUpdate'.length) : id;
      const file = files[sheetId];
      if (!file) return json({ error: 'not found' }, 404);
      if (batch) {
        for (const req of body.requests || []) {
          if (req.addSheet) file.tabs[req.addSheet.properties.title] = [];
          const rename = req.updateSheetProperties?.properties;
          if (rename?.title !== undefined) {
            const entries = Object.entries(file.tabs);
            const at = Number(rename.sheetId);
            if (entries[at]) entries[at] = [rename.title, entries[at][1]];
            file.tabs = Object.fromEntries(entries);
          }
        }
        return json({});
      }
      if (!rest) {
        return json({
          sheets: Object.keys(file.tabs).map((title, i) => ({ properties: { sheetId: i, title } })),
        });
      }
      if (rest.startsWith('values/')) {
        const append = rest.endsWith(':append');
        const range = rest.slice('values/'.length).replace(/:append$/, '');
        const { tab, startRow } = rowsFrom(range);
        const grid = file.tabs[tab];
        if (!grid) return json({ error: { message: `Unable to parse range: ${range}` } }, 400);
        if (append) {
          grid.push(...(body.values as string[][]));
          return json({ updates: { updatedRows: body.values.length } });
        }
        if (method === 'PUT') {
          (body.values as string[][]).forEach((row, i) => {
            grid[startRow - 1 + i] = row;
          });
          return json({});
        }
        return json({ values: grid.slice(startRow - 1).filter(Boolean) });
      }
    }

    if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/drive/v3/files')) {
      const id = decodeURIComponent(u.pathname.replace(/^\/drive\/v3\/files\/?/, ''));
      if (!id && method === 'POST') {
        const meta = JSON.parse(String(init?.body)) as { name: string; parents?: string[] };
        const fid = `created-${++created}`;
        files[fid] = { name: meta.name, parents: meta.parents || [], tabs: { Sheet1: [] } };
        return json({ id: fid, name: meta.name });
      }
      if (!id) {
        const q = u.searchParams.get('q') || '';
        const name = /name='([^']+)'/.exec(q)?.[1];
        const parent = /'([^']+)' in parents/.exec(q)?.[1];
        const hits = Object.entries(files)
          .filter(([, f]) => (!name || f.name === name) && (!parent || f.parents.includes(parent)))
          .map(([fid, f]) => ({ id: fid, name: f.name, parents: f.parents }));
        return json({ files: hits });
      }
      const file = files[id];
      if (!file) return json({ error: 'not found' }, 404);
      return json({ id, name: file.name, parents: file.parents });
    }

    if (onOther) return onOther(url, init);
    return json({ error: `unexpected ${method} ${url}` }, 500);
  };

  return { files, calls, fetch: handler as typeof fetch };
}
