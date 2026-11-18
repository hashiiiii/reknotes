// CLI use cases return messages ready to print so adapters only choose an exit code.
// View use cases return domain values and throw errors instead.
export type Result = { kind: "ok"; message: string } | { kind: "error"; message: string };

export function ok(message: string): Result {
  return { kind: "ok", message };
}

export function err(message: string): Result {
  return { kind: "error", message };
}
