"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { HubConnection } from "@microsoft/signalr";
import { api, type WorkflowDefinition, type WorkflowRunResponse } from "@/lib/api";
import { connectWorkflowHub, type AgentEvent, type WorkflowEvent } from "@/lib/signalr";
import type { AgentStatus, AgentTrack } from "@/lib/types";
import {
  loadHistory,
  pushHistory,
  deleteHistoryEntry,
  clearHistory,
  type RunRecord,
} from "@/lib/history";
import { RunHistoryPanel } from "@/components/RunHistoryPanel";
import { takePendingInlineRun } from "@/lib/pendingRun";

const WorkflowGraph = dynamic(
  () => import("@/components/WorkflowGraph").then((m) => m.WorkflowGraph),
  {
    ssr: false,
    loading: () => (
      <div className="h-65 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-sm text-zinc-500">
        Loading graph...
      </div>
    ),
  },
);

type RunState =
  | { phase: "idle" }
  | { phase: "running"; runId: string; inline?: boolean }
  | { phase: "replaying"; runId: string }
  | { phase: "done"; runId: string; result: WorkflowRunResponse; replayed?: boolean; inline?: boolean }
  | { phase: "error"; runId: string; message: string };

function newRunId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text).catch(() => {});
  }
  return Promise.resolve();
}

export function WorkflowConsole() {
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [workflowId, setWorkflowId] = useState<string>("");
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [inlineDef, setInlineDef] = useState<WorkflowDefinition | null>(null);
  const [topic, setTopic] = useState<string>("The future of multi-agent AI systems");
  const [tracks, setTracks] = useState<Record<string, AgentTrack>>({});
  const [trackOrder, setTrackOrder] = useState<string[]>([]);
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);

  const effectiveDef = inlineDef ?? definition;

  const connectionRef = useRef<HubConnection | null>(null);
  const replayTokenRef = useRef(0);
  const tracksRef = useRef<Record<string, AgentTrack>>({});
  const trackOrderRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    trackOrderRef.current = trackOrder;
  }, [trackOrder]);

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

  function cancelInFlight() {
    replayTokenRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    connectionRef.current?.stop().catch(() => {});
    connectionRef.current = null;
  }

  function stopRun() {
    if (run.phase !== "running" && run.phase !== "replaying") return;
    cancelInFlight();
    setRun({ phase: "error", runId: run.runId, message: "Stopped by user." });
  }

  async function startRun(opts?: { workflowId?: string; topic?: string }) {
    const wf = (opts?.workflowId ?? workflowId).trim();
    const tp = (opts?.topic ?? topic).trim();
    if (!wf || !tp) return;
    if (opts?.workflowId && opts.workflowId !== workflowId) setWorkflowId(opts.workflowId);
    if (opts?.topic && opts.topic !== topic) setTopic(opts.topic);

    setInlineDef(null);
    cancelInFlight();
    const runId = newRunId();
    const controller = new AbortController();
    abortRef.current = controller;
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
      const result = await api.runWorkflow(wf, tp, runId, controller.signal);
      setRun({ phase: "done", runId, result });

      const order = trackOrderRef.current;
      const record: RunRecord = {
        runId,
        workflowId: wf,
        topic: tp,
        timestamp: Date.now(),
        agentOrder: order.length > 0 ? order : Object.keys(result.outputs),
        outputs: result.outputs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
      setHistory(pushHistory(record));
    } catch (e) {
      if (controller.signal.aborted) return;
      setRun({ phase: "error", runId, message: (e as Error).message });
    }
  }

  async function startInlineRun(def: WorkflowDefinition, tp: string) {
    cancelInFlight();
    const runId = newRunId();
    const controller = new AbortController();
    abortRef.current = controller;
    setInlineDef(def);
    setTopic(tp);
    setTracks({});
    setTrackOrder([]);
    setRun({ phase: "running", runId, inline: true });

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
      const result = await api.runInlineWorkflow(def, tp, runId, controller.signal);
      setRun({ phase: "done", runId, result, inline: true });

      const order = trackOrderRef.current;
      const record: RunRecord = {
        runId,
        workflowId: def.id,
        topic: tp,
        timestamp: Date.now(),
        agentOrder:
          order.length > 0 ? order : def.steps.map((s) => s.agentId),
        outputs: result.outputs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
      setHistory(pushHistory(record));
    } catch (e) {
      if (controller.signal.aborted) return;
      setRun({ phase: "error", runId, message: (e as Error).message });
    }
  }

  async function replayRecord(record: RunRecord) {
    cancelInFlight();
    const myToken = ++replayTokenRef.current;

    setWorkflowId(record.workflowId);
    setTopic(record.topic);
    setTracks({});
    setTrackOrder([]);
    setRun({ phase: "replaying", runId: record.runId });

    await new Promise((r) => setTimeout(r, 50));

    for (const agentId of record.agentOrder) {
      if (replayTokenRef.current !== myToken) return;
      const text = record.outputs[agentId] ?? "";
      upsertTrack(agentId, { status: "running", text, errorMessage: undefined });

      const ms = Math.min(6000, Math.max(700, text.length * 6));
      await new Promise((r) => setTimeout(r, ms));

      if (replayTokenRef.current !== myToken) return;
      upsertTrack(agentId, { status: "done" });
    }

    if (replayTokenRef.current !== myToken) return;
    setRun({
      phase: "done",
      runId: record.runId,
      replayed: true,
      result: {
        runId: record.runId,
        workflow: record.workflowId,
        output: record.outputs[record.agentOrder[record.agentOrder.length - 1]] ?? "",
        outputs: record.outputs,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
      },
    });
  }

  function deleteRecord(runId: string) {
    setHistory(deleteHistoryEntry(runId));
  }

  function clearAllHistory() {
    setHistory(clearHistory());
  }

  function downloadRunJson() {
    if (run.phase !== "done") return;
    const body = {
      runId: run.runId,
      workflow: run.result.workflow,
      topic,
      timestamp: new Date().toISOString(),
      outputs: run.result.outputs,
      inputTokens: run.result.inputTokens,
      outputTokens: run.result.outputTokens,
    };
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${run.result.workflow}-${run.runId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    // History + pending inline run are read from browser storage that doesn't
    // exist on the server, so they have to be hydrated after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(loadHistory());
    const pending = takePendingInlineRun();
    if (pending) {
      void startInlineRun(pending.definition, pending.topic);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const busy = run.phase === "running" || run.phase === "replaying";

  return (
    <div className="space-y-6">
      <RunHistoryPanel
        records={history}
        busy={busy}
        onReplay={replayRecord}
        onRunAgain={(r) => startRun({ workflowId: r.workflowId, topic: r.topic })}
        onDelete={deleteRecord}
        onClearAll={clearAllHistory}
      />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-3">
          <select
            aria-label="Workflow"
            value={workflowId}
            onChange={(e) => {
              setInlineDef(null);
              setWorkflowId(e.target.value);
            }}
            disabled={busy || workflows.length === 0}
            className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 disabled:text-zinc-500"
          >
            {workflows.length === 0 && (
              <option value="" className="bg-zinc-900 text-zinc-100">
                no workflows
              </option>
            )}
            {workflows.map((w) => (
              <option key={w} value={w} className="bg-zinc-900 text-zinc-100">
                {w}
              </option>
            ))}
          </select>
          <input
            aria-label="Topic for the workflow run"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={busy}
            placeholder="Topic..."
            className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 disabled:text-zinc-500"
          />
          {busy ? (
            <button
              onClick={stopRun}
              className="bg-rose-600 hover:bg-rose-500 text-white rounded px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              {run.phase === "replaying" ? "Stop replay" : "Stop"}
            </button>
          ) : (
            <button
              onClick={() => startRun()}
              disabled={!workflowId || !topic.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Run
            </button>
          )}
        </div>
        {loadError && <div role="alert" className="text-rose-400 text-xs">Failed to load workflows: {loadError}</div>}
        <div role="status" aria-live="polite" aria-atomic="true">
          {run.phase !== "idle" && (
            <div className="text-xs text-zinc-500 font-mono">
              {run.phase === "replaying" && <span className="text-sky-400">replaying · </span>}
              {(run.phase === "running" || run.phase === "done") && run.inline && (
                <span className="text-emerald-400">inline · </span>
              )}
              runId: {run.runId}
              {run.phase === "done" && (
                <>
                  {" · "}
                  tokens in/out: {run.result.inputTokens}/{run.result.outputTokens}
                  {run.replayed && <span className="text-sky-400"> · from history</span>}
                </>
              )}
            </div>
          )}
          {run.phase === "error" && (
            <div role="alert" className="text-rose-400 text-sm">Error: {run.message}</div>
          )}
        </div>
      </div>

      <WorkflowGraph definition={effectiveDef} tracks={tracks} />

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
        <div className="rounded-lg border border-emerald-600 bg-zinc-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-emerald-300 text-sm font-medium">Final output</div>
            <div className="flex items-center gap-2">
              <SmallButton onClick={() => copyToClipboard(run.result.output)}>Copy</SmallButton>
              <SmallButton onClick={downloadRunJson}>Download JSON</SmallButton>
            </div>
          </div>
          <pre className="text-zinc-100 text-sm whitespace-pre-wrap font-mono">{run.result.output}</pre>
        </div>
      )}
    </div>
  );
}

function SmallButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

const STATUS_STYLES: Record<AgentStatus, { border: string; badge: string }> = {
  idle: { border: "border-zinc-800", badge: "text-zinc-400" },
  running: { border: "border-sky-600", badge: "text-sky-300" },
  done: { border: "border-emerald-600", badge: "text-emerald-300" },
  error: { border: "border-rose-600", badge: "text-rose-300" },
  skipped: { border: "border-amber-600", badge: "text-amber-300" },
};

function useTypewriter(target: string) {
  const [displayed, setDisplayed] = useState(target);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayed((prev) => {
        const t = targetRef.current;
        if (prev === t) return prev;
        if (t.length < prev.length || !t.startsWith(prev)) return t;
        const remaining = t.length - prev.length;
        const advance = Math.max(2, Math.ceil(remaining / 24));
        return t.slice(0, prev.length + advance);
      });
    }, 16);
    return () => window.clearInterval(id);
  }, []);

  return displayed;
}

function AgentCard({ track }: { track: AgentTrack }) {
  const displayed = useTypewriter(track.text);
  const s = STATUS_STYLES[track.status];
  return (
    <div className={`rounded-lg border bg-zinc-900 p-4 ${s.border}`}>
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="font-mono text-sm font-semibold text-zinc-200">{track.id}</div>
        <div className="flex items-center gap-2">
          <div className={`text-xs uppercase tracking-wider ${s.badge}`}>
            {track.status}
            {track.status === "done" && track.outputTokens !== undefined && (
              <span className="ml-2 text-zinc-500">
                {track.inputTokens}/{track.outputTokens} tokens
              </span>
            )}
          </div>
          {track.text && (
            <button
              onClick={() => copyToClipboard(track.text)}
              className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200 border border-zinc-800 rounded px-1.5 py-0.5"
              title="Copy this agent's output"
              aria-label={`Copy output from ${track.id}`}
            >
              Copy
            </button>
          )}
        </div>
      </div>
      {track.errorMessage && (
        <div className="text-xs text-rose-300 mb-2">{track.errorMessage}</div>
      )}
      <pre className="text-zinc-100 text-sm whitespace-pre-wrap font-mono leading-relaxed">
        {displayed}
        {track.status === "running" && (
          <span className="inline-block w-0.5 h-[1em] bg-sky-300 ml-0.5 align-middle animate-pulse" />
        )}
      </pre>
    </div>
  );
}
