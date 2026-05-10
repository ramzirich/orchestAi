"use client";

import type { WorkflowDefinition } from "@/lib/api";

const KEY = "orchestai.pendingInlineRun.v1";

export type PendingInlineRun = {
  definition: WorkflowDefinition;
  topic: string;
};

export function setPendingInlineRun(run: PendingInlineRun) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(run));
}

export function takePendingInlineRun(): PendingInlineRun | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(KEY);
  try {
    const parsed = JSON.parse(raw) as PendingInlineRun;
    if (!parsed?.definition?.id || !Array.isArray(parsed.definition.steps)) return null;
    if (typeof parsed.topic !== "string" || !parsed.topic.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}
