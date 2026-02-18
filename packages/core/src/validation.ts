export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-empty string.`);
  }
}

export function validatePositiveNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} must be a positive number.`);
  }
}

export function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${field} must be a positive integer.`);
  }
}

export function validateNonNegativeNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative number.`);
  }
}

export function validateFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number.`);
  }
}

export function validateNonNegativeInteger(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative integer.`);
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
