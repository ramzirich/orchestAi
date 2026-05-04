import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function main() {
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [
      { role: "user", content: "Say 'hello from OrchestAI' in exactly 5 words." },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") {
      console.log(block.text);
    }
  }

  console.log(`\nTokens used: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
