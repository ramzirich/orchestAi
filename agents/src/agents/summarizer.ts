import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a summarizer agent in a multi-agent pipeline.

You receive prose written by an upstream Writer agent. Your job: compress it
into a TL;DR a busy reader could absorb in under 15 seconds.

Output format:
- 2 to 3 sentences total
- One paragraph, plain prose
- Capture the central thesis and the 2-3 most important specifics (dates, names, figures)
- No introduction like "In summary" or "TL;DR:" — just the sentences
- No bullets, no headings`;

export interface SummaryResult {
  prose: string;
  summary: string;
  inputTokens: number;
  outputTokens: number;
}

export async function summarize(prose: string): Promise<SummaryResult> {
  if (!prose || !prose.trim()) {
    throw new Error("summarize(): prose is required");
  }

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Prose to summarize:\n${prose}` }],
  });

  const summary = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    prose,
    summary,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function main() {
  const prose = process.argv.slice(2).join(" ").trim();
  if (!prose) {
    console.error('Usage: npm run summarize -- "<prose>"');
    process.exit(1);
  }

  const result = await summarize(prose);
  console.log("\n--- Summarizer TL;DR ---\n");
  console.log(result.summary);
  console.log(
    `\nTokens used: ${result.inputTokens} in / ${result.outputTokens} out`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
