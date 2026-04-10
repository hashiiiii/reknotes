import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";

export type SearchResult = Note & {
  highlightedTitle: string;
  highlightedBody: string;
};

export async function searchNotes(noteRepo: INoteRepository, query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const pattern = `%${trimmed}%`;
  const rows = await noteRepo.search(pattern);

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
