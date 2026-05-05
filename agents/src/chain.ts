import { research } from "./agents/researcher";
import { write } from "./agents/writer";
import { critique } from "./agents/critic";

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: npm run chain -- "<topic>"');
    process.exit(1);
  }

  console.log(`\n[1/3] Researcher working on: ${topic}\n`);
  const r = await research(topic);
  console.log(r.notes);

  console.log(`\n[2/3] Writer turning notes into prose...\n`);
  const w = await write(r.notes);
  console.log(w.prose);

  console.log(`\n[3/3] Critic reviewing the prose...\n`);
  const c = await critique(w.prose);
  console.log(c.issues);

  const totalIn = r.inputTokens + w.inputTokens + c.inputTokens;
  const totalOut = r.outputTokens + w.outputTokens + c.outputTokens;
  console.log(
    `\n--- Pipeline complete --- Tokens: ${totalIn} in / ${totalOut} out (researcher: ${r.inputTokens}/${r.outputTokens}, writer: ${w.inputTokens}/${w.outputTokens}, critic: ${c.inputTokens}/${c.outputTokens})`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
