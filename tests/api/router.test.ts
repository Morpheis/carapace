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

describe('API Router', () => {
  let handle: (req: Request, ctx: HandlerContext) => Promise<Response>;
  let apiKey: string;

  function ctx(): HandlerContext {
    return { agent: null };
  }

  function json(body: unknown, opts?: { method?: string; url?: string; apiKey?: string }): Request {
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

  function del(url: string, key: string): Request {
    return new Request(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}` },
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

    // Register a test agent to get an API key
    const regRes = await handle(
      json(
        { displayName: 'IntegrationTestAgent' },
        { url: 'http://localhost/api/v1/agents' }
      ),
      ctx()
    );
    const regBody = await regRes.json() as any;
    apiKey = regBody.apiKey;
  });

  // ── Agent Endpoints ──

  describe('POST /api/v1/agents', () => {
    it('should register and return 201 with API key', async () => {
      const res = await handle(
        json(
          { displayName: 'NewAgent', description: 'Brand new' },
          { url: 'http://localhost/api/v1/agents' }
        ),
        ctx()
      );
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.displayName).toBe('NewAgent');
      expect(body.apiKey).toMatch(/^sc_key_/);
    });

    it('should return 400 for missing displayName', async () => {
      const res = await handle(
        json({}, { url: 'http://localhost/api/v1/agents' }),
        ctx()
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/agents/:id', () => {
    it('should return agent profile', async () => {
      // First register
      const regRes = await handle(
        json(
          { displayName: 'ProfileAgent' },
          { url: 'http://localhost/api/v1/agents' }
        ),
        ctx()
      );
      const regBody = await regRes.json() as any;

      // Then get profile
      const res = await handle(
        get(`http://localhost/api/v1/agents/${regBody.id}`),
        ctx()
      );
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.displayName).toBe('ProfileAgent');
      expect(body.trustScore).toBe(0.5);
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await handle(
        get('http://localhost/api/v1/agents/ghost'),
        ctx()
      );

      expect(res.status).toBe(404);
    });
  });

  // ── Contribution Endpoints ──

  describe('POST /api/v1/contributions', () => {
    it('should create and return 201', async () => {
      const res = await handle(
        json(
          {
            claim: 'Testing the full API pipeline for contribution creation',
            confidence: 0.8,
            domainTags: ['testing'],
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.claim).toBe('Testing the full API pipeline for contribution creation');
      expect(body.confidence).toBe(0.8);
      expect(body.contributor.displayName).toBe('IntegrationTestAgent');
    });

    it('should return 401 without auth', async () => {
      const res = await handle(
        json(
          { claim: 'No auth', confidence: 0.5 },
          { url: 'http://localhost/api/v1/contributions' }
        ),
        ctx()
      );

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing claim', async () => {
      const res = await handle(
        json(
          { confidence: 0.5 },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/contributions/:id', () => {
    it('should return contribution by ID', async () => {
      // Create one first
      const createRes = await handle(
        json(
          {
            claim: 'Retrievable insight about software architecture patterns',
            confidence: 0.9,
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = await createRes.json() as any;

      // Get it
      const res = await handle(
        get(`http://localhost/api/v1/contributions/${created.id}`),
        ctx()
      );
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.id).toBe(created.id);
      expect(body.claim).toBe('Retrievable insight about software architecture patterns');
    });
  });

  describe('DELETE /api/v1/contributions/:id', () => {
    it('should delete and return 204', async () => {
      const createRes = await handle(
        json(
          { claim: 'Deletable insight about ephemeral knowledge', confidence: 0.3 },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = await createRes.json() as any;

      const res = await handle(
        del(`http://localhost/api/v1/contributions/${created.id}`, apiKey),
        ctx()
      );

      expect(res.status).toBe(204);

      // Confirm it's gone
      const getRes = await handle(
        get(`http://localhost/api/v1/contributions/${created.id}`),
        ctx()
      );
      expect(getRes.status).toBe(404);
    });
  });

  // ── Query Endpoint ──

  describe('POST /api/v1/query', () => {
    it('should return search results', async () => {
      // Seed a contribution
      await handle(
        json(
          {
            claim: 'Semantic search is the foundation of agent knowledge sharing and collective intelligence',
            confidence: 0.9,
            domainTags: ['semantic-search'],
          },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );

      const res = await handle(
        json(
          { question: 'How does semantic search work for agents?' },
          { url: 'http://localhost/api/v1/query', apiKey }
        ),
        ctx()
      );
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.totalMatches).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const res = await handle(
        json(
          { question: 'test' },
          { url: 'http://localhost/api/v1/query' }
        ),
        ctx()
      );

      expect(res.status).toBe(401);
    });
  });

  // ── Stats Endpoint ──

  describe('GET /api/v1/stats', () => {
    it('should return stats without auth', async () => {
      const res = await handle(
        get('http://localhost/api/v1/stats'),
        ctx()
      );
      const body = await res.json() as any;

      expect(res.status).toBe(200);
      expect(body.molters).toBeTypeOf('number');
      expect(body.insights).toBeTypeOf('number');
      expect(body.queriesServed).toBeTypeOf('number');
      expect(body.domains).toBeTypeOf('number');
    });

    it('should include Cache-Control header', async () => {
      const res = await handle(
        get('http://localhost/api/v1/stats'),
        ctx()
      );

      expect(res.headers.get('Cache-Control')).toContain('max-age=60');
    });

    it('should reflect registered agents in molters count', async () => {
      // We already registered one in beforeEach
      const res = await handle(
        get('http://localhost/api/v1/stats'),
        ctx()
      );
      const body = await res.json() as any;

      expect(body.molters).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Feedback Endpoint ──

  describe('POST /api/v1/feedback', () => {
    it('should submit feedback and return 201', async () => {
      const res = await handle(
        json(
          {
            message: 'Search results are not relevant for the security domain',
            category: 'quality',
          },
          { url: 'http://localhost/api/v1/feedback', apiKey }
        ),
        ctx()
      );
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.message).toBe('Search results are not relevant for the security domain');
      expect(body.category).toBe('quality');
      expect(body.status).toBe('new');
    });

    it('should accept all optional fields', async () => {
      const res = await handle(
        json(
          {
            message: 'Query returns 500 when domainTags is empty array',
            category: 'bug',
            severity: 'high',
            endpoint: '/api/v1/query',
            context: { requestBody: { domainTags: [] }, responseStatus: 500 },
          },
          { url: 'http://localhost/api/v1/feedback', apiKey }
        ),
        ctx()
      );
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.severity).toBe('high');
      expect(body.endpoint).toBe('/api/v1/query');
      expect(body.context).toEqual({ requestBody: { domainTags: [] }, responseStatus: 500 });
    });

    it('should return 401 without auth', async () => {
      const res = await handle(
        json(
          { message: 'test', category: 'general' },
          { url: 'http://localhost/api/v1/feedback' }
        ),
        ctx()
      );

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing message', async () => {
      const res = await handle(
        json(
          { category: 'general' },
          { url: 'http://localhost/api/v1/feedback', apiKey }
        ),
        ctx()
      );

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid category', async () => {
      const res = await handle(
        json(
          { message: 'test', category: 'invalid' },
          { url: 'http://localhost/api/v1/feedback', apiKey }
        ),
        ctx()
      );

      expect(res.status).toBe(400);
    });
  });

  // ── Validation Endpoints ──

  describe('POST /api/v1/contributions/:id/validate', () => {
    it('should validate a contribution and return 200', async () => {
      // Register a second agent to validate
      const reg2 = await handle(
        json(
          { displayName: 'ValidatorAgent' },
          { url: 'http://localhost/api/v1/agents' }
        ),
        ctx()
      );
      const reg2Body = await reg2.json() as any;
      const validatorKey = reg2Body.apiKey;

      // Create a contribution with first agent
      const createRes = await handle(
        json(
          { claim: 'Validatable insight about knowledge bases', confidence: 0.8 },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = await createRes.json() as any;

      // Validate with second agent
      const res = await handle(
        json(
          { signal: 'confirmed', context: 'Looks correct' },
          { url: `http://localhost/api/v1/contributions/${created.id}/validate`, apiKey: validatorKey }
        ),
        ctx()
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.signal).toBe('confirmed');
    });

    it('should return 401 without auth', async () => {
      const res = await handle(
        json(
          { signal: 'confirmed' },
          { url: 'http://localhost/api/v1/contributions/test-1/validate' }
        ),
        ctx()
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/contributions/:id/validations', () => {
    it('should return validations without auth', async () => {
      // Create contribution
      const createRes = await handle(
        json(
          { claim: 'Another insight to validate', confidence: 0.7 },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const created = await createRes.json() as any;

      const res = await handle(
        get(`http://localhost/api/v1/contributions/${created.id}/validations`),
        ctx()
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // ── Connection Endpoints ──

  describe('POST /api/v1/connections', () => {
    it('should create a connection and return 201', async () => {
      // Create two contributions
      const c1 = await handle(
        json(
          { claim: 'Source claim about API design patterns', confidence: 0.8 },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const source = await c1.json() as any;

      const c2 = await handle(
        json(
          { claim: 'Target claim about REST best practices', confidence: 0.7 },
          { url: 'http://localhost/api/v1/contributions', apiKey }
        ),
        ctx()
      );
      const target = await c2.json() as any;

      const res = await handle(
        json(
          { sourceId: source.id, targetId: target.id, relationship: 'builds-on' },
          { url: 'http://localhost/api/v1/connections', apiKey }
        ),
        ctx()
      );

      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.relationship).toBe('builds-on');
    });

    it('should return 401 without auth', async () => {
      const res = await handle(
        json(
          { sourceId: 'a', targetId: 'b', relationship: 'builds-on' },
          { url: 'http://localhost/api/v1/connections' }
        ),
        ctx()
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/contributions/:id/connections', () => {
    it('should return connections without auth', async () => {
      const res = await handle(
        get('http://localhost/api/v1/contributions/test-1/connections'),
        ctx()
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // ── Domain Endpoints ──

  describe('GET /api/v1/domains', () => {
    it('should return domain stats without auth', async () => {
      const res = await handle(
        get('http://localhost/api/v1/domains'),
        ctx()
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // ── CORS & Routing ──

  describe('CORS', () => {
    it('should include CORS headers on responses', async () => {
      const res = await handle(
        get('http://localhost/api/v1/agents/test'),
        ctx()
      );

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should handle OPTIONS preflight', async () => {
      const req = new Request('http://localhost/api/v1/query', {
        method: 'OPTIONS',
      });
      const res = await handle(req, ctx());

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('404 and 405', () => {
    it('should return 404 for unknown paths', async () => {
      const res = await handle(
        get('http://localhost/api/v1/nonexistent'),
        ctx()
      );

      expect(res.status).toBe(404);
    });

    it('should return 405 for wrong method on valid path', async () => {
      const res = await handle(
        del('http://localhost/api/v1/agents', apiKey),
        ctx()
      );

      expect(res.status).toBe(405);
    });
  });
});
