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

export interface TagNode {
  id: number;
  name: string;
  noteCount: number;
}

export interface NoteTagLink {
  noteId: number;
  tagId: number;
}
