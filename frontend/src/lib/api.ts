export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5100";

export type WorkflowStep = {
  agentId: string;
  inputTemplate: string;
  maxRetries: number;
  skipOnError: boolean;
};

export type WorkflowDefinition = {
  id: string;
  steps: WorkflowStep[];
};

export type WorkflowRunResponse = {
  runId: string;
  workflow: string;
  output: string;
  outputs: Record<string, string>;
  inputTokens: number;
  outputTokens: number;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listAgents: () => jsonFetch<string[]>("/agents"),
  listWorkflows: () => jsonFetch<string[]>("/workflows"),
  getWorkflow: (id: string) => jsonFetch<WorkflowDefinition>(`/workflows/${id}`),
  runWorkflow: (id: string, topic: string, runId?: string) =>
    jsonFetch<WorkflowRunResponse>(`/workflows/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ topic, runId }),
    }),
  runInlineWorkflow: (definition: WorkflowDefinition, topic: string, runId?: string) =>
    jsonFetch<WorkflowRunResponse>(`/workflows/run-inline`, {
      method: "POST",
      body: JSON.stringify({ definition, topic, runId }),
    }),
};
