/**
 * A robust fetch wrapper with timeout and exponential-backoff retry for LLM API calls.
 *
 * - Each attempt aborts after a configurable timeout (default 30 s).
 * - Retries up to `maxRetries` times (default 3) with exponential backoff
 *   (baseDelay × 2^attempt, i.e. 1 s → 2 s → 4 s).
 * - Retries on: HTTP 5xx, network errors (TypeError), and timeouts (AbortError).
 * - Does NOT retry on: HTTP 4xx (except 429 is treated as a final failure).
 * - On final failure throws an Error with a descriptive message.
 */

export interface FetchRetryOptions {
  /** Per-attempt timeout in milliseconds (default 30_000). */
  timeoutMs?: number;
  /** Maximum number of retry attempts (default 3). */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default 1_000). */
  baseDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;

/**
 * Wraps `fetch` with timeout and exponential-backoff retry logic.
 *
 * @param input - The fetch input (URL or Request).
 * @param init  - Optional fetch init options.
 * @param options - Optional overrides for timeout, retry count, and base delay.
 * @returns A `Response` on success.
 * @throws {Error} If all retries are exhausted, with a message detailing
 *                 the number of attempts and the last error.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchRetryOptions,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      // Do not retry 4xx errors (including 429 — treat as final failure)
      if (response.status >= 400 && response.status < 500) {
        clearTimeout(timeoutId);
        return response;
      }

      if (response.status >= 500) {
        clearTimeout(timeoutId);
        lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
        // Exhausted all retries — return the response so caller sees the 5xx
        if (attempt === maxRetries) {
          return response;
        }
        await delay(baseDelayMs * Math.pow(2, attempt));
        continue;
      }

      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      // AbortError means the request timed out
      if (err instanceof DOMException && err.name === 'AbortError') {
        err = new Error(`Request timed out after ${timeoutMs} ms`);
      }

      lastError = err;

      if (attempt === maxRetries) {
        break;
      }

      await delay(baseDelayMs * Math.pow(2, attempt));
    }
  }

  throw new Error(
    `fetchWithRetry failed after ${maxRetries + 1} attempt(s). Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
