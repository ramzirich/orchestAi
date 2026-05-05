import { researcherAgent } from "./agents/researcher";
import { writerAgent } from "./agents/writer";
import { criticAgent } from "./agents/critic";
import { summarizerAgent } from "./agents/summarizer";
import type { Agent } from "./runner";

export const agentRegistry: Record<string, Agent> = {
  researcher: researcherAgent,
  writer: writerAgent,
  critic: criticAgent,
  summarizer: summarizerAgent,
};
