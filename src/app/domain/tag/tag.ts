export interface Tag {
  id: number;
  name: string;
}

export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}
