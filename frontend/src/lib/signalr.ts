import { HubConnection, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { BACKEND_URL } from "./api";

export type AgentEvent =
  | { runId: string; agent: string; type: "start" }
  | { runId: string; agent: string; type: "chunk"; text: string }
  | { runId: string; agent: string; type: "end"; inputTokens: number; outputTokens: number }
  | { runId: string; agent: string; type: "error"; message: string }
  | { runId: string; agent: string; type: "retry"; attempt: number; message: string }
  | { runId: string; agent: string; type: "skipped"; message?: string };

export type WorkflowEvent =
  | { runId: string; workflow: string; type: "start" }
  | { runId: string; workflow: string; type: "end"; inputTokens: number; outputTokens: number }
  | { runId: string; workflow: string; type: "error"; message: string };

export type WorkflowHandlers = {
  onAgentEvent?: (e: AgentEvent) => void;
  onWorkflowEvent?: (e: WorkflowEvent) => void;
};

export async function connectWorkflowHub(
  runId: string,
  handlers: WorkflowHandlers,
): Promise<HubConnection> {
  const connection = new HubConnectionBuilder()
    .withUrl(`${BACKEND_URL}/hubs/workflow`)
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();

  if (handlers.onAgentEvent) connection.on("agentEvent", handlers.onAgentEvent);
  if (handlers.onWorkflowEvent) connection.on("workflowEvent", handlers.onWorkflowEvent);

  await connection.start();
  await connection.invoke("JoinRun", runId);
  return connection;
}
