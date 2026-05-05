import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Agent } from "../runner";

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

export interface SummarizeOptions {
  onChunk?: (text: string) => void;
}

export async function summarize(
  prose: string,
  options: SummarizeOptions = {},
): Promise<SummaryResult> {
  if (!prose || !prose.trim()) {
    throw new Error("summarize(): prose is required");
  }

  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Prose to summarize:\n${prose}` }],
  });

  if (options.onChunk) stream.on("text", options.onChunk);

  const response = await stream.finalMessage();

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

export const summarizerAgent: Agent = {
  id: "summarizer",
  async run(prose, options) {
    const s = await summarize(prose, { onChunk: options?.onChunk });
    return {
      output: s.summary,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
    };
  },
};

async function main() {
  const prose = process.argv.slice(2).join(" ").trim();
  if (!prose) {
    console.error('Usage: npm run summarize -- "<prose>"');
    process.exit(1);
  }

  console.log("\n--- Summarizer TL;DR ---\n");
  const result = await summarize(prose, {
    onChunk: (text) => process.stdout.write(text),
  });
  console.log(
    `\n\nTokens used: ${result.inputTokens} in / ${result.outputTokens} out`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
