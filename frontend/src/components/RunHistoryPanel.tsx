"use client";

import { useState } from "react";
import type { RunRecord } from "@/lib/history";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function RunHistoryPanel({
  records,
  busy,
  onReplay,
  onRunAgain,
  onDelete,
  onClearAll,
}: {
  records: RunRecord[];
  busy: boolean;
  onReplay: (r: RunRecord) => void;
  onRunAgain: (r: RunRecord) => void;
  onDelete: (runId: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-zinc-200 font-medium">
          History
          <span className="ml-2 text-xs text-zinc-500">
            {records.length === 0 ? "empty" : `${records.length} run${records.length === 1 ? "" : "s"}`}
          </span>
        </span>
        <span className="text-zinc-500 text-xs">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-800 p-3 space-y-2">
          {records.length === 0 && (
            <div className="text-xs text-zinc-500 px-1 py-2">No past runs yet.</div>
          )}
          {records.map((r) => (
            <div
              key={r.runId}
              className="rounded border border-zinc-800 bg-zinc-950 p-3 flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-zinc-300 truncate" title={r.topic}>
                  <span className="text-emerald-400">{r.workflowId}</span>{" "}
                  <span className="text-zinc-500">·</span> {r.topic}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1 font-mono">
                  {timeAgo(r.timestamp)} · {r.agentOrder.length} steps · {r.inputTokens}/
                  {r.outputTokens} tokens
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onReplay(r)}
                  disabled={busy}
                  className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Replay this run's outputs without calling the model"
                >
                  Replay
                </button>
                <button
                  onClick={() => onRunAgain(r)}
                  disabled={busy}
                  className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Run the same workflow + topic again (real model call)"
                >
                  Run again
                </button>
                <button
                  onClick={() => onDelete(r.runId)}
                  className="text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:border-rose-700"
                  title="Forget this run"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {records.length > 0 && (
            <div className="flex justify-end pt-1">
              <button
                onClick={onClearAll}
                className="text-xs text-zinc-500 hover:text-rose-400"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
