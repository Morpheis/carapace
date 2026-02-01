/**
 * Query endpoint.
 * POST /api/v1/query — Semantic search (auth required)
 */

import { pipeline, errorHandler } from '../middleware/index.js';
import { validateBody } from '../middleware/validate-body.js';
import type { Handler } from '../middleware/pipeline.js';
import type { Container } from '../container.js';
import type { BodySchema } from '../types/common.js';

const querySchema: BodySchema = {
  question: { type: 'string', required: true, maxLength: 2000 },
  context: { type: 'string', required: false, maxLength: 5000 },
  maxResults: { type: 'number', required: false, min: 1, max: 20 },
  minConfidence: { type: 'number', required: false, min: 0, max: 1 },
  domainTags: { type: 'array', required: false },
};

export function createQueryHandlers(container: Container) {
  const search: Handler = pipeline(
    container.logging,
    errorHandler,
    container.authenticate,
    container.rateLimit.query,
    container.rateLimit.embeddingBudget,
    validateBody(querySchema)
  )(async (req, _ctx) => {
    const body = await req.json() as Record<string, unknown>;

    const result = await container.queryService.search({
      question: body.question as string,
      context: body.context as string | undefined,
      maxResults: body.maxResults as number | undefined,
      minConfidence: body.minConfidence as number | undefined,
      domainTags: body.domainTags as string[] | undefined,
    });

    // Record query for platform stats (fire-and-forget)
    container.statsService.recordQuery().catch(() => {});

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  return { search };
}
