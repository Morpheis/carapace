/**
 * Error handler middleware.
 * Catches errors thrown by handlers and maps them to structured JSON responses.
 * AppError subclasses get their status code and details; unknown errors become 500.
 */

import { AppError, RateLimitError } from '../errors.js';
import type { Handler } from './pipeline.js';
import type { ApiErrorResponse } from '../types/api.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function errorHandler(next: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await next(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        const body: ApiErrorResponse = {
          error: {
            code: err.code,
            message: err.message,
            ...(err.details && { details: err.details }),
          },
        };

        const headers: Record<string, string> = { ...JSON_HEADERS };

        if (err instanceof RateLimitError && err.details?.retryAfter) {
          headers['Retry-After'] = String(err.details.retryAfter);
        }

        return new Response(JSON.stringify(body), {
          status: err.statusCode,
          headers,
        });
      }

      // Unknown error — don't leak internals
      const body: ApiErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      };

      return new Response(JSON.stringify(body), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }
  };
}
