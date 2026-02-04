/**
 * Dependency wiring.
 * Constructs all services with their dependencies.
 * In production, repositories will be real Supabase implementations.
 * During development/testing, swap with mocks.
 */

import type { IAgentRepository } from './repositories/IAgentRepository.js';
import type { IContributionRepository } from './repositories/IContributionRepository.js';
import type { IFeedbackRepository } from './repositories/IFeedbackRepository.js';
import type { IValidationRepository } from './repositories/IValidationRepository.js';
import type { IConnectionRepository } from './repositories/IConnectionRepository.js';
import type { IEmbeddingProvider } from './providers/IEmbeddingProvider.js';
import type { ILogProvider } from './providers/ILogProvider.js';
import type { IRateLimitStore } from './stores/IRateLimitStore.js';
import type { ICounterStore } from './stores/ICounterStore.js';
import type { Middleware } from './middleware/pipeline.js';
import { AgentService } from './services/AgentService.js';
import { ContributionService } from './services/ContributionService.js';
import { QueryService } from './services/QueryService.js';
import { StatsService } from './services/StatsService.js';
import { FeedbackService } from './services/FeedbackService.js';
import { ValidationService } from './services/ValidationService.js';
import { ConnectionService } from './services/ConnectionService.js';
import { TrustService } from './services/TrustService.js';
import { DomainService } from './services/DomainService.js';
import { createAuthMiddleware } from './middleware/authenticate.js';
import { createRateLimitMiddleware, RATE_LIMITS } from './middleware/rate-limit.js';
import { createLoggingMiddleware } from './middleware/logging.js';
import { bodyLimit } from './middleware/body-limit.js';

export interface Container {
  agentService: AgentService;
  contributionService: ContributionService;
  queryService: QueryService;
  statsService: StatsService;
  feedbackService: FeedbackService;
  validationService: ValidationService;
  connectionService: ConnectionService;
  trustService: TrustService;
  domainService: DomainService;
  logProvider: ILogProvider;
  authenticate: ReturnType<typeof createAuthMiddleware>;
  bodyLimit: Middleware;
  logging: Middleware;
  rateLimit: {
    register: Middleware;
    createContribution: Middleware;
    updateContribution: Middleware;
    deleteContribution: Middleware;
    query: Middleware;
    embeddingBudget: Middleware;
    feedback: Middleware;
    validate: Middleware;
    createConnection: Middleware;
    deleteConnection: Middleware;
  };
}

export function createContainer(deps: {
  agentRepo: IAgentRepository;
  contributionRepo: IContributionRepository;
  feedbackRepo: IFeedbackRepository;
  validationRepo: IValidationRepository;
  connectionRepo: IConnectionRepository;
  embeddingProvider: IEmbeddingProvider;
  logProvider: ILogProvider;
  rateLimitStore: IRateLimitStore;
  counterStore: ICounterStore;
}): Container {
  const agentService = new AgentService(deps.agentRepo);
  const contributionService = new ContributionService(
    deps.contributionRepo,
    deps.agentRepo,
    deps.embeddingProvider,
    deps.validationRepo
  );
  const queryService = new QueryService(
    deps.contributionRepo,
    deps.agentRepo,
    deps.embeddingProvider,
    deps.validationRepo
  );
  const statsService = new StatsService(
    deps.agentRepo,
    deps.contributionRepo,
    deps.counterStore
  );
  const feedbackService = new FeedbackService(deps.feedbackRepo);
  const validationService = new ValidationService(
    deps.validationRepo,
    deps.contributionRepo,
    deps.agentRepo
  );
  const connectionService = new ConnectionService(
    deps.connectionRepo,
    deps.contributionRepo
  );
  const trustService = new TrustService(
    deps.validationRepo,
    deps.contributionRepo,
    deps.agentRepo
  );
  const domainService = new DomainService(deps.contributionRepo);
  const authenticate = createAuthMiddleware(agentService);
  const bodyLimitMw = bodyLimit(50 * 1024); // 50KB max request body
  const logging = createLoggingMiddleware(deps.logProvider);

  const rateLimit = {
    register: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.register),
    createContribution: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.createContribution),
    updateContribution: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.updateContribution),
    deleteContribution: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.deleteContribution),
    query: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.query),
    embeddingBudget: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.embeddingBudget),
    feedback: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.feedback),
    validate: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.validate),
    createConnection: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.createConnection),
    deleteConnection: createRateLimitMiddleware(deps.rateLimitStore, RATE_LIMITS.deleteConnection),
  };

  return {
    agentService,
    contributionService,
    queryService,
    statsService,
    feedbackService,
    validationService,
    connectionService,
    trustService,
    domainService,
    logProvider: deps.logProvider,
    authenticate,
    bodyLimit: bodyLimitMw,
    logging,
    rateLimit,
  };
}
