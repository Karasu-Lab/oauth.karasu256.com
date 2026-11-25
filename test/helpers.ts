import { vi } from 'vitest';
import { createApp } from '../src/app';

export const secret = 'test-oauth-proxy-secret';

export const previewEnv = {
  APP_ENV: 'preview',
  API_URL: 'https://api.test',
  PRODUCTION_ORIGIN: 'https://prod.test',
  PREVIEW_ORIGIN_DOMAIN: 'dev-api-auth.test',
  OAUTH_PROXY_SECRET: secret,
} as unknown as Env;

export const productionEnv = {
  APP_ENV: 'production',
  PRODUCTION_ORIGIN: 'https://prod.test',
} as unknown as Env;

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function signState(payload: Record<string, unknown>, signingSecret = secret) {
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `${body}.${encodeBase64Url(signature)}`;
}

export function validPayload(origin: string, state: string, overrides: Record<string, unknown> = {}) {
  return { origin, state, exp: Date.now() + 5 * 60 * 1000, nonce: crypto.randomUUID(), ...overrides };
}

export function stubPreviews(origins: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.origin === 'https://api.test' && url.pathname === '/api/previews/dev-api-auth.test') {
        return Response.json(Object.fromEntries(origins.map((origin, index) => [`branch-${index}`, { urls: [origin] }])));
      }
      return new Response('not found', { status: 404 });
    })
  );
}

export function callback(env: Env, search: string, provider = 'github') {
  return createApp(env).handle(new Request(`https://oauth.test/api/auth/callback/${provider}${search}`));
}
