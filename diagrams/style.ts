// Shared design system for StableRoll diagrams.
// Palette and label grammar follow LumenWipe's diagrams/generator/_style.py
// (Helvetica, slate/semantic fills, HTML title+subtitle labels, transparent
// background) so the SVGs read as product documentation, not default Graphviz.

export const FONT = "Helvetica";

export const T_DARK = "#1E293B";
export const T_MED = "#475569";
export const T_LITE = "#94A3B8";

export const F_DEFAULT = "#F8FAFC";
export const F_CLIENT = "#EFF6FF";
export const F_BACKEND = "#F0FDF4";
export const F_EXTERNAL = "#FAF5FF";
export const F_DECISION = "#FFFBEB";
export const F_SUCCESS = "#ECFDF5";
export const F_DANGER = "#FEF2F2";
export const F_ACCENT = "#F0F9FF";

export const B_DEFAULT = "#64748B";
export const B_CLIENT = "#3B82F6";
export const B_BACKEND = "#16A34A";
export const B_EXTERNAL = "#9333EA";
export const B_DECISION = "#D97706";
export const B_SUCCESS = "#059669";
export const B_DANGER = "#DC2626";
export const B_ACCENT = "#0284C7";

export const E_DEFAULT = "#94A3B8";
export const E_SUCCESS = "#059669";
export const E_DANGER = "#DC2626";
export const E_WARNING = "#D97706";

export type NodeTone =
  | "default"
  | "client"
  | "backend"
  | "external"
  | "decision"
  | "success"
  | "danger"
  | "accent";

export type EdgeKind = "default" | "success" | "danger" | "warning";

export const NODE_FILL: Record<NodeTone, string> = {
  default: F_DEFAULT,
  client: F_CLIENT,
  backend: F_BACKEND,
  external: F_EXTERNAL,
  decision: F_DECISION,
  success: F_SUCCESS,
  danger: F_DANGER,
  accent: F_ACCENT,
};

export const NODE_BORDER: Record<NodeTone, string> = {
  default: B_DEFAULT,
  client: B_CLIENT,
  backend: B_BACKEND,
  external: B_EXTERNAL,
  decision: B_DECISION,
  success: B_SUCCESS,
  danger: B_DANGER,
  accent: B_ACCENT,
};

export const EDGE_COLOR: Record<EdgeKind, string> = {
  default: E_DEFAULT,
  success: E_SUCCESS,
  danger: E_DANGER,
  warning: E_WARNING,
};

export function htmlLabel(title: string, subtitle?: string, subtitle2?: string): string {
  const safe = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/->/g, "-&gt;");
  let inner = `<B>${safe(title)}</B>`;
  if (subtitle) {
    inner += `<BR/><FONT POINT-SIZE="9" COLOR="${T_MED}">${safe(subtitle)}</FONT>`;
  }
  if (subtitle2) {
    inner += `<BR/><FONT POINT-SIZE="9" COLOR="${T_MED}">${safe(subtitle2)}</FONT>`;
  }
  return `<${inner}>`;
}
