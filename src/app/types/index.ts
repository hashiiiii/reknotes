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
