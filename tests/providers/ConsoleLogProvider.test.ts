import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleLogProvider } from '../../src/providers/ConsoleLogProvider.js';
import type { LogEvent } from '../../src/providers/ILogProvider.js';

describe('ConsoleLogProvider', () => {
  let provider: ConsoleLogProvider;

  beforeEach(() => {
    provider = new ConsoleLogProvider();
  });

  // --- log() ---

  it('should accept a log event', () => {
    const event: LogEvent = { level: 'info', message: 'test' };
    provider.log(event);
    expect(provider.events).toHaveLength(1);
    expect(provider.events[0]).toMatchObject({ level: 'info', message: 'test' });
  });

  it('should auto-set timestamp if omitted', () => {
    provider.log({ level: 'info', message: 'no ts' });
    expect(provider.events[0].timestamp).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(provider.events[0].timestamp!).toISOString()).toBe(provider.events[0].timestamp);
  });

  it('should preserve provided timestamp', () => {
    const ts = '2026-01-15T12:00:00.000Z';
    provider.log({ level: 'warn', message: 'with ts', timestamp: ts });
    expect(provider.events[0].timestamp).toBe(ts);
  });

  it('should preserve fields on events', () => {
    provider.log({ level: 'error', message: 'boom', fields: { code: 500, path: '/api' } });
    expect(provider.events[0].fields).toEqual({ code: 500, path: '/api' });
  });

  it('should accumulate multiple events', () => {
    provider.log({ level: 'info', message: 'first' });
    provider.log({ level: 'warn', message: 'second' });
    provider.log({ level: 'error', message: 'third' });
    expect(provider.events).toHaveLength(3);
  });

  // --- convenience methods ---

  it('info() should log at info level', () => {
    provider.info('hello');
    expect(provider.events[0]).toMatchObject({ level: 'info', message: 'hello' });
  });

  it('warn() should log at warn level with fields', () => {
    provider.warn('careful', { detail: 'test' });
    expect(provider.events[0]).toMatchObject({
      level: 'warn',
      message: 'careful',
      fields: { detail: 'test' },
    });
  });

  it('error() should log at error level', () => {
    provider.error('broken', { stack: 'trace' });
    expect(provider.events[0]).toMatchObject({
      level: 'error',
      message: 'broken',
      fields: { stack: 'trace' },
    });
  });

  it('debug() should log at debug level', () => {
    provider.debug('verbose');
    expect(provider.events[0]).toMatchObject({ level: 'debug', message: 'verbose' });
  });

  // --- flush() ---

  it('flush() should resolve immediately', async () => {
    provider.info('test');
    await expect(provider.flush()).resolves.toBeUndefined();
  });

  // --- console output ---

  it('should write to console when outputToConsole is true', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loud = new ConsoleLogProvider({ outputToConsole: true });
    loud.info('hello console');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('hello console');
    spy.mockRestore();
  });

  it('should not write to console by default', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    provider.info('silent');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // --- clear() ---

  it('clear() should empty the events buffer', () => {
    provider.info('one');
    provider.info('two');
    expect(provider.events).toHaveLength(2);
    provider.clear();
    expect(provider.events).toHaveLength(0);
  });
});
