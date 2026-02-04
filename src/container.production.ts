/**
 * Production container — uses real Supabase + OpenAI.
 * Falls back to mocks if environment variables are missing (dev mode).
 */

import { createContainer, type Container } from './container.js';
import { getSupabaseClient } from './db.js';
import { SupabaseAgentRepository } from './repositories/SupabaseAgentRepository.js';
import { SupabaseContributionRepository } from './repositories/SupabaseContributionRepository.js';
import { VoyageEmbeddingProvider } from './providers/VoyageEmbeddingProvider.js';
import { AxiomLogProvider } from './providers/AxiomLogProvider.js';
import { ConsoleLogProvider } from './providers/ConsoleLogProvider.js';
import { SupabaseFeedbackRepository } from './repositories/SupabaseFeedbackRepository.js';
import { SupabaseValidationRepository } from './repositories/SupabaseValidationRepository.js';
import { SupabaseConnectionRepository } from './repositories/SupabaseConnectionRepository.js';
import { SupabaseRateLimitStore } from './stores/SupabaseRateLimitStore.js';
import { SupabaseCounterStore } from './stores/SupabaseCounterStore.js';

let cached: Container | null = null;

export function getProductionContainer(): Container {
  if (cached) return cached;

  const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasVoyage = process.env.VOYAGE_API_KEY;

  if (!hasSupabase || !hasVoyage) {
    throw new Error(
      'Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY'
    );
  }

  const db = getSupabaseClient();

  // Axiom logging: uses AxiomLogProvider when configured, falls back to console.
  const hasAxiom = process.env.AXIOM_API_KEY && process.env.AXIOM_DATASET;
  const logProvider = hasAxiom
    ? new AxiomLogProvider({
        apiToken: process.env.AXIOM_API_KEY!,
        dataset: process.env.AXIOM_DATASET!,
      })
    : new ConsoleLogProvider({ outputToConsole: true });

  cached = createContainer({
    agentRepo: new SupabaseAgentRepository(db),
    contributionRepo: new SupabaseContributionRepository(db),
    feedbackRepo: new SupabaseFeedbackRepository(db),
    validationRepo: new SupabaseValidationRepository(db),
    connectionRepo: new SupabaseConnectionRepository(db),
    embeddingProvider: new VoyageEmbeddingProvider(),
    logProvider,
    rateLimitStore: new SupabaseRateLimitStore(db),
    counterStore: new SupabaseCounterStore(db),
  });

  return cached;
}
