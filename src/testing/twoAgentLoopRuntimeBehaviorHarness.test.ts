import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createRecomputeSavingsReport } from "../comparison/recomputeSavingsReport.js";
import { runReferenceScenario } from "../reference/runReferenceScenario.js";
import { projectReceiveExecutionSummary } from "../trace/projectReceiveExecutionSummary.js";
import { runLoopRuntimeLifecycleBehaviorSuite } from "./loopRuntimeLifecycleBehaviorSuite.js";
import { createTwoAgentLoopRuntimeBehaviorHarness } from "./twoAgentLoopRuntimeBehaviorHarness.js";

describe("two-agent POC Loop Runtime behavior adapter", () => {
  it("passes the reusable black-box lifecycle behavior suite", async () => {
    const harness = createTwoAgentLoopRuntimeBehaviorHarness();

    await expect(
      runLoopRuntimeLifecycleBehaviorSuite(harness),
    ).resolves.toEqual({
      passed: [
        "fixed-point-settlement",
        "latest-epoch-wins",
        "settled-only-emission",
        "trace-contract",
        "snapshot-restore",
      ],
    });
  });

  it("matches the checked-in comparison and savings migration baseline", async () => {
    const [run, baselineJson] = await Promise.all([
      runReferenceScenario(),
      readFile(
        "docs/rfcs/signal-kernel-loop-runtime-extraction-baseline.json",
        "utf8",
      ),
    ]);
    const styleOnly = run.receives.find(
      (receive) => receive.transition.id === "style-only",
    );
    const claimChanging = run.receives.find(
      (receive) => receive.transition.id === "claim-changing",
    );

    if (!styleOnly || !claimChanging) {
      throw new Error(
        "Reference scenario must include style-only and claim-changing receives",
      );
    }

    const savings = createRecomputeSavingsReport(
      run.comparison,
      run.comparisonBaseline,
      {
        "style-only": projectReceiveExecutionSummary(
          styleOnly.state.trace,
          styleOnly.receiveEpoch,
        ),
        "claim-changing": projectReceiveExecutionSummary(
          claimChanging.state.trace,
          claimChanging.receiveEpoch,
        ),
      },
    );
    const currentBaseline = {
      schemaVersion: 1,
      purpose: "before-extraction-regression-baseline",
      provider: run.provider,
      sourceScenario: "src/examples/reference-scenario.json",
      comparisonBaseline: run.comparisonBaseline,
      comparison: run.comparison,
      savings,
    };

    expect(currentBaseline).toEqual(JSON.parse(baselineJson));
  });
});
