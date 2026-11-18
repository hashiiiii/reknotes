// Reject malformed IDs before repository access so routes return 400 instead of
// treating invalid input as a missing record.
export function parseId(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}
