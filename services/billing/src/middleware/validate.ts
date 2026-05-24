import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export type ValidationTarget = 'body' | 'query' | 'params';

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const targets: { key: ValidationTarget; source: unknown }[] = [
      { key: 'body', source: req.body },
      { key: 'query', source: req.query },
      { key: 'params', source: req.params },
    ];

    for (const { key, source } of targets) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(source);
      if (!result.success) {
        res.status(400).json({
          type: 'about:blank',
          title: 'Validation Error',
          status: 400,
          detail: `Request ${key} validation failed`,
          errors: formatZodError(result.error),
        });
        return;
      }

      switch (key) {
        case 'body':
          req.body = result.data;
          break;
        case 'query':
          (req as any).validatedQuery = result.data;
          break;
        case 'params':
          (req as any).validatedParams = result.data;
          break;
      }
    }

    next();
  };
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return validate({ body: schema });
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return validate({ query: schema });
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return validate({ params: schema });
}
