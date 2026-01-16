import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { isDev } from '../config/env';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Error:', err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return c.json(
      {
        error: 'Validation Error',
        message: err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        statusCode: 400,
      },
      400
    );
  }

  // Handle HTTP exceptions
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: err.message || 'Error',
        message: err.message,
        statusCode: err.status,
      },
      err.status
    );
  }

  // Handle unknown errors
  const message = isDev() ? err.message : 'Internal server error';
  return c.json(
    {
      error: 'Internal Server Error',
      message,
      statusCode: 500,
    },
    500
  );
};
