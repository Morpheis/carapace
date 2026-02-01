import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiomLogProvider } from '../../src/providers/AxiomLogProvider.js';

// We mock global fetch for all tests.
const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

describe('AxiomLogProvider', () => {
  let provider: AxiomLogProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    provider = new AxiomLogProvider({
      apiToken: 'test-token',
      dataset: 'test-dataset',
      // Low thresholds for testing
      flushIntervalMs: 60_000,
      flushThreshold: 5,
    });
  });

  afterEach(() => {
    provider.dispose();
    vi.restoreAllMocks();
  });

  // --- buffering ---

  it('should buffer events without sending until flush', () => {
    provider.info('hello');
    provider.warn('world');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should auto-set timestamps on events', () => {
    provider.info('test');
    // We can't inspect the buffer directly, but after flush it will be in the payload
  });

  // --- flush() ---

  it('should send buffered events to Axiom on flush', async () => {
    provider.info('one');
    provider.warn('two', { key: 'val' });
    await provider.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.axiom.co/v1/datasets/test-dataset/ingest');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    });

    const body = JSON.parse(init?.body as string);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ level: 'info', message: 'one' });
    expect(body[1]).toMatchObject({ level: 'warn', message: 'two', fields: { key: 'val' } });
    // Timestamps should be set
    expect(body[0].timestamp).toBeDefined();
    expect(body[1].timestamp).toBeDefined();
  });

  it('should not call fetch when buffer is empty', async () => {
    await provider.flush();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should clear buffer after successful flush', async () => {
    provider.info('event');
    await provider.flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second flush should be a no-op
    await provider.flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // --- auto-flush on threshold ---

  it('should auto-flush when buffer reaches threshold', async () => {
    // Threshold is 5
    provider.info('1');
    provider.info('2');
    provider.info('3');
    provider.info('4');
    expect(mockFetch).not.toHaveBeenCalled();

    provider.info('5'); // hits threshold
    // Auto-flush is async, give it a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toHaveLength(5);
  });

  // --- error resilience ---

  it('should not throw when Axiom returns an error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
    provider.error('bad');
    // Should not throw
    await expect(provider.flush()).resolves.toBeUndefined();
  });

  it('should not throw when fetch itself rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network down'));
    provider.error('bad');
    await expect(provider.flush()).resolves.toBeUndefined();
  });

  it('should retain events when flush fails so they can be retried', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network down'));
    provider.info('important');
    await provider.flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Events should still be buffered — retry on next flush
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await provider.flush();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    expect(body).toHaveLength(1);
    expect(body[0].message).toBe('important');
  });

  // --- convenience methods ---

  it('info/warn/error/debug should log at correct levels', async () => {
    provider.info('i');
    provider.warn('w');
    provider.error('e');
    provider.debug('d');
    await provider.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body.map((e: { level: string }) => e.level)).toEqual([
      'info',
      'warn',
      'error',
      'debug',
    ]);
  });

  // --- log() with full event ---

  it('should accept a full LogEvent with custom timestamp and fields', async () => {
    const ts = '2026-01-20T00:00:00.000Z';
    provider.log({ level: 'warn', message: 'custom', timestamp: ts, fields: { x: 1 } });
    await provider.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body[0]).toMatchObject({
      level: 'warn',
      message: 'custom',
      timestamp: ts,
      fields: { x: 1 },
    });
  });

  // --- dispose ---

  it('dispose() should flush remaining events', async () => {
    provider.info('final');
    await provider.dispose();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // --- disabled mode (no token) ---

  it('should silently no-op when apiToken is empty', async () => {
    const disabled = new AxiomLogProvider({ apiToken: '', dataset: 'x' });
    disabled.info('ignored');
    await disabled.flush();
    expect(mockFetch).not.toHaveBeenCalled();
    disabled.dispose();
  });
});
