/**
 * Dependency wiring.
 * Constructs all services with their dependencies.
 * In production, repositories will be real Supabase implementations.
 * During development/testing, swap with mocks.
 */

import type { IAgentRepository } from './repositories/IAgentRepository.js';
import type { IContributionRepository } from './repositories/IContributionRepository.js';
import type { IEmbeddingProvider } from './providers/IEmbeddingProvider.js';
import type { ILogProvider } from './providers/ILogProvider.js';
import type { IRateLimitStore } from './stores/IRateLimitStore.js';
import type { ICounterStore } from './stores/ICounterStore.js';
import type { Middleware } from './middleware/pipeline.js';
import { AgentService } from './services/AgentService.js';
import { ContributionService } from './services/ContributionService.js';
import { QueryService } from './services/QueryService.js';
import { StatsService } from './services/StatsService.js';
import { createAuthMiddleware } from './middleware/authenticate.js';
import { createRateLimitMiddleware, RATE_LIMITS } from './middleware/rate-limit.js';
import { createLoggingMiddleware } from './middleware/logging.js';

export interface Container {
  agentService: AgentService;
  contributionService: ContributionService;
  queryService: QueryService;
  statsService: StatsService;
  logProvider: ILogProvider;
  authenticate: ReturnType<typeof createAuthMiddleware>;
  logging: Middleware;
  rateLimit: {
    register: Middleware;
    createContribution: Middleware;
    updateContribution: Middleware;
    deleteContribution: Middleware;
    query: Middleware;
    embeddingBudget: Middleware;
  };
}

export function createContainer(deps: {
  agentRepo: IAgentRepository;
  contributionRepo: IContributionRepository;
  embeddingProvider: IEmbeddingProvider;
  logProvider: ILogProvider;
  rateLimitStore: IRateLimitStore;
  counterStore: ICounterStore;
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
  const statsService = new StatsService(
    deps.agentRepo,
    deps.contributionRepo,
    deps.counterStore
  );
  const authenticate = createAuthMiddleware(agentService);
  const logging = createLoggingMiddleware(deps.logProvider);

  const rateLimit = {
    register: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.register),
    createContribution: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.createContribution),
    updateContribution: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.updateContribution),
    deleteContribution: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.deleteContribution),
    query: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.query),
    embeddingBudget: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.embeddingBudget),
  };

  return {
    agentService,
    contributionService,
    queryService,
    statsService,
    logProvider: deps.logProvider,
    authenticate,
    logging,
    rateLimit,
  };
}
