import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ base: 'https://releases.test' as string | undefined }));

vi.mock('../src/config/env.js', () => ({
  env: {
    get APP_RELEASES_BASE_URL() {
      return holder.base;
    },
  },
}));

vi.mock('../src/lib/logger.js', () => ({ logger: { warn: vi.fn() } }));

const {
  clearReleaseCache,
  getAppVersionInfo,
  getLatestUpdate,
  isValidRuntimeVersion,
  noUpdateReply,
  replyFor,
  updateReply,
} = await import('../src/modules/appRelease/release.service.js');

const asset = {
  url: 'https://releases.test/updates/1/u1/_expo/static/js/android/entry.hbc',
  hash: 'abc',
  key: 'def',
  contentType: 'application/javascript',
  fileExtension: null,
};

const record = {
  id: 'u1',
  createdAt: '2026-10-19T10:00:00.000Z',
  runtimeVersion: '1',
  launchAsset: asset,
  assets: [],
  extra: { expoClient: { name: 'The Heaven Hospitality' } },
};

function files(contents: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const path = url.replace('https://releases.test/', '');
    const value = contents[path];
    return Promise.resolve(
      value === undefined
        ? new Response('', { status: 403 })
        : new Response(JSON.stringify(value), { status: 200 }),
    );
  });
}

/** The JSON of the single part in a multipart reply. */
function part(reply: { body: string }): { name: string; json: Record<string, unknown> } {
  const name = /name="(\w+)"/.exec(reply.body)?.[1] ?? '';
  const json = JSON.parse(/\r\n\r\n([\s\S]*?)\r\n--/.exec(reply.body)?.[1] ?? '{}') as Record<string, unknown>;
  return { name, json };
}

beforeEach(() => {
  clearReleaseCache();
  holder.base = 'https://releases.test';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('which update a device is told about', () => {
  it('hands a device without the newest update its manifest', () => {
    const { name, json } = part(replyFor(record, 'older'));

    expect(name).toBe('manifest');
    expect(json['id']).toBe('u1');
    expect(json['runtimeVersion']).toBe('1');
    expect(json['launchAsset']).toEqual(asset);
    expect(json['extra']).toEqual(record.extra);
  });

  it('tells a device that already has the newest update there is nothing new', () => {
    const { name, json } = part(replyFor(record, 'u1'));

    expect(name).toBe('directive');
    expect(json).toEqual({ type: 'noUpdateAvailable' });
  });

  it('tells a device there is nothing new when no update was ever published', () => {
    expect(part(replyFor(null, undefined)).name).toBe('directive');
  });

  it('frames the reply as multipart with the boundary it declares', () => {
    const reply = updateReply(record);
    const boundary = /boundary=(.+)$/.exec(reply.contentType)?.[1];

    expect(reply.contentType).toMatch(/^multipart\/mixed; boundary=/);
    expect(reply.body.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(reply.body.endsWith(`--${boundary}--\r\n`)).toBe(true);
    expect(noUpdateReply().body).toContain('noUpdateAvailable');
  });
});

describe('reading what was published', () => {
  it('reads the newest update for a runtime version', async () => {
    vi.stubGlobal('fetch', files({ 'updates/1/latest.json': record }));

    expect((await getLatestUpdate('1'))?.id).toBe('u1');
  });

  it('finds nothing for a runtime version with no update', async () => {
    vi.stubGlobal('fetch', files({}));

    expect(await getLatestUpdate('2')).toBeNull();
  });

  it('refuses a runtime version that could point outside the updates folder', async () => {
    const fetchMock = files({});
    vi.stubGlobal('fetch', fetchMock);

    expect(isValidRuntimeVersion('../release')).toBe(false);
    expect(await getLatestUpdate('../release')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the newest and the minimum build', async () => {
    vi.stubGlobal(
      'fetch',
      files({
        'release/android.json': {
          latestVersionCode: 7,
          minVersionCode: 6,
          apkUrl: 'https://releases.test/apk/7.apk',
          notes: 'Fixes rent',
        },
      }),
    );

    expect(await getAppVersionInfo()).toEqual({
      latestVersionCode: 7,
      minVersionCode: 6,
      apkUrl: 'https://releases.test/apk/7.apk',
      notes: 'Fixes rent',
    });
  });

  it('blocks nobody when no build was published', async () => {
    vi.stubGlobal('fetch', files({}));

    expect(await getAppVersionInfo()).toEqual({
      latestVersionCode: 0,
      minVersionCode: 0,
      apkUrl: null,
      notes: null,
    });
  });

  it('blocks nobody when the bucket is not configured', async () => {
    holder.base = undefined;
    const fetchMock = files({});
    vi.stubGlobal('fetch', fetchMock);

    expect((await getAppVersionInfo()).minVersionCode).toBe(0);
    expect(await getLatestUpdate('1')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps serving the last known answer when the bucket becomes unreachable', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.stubGlobal('fetch', files({ 'updates/1/latest.json': record }));
    await getLatestUpdate('1');

    vi.setSystemTime(Date.now() + 60_000);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    expect((await getLatestUpdate('1'))?.id).toBe('u1');
    vi.useRealTimers();
  });

  it('reads a file once within the cache window', async () => {
    const fetchMock = files({ 'updates/1/latest.json': record });
    vi.stubGlobal('fetch', fetchMock);

    await getLatestUpdate('1');
    await getLatestUpdate('1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
