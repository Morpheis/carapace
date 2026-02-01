/**
 * Stats endpoint.
 * GET /api/v1/stats — Platform statistics (no auth required)
 */

import { pipeline, errorHandler } from '../middleware/index.js';
import type { Handler } from '../middleware/pipeline.js';
import type { Container } from '../container.js';

export function createStatsHandlers(container: Container) {
  const getStats: Handler = pipeline(container.logging, errorHandler)(async (_req, _ctx) => {
    const stats = await container.statsService.getStats();

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  });

  return { getStats };
}
