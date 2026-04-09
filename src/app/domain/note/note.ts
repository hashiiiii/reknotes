export interface Note {
  id: number;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export function resolveTitle(title: string, body: string): string {
  return title.trim() || body.slice(0, 30).trim();
}
