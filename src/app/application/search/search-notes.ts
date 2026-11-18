import type { INoteRepository } from "../../domain/note/note-repository";

export interface SearchResult {
  id: number;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  highlightedTitle: string;
  highlightedBody: string;
}

export async function searchNotes(noteRepo: INoteRepository, query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const rows = await noteRepo.searchByQuery(trimmed);

  return rows.map((r) => ({
    ...r,
    highlightedTitle: highlightText(r.title, trimmed),
    highlightedBody: highlightSnippet(r.body, trimmed),
  }));
}

// Highlights are rendered as HTML, so note content and queries must be escaped
// around the intentional <mark> elements.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightText(text: string, query: string): string {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escapeHtml(text).replace(new RegExp(escapeHtml(escapedQuery), "gi"), "<mark>$&</mark>");
}

function highlightSnippet(text: string, query: string, contextLen = 80): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text.slice(0, 200));

  const start = Math.max(0, idx - contextLen);
  const end = Math.min(text.length, idx + query.length + contextLen);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = `...${snippet}`;
  if (end < text.length) snippet += "...";

  return highlightText(snippet, query);
}
