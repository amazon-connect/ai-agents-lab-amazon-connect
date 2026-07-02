// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Validation utilities for batch execution configuration inputs. */

/** Result of validating batch configuration parameters. */
export interface BatchValidationResult {
  valid: boolean;
  iterationCountError?: string;
  concurrencyError?: string;
}

/**
 * Validate batch configuration inputs.
 *
 * Iteration count must be an integer in [1, 1000].
 * Concurrency must be an integer in [1, 50].
 * Both inputs are strings (from form fields) and are parsed/validated here.
 */
export function validateBatchConfig(
  iterationCount: string,
  concurrency: string
): BatchValidationResult {
  const iterationCountError = validateIterationCount(iterationCount);
  const concurrencyError = validateConcurrency(concurrency);

  const result: BatchValidationResult = {
    valid: iterationCountError === undefined && concurrencyError === undefined,
  };

  if (iterationCountError !== undefined) {
    result.iterationCountError = iterationCountError;
  }
  if (concurrencyError !== undefined) {
    result.concurrencyError = concurrencyError;
  }

  return result;
}

/** Validate iteration count input. Returns error message or undefined if valid. */
function validateIterationCount(value: string): string | undefined {
  return validateIntegerInRange(value, 1, 1000, "Iteration count");
}

/** Validate concurrency input. Returns error message or undefined if valid. */
function validateConcurrency(value: string): string | undefined {
  return validateIntegerInRange(value, 1, 50, "Concurrency");
}

/** Validate that a string represents an integer within [min, max]. */
function validateIntegerInRange(
  value: string,
  min: number,
  max: number,
  fieldName: string
): string | undefined {
  const trimmed = value.trim();

  if (trimmed === "") {
    return `${fieldName} is required.`;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return `${fieldName} must be a whole number.`;
  }

  if (parsed < min || parsed > max) {
    return `${fieldName} must be between ${min} and ${max}.`;
  }

  return undefined;
}
