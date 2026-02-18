import type { NextFunction, Request, Response } from "express";

export interface AutonomyMutationGuardOptions {
  strictMutations?: boolean;
  allowedMutationPrefixes?: readonly string[];
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isAllowedMutationPath(path: string, allowedPrefixes: readonly string[]): boolean {
  for (const prefix of allowedPrefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return false;
}

export function createAutonomyMutationGuard(options: AutonomyMutationGuardOptions = {}) {
  const strictMutations = options.strictMutations ?? false;
  const allowedMutationPrefixes = options.allowedMutationPrefixes ?? ["/autonomy", "/clawdbots"];

  return (request: Request, response: Response, next: NextFunction): void => {
    if (!strictMutations) {
      next();
      return;
    }

    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      next();
      return;
    }

    if (isAllowedMutationPath(request.path, allowedMutationPrefixes)) {
      next();
      return;
    }

    response.status(403).json({
      error: "Strict autonomous mode enabled. Manual state mutations are blocked."
    });
  };
}
