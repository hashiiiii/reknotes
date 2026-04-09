// 3D Force Graph 向けグラフ表示型
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

// リポジトリが返す生データ型
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

export function toNoteGraphNode(n: NoteNode): GraphNode {
  return {
    id: `note-${n.id}`,
    label: n.title || "無題",
    type: "note" as const,
    val: Math.max(1, n.linkCount),
    created_at: n.createdAt,
    snippet: n.snippet,
  };
}

export function toTagGraphNode(t: TagNode): GraphNode {
  return {
    id: `tag-${t.id}`,
    label: t.name,
    type: "tag" as const,
    val: Math.max(1, t.noteCount),
  };
}
