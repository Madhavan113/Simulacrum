import type { NextFunction, Request, Response } from "express";

import type { AgentAuthService } from "../agent-platform/auth.js";

export interface AgentAuthMiddlewareOptions {
  optional?: boolean;
  skip?: (request: Request) => boolean;
}

function extractBearerToken(request: Request): string | null {
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

export function createAgentAuthMiddleware(
  authService: AgentAuthService,
  options: AgentAuthMiddlewareOptions = {}
) {
  const optional = options.optional ?? false;

  return (request: Request, response: Response, next: NextFunction): void => {
    if (options.skip?.(request)) {
      next();
      return;
    }

    const token = extractBearerToken(request);

    if (!token) {
      if (optional) {
        next();
        return;
      }

      response.status(401).json({ error: "Agent access token is required." });
      return;
    }

    try {
      const claims = authService.verifyAccessToken(token);
      const profile = authService.getAgent(claims.sub);
      request.agentContext = {
        agentId: claims.sub,
        agentName: profile?.name ?? claims.sub,
        walletAccountId: claims.walletAccountId,
        scope: claims.scope,
        tokenId: claims.jti,
        issuedAt: claims.iat,
        expiresAt: claims.exp
      };
      next();
    } catch (error) {
      response.status(401).json({ error: (error as Error).message });
    }
  };
}

export function createAgentOnlyModeGuard(authService: AgentAuthService) {
  const middleware = createAgentAuthMiddleware(authService, {
    skip(request) {
      if (request.path === "/health") {
        return true;
      }

      if (request.path.startsWith("/agent/v1/auth/")) {
        return true;
      }

      if (request.path === "/.well-known/ucp" || request.path.startsWith("/ucp/")) {
        return true;
      }

      return false;
    }
  });

  return (request: Request, response: Response, next: NextFunction): void => {
    middleware(request, response, next);
  };
}

