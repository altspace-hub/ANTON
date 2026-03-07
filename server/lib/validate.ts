import { ZodSchema, ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Returns an Express middleware that validates req.body against the given Zod schema.
 * On failure: responds 400 with { error, details }.
 * On success: replaces req.body with the parsed (coerced) value and calls next().
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = (result.error as ZodError).flatten().fieldErrors;
      res.status(400).json({ error: 'Invalid request body', details });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Returns an Express middleware that validates req.query against the given Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = (result.error as ZodError).flatten().fieldErrors;
      res.status(400).json({ error: 'Invalid query parameters', details });
      return;
    }
    req.query = result.data as Record<string, string>;
    next();
  };
}

/**
 * Returns an Express middleware that validates req.params against the given Zod schema.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = (result.error as ZodError).flatten().fieldErrors;
      res.status(400).json({ error: 'Invalid path parameters', details });
      return;
    }
    req.params = result.data as Record<string, string>;
    next();
  };
}
