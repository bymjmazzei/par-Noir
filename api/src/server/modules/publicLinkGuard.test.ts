import { checkPublicLinks } from './publicLinkGuard';

function post(layers: Array<Record<string, unknown>>) {
  return {
    fileId: 'f1',
    isPublic: true,
    penFeedPage: { canvas: { w: 100, h: 100 }, actionSection: { slug: 'p', layers } }
  };
}

const open = (openUrl: string, label = 'Go') => ({
  id: 'b',
  kind: 'interactive',
  behavior: 'cta.open',
  openUrl,
  label
});

describe('checkPublicLinks', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('passes rows with no Pen links without calling Web Risk', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await checkPublicLinks({ fileId: 'f1', name: 'x' }, 'key')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects links the shared check blocks', async () => {
    expect(await checkPublicLinks(post([open('http://example.com')]), undefined)).toMatchObject({
      status: 400,
      error: 'unsafe_link'
    });
    expect(await checkPublicLinks(post([open('https://parnoir.com@evil.com')]), undefined)).toMatchObject({
      error: 'unsafe_link'
    });
    expect(await checkPublicLinks(post([open('https://grabify.link/x')]), undefined)).toMatchObject({
      error: 'unsafe_link'
    });
  });

  it('finds links in actionOverlays too', async () => {
    const meta = { fileId: 'f1', actionOverlays: [{ layer: open('https://10.0.0.1/') }] };
    expect(await checkPublicLinks(meta, undefined)).toMatchObject({ error: 'unsafe_link' });
  });

  it('rejects forms that ask for a secret', async () => {
    const layers = [
      { id: 'g', kind: 'group' },
      { id: 'in', kind: 'text', widgetElement: 'input', name: 'Seed phrase', parentGroupId: 'g' },
      { id: 's', kind: 'interactive', behavior: 'widget.submit', submitTo: 'a@b.co', parentGroupId: 'g' }
    ];
    expect(await checkPublicLinks(post(layers), undefined)).toMatchObject({
      status: 400,
      error: 'secret_prompt'
    });
  });

  it('skips Web Risk when no key is set', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await checkPublicLinks(post([open('https://example.com')]), undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a Web Risk match', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ threat: { threatTypes: ['SOCIAL_ENGINEERING'], expireTime: '2026-10-19T00:00:00Z' } })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await checkPublicLinks(post([open('https://example.com')]), 'key')).toMatchObject({
      status: 400,
      error: 'unsafe_link'
    });
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.origin + requested.pathname).toBe('https://webrisk.googleapis.com/v1/uris:search');
    expect(requested.searchParams.get('uri')).toBe('https://example.com/');
    expect(requested.searchParams.get('key')).toBe('key');
    expect(requested.searchParams.getAll('threatTypes')).toEqual([
      'MALWARE',
      'SOCIAL_ENGINEERING',
      'UNWANTED_SOFTWARE',
      'SOCIAL_ENGINEERING_EXTENDED_COVERAGE'
    ]);
  });

  it('looks up each distinct link once', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const layers = [open('https://a.example'), { ...open('https://b.example'), id: 'c' }, { ...open('https://a.example'), id: 'd' }];
    expect(await checkPublicLinks(post(layers), 'key')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses posts with more links than it will pay to check', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const layers = Array.from({ length: 26 }, (_, i) => ({ ...open(`https://site${i}.example`), id: `b${i}` }));
    expect(await checkPublicLinks(post(layers), 'key')).toMatchObject({ status: 400, error: 'unsafe_link' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes a clean Web Risk answer', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await checkPublicLinks(post([open('https://example.com')]), 'key')).toBeNull();
  });

  it('fails closed when Web Risk is down', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    expect(await checkPublicLinks(post([open('https://example.com')]), 'key')).toMatchObject({
      status: 503,
      error: 'link_check_unavailable'
    });
  });
});
