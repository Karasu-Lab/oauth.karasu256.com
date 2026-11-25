export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason?: string
  ) {
    super(message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string = 'bad_request', reason?: string) {
    super(400, message, reason);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string = 'not_found', reason?: string) {
    super(404, message, reason);
  }
}
