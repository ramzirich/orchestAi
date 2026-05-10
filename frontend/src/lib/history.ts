"use client";

const KEY = "orchestai.history.v1";
const MAX = 20;

export type RunRecord = {
  runId: string;
  workflowId: string;
  topic: string;
  timestamp: number;
  agentOrder: string[];
  outputs: Record<string, string>;
  inputTokens: number;
  outputTokens: number;
};

function safeParse(raw: string | null): RunRecord[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (r): r is RunRecord =>
        r &&
        typeof r.runId === "string" &&
        typeof r.workflowId === "string" &&
        typeof r.topic === "string" &&
        typeof r.timestamp === "number" &&
        Array.isArray(r.agentOrder) &&
        r.outputs &&
        typeof r.inputTokens === "number" &&
        typeof r.outputTokens === "number",
    );
  } catch {
    return [];
  }
}

export function loadHistory(): RunRecord[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(KEY));
}

export function saveHistory(records: RunRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(records.slice(0, MAX)));
}

export function pushHistory(record: RunRecord): RunRecord[] {
  const current = loadHistory().filter((r) => r.runId !== record.runId);
  const next = [record, ...current].slice(0, MAX);
  saveHistory(next);
  return next;
}

export function deleteHistoryEntry(runId: string): RunRecord[] {
  const next = loadHistory().filter((r) => r.runId !== runId);
  saveHistory(next);
  return next;
}

export function clearHistory(): RunRecord[] {
  saveHistory([]);
  return [];
}
