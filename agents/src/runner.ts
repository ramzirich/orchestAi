export interface AgentResult {
  output: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AgentRunOptions {
  onChunk?: (text: string) => void;
}

export interface Agent {
  id: string;
  run(input: string, options?: AgentRunOptions): Promise<AgentResult>;
}

export type NodeRef = string;
export const WORKFLOW_INPUT: NodeRef = "$input";

export type OnErrorPolicy = "fail" | "skip";

export interface WorkflowNode {
  id: string;
  agent: Agent;
  inputFrom: NodeRef;
  retries?: number;
  onError?: OnErrorPolicy;
}

export interface Workflow {
  name?: string;
  nodes: WorkflowNode[];
}

export type NodeStatus = "ok" | "failed" | "skipped";

export interface NodeRun {
  id: string;
  inputFrom: NodeRef;
  status: NodeStatus;
  output: string;
  error?: string;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
}

export interface RunOptions {
  onNodeStart?: (node: WorkflowNode, input: string) => void;
  onNodeEnd?: (node: WorkflowNode, run: NodeRun) => void;
  onChunk?: (nodeId: string, text: string) => void;
  onNodeRetry?: (node: WorkflowNode, attempt: number, error: unknown) => void;
}

export interface WorkflowRun {
  nodes: NodeRun[];
  totalInputTokens: number;
  totalOutputTokens: number;
}

export async function runWorkflow(
  workflow: Workflow,
  input: string,
  options: RunOptions = {},
): Promise<WorkflowRun> {
  const outputs = new Map<NodeRef, string>();
  const status = new Map<NodeRef, NodeStatus>();
  outputs.set(WORKFLOW_INPUT, input);
  status.set(WORKFLOW_INPUT, "ok");

  const seenIds = new Set<string>();
  const runs: NodeRun[] = [];

  for (const node of workflow.nodes) {
    if (seenIds.has(node.id)) {
      throw new Error(
        `runWorkflow: duplicate node id "${node.id}" — each node id must be unique`,
      );
    }
    seenIds.add(node.id);

    const upstreamStatus = status.get(node.inputFrom);
    if (upstreamStatus === undefined) {
      throw new Error(
        `runWorkflow: node "${node.id}" depends on "${node.inputFrom}" which has not produced an output yet`,
      );
    }

    if (upstreamStatus !== "ok") {
      const run: NodeRun = {
        id: node.id,
        inputFrom: node.inputFrom,
        status: "skipped",
        output: "",
        error: `upstream "${node.inputFrom}" was ${upstreamStatus}`,
        attempts: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      runs.push(run);
      status.set(node.id, "skipped");
      options.onNodeEnd?.(node, run);
      continue;
    }

    const upstream = outputs.get(node.inputFrom)!;
    options.onNodeStart?.(node, upstream);

    const onChunk = options.onChunk;
    const maxAttempts = (node.retries ?? 0) + 1;
    let attempts = 0;
    let result: AgentResult | undefined;
    let lastError: unknown;

    while (attempts < maxAttempts && !result) {
      attempts += 1;
      try {
        result = await node.agent.run(upstream, {
          onChunk: onChunk ? (text) => onChunk(node.id, text) : undefined,
        });
      } catch (err) {
        lastError = err;
        if (attempts < maxAttempts) {
          options.onNodeRetry?.(node, attempts, err);
        }
      }
    }

    if (result) {
      const run: NodeRun = {
        id: node.id,
        inputFrom: node.inputFrom,
        status: "ok",
        output: result.output,
        attempts,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
      outputs.set(node.id, result.output);
      status.set(node.id, "ok");
      runs.push(run);
      options.onNodeEnd?.(node, run);
      continue;
    }

    const errStr = lastError instanceof Error ? lastError.message : String(lastError);
    const policy: OnErrorPolicy = node.onError ?? "fail";

    if (policy === "fail") {
      throw lastError;
    }

    const run: NodeRun = {
      id: node.id,
      inputFrom: node.inputFrom,
      status: "failed",
      output: "",
      error: errStr,
      attempts,
      inputTokens: 0,
      outputTokens: 0,
    };
    runs.push(run);
    status.set(node.id, "failed");
    options.onNodeEnd?.(node, run);
  }

  const totalInputTokens = runs.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = runs.reduce((s, r) => s + r.outputTokens, 0);

  return { nodes: runs, totalInputTokens, totalOutputTokens };
}

export interface WorkflowSpec {
  name?: string;
  nodes: Array<{
    id: string;
    agent: string;
    inputFrom: NodeRef;
    retries?: number;
    onError?: string;
  }>;
}

export function loadWorkflow(
  spec: WorkflowSpec,
  registry: Record<string, Agent>,
): Workflow {
  const nodes: WorkflowNode[] = spec.nodes.map((n) => {
    const agent = registry[n.agent];
    if (!agent) {
      throw new Error(
        `loadWorkflow: agent "${n.agent}" referenced by node "${n.id}" is not in the registry`,
      );
    }
    if (n.onError !== undefined && n.onError !== "fail" && n.onError !== "skip") {
      throw new Error(
        `loadWorkflow: node "${n.id}" has invalid onError "${n.onError}" (expected "fail" or "skip")`,
      );
    }
    return {
      id: n.id,
      agent,
      inputFrom: n.inputFrom,
      retries: n.retries,
      onError: n.onError as OnErrorPolicy | undefined,
    };
  });
  return { name: spec.name, nodes };
}
