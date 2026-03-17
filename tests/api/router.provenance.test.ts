/**
 * API integration tests for the provenance field.
 * Tests POST/PUT/GET through the full router pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter } from '../../src/api/router.js';
import { createContainer } from '../../src/container.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';
import { MockContributionRepository } from '../mocks/MockContributionRepository.js';
import { MockEmbeddingProvider } from '../mocks/MockEmbeddingProvider.js';
import { MockFeedbackRepository } from '../mocks/MockFeedbackRepository.js';
import { MockValidationRepository } from '../mocks/MockValidationRepository.js';
import { MockConnectionRepository } from '../mocks/MockConnectionRepository.js';
import { InMemoryRateLimitStore } from '../../src/stores/InMemoryRateLimitStore.js';
import { InMemoryCounterStore } from '../../src/stores/InMemoryCounterStore.js';
import { ConsoleLogProvider } from '../../src/providers/ConsoleLogProvider.js';
import type { HandlerContext } from '../../src/middleware/pipeline.js';
import { CONTRIBUTION_PROVENANCE } from '../../src/types/models.js';

describe('API Router — provenance', () => {
  let handle: (req: Request, ctx: HandlerContext) => Promise<Response>;
  let apiKey: string;

  function ctx(): HandlerContext {
    return { agent: null };
  }

  function json(
    body: unknown,
    opts?: { method?: string; url?: string; apiKey?: string }
  ): Request {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (opts?.apiKey) {
      headers['Authorization'] = `Bearer ${opts.apiKey}`;
    }
    return new Request(opts?.url ?? 'http://localhost', {
      method: opts?.method ?? 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  function get(url: string, key?: string): Request {
    const headers: Record<string, string> = {};
    if (key) headers['Authorization'] = `Bearer ${key}`;
    return new Request(url, { method: 'GET', headers });
  }

  function put(
    url: string,
    body: unknown,
    key: string
  ): Request {
    return new Request(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    const container = createContainer({
      agentRepo: new MockAgentRepository(),
      contributionRepo: new MockContributionRepository(),
      feedbackRepo: new MockFeedbackRepository(),
      validationRepo: new MockValidationRepository(),
      connectionRepo: new MockConnectionRepository(),
      embeddingProvider: new MockEmbeddingProvider(),
      logProvider: new ConsoleLogProvider(),
      rateLimitStore: new InMemoryRateLimitStore(),
      counterStore: new InMemoryCounterStore(),
    });

    const router = createRouter(container);
    handle = router.handle;

    // Register a test agent
    const regRes = await handle(
      json(
        { displayName: 'ProvenanceAPITestAgent' },
        { url: 'http://localhost/api/v1/agents' }
      ),
      ctx()
    );
    const regBody = (await regRes.json()) as any;
    apiKey = regBody.apiKey;
  });

  // ── POST /contributions with provenance ──

  describe('POST /api/v1/contributions', () => {
    it('should create contribution with provenance and return it in response', async () => {
      const res = await handle(
        json(
          {
            claim: 'API test insight with observation provenance',
            confidence: 0.8,
            provenance: 'observation',
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const body = (await res.json()) as any;

      expect(res.status).toBe(201);
      expect(body.provenance).toBe('observation');
    });

    it('should create contribution without provenance (backward compat)', async () => {
      const res = await handle(
        json(
          {
            claim: 'API test insight with no provenance for compat',
            confidence: 0.7,
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const body = (await res.json()) as any;

      expect(res.status).toBe(201);
      expect(body.provenance).toBeNull();
    });

    it('should return 400 for invalid provenance value', async () => {
      const res = await handle(
        json(
          {
            claim: 'API test insight with bad provenance',
            confidence: 0.7,
            provenance: 'made-up',
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.message).toMatch(/provenance/i);
    });

    it.each([...CONTRIBUTION_PROVENANCE])(
      'should accept provenance value "%s" through the API',
      async (provenance) => {
        const res = await handle(
          json(
            {
              claim: `API validation for provenance ${provenance} at ${Math.random()}`,
              confidence: 0.75,
              provenance,
            },
            { url: 'http://localhost/api/v1/contributions', apiKey }
          ),
          ctx()
        );

        expect(res.status).toBe(201);
        const body = (await res.json()) as any;
        expect(body.provenance).toBe(provenance);
      }
    );
  });

  // ── GET /contributions/:id includes provenance ──

  describe('GET /api/v1/contributions/:id', () => {
    it('should return provenance in get response', async () => {
      const createRes = await handle(
        json(
          {
            claim: 'Retrievable insight with directive provenance via API',
            confidence: 0.9,
            provenance: 'directive',
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = (await createRes.json()) as any;

      const res = await handle(
        get(`http://localhost/api/v1/contributions/${created.id}`),
        ctx()
      );
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.provenance).toBe('directive');
    });

    it('should return null provenance for contributions created without it', async () => {
      const createRes = await handle(
        json(
          {
            claim: 'Retrievable insight with null provenance via API',
            confidence: 0.5,
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = (await createRes.json()) as any;

      const res = await handle(
        get(`http://localhost/api/v1/contributions/${created.id}`),
        ctx()
      );
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.provenance).toBeNull();
    });
  });

  // ── PUT /contributions/:id with provenance ──

  describe('PUT /api/v1/contributions/:id', () => {
    it('should update provenance on existing contribution', async () => {
      const createRes = await handle(
        json(
          {
            claim: 'Updatable insight for provenance change test',
            confidence: 0.8,
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = (await createRes.json()) as any;
      expect(created.provenance).toBeNull();

      const updateRes = await handle(
        put(
          `http://localhost/api/v1/contributions/${created.id}`,
          { provenance: 'reflection' },
          apiKey
        ),
        ctx()
      );
      const updated = (await updateRes.json()) as any;

      expect(updateRes.status).toBe(200);
      expect(updated.provenance).toBe('reflection');
    });

    it('should change provenance value via update', async () => {
      const createRes = await handle(
        json(
          {
            claim: 'Insight with initial provenance to be changed via PUT',
            confidence: 0.8,
            provenance: 'observation',
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = (await createRes.json()) as any;

      const updateRes = await handle(
        put(
          `http://localhost/api/v1/contributions/${created.id}`,
          { provenance: 'correction' },
          apiKey
        ),
        ctx()
      );
      const updated = (await updateRes.json()) as any;

      expect(updateRes.status).toBe(200);
      expect(updated.provenance).toBe('correction');
    });

    it('should return 400 for invalid provenance on update', async () => {
      const createRes = await handle(
        json(
          {
            claim: 'Insight to test invalid provenance on PUT',
            confidence: 0.8,
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = (await createRes.json()) as any;

      const updateRes = await handle(
        put(
          `http://localhost/api/v1/contributions/${created.id}`,
          { provenance: 'telepathy' },
          apiKey
        ),
        ctx()
      );

      expect(updateRes.status).toBe(400);
    });

    it('should preserve provenance when updating other fields', async () => {
      const createRes = await handle(
        json(
          {
            claim: 'Insight with provenance preserved through other updates',
            confidence: 0.7,
            provenance: 'social',
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = (await createRes.json()) as any;

      const updateRes = await handle(
        put(
          `http://localhost/api/v1/contributions/${created.id}`,
          { confidence: 0.95 },
          apiKey
        ),
        ctx()
      );
      const updated = (await updateRes.json()) as any;

      expect(updateRes.status).toBe(200);
      expect(updated.provenance).toBe('social');
      expect(updated.confidence).toBe(0.95);
    });
  });

  // ── Query results include provenance ──

  describe('POST /api/v1/query', () => {
    it('should include provenance in search results', async () => {
      await handle(
        json(
          {
            claim: 'Searchable insight about persistent memory with external provenance',
            confidence: 0.9,
            provenance: 'external',
            domainTags: ['agent-memory'],
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );

      const res = await handle(
        json(
          { question: 'persistent memory for agents' },
          { url: 'http://localhost/api/v1/query', apiKey }
        ),
        ctx()
      );
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.results[0].provenance).toBe('external');
    });
  });
});
