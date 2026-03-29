export interface Note {
  id: number;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface NoteWithSnippet {
  id: number;
  title: string;
  createdAt: number;
  snippet: string;
  linkCount: number;
}

export function resolveTitle(title: string, body: string): string {
  return title.trim() || body.slice(0, 30).trim();
}
