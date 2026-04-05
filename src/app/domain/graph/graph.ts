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

// リポジトリが返す生データ型（NoteWithSnippet と同一構造のため再利用）
export type { NoteWithSnippet as NoteNode } from "../note/note";

export interface TagNode {
  id: number;
  name: string;
  noteCount: number;
}

export interface NoteTagLink {
  noteId: number;
  tagId: number;
}
