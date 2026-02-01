/**
 * Dependency wiring.
 * Constructs all services with their dependencies.
 * In production, repositories will be real Supabase implementations.
 * During development/testing, swap with mocks.
 */

import type { IAgentRepository } from './repositories/IAgentRepository.js';
import type { IContributionRepository } from './repositories/IContributionRepository.js';
import type { IEmbeddingProvider } from './providers/IEmbeddingProvider.js';
import { AgentService } from './services/AgentService.js';
import { ContributionService } from './services/ContributionService.js';
import { QueryService } from './services/QueryService.js';
import { createAuthMiddleware } from './middleware/authenticate.js';

export interface Container {
  agentService: AgentService;
  contributionService: ContributionService;
  queryService: QueryService;
  authenticate: ReturnType<typeof createAuthMiddleware>;
}

export function createContainer(deps: {
  agentRepo: IAgentRepository;
  contributionRepo: IContributionRepository;
  embeddingProvider: IEmbeddingProvider;
}): Container {
  const agentService = new AgentService(deps.agentRepo);
  const contributionService = new ContributionService(
    deps.contributionRepo,
    deps.agentRepo,
    deps.embeddingProvider
  );
  const queryService = new QueryService(
    deps.contributionRepo,
    deps.agentRepo,
    deps.embeddingProvider
  );
  const authenticate = createAuthMiddleware(agentService);

  return {
    agentService,
    contributionService,
    queryService,
    authenticate,
  };
}
