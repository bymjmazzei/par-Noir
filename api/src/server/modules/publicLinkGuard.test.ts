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

  it('passes rows with no Pen links without calling Safe Browsing', async () => {
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

  it('skips Safe Browsing when no key is set', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await checkPublicLinks(post([open('https://example.com')]), undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a Safe Browsing match', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [{ threat: { url: 'https://example.com/' } }] })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await checkPublicLinks(post([open('https://example.com')]), 'key')).toMatchObject({
      status: 400,
      error: 'unsafe_link'
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.threatInfo.threatEntries).toEqual([{ url: 'https://example.com/' }]);
  });

  it('passes a clean Safe Browsing answer', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await checkPublicLinks(post([open('https://example.com')]), 'key')).toBeNull();
  });

  it('fails closed when Safe Browsing is down', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    expect(await checkPublicLinks(post([open('https://example.com')]), 'key')).toMatchObject({
      status: 503,
      error: 'link_check_unavailable'
    });
  });
});
