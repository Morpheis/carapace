import { describe, it, expect, beforeEach } from 'vitest';
import { createAuthMiddleware } from '../../src/middleware/authenticate.js';
import { AgentService } from '../../src/services/AgentService.js';
import { MockAgentRepository } from '../mocks/MockAgentRepository.js';
import type { Handler, HandlerContext } from '../../src/middleware/pipeline.js';

describe('authenticate middleware', () => {
  let agentService: AgentService;
  let agentRepo: MockAgentRepository;
  let authenticate: ReturnType<typeof createAuthMiddleware>;
  let registeredApiKey: string;

  beforeEach(async () => {
    agentRepo = new MockAgentRepository();
    agentService = new AgentService(agentRepo);
    authenticate = createAuthMiddleware(agentService);

    const result = await agentService.register({
      displayName: 'TestAgent',
    });
    registeredApiKey = result.apiKey;
  });

  const echoHandler: Handler = async (_req, ctx) => {
    return new Response(
      JSON.stringify({
        agentId: ctx.agent?.id ?? null,
        displayName: ctx.agent?.displayName ?? null,
      }),
      { status: 200 }
    );
  };

  function makeReq(apiKey?: string): Request {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return new Request('http://test', { headers });
  }

  it('should set agent on context for valid Bearer token', async () => {
    const wrapped = authenticate(echoHandler);
    const res = await wrapped(
      makeReq(registeredApiKey),
      { agent: null }
    );

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.agentId).toBeTruthy();
    expect(body.displayName).toBe('TestAgent');
  });

  it('should return 401 when no Authorization header', async () => {
    const wrapped = authenticate(echoHandler);
    const res = await wrapped(makeReq(), { agent: null });
    const body = await res.json() as any;

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 for non-Bearer scheme', async () => {
    const req = new Request('http://test', {
      headers: { Authorization: `Basic ${registeredApiKey}` },
    });
    const wrapped = authenticate(echoHandler);
    const res = await wrapped(req, { agent: null });

    expect(res.status).toBe(401);
  });

  it('should return 401 for invalid API key', async () => {
    const wrapped = authenticate(echoHandler);
    const res = await wrapped(
      makeReq('sc_key_bogus_garbage'),
      { agent: null }
    );

    expect(res.status).toBe(401);
  });

  it('should return 401 for empty Bearer token', async () => {
    const req = new Request('http://test', {
      headers: { Authorization: 'Bearer ' },
    });
    const wrapped = authenticate(echoHandler);
    const res = await wrapped(req, { agent: null });

    expect(res.status).toBe(401);
  });
});
