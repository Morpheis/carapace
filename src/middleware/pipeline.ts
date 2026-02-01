/**
 * Composable middleware pipeline for serverless function handlers.
 * Middleware wraps handlers in order (left to right), forming an onion model.
 */

import type { Agent } from '../types/models.js';

export interface HandlerContext {
  agent: Agent | null;
}

export type Handler = (req: Request, ctx: HandlerContext) => Promise<Response>;
export type Middleware = (next: Handler) => Handler;

/**
 * Compose middleware into a function that wraps a handler.
 * Middleware is applied left-to-right:
 *   pipeline(auth, rateLimit)(handler)
 *   → auth wraps (rateLimit wraps handler)
 */
export function pipeline(...middlewares: Middleware[]) {
  return (handler: Handler): Handler => {
    return middlewares.reduceRight<Handler>(
      (next, mw) => mw(next),
      handler
    );
  };
}
