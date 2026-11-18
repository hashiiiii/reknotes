// Constraint strengthening, including SET NOT NULL and ADD UNIQUE, is deliberately
// excluded from these patterns for potential data loss.
const DESTRUCTIVE_PATTERNS = [/\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bSET\s+DATA\s+TYPE\b/i];

export function findDestructive(sql: string): string[] {
  return sql
    .split(/;\s*(?:--> statement-breakpoint\s*)?/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => DESTRUCTIVE_PATTERNS.some((p) => p.test(s)));
}
