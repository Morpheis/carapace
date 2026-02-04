/**
 * Connection endpoints.
 * POST   /api/v1/connections                       — Create a connection (auth required)
 * GET    /api/v1/contributions/:id/connections      — Get connections for a contribution
 * DELETE /api/v1/connections/:id                     — Delete a connection (auth required, owner only)
 */

import { pipeline, errorHandler } from '../middleware/index.js';
import { validateBody } from '../middleware/validate-body.js';
import type { Handler } from '../middleware/pipeline.js';
import type { Container } from '../container.js';
import type { BodySchema } from '../types/common.js';

const createSchema: BodySchema = {
  sourceId: { type: 'string', required: true, maxLength: 100 },
  targetId: { type: 'string', required: true, maxLength: 100 },
  relationship: { type: 'string', required: true, maxLength: 50 },
};

export function createConnectionHandlers(container: Container) {
  const create: Handler = pipeline(
    container.bodyLimit,
    container.logging,
    errorHandler,
    container.authenticate,
    container.rateLimit.createConnection,
    validateBody(createSchema)
  )(async (req, ctx) => {
    const body = await req.json() as Record<string, unknown>;

    const result = await container.connectionService.create(
      {
        sourceId: body.sourceId as string,
        targetId: body.targetId as string,
        relationship: body.relationship as any,
      },
      ctx.agent!.id
    );

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const getConnections: Handler = pipeline(
    container.logging,
    errorHandler
  )(async (req, _ctx) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    // Pattern: /api/v1/contributions/:id/connections
    const contributionId = parts[parts.length - 2];

    const result = await container.connectionService.getConnections(contributionId);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const del: Handler = pipeline(
    container.logging,
    errorHandler,
    container.authenticate,
    container.rateLimit.deleteConnection
  )(async (req, ctx) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1];

    await container.connectionService.delete(id, ctx.agent!.id);

    return new Response(null, { status: 204 });
  });

  return { create, getConnections, delete: del };
}
