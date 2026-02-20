import { timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export interface AdminAuthMiddlewareOptions {
  adminKey?: string;
}

export function createAdminAuthMiddleware(options: AdminAuthMiddlewareOptions = {}) {
  const adminKey =
    options.adminKey ??
    process.env.SIMULACRUM_ADMIN_KEY ??
    process.env.SIMULACRUM_API_KEY;

  return (request: Request, response: Response, next: NextFunction): void => {
    if (!adminKey) {
      response.status(503).json({
        error: "Admin operations are disabled. Set SIMULACRUM_ADMIN_KEY to enable."
      });
      return;
    }

    const provided =
      request.header("x-admin-key") ??
      request.header("x-api-key");

    if (!provided) {
      const auth = request.header("authorization");
      const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

      if (
        !token ||
        token.length !== adminKey.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(adminKey))
      ) {
        response.status(403).json({ error: "Forbidden. Admin key required." });
        return;
      }

      next();
      return;
    }

    if (
      provided.length !== adminKey.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(adminKey))
    ) {
      response.status(403).json({ error: "Forbidden. Invalid admin key." });
      return;
    }

    next();
  };
}
