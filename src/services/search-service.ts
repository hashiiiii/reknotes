import { getDb } from "../db/connection";
import type { Note } from "../types";

export interface SearchResult extends Note {
  highlightedTitle: string;
  highlightedBody: string;
}

export function search(query: string): SearchResult[] {
  const _db = getDb();
  const trimmed = query.trim();
  if (!trimmed) return [];

  // trigram は3文字以上必要。2文字以下はLIKEフォールバック
  if (trimmed.length < 3) {
    return searchWithLike(trimmed);
  }

  return searchWithFts(trimmed);
}

function searchWithFts(query: string): SearchResult[] {
  const db = getDb();
  // FTS5 の特殊文字をエスケープ
  const escaped = `"${query.replace(/"/g, '""')}"`;

  const rows = db
    .prepare(
      `SELECT
        n.id, n.title, n.body, n.created_at, n.updated_at,
        highlight(notes_fts, 0, '<mark>', '</mark>') as highlightedTitle,
        highlight(notes_fts, 1, '<mark>', '</mark>') as highlightedBody
      FROM notes_fts
      JOIN notes n ON n.id = notes_fts.rowid
      WHERE notes_fts MATCH ?
      ORDER BY rank
      LIMIT 50`,
    )
    .all(escaped) as SearchResult[];

  return rows;
}

function searchWithLike(query: string): SearchResult[] {
  const db = getDb();
  const pattern = `%${query}%`;

  const rows = db
    .prepare(
      `SELECT *, title as highlightedTitle, body as highlightedBody
       FROM notes
       WHERE title LIKE ? OR body LIKE ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(pattern, pattern) as SearchResult[];

  // 手動ハイライト
  return rows.map((r) => ({
    ...r,
    highlightedTitle: highlightText(r.title, query),
    highlightedBody: highlightSnippet(r.body, query),
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
