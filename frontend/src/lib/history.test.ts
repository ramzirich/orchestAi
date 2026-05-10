import { describe, it, expect, beforeEach } from "vitest";
import {
  loadHistory,
  saveHistory,
  pushHistory,
  deleteHistoryEntry,
  clearHistory,
  type RunRecord,
} from "@/lib/history";

function record(runId: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId,
    workflowId: "article",
    topic: "test",
    timestamp: 1_000_000,
    agentOrder: ["a"],
    outputs: { a: "x" },
    inputTokens: 10,
    outputTokens: 20,
    ...overrides,
  };
}

describe("history (localStorage)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty array when nothing is stored", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("returns empty array when stored value is malformed", () => {
    window.localStorage.setItem("orchestai.history.v1", "{not json");
    expect(loadHistory()).toEqual([]);
  });

  it("filters out records missing required fields", () => {
    window.localStorage.setItem(
      "orchestai.history.v1",
      JSON.stringify([{ runId: "ok-but-incomplete" }, record("good")]),
    );
    const loaded = loadHistory();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].runId).toBe("good");
  });

  it("pushes new records to the front (most recent first)", () => {
    pushHistory(record("first"));
    pushHistory(record("second"));
    const loaded = loadHistory();
    expect(loaded.map((r) => r.runId)).toEqual(["second", "first"]);
  });

  it("dedupes by runId, replacing prior entry and moving it to the front", () => {
    pushHistory(record("a", { topic: "old" }));
    pushHistory(record("b"));
    pushHistory(record("a", { topic: "new" }));
    const loaded = loadHistory();
    expect(loaded.map((r) => r.runId)).toEqual(["a", "b"]);
    expect(loaded[0].topic).toBe("new");
  });

  it("caps at 20 records", () => {
    for (let i = 0; i < 25; i++) pushHistory(record(`r${i}`));
    expect(loadHistory()).toHaveLength(20);
  });

  it("deletes by runId", () => {
    pushHistory(record("keep"));
    pushHistory(record("drop"));
    deleteHistoryEntry("drop");
    expect(loadHistory().map((r) => r.runId)).toEqual(["keep"]);
  });

  it("clears everything", () => {
    pushHistory(record("a"));
    pushHistory(record("b"));
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it("survives a save/load roundtrip", () => {
    const original = [record("a"), record("b")];
    saveHistory(original);
    expect(loadHistory()).toEqual(original);
  });
});
