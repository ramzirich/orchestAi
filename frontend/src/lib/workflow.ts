import type { Edge, Node } from "@xyflow/react";
import type { WorkflowDefinition, WorkflowStep } from "@/lib/api";

export type BuilderNodeData = {
  agentId: string;
  inputTemplate: string;
};

export type BuilderNode = Node<BuilderNodeData, "agent">;

export class GraphError extends Error {}

export function defaultTemplateForFirstStep() {
  return "{topic}";
}

export function defaultTemplateFromUpstream(agentIds: string[]) {
  if (agentIds.length === 0) return "{topic}";
  if (agentIds.length === 1) return `{${agentIds[0]}.output}`;
  return agentIds.map((id) => `${id}:\n{${id}.output}`).join("\n\n");
}

function topoSort(
  nodes: BuilderNode[],
  edges: Edge[],
): { ordered: BuilderNode[]; incoming: Map<string, string[]> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    incoming.get(e.target)!.push(e.source);
    outgoing.get(e.source)!.push(e.target);
  }

  const indegree = new Map<string, number>();
  for (const [id, srcs] of incoming) indegree.set(id, srcs.length);

  const ordered: BuilderNode[] = [];
  const queue: BuilderNode[] = nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .sort((a, b) => a.position.x - b.position.x);

  while (queue.length > 0) {
    const n = queue.shift()!;
    ordered.push(n);
    for (const next of outgoing.get(n.id)!) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) {
        const node = byId.get(next)!;
        const insertAt = queue.findIndex((q) => q.position.x > node.position.x);
        if (insertAt === -1) queue.push(node);
        else queue.splice(insertAt, 0, node);
      }
    }
  }

  if (ordered.length !== nodes.length) {
    throw new GraphError("Workflow has a cycle — every edge must point downstream.");
  }

  return { ordered, incoming };
}

export function toDefinition(
  id: string,
  nodes: BuilderNode[],
  edges: Edge[],
): WorkflowDefinition {
  if (nodes.length === 0) throw new GraphError("Workflow is empty.");

  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.data.agentId)) {
      throw new GraphError(`Agent "${n.data.agentId}" appears more than once.`);
    }
    seen.add(n.data.agentId);
  }

  const { ordered, incoming } = topoSort(nodes, edges);
  const idByNode = new Map(nodes.map((n) => [n.id, n.data.agentId]));

  const steps: WorkflowStep[] = ordered.map((n) => {
    const upstream = (incoming.get(n.id) ?? [])
      .map((src) => idByNode.get(src)!)
      .filter(Boolean);
    return {
      agentId: n.data.agentId,
      inputTemplate: n.data.inputTemplate || defaultTemplateFromUpstream(upstream),
      maxRetries: 0,
      skipOnError: false,
    };
  });

  return { id, steps };
}

const REF_RE = /\{([a-zA-Z0-9_-]+)\.output\}/g;

function extractDeps(template: string, knownAgents: Set<string>): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(template)) !== null) {
    if (knownAgents.has(m[1])) out.add(m[1]);
  }
  return [...out];
}

export function fromDefinition(def: WorkflowDefinition): { nodes: BuilderNode[]; edges: Edge[] } {
  const knownAgents = new Set(def.steps.map((s) => s.agentId));
  const nodes: BuilderNode[] = def.steps.map((step, i) => ({
    id: step.agentId,
    type: "agent",
    position: { x: i * 240, y: 0 },
    data: { agentId: step.agentId, inputTemplate: step.inputTemplate },
  }));

  const edges: Edge[] = [];
  def.steps.forEach((step, i) => {
    const deps = extractDeps(step.inputTemplate, knownAgents);
    const sources = deps.length > 0 ? deps : i > 0 ? [def.steps[i - 1].agentId] : [];
    for (const src of sources) {
      edges.push({
        id: `${src}->${step.agentId}`,
        source: src,
        target: step.agentId,
      });
    }
  });

  return { nodes, edges };
}
