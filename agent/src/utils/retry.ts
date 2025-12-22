// Exponential backoff retry utility for FHE relayer operations

import { createLogger } from "./logger.js";

const logger = createLogger("Retry");

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  shouldRetry: (error: unknown) => {
    // Retry on network errors and 5xx status codes
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Retry on status 5xx errors (common with Zama relayer)
      if (/status\s*[:=]?\s*5\d{2}/i.test(message)) return true;
      // Retry on network errors
      if (message.includes("network") || message.includes("timeout") || message.includes("econnrefused")) return true;
      // Retry on rate limiting
      if (/status\s*[:=]?\s*429/i.test(message)) return true;
    }
    return false;
  },
};

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= opts.maxRetries) {
        logger.error(`All ${opts.maxRetries + 1} attempts failed`, error);
        throw error;
      }

      if (!opts.shouldRetry(error, attempt)) {
        logger.debug("Error is not retryable, throwing immediately", {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = opts.baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
      const delay = Math.min(exponentialDelay + jitter, opts.maxDelayMs);

      logger.warn(`Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms`, {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries + 1,
        delayMs: Math.round(delay),
        error: error instanceof Error ? error.message : String(error),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Relayer-specific retry with appropriate defaults
export async function withRelayerRetry<T>(operation: () => Promise<T>): Promise<T> {
  return withRetry(operation, {
    maxRetries: 5,
    baseDelayMs: 3000,
    maxDelayMs: 60000,
    shouldRetry: (error) => {
      if (error instanceof Error) {
        const message = error.message;
        // Zama relayer specific errors
        if (/status\s*[:=]?\s*(500|502|503|504|520)/i.test(message)) return true;
        if (message.includes("relayer")) return true;
        if (message.includes("timeout")) return true;
      }
      return false;
    },
  });
}

