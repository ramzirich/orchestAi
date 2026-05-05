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

export interface WorkflowNode {
  agent: Agent;
  inputFrom: NodeRef;
}

export interface Workflow {
  nodes: WorkflowNode[];
}

export interface NodeRun {
  id: string;
  inputFrom: NodeRef;
  output: string;
  inputTokens: number;
  outputTokens: number;
}

export interface WorkflowRun {
  nodes: NodeRun[];
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface RunOptions {
  onNodeStart?: (node: WorkflowNode, input: string) => void;
  onNodeEnd?: (node: WorkflowNode, run: NodeRun) => void;
  onChunk?: (nodeId: string, text: string) => void;
}

export async function runWorkflow(
  workflow: Workflow,
  input: string,
  options: RunOptions = {},
): Promise<WorkflowRun> {
  const outputs = new Map<NodeRef, string>();
  outputs.set(WORKFLOW_INPUT, input);

  const seenIds = new Set<string>();
  const runs: NodeRun[] = [];

  for (const node of workflow.nodes) {
    if (seenIds.has(node.agent.id)) {
      throw new Error(
        `runWorkflow: duplicate node id "${node.agent.id}" — each node must be unique`,
      );
    }
    seenIds.add(node.agent.id);

    const upstream = outputs.get(node.inputFrom);
    if (upstream === undefined) {
      throw new Error(
        `runWorkflow: node "${node.agent.id}" depends on "${node.inputFrom}" which has not produced an output yet`,
      );
    }

    options.onNodeStart?.(node, upstream);
    const onChunk = options.onChunk;
    const result = await node.agent.run(upstream, {
      onChunk: onChunk ? (text) => onChunk(node.agent.id, text) : undefined,
    });

    const run: NodeRun = {
      id: node.agent.id,
      inputFrom: node.inputFrom,
      output: result.output,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
    outputs.set(node.agent.id, result.output);
    runs.push(run);
    options.onNodeEnd?.(node, run);
  }

  const totalInputTokens = runs.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = runs.reduce((s, r) => s + r.outputTokens, 0);

  return { nodes: runs, totalInputTokens, totalOutputTokens };
}
