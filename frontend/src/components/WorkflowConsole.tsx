"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { HubConnection } from "@microsoft/signalr";
import { api, type WorkflowDefinition, type WorkflowRunResponse } from "@/lib/api";
import { connectWorkflowHub, type AgentEvent, type WorkflowEvent } from "@/lib/signalr";
import type { AgentStatus, AgentTrack } from "@/lib/types";

const WorkflowGraph = dynamic(
  () => import("@/components/WorkflowGraph").then((m) => m.WorkflowGraph),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-sm text-zinc-500">
        Loading graph...
      </div>
    ),
  },
);

type RunState =
  | { phase: "idle" }
  | { phase: "running"; runId: string }
  | { phase: "done"; runId: string; result: WorkflowRunResponse }
  | { phase: "error"; runId: string; message: string };

function newRunId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function WorkflowConsole() {
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [workflowId, setWorkflowId] = useState<string>("");
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [topic, setTopic] = useState<string>("The future of multi-agent AI systems");
  const [tracks, setTracks] = useState<Record<string, AgentTrack>>({});
  const [trackOrder, setTrackOrder] = useState<string[]>([]);
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);

  const connectionRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    api
      .listWorkflows()
      .then((ws) => {
        setWorkflows(ws);
        if (ws.length > 0) setWorkflowId(ws[0]);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    if (!workflowId) {
      setDefinition(null);
      return;
    }
    let cancelled = false;
    api
      .getWorkflow(workflowId)
      .then((d) => {
        if (!cancelled) setDefinition(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(`load definition: ${e.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  useEffect(() => {
    return () => {
      connectionRef.current?.stop().catch(() => {});
      connectionRef.current = null;
    };
  }, []);

  function upsertTrack(id: string, patch: Partial<AgentTrack>) {
    setTracks((prev) => {
      const existing = prev[id] ?? { id, status: "idle", text: "" };
      return { ...prev, [id]: { ...existing, ...patch } };
    });
    setTrackOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function appendChunk(id: string, text: string) {
    setTracks((prev) => {
      const existing = prev[id] ?? { id, status: "running" as AgentStatus, text: "" };
      return { ...prev, [id]: { ...existing, status: "running", text: existing.text + text } };
    });
    setTrackOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function handleAgentEvent(e: AgentEvent) {
    switch (e.type) {
      case "start":
        upsertTrack(e.agent, { status: "running", text: "" });
        return;
      case "chunk":
        appendChunk(e.agent, e.text);
        return;
      case "end":
        upsertTrack(e.agent, {
          status: "done",
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
        });
        return;
      case "error":
        upsertTrack(e.agent, { status: "error", errorMessage: e.message });
        return;
      case "retry":
        upsertTrack(e.agent, { status: "running", errorMessage: `retry ${e.attempt}: ${e.message}` });
        return;
      case "skipped":
        upsertTrack(e.agent, { status: "skipped", errorMessage: e.message });
        return;
    }
  }

  function handleWorkflowEvent(e: WorkflowEvent) {
    if (e.type === "error") {
      setRun({ phase: "error", runId: e.runId, message: e.message });
    }
  }

  async function startRun() {
    if (!workflowId || !topic.trim()) return;

    connectionRef.current?.stop().catch(() => {});
    connectionRef.current = null;

    const runId = newRunId();
    setTracks({});
    setTrackOrder([]);
    setRun({ phase: "running", runId });

    try {
      connectionRef.current = await connectWorkflowHub(runId, {
        onAgentEvent: handleAgentEvent,
        onWorkflowEvent: handleWorkflowEvent,
      });
    } catch (e) {
      setRun({ phase: "error", runId, message: `SignalR: ${(e as Error).message}` });
      return;
    }

    try {
      const result = await api.runWorkflow(workflowId, topic, runId);
      setRun({ phase: "done", runId, result });
    } catch (e) {
      setRun({ phase: "error", runId, message: (e as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-3">
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            disabled={run.phase === "running" || workflows.length === 0}
            className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          >
            {workflows.length === 0 && <option value="">no workflows</option>}
            {workflows.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={run.phase === "running"}
            placeholder="Topic..."
            className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={startRun}
            disabled={run.phase === "running" || !workflowId || !topic.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded px-4 py-2 text-sm font-medium"
          >
            {run.phase === "running" ? "Running..." : "Run"}
          </button>
        </div>
        {loadError && <div className="text-rose-400 text-xs">Failed to load workflows: {loadError}</div>}
        {run.phase !== "idle" && (
          <div className="text-xs text-zinc-500 font-mono">
            runId: {run.runId}
            {run.phase === "done" && (
              <>
                {" · "}
                tokens in/out: {run.result.inputTokens}/{run.result.outputTokens}
              </>
            )}
          </div>
        )}
        {run.phase === "error" && (
          <div className="text-rose-400 text-sm">Error: {run.message}</div>
        )}
      </div>

      <WorkflowGraph definition={definition} tracks={tracks} />

      <div className="space-y-3">
        {trackOrder.length === 0 && run.phase === "idle" && (
          <div className="text-sm text-zinc-500">No run yet. Pick a workflow, enter a topic, and hit Run.</div>
        )}
        {trackOrder.map((id) => {
          const t = tracks[id];
          return <AgentCard key={id} track={t} />;
        })}
      </div>

      {run.phase === "done" && (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-4">
          <div className="text-emerald-300 text-sm font-medium mb-2">Final output</div>
          <pre className="text-zinc-100 text-sm whitespace-pre-wrap font-mono">{run.result.output}</pre>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<AgentStatus, string> = {
  idle: "border-zinc-800 bg-zinc-900 text-zinc-400",
  running: "border-sky-700/60 bg-sky-950/30 text-sky-200",
  done: "border-emerald-700/60 bg-emerald-950/30 text-emerald-200",
  error: "border-rose-700/60 bg-rose-950/30 text-rose-200",
  skipped: "border-amber-700/60 bg-amber-950/30 text-amber-200",
};

function AgentCard({ track }: { track: AgentTrack }) {
  return (
    <div className={`rounded-lg border p-4 ${STATUS_STYLES[track.status]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-sm font-semibold">{track.id}</div>
        <div className="text-xs uppercase tracking-wider">
          {track.status}
          {track.status === "done" && track.outputTokens !== undefined && (
            <span className="ml-2 text-zinc-400">
              {track.inputTokens}/{track.outputTokens} tokens
            </span>
          )}
        </div>
      </div>
      {track.errorMessage && (
        <div className="text-xs text-rose-300 mb-2">{track.errorMessage}</div>
      )}
      <pre className="text-zinc-100 text-sm whitespace-pre-wrap font-mono leading-relaxed">
        {track.text || (track.status === "running" ? "..." : "")}
      </pre>
    </div>
  );
}
