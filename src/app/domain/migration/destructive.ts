// データ消失系 SQL のパターン。制約強化系 (SET NOT NULL / ADD UNIQUE) は意図的に含めない
const DESTRUCTIVE_PATTERNS = [/\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bSET\s+DATA\s+TYPE\b/i];

export function findDestructive(sql: string): string[] {
  return sql
    .split(/;\s*(?:--> statement-breakpoint\s*)?/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => DESTRUCTIVE_PATTERNS.some((p) => p.test(s)));
}
