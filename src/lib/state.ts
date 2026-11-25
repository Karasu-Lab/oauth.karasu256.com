import { z } from 'zod';
import type { DispatchConfig } from './config';

const payloadSchema = z.strictObject({
  origin: z.string(),
  state: z.string(),
  exp: z.number(),
  nonce: z.string(),
});

function decodeBase64Url(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
}

export async function verifyState(config: DispatchConfig, token: string, now = Date.now()) {
  const [body, signature, ...rest] = token.split('.');
  if (!body || !signature || rest.length) return null;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signature), new TextEncoder().encode(body));
    if (!valid) return null;
    const payload = payloadSchema.parse(JSON.parse(new TextDecoder().decode(decodeBase64Url(body))));
    if (payload.exp <= now || payload.exp - now > config.maxTtlMs) return null;
    return payload;
  } catch {
    return null;
  }
}
