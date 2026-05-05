import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Agent } from "../runner";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a critic agent in a multi-agent pipeline.

You receive prose written by an upstream Writer agent. Your job: find concrete,
actionable problems a downstream editor or summarizer could act on.

Output format:
- 3 to 6 bullet points
- Each bullet names ONE specific issue: factual gap, unclear sentence, weak transition, tone mismatch, repeated point, missing context, etc.
- Quote or paraphrase the offending passage briefly so the issue is grounded
- If the prose is genuinely strong, say so in 1 bullet and stop — do not invent problems
- No introduction, no closing remarks, just the bullets`;

export interface CritiqueResult {
  prose: string;
  issues: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CritiqueOptions {
  onChunk?: (text: string) => void;
}

export async function critique(
  prose: string,
  options: CritiqueOptions = {},
): Promise<CritiqueResult> {
  if (!prose || !prose.trim()) {
    throw new Error("critique(): prose is required");
  }

  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Prose to critique:\n${prose}` }],
  });

  if (options.onChunk) stream.on("text", options.onChunk);

  const response = await stream.finalMessage();

  const issues = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    prose,
    issues,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export const criticAgent: Agent = {
  id: "critic",
  async run(prose, options) {
    const c = await critique(prose, { onChunk: options?.onChunk });
    return {
      output: c.issues,
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
    };
  },
};

async function main() {
  const prose = process.argv.slice(2).join(" ").trim();
  if (!prose) {
    console.error('Usage: npm run critique -- "<prose>"');
    process.exit(1);
  }

  console.log("\n--- Critic issues ---\n");
  const result = await critique(prose, {
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
