export interface GraphNode {
  id: string;
  label: string;
  type: "note" | "tag";
  val: number;
  created_at?: number;
  snippet?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  type: "tag" | "link";
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface NoteNode {
  id: number;
  title: string;
  createdAt: number;
  snippet: string;
  linkCount: number;
}

export interface TagNode {
  id: number;
  name: string;
  noteCount: number;
}

export interface NoteTagLink {
  noteId: number;
  tagId: number;
}
