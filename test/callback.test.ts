import { afterEach, describe, expect, it, vi } from 'vitest';
import { callback, previewEnv, productionEnv, signState, stubPreviews, validPayload } from './helpers';

const origin = 'https://feature-a.dev-api-auth.test';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dispatch', () => {
  it('routes concurrent authentications to their own origin and state', async () => {
    const origins = Array.from({ length: 12 }, (_, index) => `https://branch-${index}.dev-api-auth.test`);
    stubPreviews(origins);
    const responses = await Promise.all(
      origins.map(async (target, index) => {
        const token = await signState(validPayload(target, `original-state-${index}`));
        return callback(previewEnv, `?code=code-${index}&state=${encodeURIComponent(token)}`);
      })
    );
    responses.forEach((response, index) => {
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${origins[index]}/api/auth/callback/github?code=code-${index}&state=original-state-${index}`);
    });
  });

  it('forwards every query parameter except state byte for byte', async () => {
    stubPreviews([origin]);
    const token = await signState(validPayload(origin, 'abc 123/+='));
    const search = `?code=a%2Fb%3D&iss=https%3A%2F%2Fissuer.test&error_description=bad%20thing%2B&unknown=1&dup=1&dup=2&empty=&state=${encodeURIComponent(token)}&tail=%E3%81%82`;
    const response = await callback(previewEnv, search);
    expect(response.headers.get('location')).toBe(
      `${origin}/api/auth/callback/github?code=a%2Fb%3D&iss=https%3A%2F%2Fissuer.test&error_description=bad%20thing%2B&unknown=1&dup=1&dup=2&empty=&state=${encodeURIComponent('abc 123/+=')}&tail=%E3%81%82`
    );
  });

  it('forwards provider errors to the original origin', async () => {
    stubPreviews([origin]);
    const token = await signState(validPayload(origin, 's'));
    const response = await callback(previewEnv, `?error=access_denied&state=${encodeURIComponent(token)}`, 'google');
    expect(response.headers.get('location')).toBe(`${origin}/api/auth/callback/google?error=access_denied&state=s`);
  });

  it('keeps the PKCE code untouched while only restoring state', async () => {
    stubPreviews([origin]);
    const token = await signState(validPayload(origin, 'pkce-state'));
    const response = await callback(previewEnv, `?code=pkce-code&state=${encodeURIComponent(token)}`);
    const location = new URL(response.headers.get('location') as string);
    expect(location.searchParams.get('code')).toBe('pkce-code');
    expect(location.searchParams.get('state')).toBe('pkce-state');
    expect([...location.searchParams.keys()]).toEqual(['code', 'state']);
  });
});

describe('origin validation', () => {
  it.each([
    ['an origin that is not deployed', 'https://missing.dev-api-auth.test'],
    ['another domain', 'https://evil.example.com'],
    ['a lookalike suffix', 'https://feature-a.dev-api-auth.test.evil.com'],
    ['plain http', 'http://feature-a.dev-api-auth.test'],
    ['userinfo', 'https://user@feature-a.dev-api-auth.test'],
    ['an explicit port', 'https://feature-a.dev-api-auth.test:8443'],
    ['a path', 'https://feature-a.dev-api-auth.test/path'],
    ['nested labels', 'https://a.b.dev-api-auth.test'],
  ])('does not redirect to %s', async (_name, target) => {
    stubPreviews([origin]);
    const token = await signState(validPayload(target, 's'));
    const response = await callback(previewEnv, `?code=c&state=${encodeURIComponent(token)}`);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not redirect when the origin disappeared before the callback', async () => {
    stubPreviews([]);
    const token = await signState(validPayload(origin, 's'));
    const response = await callback(previewEnv, `?code=c&state=${encodeURIComponent(token)}`);
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not redirect when the previews API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 500 })));
    const token = await signState(validPayload(origin, 's'));
    const response = await callback(previewEnv, `?code=c&state=${encodeURIComponent(token)}`);
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('HMAC tamper detection', () => {
  async function expectRejected(search: string) {
    stubPreviews([origin, 'https://other.dev-api-auth.test']);
    const response = await callback(previewEnv, search);
    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
  }

  async function mutated(change: (payload: ReturnType<typeof validPayload>) => Record<string, unknown>) {
    const payload = validPayload(origin, 'original');
    const body = btoa(JSON.stringify(change(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const signature = (await signState(payload)).split('.')[1];
    return `?code=c&state=${encodeURIComponent(`${body}.${signature}`)}`;
  }

  it('accepts an untouched state', async () => {
    stubPreviews([origin]);
    const token = await signState(validPayload(origin, 's'));
    const response = await callback(previewEnv, `?code=c&state=${encodeURIComponent(token)}`);
    expect(response.status).toBe(302);
  });

  it('rejects a changed origin', async () => {
    await expectRejected(await mutated((payload) => ({ ...payload, origin: 'https://other.dev-api-auth.test' })));
  });

  it('rejects a changed original state', async () => {
    await expectRejected(await mutated((payload) => ({ ...payload, state: 'forged' })));
  });

  it('rejects a changed expiry', async () => {
    await expectRejected(await mutated((payload) => ({ ...payload, exp: payload.exp + 1 })));
  });

  it('rejects a changed nonce', async () => {
    await expectRejected(await mutated((payload) => ({ ...payload, nonce: 'other' })));
  });

  it('rejects an added field', async () => {
    await expectRejected(await mutated((payload) => ({ ...payload, extra: true })));
  });

  it('rejects a flipped signature character', async () => {
    const token = await signState(validPayload(origin, 's'));
    const [body, signature] = token.split('.');
    const flipped = `${signature?.startsWith('A') ? 'B' : 'A'}${signature?.slice(1)}`;
    await expectRejected(`?code=c&state=${encodeURIComponent(`${body}.${flipped}`)}`);
  });

  it('rejects a missing signature', async () => {
    const token = await signState(validPayload(origin, 's'));
    await expectRejected(`?code=c&state=${encodeURIComponent(token.split('.')[0] as string)}`);
  });

  it('rejects a state signed with another secret', async () => {
    const token = await signState(validPayload(origin, 's'), 'another-secret');
    await expectRejected(`?code=c&state=${encodeURIComponent(token)}`);
  });

  it('rejects an expired state', async () => {
    const token = await signState(validPayload(origin, 's', { exp: Date.now() - 1000 }));
    await expectRejected(`?code=c&state=${encodeURIComponent(token)}`);
  });

  it('rejects a state whose expiry is too far in the future', async () => {
    const token = await signState(validPayload(origin, 's', { exp: Date.now() + 24 * 60 * 60 * 1000 }));
    await expectRejected(`?code=c&state=${encodeURIComponent(token)}`);
  });

  it('rejects a missing state', async () => {
    await expectRejected('?code=c');
  });

  it('rejects duplicated state parameters', async () => {
    const token = await signState(validPayload(origin, 's'));
    await expectRejected(`?code=c&state=${encodeURIComponent(token)}&state=${encodeURIComponent(token)}`);
  });

  it('rejects an invalid provider segment', async () => {
    stubPreviews([origin]);
    const token = await signState(validPayload(origin, 's'));
    const response = await callback(previewEnv, `?state=${encodeURIComponent(token)}`, 'git%2Fhub');
    expect(response.status).toBe(400);
  });
});

describe('production', () => {
  it('always forwards to the production origin without touching the query', async () => {
    const token = await signState(validPayload(origin, 's'));
    const search = `?code=a%2Fb&state=${encodeURIComponent(token)}&x=1&x=2`;
    const response = await callback(productionEnv, search);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`https://prod.test/api/auth/callback/github${search}`);
  });

  it('does not call the previews API', async () => {
    stubPreviews([origin]);
    await callback(productionEnv, '?code=c&state=raw');
    expect(fetch).not.toHaveBeenCalled();
  });
});
