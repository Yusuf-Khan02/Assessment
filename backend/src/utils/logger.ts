import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  type?: string;
  [key: string]: unknown;
}

export class Logger {
  private static formatLog(level: LogLevel, message: string, meta: Record<string, unknown> = {}): string {
    const context = requestContextStorage.getStore();
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context?.requestId && { requestId: context.requestId }),
      ...(context?.tenantId && { tenantId: context.tenantId }),
      ...(context?.userId && { userId: context.userId }),
      ...meta,
    };
    return JSON.stringify(entry);
  }

  static debug(message: string, meta: Record<string, unknown> = {}): void {
    if (process.env.NODE_ENV !== 'production' || process.env.LOG_LEVEL === 'DEBUG') {
      console.debug(this.formatLog('DEBUG', message, meta));
    }
  }

  static info(message: string, meta: Record<string, unknown> = {}): void {
    console.log(this.formatLog('INFO', message, meta));
  }

  static warn(message: string, meta: Record<string, unknown> = {}): void {
    console.warn(this.formatLog('WARN', message, meta));
  }

  static error(message: string, meta: Record<string, unknown> = {}): void {
    console.error(this.formatLog('ERROR', message, meta));
  }

  /**
   * Dedicated structured logging for performance SLA violations
   */
  static perfAlert(
    alert: string,
    thresholdMs: number,
    actualMs: number,
    meta: Record<string, unknown> = {}
  ): void {
    const entry = this.formatLog('WARN', `Performance SLA Exceeded: ${alert}`, {
      type: 'PERFORMANCE_ALERT',
      alert,
      thresholdMs,
      actualMs,
      ...meta,
    });
    console.warn(`[PERFORMANCE_ALERT]: ${entry}`);
  }
}

