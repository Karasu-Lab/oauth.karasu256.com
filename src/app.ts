import { Elysia } from 'elysia';
import { authCallbackGet } from './api/api/auth/callback/[provider]/get';
import { errorHandler } from './lib/error-handler';

export const createApp = (env: Env, options?: ConstructorParameters<typeof Elysia>[0]) =>
  new Elysia(options)
    .use(errorHandler())
    .use(authCallbackGet(env))
    .get('/health', () => ({ ok: true }));
