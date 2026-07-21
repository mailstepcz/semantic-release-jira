export function escapeRegExp(strIn: string): string {
  return strIn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a human-readable message from an error thrown by jira.js.
 *
 * jira.js throws an `HttpException` whose `.response.data` holds the raw Jira
 * error body (`{ errorMessages: [...], errors: { field: msg } }`) and whose
 * `.status` holds the numeric HTTP status. Network/other errors only carry a
 * `.message`. This normalises all of those into a single string so failures
 * surface a useful reason instead of `[object Object]` or `{}`.
 */
export function describeJiraError(err: unknown): string {
  const e = err as {
    message?: unknown;
    status?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  const data = e?.response?.data as
    | { errorMessages?: unknown; errors?: unknown }
    | undefined;

  const parts: string[] = [];

  if (
    Array.isArray(data?.errorMessages) &&
    data.errorMessages.length > 0
  ) {
    parts.push(data.errorMessages.join("; "));
  }

  if (data?.errors && typeof data.errors === "object") {
    const fieldErrors = Object.entries(
      data.errors as Record<string, unknown>,
    ).map(([field, message]) => `${field}: ${String(message)}`);
    if (fieldErrors.length > 0) {
      parts.push(fieldErrors.join("; "));
    }
  }

  if (parts.length === 0 && typeof e?.message === "string" && e.message) {
    parts.push(e.message);
  }

  const status =
    typeof e?.status === "number"
      ? e.status
      : typeof e?.response?.status === "number"
        ? e.response.status
        : undefined;
  const suffix = typeof status === "number" ? ` (status ${status})` : "";

  return (parts.join("; ") || "Unknown Jira error") + suffix;
}
