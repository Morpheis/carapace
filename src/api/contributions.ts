/**
 * Contribution endpoints.
 * POST   /api/v1/contributions      — Create a contribution (auth required)
 * GET    /api/v1/contributions/:id   — Get a contribution
 * PUT    /api/v1/contributions/:id   — Update a contribution (auth required, owner only)
 * DELETE /api/v1/contributions/:id   — Delete a contribution (auth required, owner only)
 */

import { pipeline, errorHandler } from '../middleware/index.js';
import { validateBody } from '../middleware/validate-body.js';
import type { Handler } from '../middleware/pipeline.js';
import type { Container } from '../container.js';
import type { BodySchema } from '../types/common.js';

const createSchema: BodySchema = {
  claim: { type: 'string', required: true, maxLength: 2000 },
  reasoning: { type: 'string', required: false, maxLength: 5000 },
  applicability: { type: 'string', required: false, maxLength: 3000 },
  limitations: { type: 'string', required: false, maxLength: 3000 },
  confidence: { type: 'number', required: true, min: 0, max: 1 },
  domainTags: { type: 'array', required: false },
};

const updateSchema: BodySchema = {
  claim: { type: 'string', required: false, maxLength: 2000 },
  reasoning: { type: 'string', required: false, maxLength: 5000 },
  applicability: { type: 'string', required: false, maxLength: 3000 },
  limitations: { type: 'string', required: false, maxLength: 3000 },
  confidence: { type: 'number', required: false, min: 0, max: 1 },
  domainTags: { type: 'array', required: false },
};

export function createContributionHandlers(container: Container) {
  const create: Handler = pipeline(
    errorHandler,
    container.authenticate,
    validateBody(createSchema)
  )(async (req, ctx) => {
    const body = await req.json() as Record<string, unknown>;

    const result = await container.contributionService.create(
      {
        claim: body.claim as string,
        reasoning: body.reasoning as string | undefined,
        applicability: body.applicability as string | undefined,
        limitations: body.limitations as string | undefined,
        confidence: body.confidence as number,
        domainTags: body.domainTags as string[] | undefined,
      },
      ctx.agent!.id
    );

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const getById: Handler = pipeline(errorHandler)(async (req, _ctx) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1];

    const result = await container.contributionService.getById(id);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const update: Handler = pipeline(
    errorHandler,
    container.authenticate,
    validateBody(updateSchema)
  )(async (req, ctx) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1];

    const body = await req.json() as Record<string, unknown>;

    const result = await container.contributionService.update(
      id,
      {
        claim: body.claim as string | undefined,
        reasoning: body.reasoning as string | undefined,
        applicability: body.applicability as string | undefined,
        limitations: body.limitations as string | undefined,
        confidence: body.confidence as number | undefined,
        domainTags: body.domainTags as string[] | undefined,
      },
      ctx.agent!.id
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const del: Handler = pipeline(
    errorHandler,
    container.authenticate
  )(async (req, ctx) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1];

    await container.contributionService.delete(id, ctx.agent!.id);

    return new Response(null, { status: 204 });
  });

  return { create, getById, update, delete: del };
}
