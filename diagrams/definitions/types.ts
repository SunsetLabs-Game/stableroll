import type { EdgeKind, NodeTone } from "../style.js";

export interface DiagramNode {
  id: string;
  title: string;
  subtitle?: string;
  subtitle2?: string;
  shape?: string;
  tone?: NodeTone;
  cluster?: string;
  penwidth?: string;
}

export interface DiagramCluster {
  id: string;
  title: string;
  subtitle?: string;
  tone: NodeTone;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
  style?: string;
  penwidth?: string;
}

export interface DiagramSpec {
  name: string;
  title: string;
  subtitle?: string;
  rankdir?: string;
  splines?: string;
  size?: string;
  clusters?: DiagramCluster[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
