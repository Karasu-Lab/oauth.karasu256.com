import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { env as cfEnv } from 'cloudflare:workers';
import { authCallbackGet } from './api/api/auth/callback/[provider]/get';

const env = cfEnv as Env;

const app = new Elysia({ adapter: CloudflareAdapter, aot: false, normalize: 'typebox' })
  .use(authCallbackGet(env))
  .get('/health', () => ({ ok: true }));

export default {
  fetch: (request: Request) => app.fetch(request),
};
