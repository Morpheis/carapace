/**
 * Domain endpoints.
 * GET /api/v1/domains — Get domain statistics
 */

import { pipeline, errorHandler } from '../middleware/index.js';
import type { Handler } from '../middleware/pipeline.js';
import type { Container } from '../container.js';

export function createDomainHandlers(container: Container) {
  const getDomains: Handler = pipeline(
    container.logging,
    errorHandler
  )(async (_req, _ctx) => {
    const result = await container.domainService.getDomains();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  return { getDomains };
}
