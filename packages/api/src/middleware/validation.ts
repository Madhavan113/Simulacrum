import type { RequestHandler } from "express";
import { type ZodSchema } from "zod";

export function validateBody<TBody>(schema: ZodSchema<TBody>): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      response.status(400).json({
        error: "Invalid request body",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
      return;
    }

    request.body = result.data;
    next();
  };
}
