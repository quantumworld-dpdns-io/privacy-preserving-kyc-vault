import { Request, Response, NextFunction } from 'express';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: unknown[];
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly type: string;
  public readonly errors?: unknown[];

  constructor(
    statusCode: number,
    message: string,
    type?: string,
    errors?: unknown[],
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.type = type ?? 'about:blank';
    this.errors = errors;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', errors?: unknown[]) {
    super(400, message, 'about:blank', errors);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message, 'about:blank');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(409, message, 'about:blank');
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(500, message, 'about:blank');
  }
}

function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

function isZodError(err: unknown): err is { issues: Array<{ path: (string | number)[]; message: string; code: string }> } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'issues' in err &&
    Array.isArray((err as any).issues)
  );
}

function buildProblemDetails(
  err: unknown,
  req: Request,
): ProblemDetails {
  if (isAppError(err)) {
    return {
      type: err.type,
      title: err.message,
      status: err.statusCode,
      detail: err.message,
      instance: req.originalUrl ?? req.url,
      ...(err.errors ? { errors: err.errors } : {}),
    };
  }

  if (isZodError(err)) {
    return {
      type: 'about:blank',
      title: 'Validation Error',
      status: 400,
      detail: 'Request validation failed',
      instance: req.originalUrl ?? req.url,
      errors: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    };
  }

  const errObj = err as Error;
  return {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : errObj.message || 'An unexpected error occurred',
    instance: req.originalUrl ?? req.url,
  };
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const problem = buildProblemDetails(err, req);
  const statusCode = problem.status;

  res.setHeader('Content-Type', 'application/problem+json');
  res.status(statusCode).json(problem);
}
