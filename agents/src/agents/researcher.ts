import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Agent } from "../runner";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a research agent in a multi-agent pipeline.

Your job: given a topic, produce concise research notes that a downstream Writer agent can turn into prose.

Output format:
- 5 to 8 bullet points
- Each bullet: one concrete, verifiable fact or angle
- No filler, no introductions, no conclusions
- Plain text only`;

export interface ResearchResult {
  topic: string;
  notes: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ResearchOptions {
  onChunk?: (text: string) => void;
}

export async function research(
  topic: string,
  options: ResearchOptions = {},
): Promise<ResearchResult> {
  if (!topic || !topic.trim()) {
    throw new Error("research(): topic is required");
  }

  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Topic: ${topic}` }],
  });

  if (options.onChunk) stream.on("text", options.onChunk);

  const response = await stream.finalMessage();

  const notes = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    topic,
    notes,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export const researcherAgent: Agent = {
  id: "researcher",
  async run(topic, options) {
    const r = await research(topic, { onChunk: options?.onChunk });
    return {
      output: r.notes,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    };
  },
};

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: npm run research -- "<topic>"');
    process.exit(1);
  }

  console.log(`\n--- Researcher notes on: ${topic} ---\n`);
  const result = await research(topic, {
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
