# Phase 2 Build Spec — Trust & Knowledge Graph

## Overview
Build ALL Phase 2 features in one branch (`clawd/phase-2-trust-graph`). TDD throughout. One PR when done.

Existing: 221 tests passing, 19 test files. Phase 2 types already defined in `src/types/models.ts` and `src/types/database.ts`.

## What to Build (in order)

### 1. Database Migration: `supabase/migrations/005_validations_connections_domains.sql`

```sql
-- Validations table
CREATE TABLE validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  signal TEXT NOT NULL CHECK (signal IN ('confirmed', 'contradicted', 'refined')),
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contribution_id, agent_id)  -- one validation per agent per contribution
);

CREATE INDEX validations_contribution_id_idx ON validations(contribution_id);
CREATE INDEX validations_agent_id_idx ON validations(agent_id);

-- Connections table
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('builds-on', 'contradicts', 'generalizes', 'applies-to')),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, target_id, agent_id)  -- one connection per agent per pair
);

CREATE INDEX connections_source_id_idx ON connections(source_id);
CREATE INDEX connections_target_id_idx ON connections(target_id);

-- RPC: get validation summary for a contribution
CREATE OR REPLACE FUNCTION get_validation_summary(p_contribution_id UUID)
RETURNS TABLE (
  confirmed BIGINT,
  contradicted BIGINT,
  refined BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE signal = 'confirmed') AS confirmed,
    COUNT(*) FILTER (WHERE signal = 'contradicted') AS contradicted,
    COUNT(*) FILTER (WHERE signal = 'refined') AS refined
  FROM validations
  WHERE contribution_id = p_contribution_id;
$$;

-- RPC: get domain stats
CREATE OR REPLACE FUNCTION get_domain_stats()
RETURNS TABLE (
  domain TEXT,
  contribution_count BIGINT,
  avg_confidence REAL,
  latest_contribution TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    unnest(domain_tags) AS domain,
    COUNT(*) AS contribution_count,
    AVG(confidence)::REAL AS avg_confidence,
    MAX(created_at) AS latest_contribution
  FROM contributions
  GROUP BY domain
  ORDER BY contribution_count DESC;
$$;

-- RLS
ALTER TABLE validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "validations_read" ON validations FOR SELECT USING (true);
CREATE POLICY "validations_insert" ON validations FOR INSERT WITH CHECK (true);
CREATE POLICY "validations_update" ON validations FOR UPDATE USING (true);
CREATE POLICY "validations_delete" ON validations FOR DELETE USING (true);
CREATE POLICY "connections_read" ON connections FOR SELECT USING (true);
CREATE POLICY "connections_insert" ON connections FOR INSERT WITH CHECK (true);
CREATE POLICY "connections_delete" ON connections FOR DELETE USING (true);
```

### 2. Repository: IValidationRepository + MockValidationRepository

**Interface** `src/repositories/IValidationRepository.ts`:
```typescript
interface IValidationRepository {
  upsert(input: { contributionId: string; agentId: string; signal: ValidationSignal; context?: string }): Promise<ValidationRow>;
  findByContribution(contributionId: string): Promise<ValidationRow[]>;
  findByAgent(agentId: string): Promise<ValidationRow[]>;
  getSummary(contributionId: string): Promise<{ confirmed: number; contradicted: number; refined: number }>;
  delete(contributionId: string, agentId: string): Promise<void>;
}
```

**Mock** `tests/mocks/MockValidationRepository.ts`: In-memory implementation following `MockFeedbackRepository` pattern. Store items in `readonly items: Validation[]`. Upsert = find existing by contributionId+agentId, replace or insert.

### 3. Repository: IConnectionRepository + MockConnectionRepository

**Interface** `src/repositories/IConnectionRepository.ts`:
```typescript
interface IConnectionRepository {
  create(input: { sourceId: string; targetId: string; relationship: ConnectionRelationship; agentId: string }): Promise<ConnectionRow>;
  findByContribution(contributionId: string): Promise<ConnectionRow[]>;  // both source and target
  findByAgent(agentId: string): Promise<ConnectionRow[]>;
  delete(id: string, agentId: string): Promise<void>;  // owner only
  exists(sourceId: string, targetId: string, agentId: string): Promise<boolean>;
}
```

**Mock** `tests/mocks/MockConnectionRepository.ts`: Same pattern.

### 4. Service: ValidationService

`src/services/ValidationService.ts`

**Dependencies:** IValidationRepository, IContributionRepository, IAgentRepository

**Methods:**

`validate(contributionId, input: CreateValidationRequest, agentId)`:
- Verify contribution exists (throw NotFoundError if not)
- Verify agent is not validating their own contribution (throw ForbiddenError: "Cannot validate your own contribution")
- Upsert validation (agents can change their validation)
- Return the validation

`getValidations(contributionId)`:
- Verify contribution exists
- Return all validations for that contribution

`getSummary(contributionId)`:
- Return { confirmed, contradicted, refined } counts

`removeValidation(contributionId, agentId)`:
- Delete the validation

**Validation rules:**
- Signal must be one of: 'confirmed', 'contradicted', 'refined'
- Context max length: 2000 chars
- contributionId must be valid UUID format

**Tests** `tests/services/ValidationService.test.ts`:
- Can validate a contribution
- Cannot validate own contribution
- Can update existing validation (upsert)
- Returns validation summary counts
- Throws NotFoundError for nonexistent contribution
- Throws ForbiddenError for self-validation
- Validates signal enum
- Validates context length
- Can remove a validation
- Multiple agents can validate same contribution

### 5. Service: ConnectionService

`src/services/ConnectionService.ts`

**Dependencies:** IConnectionRepository, IContributionRepository

**Methods:**

`create(input: CreateConnectionRequest, agentId)`:
- Verify both source and target contributions exist
- Verify source !== target (can't connect to self)
- Verify connection doesn't already exist for this agent+pair (throw ConflictError)
- Create and return

`getConnections(contributionId)`:
- Return all connections where contributionId is source OR target
- Include direction info

`delete(connectionId, agentId)`:
- Verify ownership, delete

**Validation rules:**
- Relationship must be one of: 'builds-on', 'contradicts', 'generalizes', 'applies-to'
- Both IDs must be valid UUIDs
- sourceId !== targetId

**Tests** `tests/services/ConnectionService.test.ts`:
- Can create a connection
- Cannot connect contribution to itself
- Cannot create duplicate connection (same agent, same pair)
- Different agents can create same relationship between same pair
- Returns connections for a contribution (both directions)
- Throws NotFoundError for nonexistent contributions
- Validates relationship enum
- Owner can delete their connection
- Non-owner cannot delete

### 6. Service: TrustService

`src/services/TrustService.ts`

**Dependencies:** IValidationRepository, IAgentRepository

**Methods:**

`computeContributionTrust(contributionId)`:
- Get validation summary
- Get contributor's trust_score
- Get contribution's confidence
- Formula: `base = agentTrust * confidence`
- Boosts: `+0.1 * confirmed - 0.15 * contradicted + 0.05 * refined`
- Clamp to [0, 1]
- Return { score, breakdown: { base, validationBoost, confirmed, contradicted, refined } }

`computeAgentTrust(agentId)`:
- Get all validations for all of this agent's contributions
- Base: 0.5 (starting trust)
- For each contribution: if net validations positive → +0.02, if negative → -0.03
- Clamp to [0.1, 1.0] (never fully untrusted, never perfect)
- Return updated trust score

`updateAgentTrust(agentId)`:
- Compute and persist the new trust score

**Tests** `tests/services/TrustService.test.ts`:
- Contribution trust with no validations = base score
- Contribution trust with confirmations increases
- Contribution trust with contradictions decreases
- Trust never exceeds 1.0 or goes below 0.0
- Agent trust starts at 0.5
- Agent trust increases when contributions are confirmed
- Agent trust decreases when contributions are contradicted
- Agent trust clamped to [0.1, 1.0]

### 7. Service: DomainService

`src/services/DomainService.ts`

**Dependencies:** IContributionRepository (add a `getDomainStats()` method to the interface)

**Methods:**

`getDomains()`:
- Query domain_tags aggregation
- Return array of { domain, contributionCount, avgConfidence, latestContribution }
- Sorted by contribution count descending

**Tests** `tests/services/DomainService.test.ts`:
- Returns domain stats from contributions
- Handles no contributions (empty array)
- Sorts by count descending
- Deduplicates across contributions

### 8. Integration with existing services

**ContributionService** — update `getById()` and query results to include real validation summaries:
- Inject IValidationRepository
- In `toResponse()` / result assembly, call `validationRepo.getSummary(id)` instead of returning zeroes

**QueryService** — integrate trust scoring into search ranking:
- Inject IValidationRepository (for validation summaries in results)
- Update `assembleResults()` to fetch real validation summaries
- Update `_meta.trust` based on whether results have validations
- Add `trustWeight` option to QueryRequest (optional, default 0.3)
- Blend: `finalScore = (1 - trustWeight) * similarity + trustWeight * contributionTrust`
- Re-sort results by finalScore

### 9. API Routes

**Validations** `src/api/validations.ts`:
- `POST /api/v1/contributions/:id/validate` — auth required
  - Body: `{ signal: "confirmed"|"contradicted"|"refined", context?: string }`
  - Returns 200 with the validation
- `GET /api/v1/contributions/:id/validations` — public
  - Returns array of validations
- `DELETE /api/v1/contributions/:id/validate` — auth required, removes own validation

**Connections** `src/api/connections.ts`:
- `POST /api/v1/connections` — auth required
  - Body: `{ sourceId, targetId, relationship }`
  - Returns 201 with the connection
- `GET /api/v1/contributions/:id/connections` — public
  - Returns connections where contribution is source or target
- `DELETE /api/v1/connections/:id` — auth required, owner only
  - Returns 204

**Domains** `src/api/domains.ts`:
- `GET /api/v1/domains` — public
  - Returns array of domain stats

### 10. Router additions

Add to `router.ts`:
```typescript
// Validations
{ method: 'POST', pattern: /^\/api\/v1\/contributions\/[^/]+\/validate\/?$/, handler: validations.validate },
{ method: 'GET', pattern: /^\/api\/v1\/contributions\/[^/]+\/validations\/?$/, handler: validations.getValidations },
{ method: 'DELETE', pattern: /^\/api\/v1\/contributions\/[^/]+\/validate\/?$/, handler: validations.removeValidation },

// Connections
{ method: 'POST', pattern: /^\/api\/v1\/connections\/?$/, handler: connections.create },
{ method: 'GET', pattern: /^\/api\/v1\/contributions\/[^/]+\/connections\/?$/, handler: connections.getConnections },
{ method: 'DELETE', pattern: /^\/api\/v1\/connections\/[^/]+\/?$/, handler: connections.delete },

// Domains
{ method: 'GET', pattern: /^\/api\/v1\/domains\/?$/, handler: domains.getDomains },
```

### 11. Container wiring

Update `Container` interface and `createContainer()`:
- Add `validationService`, `connectionService`, `trustService`, `domainService`
- Add `IValidationRepository` and `IConnectionRepository` to deps
- Add rate limits: `validate`, `createConnection`, `deleteConnection`

### 12. Rate limits

Add to `RATE_LIMITS` in `middleware/rate-limit.ts`:
- `validate`: 60/min per agent
- `createConnection`: 30/min per agent
- `deleteConnection`: 30/min per agent

## Build Order (TDD)

1. Migration SQL file
2. IValidationRepository + MockValidationRepository + tests
3. IConnectionRepository + MockConnectionRepository + tests
4. ValidationService + tests
5. ConnectionService + tests
6. TrustService + tests
7. DomainService + tests (add `getDomainStats()` to IContributionRepository + MockContributionRepository)
8. Update ContributionService — inject validation repo, return real summaries + tests
9. Update QueryService — inject validation repo, trust-weighted ranking + tests
10. API routes: validations + connections + domains
11. Router + container wiring
12. Update existing router tests for new routes

## Rules

1. TDD: one failing test → make it pass → next
2. All imports use `.js` extension (ES modules)
3. Use `import type` for type-only imports
4. Follow existing patterns EXACTLY (look at FeedbackService/Repository as the template)
5. Run tests: `cd ~/Personal/carapace && npx vitest run`
6. Run specific suite: `npx vitest run tests/services/ValidationService.test.ts`
7. Don't modify existing tests (but DO update existing services)
8. Git: work on branch `clawd/phase-2-trust-graph`, commit after each module
9. When adding methods to existing interfaces (IContributionRepository), also add them to MockContributionRepository
10. UUID validation: use regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
11. Error classes: use existing `NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError` from `src/errors.ts`
12. After ALL tests pass, run `npx tsc` to verify, then push branch. Do NOT create PR (I'll do that).

## Final deliverable
All existing 221 tests + new tests all green. TypeScript compiles. Branch pushed.
