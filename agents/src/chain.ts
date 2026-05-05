import { researcherAgent } from "./agents/researcher";
import { writerAgent } from "./agents/writer";
import { criticAgent } from "./agents/critic";
import { summarizerAgent } from "./agents/summarizer";
import { runWorkflow, WORKFLOW_INPUT, type Workflow } from "./runner";

const workflow: Workflow = {
  nodes: [
    { agent: researcherAgent, inputFrom: WORKFLOW_INPUT },
    { agent: writerAgent, inputFrom: "researcher" },
    { agent: criticAgent, inputFrom: "writer" },
    { agent: summarizerAgent, inputFrom: "writer" },
  ],
};

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
        `\n[${step}/${total}] ${node.agent.id} <- ${node.inputFrom}\n`,
      );
    },
    onChunk: (_nodeId, text) => process.stdout.write(text),
    onNodeEnd: () => process.stdout.write("\n"),
  });

  const perNode = run.nodes
    .map((n) => `${n.id} ${n.inputTokens}/${n.outputTokens}`)
    .join(", ");
  console.log(
    `\n--- Pipeline complete --- Tokens: ${run.totalInputTokens} in / ${run.totalOutputTokens} out (${perNode})`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
