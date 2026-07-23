import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("multi-agent snapshot recovery documentation", () => {
  it("documents the public API, checkpoint boundary, and durability limits", async () => {
    const [readme, article, recoveryDoc] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/reactive-correction-graph-zh.md", "utf8"),
      readFile("docs/multi-agent-snapshot-recovery.md", "utf8"),
    ]);

    expect(readme).toContain("Multi-Agent Snapshot Recovery");
    expect(readme).toContain("docs/multi-agent-snapshot-recovery.md");

    expect(article).toContain(
      "## Task 51：Multi-Agent Snapshot And Recovery",
    );
    expect(article).toContain(
      "docs/multi-agent-snapshot-recovery.md",
    );

    const requirements = [
      "@signal-kernel/snapshot",
      "parseTwoAgentCorrectionCoordinatorSnapshot",
      "restoreTwoAgentCorrectionCoordinator",
      "schemaVersion: 1",
      "LangGraph checkpoint state",
      "Only settled coordinator snapshots are currently supported.",
      "Snapshot is continuity, not live state sharing.",
      "remain process-local",
      "No database",
      "exactly-once",
    ] as const;

    for (const requirement of requirements) {
      expect(recoveryDoc).toContain(requirement);
    }
  });
});
