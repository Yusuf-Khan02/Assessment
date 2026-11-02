import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger, requestContextStorage } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export const API_PERFORMANCE_THRESHOLD_MS = 2000;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId.trim()
    : randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = performance.now();

  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - start);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (durationMs > API_PERFORMANCE_THRESHOLD_MS) {
      Logger.perfAlert('API_ENDPOINT_SLA_EXCEEDED', API_PERFORMANCE_THRESHOLD_MS, durationMs, {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
      });
    }

    Logger.info('HTTP Request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ...(tenantId && { tenantId }),
      ...(userId && { userId }),
    });
  });

  requestContextStorage.run(
    {
      requestId,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
    },
    () => {
      next();
    }
  );
}
