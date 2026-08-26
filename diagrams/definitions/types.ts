export interface DiagramSpec {
  name: string;
  graphAttributes?: Record<string, string>;
  nodes: { id: string; label: string; shape?: string }[];
  edges: { from: string; to: string; label?: string }[];
}
