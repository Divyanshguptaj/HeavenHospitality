import { afterEach, describe, expect, it, vi } from 'vitest';

const { ExpoPushProvider } = await import('../src/modules/notifications/providers/push.provider.js');

const TOKEN = 'ExponentPushToken[abcdefghijklmnopqrstuv]';
const message = { to: TOKEN, title: 'Rent due', body: '₹5,000 is due', data: { route: '/(resident)/rent' } };

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ExpoPushProvider.send', () => {
  it('posts to the Expo send endpoint on the default Android channel', async () => {
    const fetchMock = stubFetch(json({ data: [{ status: 'ok', id: 'ticket-1' }] }));

    const tickets = await new ExpoPushProvider().send([message]);

    expect(tickets).toEqual([{ ok: true, ticketId: 'ticket-1', error: null }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual([
      {
        to: TOKEN,
        title: 'Rent due',
        body: '₹5,000 is due',
        data: { route: '/(resident)/rent' },
        sound: 'default',
        channelId: 'default',
      },
    ]);
  });

  it('sends no authorization header unless an access token is configured', async () => {
    const fetchMock = stubFetch(json({ data: [{ status: 'ok', id: 't' }] }));
    await new ExpoPushProvider().send([message]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['authorization']).toBeUndefined();
  });

  it('reports a rejected token with Expo’s error code', async () => {
    stubFetch(
      json({
        data: [{ status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }],
      }),
    );

    const [ticket] = await new ExpoPushProvider().send([message]);

    expect(ticket).toEqual({ ok: false, ticketId: null, error: 'DeviceNotRegistered' });
  });

  it('keeps tickets aligned with messages when only some are accepted', async () => {
    stubFetch(
      json({
        data: [
          { status: 'ok', id: 'a' },
          { status: 'error', message: 'bad', details: { error: 'MessageTooBig' } },
        ],
      }),
    );

    const tickets = await new ExpoPushProvider().send([message, { ...message, to: `${TOKEN}x` }]);

    expect(tickets.map((t) => t.ok)).toEqual([true, false]);
    expect(tickets[1]?.error).toBe('MessageTooBig');
  });

  it('fails every message, without throwing, when Expo is unreachable', async () => {
    stubFetch(new Error('network down'));
    const tickets = await new ExpoPushProvider().send([message, message]);
    expect(tickets).toEqual([
      { ok: false, ticketId: null, error: 'ExpoUnreachable' },
      { ok: false, ticketId: null, error: 'ExpoUnreachable' },
    ]);
  });

  it('fails every message on an HTTP error', async () => {
    stubFetch(new Response('boom', { status: 503 }));
    const [ticket] = await new ExpoPushProvider().send([message]);
    expect(ticket?.error).toBe('ExpoHttp503');
  });

  it('fails every message when the ticket count does not match', async () => {
    stubFetch(json({ data: [] }));
    const [ticket] = await new ExpoPushProvider().send([message]);
    expect(ticket?.error).toBe('ExpoBadResponse');
  });

  it('makes no request for an empty batch', async () => {
    const fetchMock = stubFetch(json({ data: [] }));
    expect(await new ExpoPushProvider().send([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ExpoPushProvider.getReceipts', () => {
  it('maps delivered and failed receipts by ticket id', async () => {
    const fetchMock = stubFetch(
      json({
        data: {
          t1: { status: 'ok' },
          t2: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        },
      }),
    );

    const receipts = await new ExpoPushProvider().getReceipts(['t1', 't2']);

    expect(receipts.get('t1')).toEqual({ ok: true, error: null });
    expect(receipts.get('t2')).toEqual({ ok: false, error: 'DeviceNotRegistered' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/getReceipts');
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['t1', 't2'] });
  });

  it('returns nothing, and asks nothing, for no ticket ids', async () => {
    const fetchMock = stubFetch(json({ data: {} }));
    expect((await new ExpoPushProvider().getReceipts([])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns nothing when Expo answers with an error status', async () => {
    stubFetch(new Response('no', { status: 500 }));
    expect((await new ExpoPushProvider().getReceipts(['t1'])).size).toBe(0);
  });
});
