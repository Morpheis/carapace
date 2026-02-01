/**
 * Netlify Function entry point.
 * Single function handles all /api/v1/* routes via the router.
 *
 * In production, this will use real Supabase repositories and OpenAI embeddings.
 * For now, uses in-memory mocks for development.
 */

import type { Context } from '@netlify/functions';
import { createRouter } from '../../src/api/router.js';
import { createContainer } from '../../src/container.js';

// TODO: Replace mocks with real implementations
import { MockAgentRepository } from '../../tests/mocks/MockAgentRepository.js';
import { MockContributionRepository } from '../../tests/mocks/MockContributionRepository.js';
import { MockEmbeddingProvider } from '../../tests/mocks/MockEmbeddingProvider.js';

// Container is created once per cold start (shared across warm invocations)
const container = createContainer({
  agentRepo: new MockAgentRepository(),
  contributionRepo: new MockContributionRepository(),
  embeddingProvider: new MockEmbeddingProvider(),
});

const router = createRouter(container);

export default async (req: Request, _context: Context) => {
  return router.handle(req, { agent: null });
};

export const config = {
  path: '/api/v1/*',
};
