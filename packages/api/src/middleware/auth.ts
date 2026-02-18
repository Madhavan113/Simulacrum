import type { NextFunction, Request, Response } from "express";

export interface AuthMiddlewareOptions {
  apiKey?: string;
}

function extractApiKey(request: Request): string | null {
  const headerKey = request.header("x-api-key");

  if (headerKey) {
    return headerKey;
  }

  const authorization = request.header("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const configuredApiKey = options.apiKey ?? process.env.SIMULACRUM_API_KEY;

  return (request: Request, response: Response, next: NextFunction): void => {
    if (!configuredApiKey) {
      next();
      return;
    }

    const receivedApiKey = extractApiKey(request);

    if (receivedApiKey !== configuredApiKey) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}
