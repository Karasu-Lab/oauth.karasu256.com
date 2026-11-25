import { Elysia } from 'elysia';
import { getOAuthProxyConfig } from '../../../../../lib/config';
import { BadRequestError, NotFoundError } from '../../../../../lib/errors';
import { parsePreviewOrigin, previewExists } from '../../../../../lib/origin';
import { redirect } from '../../../../../lib/response';
import { verifyState } from '../../../../../lib/state';

export const authCallbackGet = (env: Env) =>
  new Elysia().get('/api/auth/callback/:provider', async ({ request, params }) => {
    const config = getOAuthProxyConfig(env);
    if (!/^[a-z0-9-]+$/i.test(params.provider)) throw new BadRequestError('invalid_provider');
    const path = `/api/auth/callback/${params.provider}`;
    const search = new URL(request.url).search;

    if (!config.dispatch) return redirect(`${config.productionOrigin}${path}${search}`);

    const segments = search.slice(1).split('&');
    const stateIndexes = segments.flatMap((segment, index) => (new URLSearchParams(segment).has('state') ? [index] : []));
    const stateIndex = stateIndexes[0];
    if (stateIndexes.length !== 1 || stateIndex === undefined) throw new BadRequestError('invalid_state');

    const payload = await verifyState(config, new URLSearchParams(segments[stateIndex]).get('state') ?? '');
    if (!payload) throw new BadRequestError('invalid_state');

    const origin = parsePreviewOrigin(config, payload.origin);
    if (!origin) throw new BadRequestError('invalid_origin');
    if (!(await previewExists(config, origin))) throw new NotFoundError('unknown_origin');

    segments[stateIndex] = `state=${encodeURIComponent(payload.state)}`;
    return redirect(`${origin}${path}?${segments.join('&')}`);
  });
