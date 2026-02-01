/**
 * Authentication middleware.
 * Extracts Bearer token from Authorization header, validates via AgentService,
 * and attaches the authenticated agent to context.
 */

import type { AgentService } from '../services/AgentService.js';
import type { Handler, Middleware } from './pipeline.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createAuthMiddleware(agentService: AgentService): Middleware {
  return (next: Handler): Handler => {
    return async (req, ctx) => {
      const authHeader = req.headers.get('Authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Missing or invalid Authorization header. Use: Bearer <api_key>',
            },
          }),
          { status: 401, headers: JSON_HEADERS }
        );
      }

      const apiKey = authHeader.slice(7).trim();

      if (!apiKey) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: 'API key is empty',
            },
          }),
          { status: 401, headers: JSON_HEADERS }
        );
      }

      try {
        const agent = await agentService.authenticate(apiKey);
        ctx.agent = agent;
        return next(req, ctx);
      } catch {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid API key',
            },
          }),
          { status: 401, headers: JSON_HEADERS }
        );
      }
    };
  };
}
