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
  constructor(details: unknown, message = 'The request is invalid.') {
    super(422, ErrorCode.ValidationFailed, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'You need to sign in to continue.') {
    super(401, ErrorCode.Unauthenticated, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this.') {
    super(403, ErrorCode.Forbidden, message);
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
