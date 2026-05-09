export type AgentStatus = "idle" | "running" | "done" | "error" | "skipped";

export type AgentTrack = {
  id: string;
  status: AgentStatus;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
};
