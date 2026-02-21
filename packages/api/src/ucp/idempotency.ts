import type { Request, Response, NextFunction } from "express";

const IDEMPOTENCY_HEADER = "idempotency-key";
const REQUEST_ID_HEADER = "request-id";
const UCP_AGENT_HEADER = "ucp-agent";

interface CachedResponse {
  status: number;
  body: unknown;
  createdAt: number;
}

const cache = new Map<string, CachedResponse>();

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 10_000;

function evictExpired(): void {
  const now = Date.now();

  for (const [key, entry] of cache) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }

  if (cache.size > MAX_CACHE_SIZE) {
    const oldest = Array.from(cache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, cache.size - MAX_CACHE_SIZE);

    for (const [key] of oldest) {
      cache.delete(key);
    }
  }
}

export function ucpIdempotencyMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const idempotencyKey = request.get(IDEMPOTENCY_HEADER);
  const requestId = request.get(REQUEST_ID_HEADER);
  const ucpAgent = request.get(UCP_AGENT_HEADER);

  if (requestId) {
    response.set("request-id", requestId);
  }

  if (ucpAgent) {
    response.set("ucp-agent", ucpAgent);
  }

  if (!idempotencyKey) {
    next();
    return;
  }

  evictExpired();

  const cached = cache.get(idempotencyKey);

  if (cached) {
    response.status(cached.status).json(cached.body);
    return;
  }

  const originalJson = response.json.bind(response);

  response.json = function cacheAndSend(body: unknown) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      cache.set(idempotencyKey, {
        status: response.statusCode,
        body,
        createdAt: Date.now()
      });
    }

    return originalJson(body);
  };

  next();
}
