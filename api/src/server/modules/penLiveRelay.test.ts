/**
 * @jest-environment node
 *
 * The relay is the only server piece of live co-editing. These tests prove it
 * refuses unauthenticated sockets, drops oversize and out-of-room traffic,
 * never echoes to the sender, and rate limits a flooding socket.
 */
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { attachPenLiveRelay, PEN_LIVE_MAX_PAYLOAD_CHARS } from './penLiveRelay';

const ROOM = 'a'.repeat(64);
const OTHER_ROOM = 'b'.repeat(64);

let http: HttpServer;
let ioServer: SocketIOServer;
let url: string;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  http = createServer();
  ioServer = new SocketIOServer(http);
  ioServer.use((socket, next) => {
    const pn = (socket.handshake.auth as { pn?: string } | undefined)?.pn;
    if (pn) (socket.data as { oauth?: { pnIdentifier: string } }).oauth = { pnIdentifier: pn };
    next();
  });
  ioServer.on('connection', (socket) => attachPenLiveRelay(socket));
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const c of clients.splice(0)) c.close();
});

afterAll(async () => {
  ioServer.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

async function client(pn?: string): Promise<ClientSocket> {
  const socket = connect(url, { auth: pn ? { pn } : {}, transports: ['websocket'], forceNew: true });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

function join(socket: ClientSocket, roomToken = ROOM): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit('pen:join', { roomToken }, resolve));
}

function collect(socket: ClientSocket, event: string): unknown[] {
  const got: unknown[] = [];
  socket.on(event, (msg: unknown) => got.push(msg));
  return got;
}

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('pen live relay', () => {
  it('relays a batch to other room members only, never back to the sender', async () => {
    const a = await client('pn-a');
    const b = await client('pn-b');
    const c = await client('pn-c');
    expect(await join(a)).toEqual({ ok: true });
    expect(await join(b)).toEqual({ ok: true });
    expect(await join(c, OTHER_ROOM)).toEqual({ ok: true });
    const atA = collect(a, 'pen:batch');
    const atB = collect(b, 'pen:batch');
    const atC = collect(c, 'pen:batch');
    a.emit('pen:batch', { roomToken: ROOM, payload: { ciphertext: 'x' } });
    await wait();
    expect(atB).toEqual([{ roomToken: ROOM, payload: { ciphertext: 'x' } }]);
    expect(atA).toEqual([]);
    expect(atC).toEqual([]);
  });

  it('relays encrypted control messages (key claims, role updates)', async () => {
    const a = await client('pn-a');
    const b = await client('pn-b');
    await join(a);
    await join(b);
    const atB = collect(b, 'pen:control');
    a.emit('pen:control', { roomToken: ROOM, payload: { docId: 'd', keyEpoch: 0, control: 'x' } });
    await wait();
    expect(atB).toEqual([{ roomToken: ROOM, payload: { docId: 'd', keyEpoch: 0, control: 'x' } }]);
  });

  it('refuses unauthenticated sockets', async () => {
    const anon = await client();
    const b = await client('pn-b');
    await join(b);
    const atB = collect(b, 'pen:sync');
    expect(await join(anon)).toEqual({ ok: false, error: 'unauthorized' });
    anon.emit('pen:sync', { roomToken: ROOM, payload: { ciphertext: 'x' } });
    await wait();
    expect(atB).toEqual([]);
  });

  it('rejects malformed room tokens and traffic for rooms the socket has not joined', async () => {
    const a = await client('pn-a');
    const b = await client('pn-b');
    await join(b);
    const atB = collect(b, 'pen:awareness');
    expect(await join(a, 'not-a-token')).toEqual({ ok: false, error: 'bad_room' });
    a.emit('pen:awareness', { roomToken: ROOM, payload: { ciphertext: 'x' } });
    await wait();
    expect(atB).toEqual([]);
  });

  it('drops oversize payloads', async () => {
    const a = await client('pn-a');
    const b = await client('pn-b');
    await join(a);
    await join(b);
    const atB = collect(b, 'pen:batch');
    a.emit('pen:batch', {
      roomToken: ROOM,
      payload: { ciphertext: 'x'.repeat(PEN_LIVE_MAX_PAYLOAD_CHARS + 1) }
    });
    a.emit('pen:batch', { roomToken: ROOM, payload: { ciphertext: 'ok' } });
    await wait();
    expect(atB).toEqual([{ roomToken: ROOM, payload: { ciphertext: 'ok' } }]);
  });

  it('stops relaying after leave', async () => {
    const a = await client('pn-a');
    const b = await client('pn-b');
    await join(a);
    await join(b);
    const atB = collect(b, 'pen:batch');
    a.emit('pen:leave', { roomToken: ROOM });
    await wait(20);
    a.emit('pen:batch', { roomToken: ROOM, payload: { ciphertext: 'x' } });
    await wait();
    expect(atB).toEqual([]);
  });

  it('rate limits a flooding socket', async () => {
    const a = await client('pn-a');
    const b = await client('pn-b');
    await join(a);
    await join(b);
    const atB = collect(b, 'pen:batch');
    for (let i = 0; i < 300; i++) a.emit('pen:batch', { roomToken: ROOM, payload: { i } });
    await wait(200);
    expect(atB.length).toBeGreaterThan(0);
    expect(atB.length).toBeLessThan(120);
  });
});
