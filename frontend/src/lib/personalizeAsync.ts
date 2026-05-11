export interface PersonalizeEventResponse {
  personalized: {
    narrative: string;
    choices: Array<{ id: string; description: string }>;
  } | null;
}

export interface PersonalizeAsyncOptions {
  retries?: number;
  timeout?: number;
}

/**
 * Wraps `api.personalizeEvent` with retry + timeout logic.
 *
 * - First thrown error (network/HTTP) → retries once
 * - Second thrown error or timeout → returns `null`
 * - API responds with `personalized: null` (AI inactive) → returns `null` immediately, no retry
 *
 * Defaults: 1 retry, 6000ms timeout.
 */
export async function personalizeAsync(
  apiFn: () => Promise<PersonalizeEventResponse>,
  options?: PersonalizeAsyncOptions,
): Promise<PersonalizeEventResponse['personalized']> {
  const maxAttempts = (options?.retries ?? 1) + 1;
  const timeoutMs = options?.timeout ?? 6000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await Promise.race([
        apiFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs),
        ),
      ]);

      // AI is not active — normal response, no retry
      if (res.personalized === null) {
        return null;
      }

      return res.personalized;
    } catch {
      if (attempt === maxAttempts - 1) {
        return null;
      }
    }
  }

  return null;
}
