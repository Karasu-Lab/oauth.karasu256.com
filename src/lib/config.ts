import { z } from 'zod';

const baseSchema = z.object({
  APP_ENV: z.enum(['local', 'preview', 'production']),
  PRODUCTION_ORIGIN: z.url(),
});

const dispatchSchema = baseSchema.extend({
  API_URL: z.url(),
  PREVIEW_ORIGIN_DOMAIN: z.string().min(1),
  OAUTH_PROXY_SECRET: z.string().min(1),
});

export function getOAuthProxyConfig(env: unknown) {
  const base = baseSchema.parse(env);
  if (base.APP_ENV === 'production') return { dispatch: false as const, productionOrigin: base.PRODUCTION_ORIGIN };
  const parsed = dispatchSchema.parse(env);
  return {
    dispatch: true as const,
    productionOrigin: parsed.PRODUCTION_ORIGIN,
    apiUrl: parsed.API_URL,
    previewDomain: parsed.PREVIEW_ORIGIN_DOMAIN,
    secret: parsed.OAUTH_PROXY_SECRET,
    maxTtlMs: 10 * 60 * 1000,
  };
}

export type OAuthProxyConfig = ReturnType<typeof getOAuthProxyConfig>;
export type DispatchConfig = Extract<OAuthProxyConfig, { dispatch: true }>;
