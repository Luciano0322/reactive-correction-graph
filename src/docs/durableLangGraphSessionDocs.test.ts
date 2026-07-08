import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("durable LangGraph session documentation", () => {
  it("documents checkpoint boundaries, limitations, and production follow-ups", async () => {
    const [readme, sdkDoc, durableDoc] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/headless-session-sdk.md", "utf8"),
      readFile("docs/durable-langgraph-session.md", "utf8"),
    ]);

    expect(readme).toContain("Durable LangGraph Session Boundary");
    expect(readme).toContain("docs/durable-langgraph-session.md");

    expect(sdkDoc).toContain("Durable LangGraph checkpoints");
    expect(sdkDoc).toContain("docs/durable-langgraph-session.md");

    expect(durableDoc).toContain("# Durable LangGraph Session Boundary");
    expect(durableDoc).toContain("createCorrectionGraphSession({ checkpoint })");
    expect(durableDoc).toContain("session.checkpoint(state)");
    expect(durableDoc).toContain("createCorrectionGraphCheckpoint(state)");
    expect(durableDoc).toContain("parseCorrectionGraphCheckpoint(value)");
    expect(durableDoc).toContain("restoreCorrectionSessionFromCheckpoint(value)");
    expect(durableDoc).toContain("LangGraph checkpoint state stores serializable facts");
    expect(durableDoc).toContain("signal-kernel runtime instances are rebuilt, not persisted");
    expect(durableDoc).toContain("Runtime cache behavior is an optimization, not durable truth");
    expect(durableDoc).toContain("Do not store promises, functions, signals, effects, AbortController, subscriptions, sessions, or runtime instances");
    expect(durableDoc).toContain("In-flight async work from before restore is not resumed");
    expect(durableDoc).toContain("This is not yet a production checkpointing claim");
    expect(durableDoc).toContain("Future production LangGraph work");
  });
});
