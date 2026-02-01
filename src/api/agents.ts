/**
 * Agent endpoints.
 * POST /api/v1/agents      — Register a new agent
 * GET  /api/v1/agents/:id   — Get agent profile
 */

import { pipeline, errorHandler } from '../middleware/index.js';
import { validateBody } from '../middleware/validate-body.js';
import type { Handler, HandlerContext } from '../middleware/pipeline.js';
import type { Container } from '../container.js';
import type { BodySchema } from '../types/common.js';

const registerSchema: BodySchema = {
  displayName: { type: 'string', required: true, maxLength: 100 },
  description: { type: 'string', required: false, maxLength: 500 },
};

export function createAgentHandlers(container: Container) {
  const register: Handler = pipeline(
    container.logging,
    errorHandler,
    container.rateLimit.register,
    validateBody(registerSchema)
  )(async (req, _ctx) => {
    const body = await req.json() as { displayName: string; description?: string };

    const result = await container.agentService.register({
      displayName: body.displayName,
      description: body.description,
    });

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const getProfile: Handler = pipeline(container.logging, errorHandler)(
    async (req, _ctx) => {
      // Extract ID from URL path: /api/v1/agents/:id
      const url = new URL(req.url);
      const parts = url.pathname.split('/');
      const id = parts[parts.length - 1];

      const result = await container.agentService.getById(id);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  );

  return { register, getProfile };
}
