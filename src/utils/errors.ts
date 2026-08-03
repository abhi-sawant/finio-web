/** Narrows a `catch` block's `unknown` error into a user-facing message, falling back when it
 * isn't an `Error` (or has no message) — e.g. a thrown string, or a fetch rejection with no
 * `.message`. */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
