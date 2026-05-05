import { agentRegistry } from "./registry";
import { loadWorkflow, runWorkflow, type WorkflowSpec } from "./runner";
import workflowSpec from "./workflows/research-pipeline.json";

const workflow = loadWorkflow(workflowSpec as WorkflowSpec, agentRegistry);

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: npm run chain -- "<topic>"');
    process.exit(1);
  }

  const total = workflow.nodes.length;
  let step = 0;

  const run = await runWorkflow(workflow, topic, {
    onNodeStart: (node) => {
      step += 1;
      console.log(
        `\n[${step}/${total}] ${node.id} <- ${node.inputFrom}\n`,
      );
    },
    onChunk: (_nodeId, text) => process.stdout.write(text),
    onNodeRetry: (node, attempt, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n[retry] ${node.id} attempt ${attempt} failed: ${msg}`);
    },
    onNodeEnd: (_node, r) => {
      if (r.status === "ok") {
        process.stdout.write("\n");
      } else if (r.status === "skipped") {
        step += 1;
        console.log(`\n[${step}/${total}] ${r.id} skipped — ${r.error}`);
      } else if (r.status === "failed") {
        console.log(`\n[fail] ${r.id} after ${r.attempts} attempt(s): ${r.error}`);
      }
    },
  });

  const perNode = run.nodes
    .map((n) => `${n.id}(${n.status}) ${n.inputTokens}/${n.outputTokens}`)
    .join(", ");
  console.log(
    `\n--- ${workflow.name ?? "pipeline"} complete --- Tokens: ${run.totalInputTokens} in / ${run.totalOutputTokens} out (${perNode})`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
