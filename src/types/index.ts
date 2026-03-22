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

export interface GraphNode {
  id: string;
  label: string;
  type: "note" | "tag";
  val: number;
  created_at?: string;
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
