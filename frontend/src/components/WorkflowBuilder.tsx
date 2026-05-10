"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Position,
  Handle,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeProps,
  type OnConnect,
} from "@xyflow/react";

import { api } from "@/lib/api";
import {
  GraphError,
  defaultTemplateForFirstStep,
  defaultTemplateFromUpstream,
  fromDefinition,
  toDefinition,
  type BuilderNode,
} from "@/lib/workflow";
import { setPendingInlineRun } from "@/lib/pendingRun";

const PALETTE_MIME = "application/x-orchestai-agent";

function AgentBuilderNode({ data, selected }: NodeProps<BuilderNode>) {
  return (
    <div
      className={`rounded-md border px-3 py-2 min-w-40 text-xs font-mono shadow-md transition-colors ${
        selected
          ? "border-emerald-400 bg-emerald-950 text-emerald-100 ring-2 ring-emerald-400/40"
          : "border-zinc-600 bg-zinc-900 text-zinc-100"
      }`}
    >
      <Handle type="target" position={Position.Left} className="bg-zinc-500!" />
      <div className="font-semibold text-sm">{data.agentId}</div>
      <div className="text-[10px] opacity-60 mt-1 truncate" title={data.inputTemplate}>
        {data.inputTemplate || <span className="italic">no template</span>}
      </div>
      <Handle type="source" position={Position.Right} className="bg-zinc-500!" />
    </div>
  );
}

const NODE_TYPES = { agent: AgentBuilderNode };

function AgentPalette({ agents, used }: { agents: string[]; used: Set<string> }) {
  return (
    <div className="md:space-y-2 flex md:flex-col gap-2 md:gap-0">
      <div className="hidden md:block text-xs uppercase tracking-wider text-zinc-500">Agents</div>
      {agents.length === 0 && <div className="text-xs text-zinc-600">Loading agents...</div>}
      {agents.map((id) => {
        const isUsed = used.has(id);
        return (
          <div
            key={id}
            draggable={!isUsed}
            tabIndex={isUsed ? -1 : 0}
            role="button"
            aria-label={`${id} agent — drag onto the canvas`}
            aria-disabled={isUsed}
            onDragStart={(e) => {
              e.dataTransfer.setData(PALETTE_MIME, id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className={`px-3 py-2 rounded border text-xs font-mono select-none whitespace-nowrap ${
              isUsed
                ? "border-zinc-800 bg-zinc-900/50 text-zinc-600 cursor-not-allowed"
                : "border-zinc-700 bg-zinc-900 text-zinc-100 cursor-grab hover:border-emerald-500/60 hover:bg-zinc-800"
            }`}
            title={isUsed ? "Already on the canvas" : "Drag onto the canvas"}
          >
            {id}
            {isUsed && <span className="ml-1 text-zinc-700">(used)</span>}
          </div>
        );
      })}
    </div>
  );
}

function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: BuilderNode | null;
  onChange: (template: string) => void;
  onDelete: () => void;
}) {
  if (!node) {
    return (
      <div className="text-xs text-zinc-500">
        Select a node to edit its input template, or press Backspace to delete the selected node.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500">Selected agent</div>
        <div className="font-mono text-sm text-zinc-100 mt-1">{node.data.agentId}</div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-zinc-500 block mb-1">
          Input template
        </label>
        <textarea
          value={node.data.inputTemplate}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 resize-y"
          placeholder="{topic} or {agentId.output}"
        />
        <div className="text-[10px] text-zinc-500 mt-1">
          Use {"{topic}"} for the run topic, or {"{agentId.output}"} to reference an upstream
          agent.
        </div>
      </div>
      <button
        onClick={onDelete}
        className="text-xs text-rose-400 hover:text-rose-300"
      >
        Delete node
      </button>
    </div>
  );
}

function BuilderInner() {
  const router = useRouter();
  const [agents, setAgents] = useState<string[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string>("custom");
  const [topic, setTopic] = useState<string>("The future of multi-agent AI systems");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const flow = useReactFlow();

  useEffect(() => {
    api.listAgents().then(setAgents).catch((e: Error) => {
      setStatus({ kind: "err", text: `Could not load agents: ${e.message}` });
    });
  }, []);

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const used = useMemo(() => new Set(nodes.map((n) => n.data.agentId)), [nodes]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      setEdges((eds) =>
        addEdge(
          { ...connection, id: `${connection.source}->${connection.target}` },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const agentId = event.dataTransfer.getData(PALETTE_MIME);
      if (!agentId) return;
      if (used.has(agentId)) {
        setStatus({ kind: "err", text: `"${agentId}" is already on the canvas.` });
        return;
      }
      const position = flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const node: BuilderNode = {
        id: agentId,
        type: "agent",
        position,
        data: {
          agentId,
          inputTemplate: nodes.length === 0 ? defaultTemplateForFirstStep() : "",
        },
      };
      setNodes((nds) => [...nds, node]);
      setSelectedId(agentId);
      setStatus(null);
    },
    [flow, nodes.length, setNodes, used],
  );

  const updateTemplate = useCallback(
    (template: string) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedId
            ? { ...n, data: { ...n.data, inputTemplate: template } }
            : n,
        ),
      );
    },
    [selectedId, setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }, [selectedId, setNodes, setEdges]);

  const handleNew = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
    setWorkflowId("custom");
    setStatus(null);
  }, [setNodes, setEdges]);

  const handleSave = useCallback(() => {
    try {
      const def = toDefinition(workflowId.trim() || "custom", nodes, edges);
      const json = JSON.stringify(def, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${def.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: "ok", text: `Exported ${def.steps.length}-step workflow as ${def.id}.json` });
    } catch (e) {
      const msg = e instanceof GraphError ? e.message : (e as Error).message;
      setStatus({ kind: "err", text: msg });
    }
  }, [workflowId, nodes, edges]);

  const handleRun = useCallback(() => {
    if (!topic.trim()) {
      setStatus({ kind: "err", text: "Topic is required to run a workflow." });
      return;
    }
    try {
      const def = toDefinition(workflowId.trim() || "custom", nodes, edges);
      setPendingInlineRun({ definition: def, topic: topic.trim() });
      router.push("/");
    } catch (e) {
      const msg = e instanceof GraphError ? e.message : (e as Error).message;
      setStatus({ kind: "err", text: msg });
    }
  }, [router, workflowId, topic, nodes, edges]);

  const handleLoad = useCallback(
    (file: File) => {
      file
        .text()
        .then((text) => {
          const parsed = JSON.parse(text);
          if (!parsed?.id || !Array.isArray(parsed?.steps)) {
            throw new Error("File is not a workflow definition (expected { id, steps }).");
          }
          const { nodes: newNodes, edges: newEdges } = fromDefinition(parsed);
          setWorkflowId(parsed.id);
          setNodes(newNodes);
          setEdges(newEdges);
          setSelectedId(null);
          setStatus({ kind: "ok", text: `Loaded ${newNodes.length}-step workflow "${parsed.id}".` });
          setTimeout(() => flow.fitView({ padding: 0.2 }), 50);
        })
        .catch((e: Error) => setStatus({ kind: "err", text: `Load failed: ${e.message}` }));
    },
    [flow, setNodes, setEdges],
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col md:flex-row">
      <aside
        aria-label="Agent palette"
        className="border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-950 p-3 md:p-4 md:w-56 md:space-y-4 md:overflow-y-auto overflow-x-auto md:overflow-x-hidden shrink-0"
      >
        <AgentPalette agents={agents} used={used} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-2 flex items-center gap-2 flex-wrap">
          <input
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono w-40 text-zinc-100 placeholder:text-zinc-500"
            placeholder="workflow id"
          />
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono flex-1 min-w-50 text-zinc-100 placeholder:text-zinc-500"
            placeholder="topic for this run"
          />
          <button
            onClick={handleRun}
            disabled={nodes.length === 0 || !topic.trim()}
            className="text-xs px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-medium"
            title="Execute this workflow and stream results in the Console"
          >
            Run
          </button>
          <button
            onClick={handleNew}
            className="text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            New
          </button>
          <button
            onClick={handleSave}
            className="text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Save JSON
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Load JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLoad(f);
              e.target.value = "";
            }}
          />
          {status && (
            <div
              className={`ml-auto text-xs ${
                status.kind === "ok" ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {status.text}
            </div>
          )}
        </div>

        <div
          ref={wrapperRef}
          className="flex-1 min-h-96 md:min-h-0"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={({ nodes: selNodes }) => {
              setSelectedId(selNodes[0]?.id ?? null);
            }}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background color="#27272a" gap={16} />
            <Controls className="bg-zinc-800! border-zinc-700!" />
            <MiniMap
              pannable
              zoomable
              className="bg-zinc-900! border! border-zinc-800!"
              nodeColor="#10b981"
              maskColor="rgba(9,9,11,0.8)"
            />
          </ReactFlow>
        </div>
      </div>

      <aside
        aria-label="Node inspector"
        className="border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-950 p-4 md:w-72 max-h-72 md:max-h-none overflow-y-auto shrink-0"
      >
        <NodeInspector
          node={selected}
          onChange={(t) =>
            updateTemplate(
              t === "" && selected
                ? defaultTemplateFromUpstream(
                    edges
                      .filter((e) => e.target === selected.id)
                      .map((e) => e.source),
                  )
                : t,
            )
          }
          onDelete={deleteSelected}
        />
      </aside>
    </div>
  );
}

export function WorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <BuilderInner />
    </ReactFlowProvider>
  );
}
