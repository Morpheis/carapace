/**
 * Console-based log provider.
 * Buffers events in memory for inspection (useful in tests).
 * Optionally writes to stdout.
 */

import type { ILogProvider, LogEvent, LogLevel } from './ILogProvider.js';

export interface ConsoleLogProviderOptions {
  /** Write events to console.log as they arrive. Default: false. */
  outputToConsole?: boolean;
}

export class ConsoleLogProvider implements ILogProvider {
  /** Inspectable buffer of all logged events (most recent last). */
  readonly events: LogEvent[] = [];

  private readonly outputToConsole: boolean;

  constructor(options?: ConsoleLogProviderOptions) {
    this.outputToConsole = options?.outputToConsole ?? false;
  }

  log(event: LogEvent): void {
    const stamped: LogEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.events.push(stamped);

    if (this.outputToConsole) {
      const prefix = `[${stamped.level.toUpperCase()}]`;
      const fieldsStr = stamped.fields ? ` ${JSON.stringify(stamped.fields)}` : '';
      console.log(`${prefix} ${stamped.message}${fieldsStr}`);
    }
  }

  async flush(): Promise<void> {
    // Nothing to flush — events are synchronous.
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.log({ level: 'info', message, fields });
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.log({ level: 'warn', message, fields });
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.log({ level: 'error', message, fields });
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.log({ level: 'debug', message, fields });
  }

  /** Clear the event buffer. Useful between test cases. */
  clear(): void {
    this.events.length = 0;
  }
}
