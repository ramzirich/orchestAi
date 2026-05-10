import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import {
  GraphError,
  fromDefinition,
  toDefinition,
  type BuilderNode,
} from "@/lib/workflow";
import type { WorkflowDefinition } from "@/lib/api";

function node(id: string, x: number, template = ""): BuilderNode {
  return {
    id,
    type: "agent",
    position: { x, y: 0 },
    data: { agentId: id, inputTemplate: template },
  };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target };
}

describe("toDefinition", () => {
  it("rejects an empty graph", () => {
    expect(() => toDefinition("x", [], [])).toThrow(GraphError);
  });

  it("orders steps by edges, not by x position", () => {
    const nodes = [node("c", 0), node("a", 200), node("b", 400)];
    const edges = [edge("a", "b"), edge("b", "c")];
    const def = toDefinition("flow", nodes, edges);
    expect(def.steps.map((s) => s.agentId)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties between roots by x position", () => {
    const nodes = [node("right", 400), node("left", 0), node("middle", 200)];
    const def = toDefinition("flow", nodes, []);
    expect(def.steps.map((s) => s.agentId)).toEqual(["left", "middle", "right"]);
  });

  it("rejects cycles", () => {
    const nodes = [node("a", 0), node("b", 200)];
    const edges = [edge("a", "b"), edge("b", "a")];
    expect(() => toDefinition("flow", nodes, edges)).toThrow(/cycle/i);
  });

  it("rejects duplicate agent ids", () => {
    const nodes: BuilderNode[] = [
      { ...node("writer", 0), id: "n1" },
      { ...node("writer", 200), id: "n2" },
    ];
    expect(() => toDefinition("flow", nodes, [])).toThrow(/more than once/);
  });

  it("auto-generates inputTemplate from upstream when blank", () => {
    const nodes = [node("a", 0), node("b", 200)];
    const def = toDefinition("flow", nodes, [edge("a", "b")]);
    expect(def.steps[0].inputTemplate).toBe("{topic}");
    expect(def.steps[1].inputTemplate).toBe("{a.output}");
  });

  it("preserves user-provided inputTemplate", () => {
    const nodes = [node("a", 0, "{topic}"), node("b", 200, "literal")];
    const def = toDefinition("flow", nodes, [edge("a", "b")]);
    expect(def.steps[1].inputTemplate).toBe("literal");
  });

  it("combines multiple upstream inputs by default", () => {
    const nodes = [node("a", 0), node("b", 200), node("c", 400)];
    const edges = [edge("a", "c"), edge("b", "c")];
    const def = toDefinition("flow", nodes, edges);
    const cTemplate = def.steps.find((s) => s.agentId === "c")!.inputTemplate;
    expect(cTemplate).toContain("{a.output}");
    expect(cTemplate).toContain("{b.output}");
  });
});

describe("fromDefinition", () => {
  it("derives edges from {agentId.output} references in templates", () => {
    const def: WorkflowDefinition = {
      id: "article",
      steps: [
        { agentId: "researcher", inputTemplate: "{topic}", maxRetries: 0, skipOnError: false },
        { agentId: "writer", inputTemplate: "{researcher.output}", maxRetries: 0, skipOnError: false },
        { agentId: "summarizer", inputTemplate: "{writer.output}\n{researcher.output}", maxRetries: 0, skipOnError: false },
      ],
    };
    const { edges } = fromDefinition(def);
    expect(edges.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      "researcher->summarizer",
      "researcher->writer",
      "writer->summarizer",
    ]);
  });

  it("falls back to sequential edges when a step has no template references", () => {
    const def: WorkflowDefinition = {
      id: "seq",
      steps: [
        { agentId: "a", inputTemplate: "{topic}", maxRetries: 0, skipOnError: false },
        { agentId: "b", inputTemplate: "no refs here", maxRetries: 0, skipOnError: false },
      ],
    };
    const { edges } = fromDefinition(def);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("a");
    expect(edges[0].target).toBe("b");
  });

  it("ignores references to unknown agents", () => {
    const def: WorkflowDefinition = {
      id: "x",
      steps: [
        { agentId: "a", inputTemplate: "{ghost.output}", maxRetries: 0, skipOnError: false },
      ],
    };
    const { edges } = fromDefinition(def);
    expect(edges).toEqual([]);
  });
});

describe("toDefinition / fromDefinition roundtrip", () => {
  it("preserves agent order and edge structure", () => {
    const original: WorkflowDefinition = {
      id: "article",
      steps: [
        { agentId: "researcher", inputTemplate: "{topic}", maxRetries: 0, skipOnError: false },
        { agentId: "writer", inputTemplate: "{researcher.output}", maxRetries: 0, skipOnError: false },
        { agentId: "critic", inputTemplate: "{writer.output}", maxRetries: 0, skipOnError: false },
        {
          agentId: "summarizer",
          inputTemplate: "Draft:\n{writer.output}\n\nCritique:\n{critic.output}",
          maxRetries: 0,
          skipOnError: false,
        },
      ],
    };
    const { nodes, edges } = fromDefinition(original);
    const roundtripped = toDefinition(original.id, nodes, edges);

    expect(roundtripped.id).toBe(original.id);
    expect(roundtripped.steps.map((s) => s.agentId)).toEqual(
      original.steps.map((s) => s.agentId),
    );
    for (const step of original.steps) {
      const matched = roundtripped.steps.find((s) => s.agentId === step.agentId)!;
      expect(matched.inputTemplate).toBe(step.inputTemplate);
    }
  });
});
