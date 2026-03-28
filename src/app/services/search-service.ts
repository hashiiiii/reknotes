import { getDb } from "../db/connection";
import type { Note } from "../types";

export interface SearchResult extends Note {
  highlightedTitle: string;
  highlightedBody: string;
}

export function search(query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = getDb();
  const pattern = `%${trimmed}%`;

  const rows = db
    .prepare(
      `SELECT *, title as highlightedTitle, body as highlightedBody
       FROM notes
       WHERE title LIKE ? OR body LIKE ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(pattern, pattern) as SearchResult[];

  return rows.map((r) => ({
    ...r,
    highlightedTitle: highlightText(r.title, trimmed),
    highlightedBody: highlightSnippet(r.body, trimmed),
  }));
}

function highlightText(text: string, query: string): string {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), "<mark>$&</mark>");
}

function highlightSnippet(text: string, query: string, contextLen = 80): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 200);

  const start = Math.max(0, idx - contextLen);
  const end = Math.min(text.length, idx + query.length + contextLen);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = `...${snippet}`;
  if (end < text.length) snippet += "...";

  return highlightText(snippet, query);
}
