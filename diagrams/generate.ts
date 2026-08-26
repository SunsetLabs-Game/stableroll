import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spec as architecture } from "./definitions/architecture.diagram.js";
import { spec as claimRouting } from "./definitions/claim-routing.diagram.js";
import { spec as stateMachine } from "./definitions/state-machine.diagram.js";
import type { DiagramCluster, DiagramNode, DiagramSpec } from "./definitions/types.js";
import {
  B_DEFAULT,
  E_DEFAULT,
  EDGE_COLOR,
  FONT,
  NODE_BORDER,
  NODE_FILL,
  T_DARK,
  T_MED,
  htmlLabel,
} from "./style.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "out");
const SPECS: DiagramSpec[] = [architecture, stateMachine, claimRouting];

function escapeAttr(value: string): string {
  return value.replace(/"/g, '\\"');
}

function assertWellFormed(spec: DiagramSpec): void {
  const ids = new Set<string>();
  for (const node of spec.nodes) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(node.id)) {
      throw new Error(`${spec.name}: invalid node id ${node.id}`);
    }
    if (ids.has(node.id)) {
      throw new Error(`${spec.name}: duplicate node id ${node.id}`);
    }
    ids.add(node.id);
  }
  const clusterIds = new Set((spec.clusters ?? []).map((c) => c.id));
  for (const node of spec.nodes) {
    if (node.cluster && !clusterIds.has(node.cluster)) {
      throw new Error(`${spec.name}: node ${node.id} references missing cluster ${node.cluster}`);
    }
  }
  for (const edge of spec.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new Error(`${spec.name}: edge ${edge.from} -> ${edge.to} references a missing node`);
    }
  }
}

function nodeLine(node: DiagramNode): string {
  const tone = node.tone ?? "default";
  const attrs: string[] = [];
  if (node.title) {
    attrs.push(`label=${htmlLabel(node.title, node.subtitle, node.subtitle2)}`);
  } else {
    attrs.push(`label=""`);
    attrs.push(`width="0.3"`);
    attrs.push(`height="0.3"`);
    attrs.push(`fixedsize="true"`);
  }
  attrs.push(`fillcolor="${NODE_FILL[tone]}"`);
  attrs.push(`color="${NODE_BORDER[tone]}"`);
  if (node.shape) attrs.push(`shape="${escapeAttr(node.shape)}"`);
  if (node.penwidth) attrs.push(`penwidth="${escapeAttr(node.penwidth)}"`);
  return `  ${node.id} [${attrs.join(", ")}];`;
}

function clusterBlock(cluster: DiagramCluster, nodes: DiagramNode[]): string[] {
  const border = NODE_BORDER[cluster.tone];
  const lines = [
    `  subgraph cluster_${cluster.id} {`,
    `    label=${htmlLabel(cluster.title, cluster.subtitle)};`,
    `    style="rounded";`,
    `    color="${border}";`,
    `    fontcolor="${border}";`,
    `    fontname="${FONT}";`,
    `    fontsize="12";`,
    `    penwidth="2.5";`,
    `    margin="18";`,
  ];
  for (const node of nodes) {
    lines.push(nodeLine(node).replace(/^  /, "    "));
  }
  lines.push("  }");
  return lines;
}

function toDot(spec: DiagramSpec): string {
  const lines: string[] = [`digraph "${escapeAttr(spec.name)}" {`];
  lines.push(`  bgcolor="transparent";`);
  lines.push(`  fontname="${FONT}";`);
  lines.push(`  fontsize="13";`);
  lines.push(`  fontcolor="${T_DARK}";`);
  lines.push(`  labelloc="t";`);
  lines.push(`  labeljust="l";`);
  lines.push(`  pad="0.7";`);
  lines.push(`  nodesep="0.55";`);
  lines.push(`  ranksep="0.8";`);
  lines.push(`  rankdir="${spec.rankdir ?? "TB"}";`);
  lines.push(`  splines="${spec.splines ?? "spline"}";`);
  if (spec.size) lines.push(`  size="${escapeAttr(spec.size)}";`);
  lines.push(`  label=${htmlLabel(spec.title, spec.subtitle)};`);
  lines.push(
    `  node [shape="box", style="filled,rounded", fillcolor="${NODE_FILL.default}", color="${B_DEFAULT}", fontname="${FONT}", fontsize="11", fontcolor="${T_DARK}", margin="0.22,0.13", penwidth="1.6"];`,
  );
  lines.push(
    `  edge [color="${E_DEFAULT}", fontname="${FONT}", fontsize="10", fontcolor="${T_MED}", arrowsize="0.85", penwidth="1.4"];`,
  );

  const clustered = new Set<string>();
  for (const cluster of spec.clusters ?? []) {
    const members = spec.nodes.filter((n) => n.cluster === cluster.id);
    for (const member of members) clustered.add(member.id);
    lines.push(...clusterBlock(cluster, members));
  }
  for (const node of spec.nodes) {
    if (!clustered.has(node.id)) lines.push(nodeLine(node));
  }
  for (const edge of spec.edges) {
    const kind = edge.kind ?? "default";
    const color = EDGE_COLOR[kind];
    const attrs = [`color="${color}"`];
    if (edge.label) attrs.push(`label="${escapeAttr(edge.label)}"`);
    if (kind !== "default") attrs.push(`fontcolor="${color}"`);
    if (edge.style) attrs.push(`style="${escapeAttr(edge.style)}"`);
    if (edge.penwidth) attrs.push(`penwidth="${escapeAttr(edge.penwidth)}"`);
    lines.push(`  ${edge.from} -> ${edge.to} [${attrs.join(", ")}];`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function normalizeSvg(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trimStart();
}

function generate(spec: DiagramSpec): void {
  assertWellFormed(spec);
  mkdirSync(OUT, { recursive: true });
  const dotPath = join(OUT, `${spec.name}.dot`);
  const svgPath = join(OUT, `${spec.name}.svg`);
  writeFileSync(dotPath, toDot(spec));
  try {
    execFileSync("dot", ["-Tsvg", dotPath, "-o", svgPath], { stdio: "inherit" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        "graphviz `dot` not found. Install it with `brew install graphviz` or `apt-get install graphviz`.",
      );
    }
    throw err;
  }
  writeFileSync(svgPath, normalizeSvg(readFileSync(svgPath, "utf8")));
}

for (const spec of SPECS) {
  generate(spec);
}
