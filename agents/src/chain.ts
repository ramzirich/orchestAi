import { research } from "./agents/researcher";
import { write } from "./agents/writer";

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: npm run chain -- "<topic>"');
    process.exit(1);
  }

  console.log(`\n[1/2] Researcher working on: ${topic}\n`);
  const r = await research(topic);
  console.log(r.notes);

  console.log(`\n[2/2] Writer turning notes into prose...\n`);
  const w = await write(r.notes);
  console.log(w.prose);

  const totalIn = r.inputTokens + w.inputTokens;
  const totalOut = r.outputTokens + w.outputTokens;
  console.log(
    `\n--- Pipeline complete --- Tokens: ${totalIn} in / ${totalOut} out (researcher: ${r.inputTokens}/${r.outputTokens}, writer: ${w.inputTokens}/${w.outputTokens})`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
