import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { env as cfEnv } from 'cloudflare:workers';
import { createApp } from './app';

const app = createApp(cfEnv as Env, { adapter: CloudflareAdapter, aot: false, normalize: 'typebox' });

export default {
  fetch: (request: Request) => app.fetch(request),
};
