import { Elysia, ValidationError } from 'elysia';
import { z } from 'zod';
import { HttpError } from './errors';

const errorResponseSchema = z.object({
  error: z.string(),
  reason: z.string().optional(),
});

function toResponse(error: string, reason?: string) {
  return errorResponseSchema.parse({ error, reason });
}

export const errorHandler = () =>
  new Elysia({ name: 'error-handler' }).onError({ as: 'global' }, ({ code, error, request, set }) => {
    const { method } = request;
    const { pathname } = new URL(request.url);

    if (error instanceof HttpError) {
      set.status = error.status;
      return toResponse(error.message, error.reason);
    }

    if (error instanceof ValidationError) {
      set.status = 422;
      return toResponse('invalid_request');
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return toResponse('not_found');
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    console.error(
      JSON.stringify({ level: 'error', kind: 'unhandled', code, method, pathname, name: cause.name, message: cause.message, stack: cause.stack })
    );
    set.status = 500;
    return toResponse('internal_server_error');
  });
