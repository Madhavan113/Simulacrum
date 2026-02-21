import { submitMessage, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";
import crypto from "node:crypto";

import { getServiceStore, persistServiceStore, type ServiceStore } from "./store.js";
import { type ReviewServiceInput, type ServiceReview, ServiceError } from "./types.js";

interface ReviewServiceDependencies {
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface ReviewServiceOptions {
  client?: Client;
  store?: ServiceStore;
  deps?: Partial<ReviewServiceDependencies>;
}

function toServiceError(message: string, error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  return new ServiceError(message, error);
}

export async function reviewService(
  input: ReviewServiceInput,
  options: ReviewServiceOptions = {}
): Promise<ServiceReview> {
  validateNonEmptyString(input.serviceId, "serviceId");
  validateNonEmptyString(input.serviceRequestId, "serviceRequestId");
  validateNonEmptyString(input.reviewerAccountId, "reviewerAccountId");
  validatePositiveNumber(input.rating, "rating");
  validateNonEmptyString(input.comment, "comment");

  if (input.rating < 1 || input.rating > 5) {
    throw new ServiceError("Rating must be between 1 and 5.");
  }

  const deps: ReviewServiceDependencies = {
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  const store = getServiceStore(options.store);
  const service = store.services.get(input.serviceId);

  if (!service) {
    throw new ServiceError(`Service ${input.serviceId} not found.`);
  }

  const request = store.requests.get(input.serviceRequestId);

  if (!request) {
    throw new ServiceError(`Request ${input.serviceRequestId} not found.`);
  }

  if (request.serviceId !== input.serviceId) {
    throw new ServiceError("Request does not belong to this service.");
  }

  if (request.status !== "COMPLETED") {
    throw new ServiceError("Can only review completed requests.");
  }

  if (request.requesterAccountId !== input.reviewerAccountId) {
    throw new ServiceError("Only the requester can review a service.");
  }

  // Check for duplicate review
  const existingReviews = store.reviews.get(input.serviceId) ?? [];
  const alreadyReviewed = existingReviews.some(
    (r) => r.serviceRequestId === input.serviceRequestId
  );
  if (alreadyReviewed) {
    throw new ServiceError("This request has already been reviewed.");
  }

  try {
    const nowIso = deps.now().toISOString();
    const review: ServiceReview = {
      id: crypto.randomUUID(),
      serviceId: input.serviceId,
      serviceRequestId: input.serviceRequestId,
      reviewerAccountId: input.reviewerAccountId,
      rating: Math.round(input.rating),
      comment: input.comment,
      createdAt: nowIso
    };

    existingReviews.push(review);
    store.reviews.set(input.serviceId, existingReviews);

    // Update service rating (running average)
    service.reviewCount += 1;
    const totalRating = existingReviews.reduce((sum, r) => sum + r.rating, 0);
    service.rating = Number((totalRating / existingReviews.length).toFixed(2));
    service.updatedAt = nowIso;
    store.services.set(service.id, service);

    persistServiceStore(store);

    await deps.submitMessage(
      service.id,
      {
        type: "SERVICE_REVIEWED",
        reviewId: review.id,
        serviceId: service.id,
        requestId: input.serviceRequestId,
        rating: review.rating,
        reviewerAccountId: input.reviewerAccountId,
        createdAt: nowIso
      },
      { client: options.client }
    );

    return review;
  } catch (error) {
    throw toServiceError("Failed to review service.", error);
  }
}
