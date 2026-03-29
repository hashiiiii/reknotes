export interface Tag {
  id: number;
  name: string;
}

export interface TagWithCount {
  id: number;
  name: string;
  count: number;
}

export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}
