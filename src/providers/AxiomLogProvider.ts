/**
 * Axiom log provider.
 * Buffers events and sends them in batches to Axiom's ingest API.
 * Non-blocking — flush failures are swallowed (events retained for retry).
 * Gracefully degrades to no-op when apiToken is empty.
 */

import type { ILogProvider, LogEvent } from './ILogProvider.js';

export interface AxiomLogProviderOptions {
  /** Axiom API token (Bearer). Empty string disables sending. */
  apiToken: string;
  /** Axiom dataset name. */
  dataset: string;
  /** Flush after this many buffered events. Default: 50. */
  flushThreshold?: number;
  /** Auto-flush interval in ms. Default: 10_000 (10s). 0 disables. */
  flushIntervalMs?: number;
}

const AXIOM_INGEST_URL = 'https://api.axiom.co/v1/datasets';

export class AxiomLogProvider implements ILogProvider {
  private buffer: LogEvent[] = [];
  private readonly apiToken: string;
  private readonly dataset: string;
  private readonly flushThreshold: number;
  private readonly flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly enabled: boolean;

  constructor(options: AxiomLogProviderOptions) {
    this.apiToken = options.apiToken;
    this.dataset = options.dataset;
    this.flushThreshold = options.flushThreshold ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 10_000;
    this.enabled = Boolean(this.apiToken);

    if (this.enabled && this.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, this.flushIntervalMs);
      // Don't hold the process open for the timer
      if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }

  log(event: LogEvent): void {
    if (!this.enabled) return;

    const stamped: LogEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.buffer.push(stamped);

    if (this.buffer.length >= this.flushThreshold) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.enabled || this.buffer.length === 0) return;

    const batch = [...this.buffer];

    try {
      const response = await fetch(
        `${AXIOM_INGEST_URL}/${this.dataset}/ingest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
          },
          body: JSON.stringify(batch),
        }
      );

      if (response.ok) {
        // Only clear the events that were in this batch
        this.buffer.splice(0, batch.length);
      }
      // Non-ok response: retain events for retry on next flush
    } catch {
      // Network error: retain events for retry on next flush
    }
  }

  /** Stop the auto-flush timer and flush remaining events. */
  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
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
}
