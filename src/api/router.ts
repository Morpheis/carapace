/**
 * API router.
 * Maps HTTP method + path pattern to handlers.
 * Framework-agnostic — works with any Request/Response based runtime.
 */

import type { Container } from '../container.js';
import type { Handler, HandlerContext } from '../middleware/pipeline.js';
import { createAgentHandlers } from './agents.js';
import { createContributionHandlers } from './contributions.js';
import { createQueryHandlers } from './query.js';
import { createStatsHandlers } from './stats.js';
import { createFeedbackHandlers } from './feedback.js';
import { createValidationHandlers } from './validations.js';
import { createConnectionHandlers } from './connections.js';
import { createDomainHandlers } from './domains.js';

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

export function createRouter(container: Container) {
  const agents = createAgentHandlers(container);
  const contributions = createContributionHandlers(container);
  const query = createQueryHandlers(container);
  const stats = createStatsHandlers(container);
  const feedback = createFeedbackHandlers(container);
  const validations = createValidationHandlers(container);
  const connections = createConnectionHandlers(container);
  const domains = createDomainHandlers(container);

  const routes: Route[] = [
    // Agents
    { method: 'POST', pattern: /^\/api\/v1\/agents\/?$/, handler: agents.register },
    { method: 'GET', pattern: /^\/api\/v1\/agents\/[^/]+\/?$/, handler: agents.getProfile },

    // Contributions
    { method: 'POST', pattern: /^\/api\/v1\/contributions\/?$/, handler: contributions.create },
    { method: 'GET', pattern: /^\/api\/v1\/contributions\/[^/]+\/?$/, handler: contributions.getById },
    { method: 'PUT', pattern: /^\/api\/v1\/contributions\/[^/]+\/?$/, handler: contributions.update },
    { method: 'DELETE', pattern: /^\/api\/v1\/contributions\/[^/]+\/?$/, handler: contributions.delete },

    // Query
    { method: 'POST', pattern: /^\/api\/v1\/query\/?$/, handler: query.search },

    // Stats
    { method: 'GET', pattern: /^\/api\/v1\/stats\/?$/, handler: stats.getStats },

    // Feedback
    { method: 'POST', pattern: /^\/api\/v1\/feedback\/?$/, handler: feedback.submit },

    // Validations
    { method: 'POST', pattern: /^\/api\/v1\/contributions\/[^/]+\/validate\/?$/, handler: validations.validate },
    { method: 'GET', pattern: /^\/api\/v1\/contributions\/[^/]+\/validations\/?$/, handler: validations.getValidations },
    { method: 'DELETE', pattern: /^\/api\/v1\/contributions\/[^/]+\/validate\/?$/, handler: validations.removeValidation },

    // Connections
    { method: 'POST', pattern: /^\/api\/v1\/connections\/?$/, handler: connections.create },
    { method: 'GET', pattern: /^\/api\/v1\/contributions\/[^/]+\/connections\/?$/, handler: connections.getConnections },
    { method: 'DELETE', pattern: /^\/api\/v1\/connections\/[^/]+\/?$/, handler: connections.delete },

    // Domains
    { method: 'GET', pattern: /^\/api\/v1\/domains\/?$/, handler: domains.getDomains },
  ];

  const handle: Handler = async (req: Request, ctx: HandlerContext) => {
    const url = new URL(req.url);
    const method = req.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    for (const route of routes) {
      if (route.method === method && route.pattern.test(url.pathname)) {
        const response = await route.handler(req, ctx);
        return addCorsHeaders(response);
      }
    }

    // Check if path matches but method doesn't
    const pathMatches = routes.some((r) => r.pattern.test(url.pathname));
    if (pathMatches) {
      const allowed = routes
        .filter((r) => r.pattern.test(url.pathname))
        .map((r) => r.method)
        .join(', ');

      return new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_REQUEST',
            message: `Method ${method} not allowed`,
          },
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            Allow: allowed,
            ...corsHeaders(),
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: `No route matches ${method} ${url.pathname}`,
        },
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      }
    );
  };

  return { handle, routes };
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
