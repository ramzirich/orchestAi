"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
} from "@xyflow/react";

import type { WorkflowDefinition } from "@/lib/api";
import type { AgentStatus, AgentTrack } from "@/lib/types";

type AgentNodeData = {
  agentId: string;
  status: AgentStatus;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
};

type AgentNode = Node<AgentNodeData, "agent">;

const STATUS_NODE_STYLES: Record<AgentStatus, string> = {
  idle: "border-zinc-700 bg-zinc-900 text-zinc-300",
  running: "border-sky-500 bg-sky-950 text-sky-100 ring-2 ring-sky-500/40 animate-pulse",
  done: "border-emerald-500 bg-emerald-950 text-emerald-100",
  error: "border-rose-500 bg-rose-950 text-rose-100",
  skipped: "border-amber-500 bg-amber-950 text-amber-100",
};

function AgentFlowNode({ data }: NodeProps<AgentNode>) {
  return (
    <div
      className={`rounded-md border px-3 py-2 min-w-[160px] text-xs font-mono shadow-md ${STATUS_NODE_STYLES[data.status]}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-500" />
      <div className="font-semibold text-sm">{data.agentId}</div>
      <div className="uppercase tracking-wider text-[10px] mt-1 opacity-80">{data.status}</div>
      {data.status === "done" && data.outputTokens !== undefined && (
        <div className="text-[10px] opacity-70 mt-1">
          {data.inputTokens}/{data.outputTokens} tokens
        </div>
      )}
      {data.errorMessage && (
        <div className="text-[10px] opacity-80 mt-1 truncate" title={data.errorMessage}>
          {data.errorMessage}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-zinc-500" />
    </div>
  );
}

const NODE_TYPES = { agent: AgentFlowNode };

function extractDependencies(template: string, knownAgents: Set<string>): string[] {
  const deps = new Set<string>();
  const re = /\{([a-zA-Z0-9_-]+)\.output\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    const id = match[1];
    if (knownAgents.has(id)) deps.add(id);
  }
  return [...deps];
}

export function WorkflowGraph({
  definition,
  tracks,
}: {
  definition: WorkflowDefinition | null;
  tracks: Record<string, AgentTrack>;
}) {
  const { nodes, edges } = useMemo(() => {
    if (!definition) return { nodes: [] as AgentNode[], edges: [] as Edge[] };

    const known = new Set(definition.steps.map((s) => s.agentId));
    const nodes: AgentNode[] = definition.steps.map((step, i) => {
      const t = tracks[step.agentId];
      return {
        id: step.agentId,
        type: "agent",
        position: { x: i * 220, y: 0 },
        data: {
          agentId: step.agentId,
          status: t?.status ?? "idle",
          inputTokens: t?.inputTokens,
          outputTokens: t?.outputTokens,
          errorMessage: t?.errorMessage,
        },
      };
    });

    const edges: Edge[] = [];
    definition.steps.forEach((step, i) => {
      const deps = extractDependencies(step.inputTemplate, known);
      const sources = deps.length > 0 ? deps : i > 0 ? [definition.steps[i - 1].agentId] : [];
      for (const src of sources) {
        const targetStatus = tracks[step.agentId]?.status ?? "idle";
        const sourceStatus = tracks[src]?.status ?? "idle";
        const active = sourceStatus === "done" || targetStatus === "running" || targetStatus === "done";
        edges.push({
          id: `${src}->${step.agentId}`,
          source: src,
          target: step.agentId,
          animated: targetStatus === "running",
          style: {
            stroke: active ? "#10b981" : "#52525b",
            strokeWidth: 2,
          },
        });
      }
    });

    return { nodes, edges };
  }, [definition, tracks]);

  if (!definition) {
    return (
      <div className="h-[200px] rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-sm text-zinc-500">
        Select a workflow to view the graph.
      </div>
    );
  }

  return (
    <div className="h-[260px] rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#27272a" gap={16} />
        <Controls showInteractive={false} className="!bg-zinc-800 !border-zinc-700" />
      </ReactFlow>
    </div>
  );
}
