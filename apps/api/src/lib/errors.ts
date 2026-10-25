import { ErrorCode } from '@festpass/shared';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Some fields need attention.') {
    super(422, ErrorCode.ValidationFailed, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(
    message = 'You need to sign in to continue.',
    code: string = ErrorCode.Unauthenticated,
  ) {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have permission to do this.',
    code: string = ErrorCode.Forbidden,
  ) {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.') {
    super(404, ErrorCode.NotFound, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = ErrorCode.Conflict) {
    super(409, code, message);
  }
}

export class InvalidTokenError extends AppError {
  constructor(message = 'This link is invalid or has expired. Request a new one.') {
    super(400, ErrorCode.InvalidToken, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many attempts. Wait a few minutes and try again.') {
    super(429, ErrorCode.RateLimited, message);
  }
}
