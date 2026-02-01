/**
 * Request logging middleware.
 * Captures method, path, status, duration, and agent context for every request.
 * Logs are sent to the configured ILogProvider (Axiom, console, etc).
 *
 * Level mapping:
 *   2xx → info
 *   4xx → warn
 *   5xx → error
 *   handler exception → error (re-thrown)
 */

import type { ILogProvider, LogLevel, RequestLogEvent } from '../providers/ILogProvider.js';
import type { Handler, Middleware } from './pipeline.js';

function levelForStatus(status: number): LogLevel {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

export function createLoggingMiddleware(logProvider: ILogProvider): Middleware {
  return (next: Handler): Handler => {
    return async (req, ctx) => {
      const url = new URL(req.url);
      const method = req.method;
      const path = url.pathname;
      const start = performance.now();

      try {
        const response = await next(req, ctx);
        const durationMs = Math.round(performance.now() - start);
        const status = response.status;

        const event: RequestLogEvent = {
          level: levelForStatus(status),
          message: `${method} ${path} → ${status} (${durationMs}ms)`,
          method,
          path,
          status,
          durationMs,
          ...(ctx.agent?.id && { agentId: ctx.agent.id }),
        };

        logProvider.log(event);
        return response;
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);

        const event: RequestLogEvent = {
          level: 'error',
          message: `${method} ${path} → 500 (${durationMs}ms)`,
          method,
          path,
          status: 500,
          durationMs,
          fields: {
            error: err instanceof Error ? err.message : String(err),
          },
          ...(ctx.agent?.id && { agentId: ctx.agent.id }),
        };

        logProvider.log(event);
        throw err;
      }
    };
  };
}
