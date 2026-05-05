import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a writer agent in a multi-agent pipeline.

You receive research notes (bullet points of facts) from an upstream Researcher agent.
Your job: turn those notes into clear, engaging prose for a general audience.

Output format:
- 2 to 3 short paragraphs
- Plain prose, no bullets, no headings
- Weave the facts into a narrative; do not just restate them
- No introduction like "Here is..." — just start with the content`;

export interface WriteResult {
  notes: string;
  prose: string;
  inputTokens: number;
  outputTokens: number;
}

export async function write(notes: string): Promise<WriteResult> {
  if (!notes || !notes.trim()) {
    throw new Error("write(): notes are required");
  }

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Research notes:\n${notes}` }],
  });

  const prose = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    notes,
    prose,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function main() {
  const notes = process.argv.slice(2).join(" ").trim();
  if (!notes) {
    console.error('Usage: npm run write -- "<bullet notes>"');
    process.exit(1);
  }

  const result = await write(notes);
  console.log("\n--- Writer prose ---\n");
  console.log(result.prose);
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
