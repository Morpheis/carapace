import { describe, it, expect, beforeEach } from 'vitest';
import { createLoggingMiddleware } from '../../src/middleware/logging.js';
import { ConsoleLogProvider } from '../../src/providers/ConsoleLogProvider.js';
import type { Handler, HandlerContext } from '../../src/middleware/pipeline.js';
import type { RequestLogEvent } from '../../src/providers/ILogProvider.js';

function makeRequest(method: string, path: string): Request {
  return new Request(`https://example.com${path}`, { method });
}

const defaultCtx: HandlerContext = { agent: null };
const agentCtx: HandlerContext = {
  agent: {
    id: 'agent-123',
    apiKeyHash: 'hash',
    displayName: 'TestBot',
    description: null,
    trustScore: 0.5,
    createdAt: new Date(),
    lastActiveAt: null,
  },
};

describe('logging middleware', () => {
  let logProvider: ConsoleLogProvider;
  let middleware: ReturnType<typeof createLoggingMiddleware>;

  beforeEach(() => {
    logProvider = new ConsoleLogProvider();
    middleware = createLoggingMiddleware(logProvider);
  });

  // --- basic request logging ---

  it('should log a successful request', async () => {
    const handler: Handler = async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 });

    const wrapped = middleware(handler);
    const response = await wrapped(makeRequest('GET', '/api/v1/stats'), defaultCtx);

    expect(response.status).toBe(200);
    expect(logProvider.events).toHaveLength(1);

    const event = logProvider.events[0] as RequestLogEvent;
    expect(event.level).toBe('info');
    expect(event.method).toBe('GET');
    expect(event.path).toBe('/api/v1/stats');
    expect(event.status).toBe(200);
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(event.message).toContain('GET /api/v1/stats');
    expect(event.message).toContain('200');
  });

  it('should pass through the response unmodified', async () => {
    const body = JSON.stringify({ data: 'test' });
    const handler: Handler = async () =>
      new Response(body, {
        status: 201,
        headers: { 'Content-Type': 'application/json', 'X-Custom': 'yes' },
      });

    const wrapped = middleware(handler);
    const response = await wrapped(makeRequest('POST', '/api/v1/contributions'), defaultCtx);

    expect(response.status).toBe(201);
    expect(response.headers.get('X-Custom')).toBe('yes');
    expect(await response.text()).toBe(body);
  });

  // --- method and path ---

  it('should log POST method and path correctly', async () => {
    const handler: Handler = async () => new Response(null, { status: 201 });
    const wrapped = middleware(handler);
    await wrapped(makeRequest('POST', '/api/v1/query'), defaultCtx);

    const event = logProvider.events[0] as RequestLogEvent;
    expect(event.method).toBe('POST');
    expect(event.path).toBe('/api/v1/query');
    expect(event.status).toBe(201);
  });

  // --- agent context ---

  it('should include agentId when agent is authenticated', async () => {
    const handler: Handler = async () => new Response(null, { status: 200 });
    const wrapped = middleware(handler);
    await wrapped(makeRequest('GET', '/api/v1/stats'), agentCtx);

    const event = logProvider.events[0] as RequestLogEvent;
    expect(event.agentId).toBe('agent-123');
  });

  it('should omit agentId when no agent in context', async () => {
    const handler: Handler = async () => new Response(null, { status: 200 });
    const wrapped = middleware(handler);
    await wrapped(makeRequest('GET', '/api/v1/stats'), defaultCtx);

    const event = logProvider.events[0] as RequestLogEvent;
    expect(event.agentId).toBeUndefined();
  });

  // --- error responses ---

  it('should log 4xx responses at warn level', async () => {
    const handler: Handler = async () =>
      new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

    const wrapped = middleware(handler);
    await wrapped(makeRequest('GET', '/api/v1/contributions/bad'), defaultCtx);

    const event = logProvider.events[0];
    expect(event.level).toBe('warn');
    expect((event as RequestLogEvent).status).toBe(404);
  });

  it('should log 5xx responses at error level', async () => {
    const handler: Handler = async () =>
      new Response('Internal Error', { status: 500 });

    const wrapped = middleware(handler);
    await wrapped(makeRequest('POST', '/api/v1/query'), defaultCtx);

    const event = logProvider.events[0];
    expect(event.level).toBe('error');
    expect((event as RequestLogEvent).status).toBe(500);
  });

  it('should log 2xx responses at info level', async () => {
    const handler: Handler = async () => new Response(null, { status: 204 });
    const wrapped = middleware(handler);
    await wrapped(makeRequest('DELETE', '/api/v1/contributions/abc'), defaultCtx);

    expect(logProvider.events[0].level).toBe('info');
  });

  // --- duration tracking ---

  it('should measure request duration', async () => {
    const handler: Handler = async () => {
      await new Promise((r) => setTimeout(r, 20));
      return new Response(null, { status: 200 });
    };

    const wrapped = middleware(handler);
    await wrapped(makeRequest('GET', '/api/v1/stats'), defaultCtx);

    const event = logProvider.events[0] as RequestLogEvent;
    expect(event.durationMs).toBeGreaterThanOrEqual(15); // allow small timing variance
  });

  // --- handler exceptions ---

  it('should log and re-throw if the handler throws', async () => {
    const handler: Handler = async () => {
      throw new Error('boom');
    };

    const wrapped = middleware(handler);
    await expect(wrapped(makeRequest('POST', '/api/v1/query'), defaultCtx)).rejects.toThrow(
      'boom'
    );

    // Should still have logged the error
    expect(logProvider.events).toHaveLength(1);
    const event = logProvider.events[0] as RequestLogEvent;
    expect(event.level).toBe('error');
    expect(event.status).toBe(500);
    expect(event.message).toContain('POST /api/v1/query');
    expect(event.fields?.error).toBe('boom');
  });

  // --- strips query strings from logged path ---

  it('should log path without query parameters', async () => {
    const handler: Handler = async () => new Response(null, { status: 200 });
    const wrapped = middleware(handler);
    await wrapped(makeRequest('GET', '/api/v1/stats?foo=bar&baz=1'), defaultCtx);

    const event = logProvider.events[0] as RequestLogEvent;
    expect(event.path).toBe('/api/v1/stats');
  });
});
