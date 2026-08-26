import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spec as architecture } from "./definitions/architecture.diagram.js";
import { spec as claimRouting } from "./definitions/claim-routing.diagram.js";
import { spec as stateMachine } from "./definitions/state-machine.diagram.js";
import type { DiagramSpec } from "./definitions/types.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "out");

const SPECS: DiagramSpec[] = [architecture, stateMachine, claimRouting];

function escapeDot(value: string): string {
  // Labels use Graphviz escapes (`\n`). Do not backslash-escape those;
  // only quotes would terminate the quoted attribute.
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
  for (const edge of spec.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new Error(
        `${spec.name}: edge ${edge.from} -> ${edge.to} references a missing node`,
      );
    }
  }
}

function toDot(spec: DiagramSpec): string {
  const lines: string[] = [`digraph "${escapeDot(spec.name)}" {`];
  for (const [key, value] of Object.entries(spec.graphAttributes ?? {})) {
    lines.push(`  ${key}="${escapeDot(value)}";`);
  }
  for (const node of spec.nodes) {
    const attrs = [`label="${escapeDot(node.label)}"`];
    if (node.shape) attrs.push(`shape="${escapeDot(node.shape)}"`);
    lines.push(`  ${node.id} [${attrs.join(", ")}];`);
  }
  for (const edge of spec.edges) {
    const suffix = edge.label ? ` [label="${escapeDot(edge.label)}"]` : "";
    lines.push(`  ${edge.from} -> ${edge.to}${suffix};`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

// Graphviz embeds its version in an HTML comment. Layout numbers also drift
// across Graphviz releases (Homebrew 15.x vs Ubuntu apt 2.43). Comments are
// stripped so a version bump does not itself fail the drift check; the
// committed .dot is the byte-stable source of truth (see CI).
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
