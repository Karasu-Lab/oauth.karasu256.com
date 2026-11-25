import { z } from 'zod';
import type { DispatchConfig } from './config';

const previewsSchema = z.record(z.string(), z.object({ urls: z.array(z.string()) }));

export function parsePreviewOrigin(config: DispatchConfig, origin: string) {
  if (!URL.canParse(origin)) return null;
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.origin !== origin) return null;
  const suffix = `.${config.previewDomain}`;
  if (!url.hostname.endsWith(suffix)) return null;
  return /^[a-z0-9-]+$/.test(url.hostname.slice(0, -suffix.length)) ? url.origin : null;
}

export async function previewExists(config: DispatchConfig, origin: string) {
  const response = await fetch(new URL(`/api/previews/${config.previewDomain}`, config.apiUrl)).catch(() => null);
  if (!response?.ok) return false;
  const previews = previewsSchema.safeParse(await response.json().catch(() => null));
  if (!previews.success) return false;
  return Object.values(previews.data).some((preview) => preview.urls.some((url) => URL.canParse(url) && new URL(url).origin === origin));
}
