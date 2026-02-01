/**
 * Logging provider interface.
 * Wraps external logging services (Axiom, console, etc).
 */

/** Log severity levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A structured log event. */
export interface LogEvent {
  /** Severity level. */
  level: LogLevel;
  /** Human-readable message. */
  message: string;
  /** ISO-8601 timestamp (auto-set if omitted). */
  timestamp?: string;
  /** Arbitrary structured metadata. */
  fields?: Record<string, unknown>;
}

/** Extended event for HTTP request logging. */
export interface RequestLogEvent extends LogEvent {
  /** HTTP method (GET, POST, etc). */
  method: string;
  /** URL path (e.g. /api/v1/query). */
  path: string;
  /** HTTP response status code. */
  status: number;
  /** Request duration in milliseconds. */
  durationMs: number;
  /** Authenticated agent ID, if any. */
  agentId?: string;
}

export interface ILogProvider {
  /** Enqueue a structured log event for delivery. */
  log(event: LogEvent): void;

  /** Flush any buffered events. Returns when the flush attempt completes. */
  flush(): Promise<void>;

  /* Convenience methods — all non-blocking. */
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
}
