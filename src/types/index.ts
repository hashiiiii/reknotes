export interface Note {
  id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface NoteTag {
  note_id: number;
  tag_id: number;
}

export interface NoteLink {
  source_id: number;
  target_id: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "note" | "tag";
  val: number;
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
