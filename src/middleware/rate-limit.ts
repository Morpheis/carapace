/**
 * Rate limiting middleware.
 * Composable with the pipeline — each endpoint can have its own config.
 * Uses an IRateLimitStore for persistence (in-memory for dev, Supabase for prod).
 */

import type { IRateLimitStore } from '../stores/IRateLimitStore.js';
import type { HandlerContext, Middleware, Handler } from './pipeline.js';
import { RateLimitError } from '../errors.js';

export interface RateLimitConfig {
  /** Extract the rate limit key from the request/context. */
  key: (req: Request, ctx: HandlerContext) => string;
  /** Maximum requests allowed within the window. */
  limit: number;
  /** Window duration in seconds. */
  windowSeconds: number;
}

export function createRateLimitMiddleware(
  store: IRateLimitStore,
  config: RateLimitConfig
): Middleware {
  return (next: Handler): Handler => {
    return async (req, ctx) => {
      // Bypass rate limiting for exempt agents
      if (ctx.agent?.id && EXEMPT_AGENTS.has(ctx.agent.id)) {
        return next(req, ctx);
      }

      const key = config.key(req, ctx);
      const { count, resetAt } = await store.increment(key, config.windowSeconds);

      if (count > config.limit) {
        const now = Math.floor(Date.now() / 1000);
        const retryAfter = Math.max(1, resetAt - now);
        throw new RateLimitError(retryAfter);
      }

      const response = await next(req, ctx);

      // Attach rate limit headers to successful responses
      const headers = new Headers(response.headers);
      headers.set('X-RateLimit-Limit', String(config.limit));
      headers.set('X-RateLimit-Remaining', String(Math.max(0, config.limit - count)));
      headers.set('X-RateLimit-Reset', String(resetAt));

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    };
  };
}

// ── Key extraction helpers ──

/** Agent IDs exempt from rate limiting (platform operators). */
const EXEMPT_AGENTS = new Set([
  'clawdactual-5f36cfce', // ClawdActual — original platform agent
]);

/** Per-agent key: requires authenticated context. Returns null for exempt agents. */
export function agentKey(action: string) {
  return (_req: Request, ctx: HandlerContext): string => {
    return `agent:${ctx.agent!.id}:${action}`;
  };
}

/** IP-based key: for unauthenticated endpoints. */
export function ipKey(action: string) {
  return (req: Request): string => {
    const forwarded = req.headers.get('X-Forwarded-For');
    const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
    return `ip:${ip}:${action}`;
  };
}

/** Global key: shared budget across all agents. */
export function globalKey(action: string) {
  return (): string => `global:${action}`;
}

// ── Pre-built rate limit configs ──

const ONE_HOUR = 3600;
const ONE_DAY = 86400;

export const RATE_LIMITS = {
  /** POST /agents — registration spam protection */
  register: { key: ipKey('register'), limit: 5, windowSeconds: ONE_HOUR },
  /** POST /contributions — creation rate */
  createContribution: { key: agentKey('contribute'), limit: 10, windowSeconds: ONE_HOUR },
  /** PUT /contributions — update rate */
  updateContribution: { key: agentKey('update'), limit: 20, windowSeconds: ONE_HOUR },
  /** DELETE /contributions — deletion rate */
  deleteContribution: { key: agentKey('delete'), limit: 20, windowSeconds: ONE_HOUR },
  /** POST /query — search rate */
  query: { key: agentKey('query'), limit: 60, windowSeconds: ONE_HOUR },
  /** Global embedding budget — protects OpenAI bill */
  embeddingBudget: { key: globalKey('embeddings'), limit: 500, windowSeconds: ONE_DAY },
} as const satisfies Record<string, RateLimitConfig>;
