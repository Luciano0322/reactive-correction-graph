import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Loop Runtime extraction readiness documentation", () => {
  it("records accepted boundaries and blocks extraction until the readiness audit passes", async () => {
    const rfc = await readFile(
      "docs/rfcs/signal-kernel-loop-runtime-proposal.md",
      "utf8",
    );

    expect({
      acceptedDecisions: rfc.includes("## Accepted Decisions"),
      nonGoals: rfc.includes("## Non-Goals"),
      extractionGates: rfc.includes("## Extraction Gates"),
      blocksPrematureExtraction: rfc.includes(
        "No publishable package implementation or source-file move begins until the readiness audit passes.",
      ),
    }).toEqual({
      acceptedDecisions: true,
      nonGoals: true,
      extractionGates: true,
      blocksPrematureExtraction: true,
    });
  });

  it("maps candidate mechanics to Task 49-51 evidence, ownership, and honest readiness", async () => {
    const rfc = await readFile(
      "docs/rfcs/signal-kernel-loop-runtime-proposal.md",
      "utf8",
    );
    const matrix = extractSection(rfc, "## Extraction Evidence Matrix");

    expect(matrix).toContain(
      "| Candidate generic mechanic | Current source ownership | Task 49-51 behavior evidence | Readiness |",
    );
    expect(matrix).toContain("Opaque `receive(input)` and lifecycle boundary");
    expect(matrix).toContain("Fixed-point settlement and settled-only `emit()`");
    expect(matrix).toContain("Latest-epoch stale-result containment");
    expect(matrix).toContain("Settled snapshot reuse and restore isolation");
    expect(matrix).toContain("Omitted-pending-work recomputation");
    expect(matrix).toContain(
      "Restored, reused, recomputed, and superseded trace semantics",
    );
    expect(matrix).toContain("Error propagation, no automatic retry, and disposal");

    expect(matrix).toContain("src/runtime/signalNode.ts");
    expect(matrix).toContain("src/runtime/createCorrectionRuntime.ts");
    expect(matrix).toContain("src/agents/createTwoAgentCorrectionCoordinator.ts");
    expect(matrix).toContain("src/agents/createAgentRuntimeSnapshotAdapter.ts");
    expect(matrix).toContain("src/trace/types.ts");

    expect(matrix).toContain("src/agents/agentContracts.test.ts");
    expect(matrix).toContain("src/agents/coordinatorContracts.test.ts");
    expect(matrix).toContain(
      "src/agents/createTwoAgentCorrectionCoordinator.test.ts",
    );
    expect(matrix).toContain(
      "src/agents/twoAgentCorrectionCoordinatorSnapshot.test.ts",
    );
    expect(matrix).toContain(
      "src/agents/twoAgentCorrectionCoordinatorRestoreGuards.test.ts",
    );

    expect(matrix).toContain("**Proven in the POC**");
    expect(matrix).toContain("**Partial evidence**");
    expect(matrix).toContain("**Missing extraction evidence**");
  });

  it("links the black-box POC validation and before-extraction baseline without claiming package readiness", async () => {
    const rfc = await readFile(
      "docs/rfcs/signal-kernel-loop-runtime-proposal.md",
      "utf8",
    );

    expect(rfc).toContain(
      "src/testing/loopRuntimeLifecycleBehaviorSuite.ts",
    );
    expect(rfc).toContain(
      "src/testing/twoAgentLoopRuntimeBehaviorHarness.ts",
    );
    expect(rfc).toContain(
      "docs/rfcs/signal-kernel-loop-runtime-extraction-baseline.json",
    );
    expect(rfc).toContain(
      "Passing through the POC adapter does not make the candidate package boundary import-clean or extraction-ready.",
    );
  });

  it("publishes a not-ready decision and dispositions every RFC open question", async () => {
    const [rfc, auditJson] = await Promise.all([
      readFile("docs/rfcs/signal-kernel-loop-runtime-proposal.md", "utf8"),
      readFile(
        "docs/rfcs/signal-kernel-loop-runtime-readiness-audit.json",
        "utf8",
      ),
    ]);
    const audit = JSON.parse(auditJson) as {
      schemaVersion: number;
      target: string;
      status: string;
      decision: string;
      packageWorkspaceCreated: boolean;
      blockers: Array<{ id: string }>;
      regressionBaseline: string;
    };

    expect({
      schemaVersion: audit.schemaVersion,
      target: audit.target,
      status: audit.status,
      decision: audit.decision,
      packageWorkspaceCreated: audit.packageWorkspaceCreated,
      blockerIds: audit.blockers.map((blocker) => blocker.id),
      regressionBaseline: audit.regressionBaseline,
    }).toEqual({
      schemaVersion: 1,
      target: "@signal-kernel/loop-runtime@0.1.0",
      status: "not-ready",
      decision: "defer-package-creation",
      packageWorkspaceCreated: false,
      blockerIds: [
        "architecture-import-boundary",
        "pending-restore-recomputation",
        "public-trace-taxonomy",
        "generic-inspection-contract",
        "typed-error-and-disposal-contract",
        "resource-and-effect-registration-contract",
      ],
      regressionBaseline:
        "docs/rfcs/signal-kernel-loop-runtime-extraction-baseline.json",
    });

    expect(rfc).toContain("- Readiness audit: Not ready");
    expect(rfc).toContain("- Extraction decision: Defer package creation");
    expect(rfc).toContain("## Readiness Audit Result");
    expect(rfc).toContain(
      "Decision: do not create `packages/loop-runtime` or move runtime source files.",
    );

    const dispositions = extractSection(
      rfc,
      "## Open Question Dispositions",
    );
    expect(dispositions).toContain("`LoopContext.resource()`");
    expect(dispositions).toContain("Effects that generate new work");
    expect(dispositions).toContain("`@signal-kernel/snapshot` API");
    expect(dispositions).toContain("Singleton peer resolution");
    expect(dispositions).toContain("Trace event taxonomy");
    expect(dispositions).toContain("Loop identity and snapshot migrations");
    expect(dispositions).toContain("Clock and ID factories");
    expect(dispositions).toContain("`/testing` subpath");
    expect(dispositions).toContain("Pending-work disposal guarantees");
    expect(dispositions.match(/\| (?:Accepted|Deferred) \|/g)).toHaveLength(9);
    expect(rfc).not.toContain("## Open Questions");
  });
});

function extractSection(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);

  if (start === -1) {
    return "";
  }

  const nextHeading = markdown.indexOf("\n## ", start + heading.length);
  return markdown.slice(start, nextHeading === -1 ? undefined : nextHeading);
}
