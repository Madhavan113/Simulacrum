import type { NextFunction, Request, Response } from "express";

export interface CorsMiddlewareOptions {
  allowedOrigins?: string | string[];
}

export function createCorsMiddleware(options: CorsMiddlewareOptions = {}) {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const rawOrigins = options.allowedOrigins ?? envOrigins ?? "http://localhost:5173";
  const allowedOrigins = typeof rawOrigins === "string"
    ? rawOrigins.split(",").map((o) => o.trim()).filter(Boolean)
    : rawOrigins;

  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;

    if (origin && (allowedOrigins.includes("*") || allowedOrigins.includes(origin))) {
      response.setHeader("Access-Control-Allow-Origin", origin);
    } else if (allowedOrigins.includes("*")) {
      response.setHeader("Access-Control-Allow-Origin", "*");
    }

    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
    response.setHeader("Access-Control-Max-Age", "86400");

    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }

    next();
  };
}
