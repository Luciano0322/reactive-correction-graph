import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("multi-agent contract documentation", () => {
  it("documents roles, ownership, public contracts, and explicit non-goals", async () => {
    const [readme, article, contractDoc] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/reactive-correction-graph-zh.md", "utf8"),
      readFile("docs/multi-agent-contracts.md", "utf8"),
    ]);

    expect(readme).toContain("Multi-Agent Contract Boundary");
    expect(readme).toContain("docs/multi-agent-contracts.md");

    expect(article).toContain("## Task 49: Multi-Agent Contract Definition");
    expect(article).toContain("docs/multi-agent-contracts.md");

    const roleRequirements = [
      "FactCheck Agent",
      "owns claim verification and evidence output",
      "Writer Agent",
      "owns style-aware revision",
      "Coordinator owns routing and lifecycle",
      "Each agent owns one private session and runtime state",
    ] as const;
    const publicBoundaryRequirements = [
      "Framework-neutral public boundary",
      "Versioned JSON-serializable envelopes",
      "AgentIdentity",
      "AgentMessageEnvelope",
      "AgentResult",
      "parseAgentMessageEnvelope",
      "createAgentCoordinatorBoundary",
      "AgentSessionBoundary",
    ] as const;
    const nonGoals = [
      "Autonomous planning",
      "Dynamic team formation",
      "Tool selection",
      "Shared mutable runtime state",
      "LangGraph-specific coordinator",
      "React or Vue integration",
      "Real LLM quality improvement",
    ] as const;

    for (const requirement of [
      ...roleRequirements,
      ...publicBoundaryRequirements,
      ...nonGoals,
    ]) {
      expect(contractDoc).toContain(requirement);
    }

    expect(contractDoc).toContain(
      "Current factCheck, styleReview, and rewriteDraft branches are not isolated agents.",
    );
  });
});
