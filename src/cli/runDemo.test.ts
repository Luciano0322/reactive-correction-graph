import { exec } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);

describe("demo CLI", () => {
  it("writes an explanatory correction narrative for the demo fixture", async () => {
    const cwd = process.cwd();
    const outputDir = resolve(cwd, ".output");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await rm(outputDir, { recursive: true, force: true });
    await execAsync(`${pnpmCommand} demo ./src/examples/input.md`, {
      cwd,
      timeout: 10_000,
    });

    const resultMarkdown = await readFile(resolve(outputDir, "result.md"), "utf8");
    const traceJson = await readFile(resolve(outputDir, "trace.json"), "utf8");
    const stateJson = await readFile(resolve(outputDir, "state.json"), "utf8");

    const trace = JSON.parse(traceJson) as Array<{
      scope?: string;
      type?: string;
      label?: string;
    }>;
    const state = JSON.parse(stateJson) as {
      finalResult?: {
        revisedDraft?: string;
        summary?: string[];
        unresolvedIssues?: string[];
      };
    };

    expect(resultMarkdown).toContain("## Revised Draft");
    expect(resultMarkdown).toContain("Mock correction notes");
    expect(resultMarkdown).toContain("## Correction Summary");
    expect(resultMarkdown).toContain("## Unresolved Issues");
    expect(Array.isArray(trace)).toBe(true);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "effect",
          type: "emitted",
          label: "finalResult",
        }),
      ]),
    );
    expect(state.finalResult?.revisedDraft).toContain("Mock correction notes");
    expect(state.finalResult?.summary).toEqual(
      expect.arrayContaining([
        "Review claim claim-1: This claim is tentative and should be verified.",
        "Apply style guide: Use concise technical language for TypeScript developers.",
        "Respect user intent: Explain why reactive invalidation avoids unnecessary agent work.",
      ]),
    );
    expect(state.finalResult?.unresolvedIssues).toEqual([
      "This claim is tentative and should be verified.",
    ]);
  }, 20_000);

  it("writes graph and runtime trace artifacts in graph mode", async () => {
    const cwd = process.cwd();
    const outputDir = resolve(cwd, ".output");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await rm(outputDir, { recursive: true, force: true });
    await execAsync(`${pnpmCommand} run demo:graph`, {
      cwd,
      timeout: 10_000,
    });

    const resultMarkdown = await readFile(resolve(outputDir, "result.md"), "utf8");
    const traceJson = await readFile(resolve(outputDir, "trace.json"), "utf8");
    const stateJson = await readFile(resolve(outputDir, "state.json"), "utf8");

    const trace = JSON.parse(traceJson) as Array<{
      scope?: string;
      type?: string;
      label?: string;
    }>;
    const state = JSON.parse(stateJson) as {
      finalResult?: {
        revisedDraft?: string;
      };
      trace?: typeof trace;
      graphTrace?: typeof trace;
    };

    expect({
      result: resultMarkdown,
      graphTrace: state.graphTrace,
      runtimeTrace: state.trace,
      traceArtifact: trace,
    }).toEqual({
      result: expect.stringContaining("Mock correction notes"),
      graphTrace: expect.arrayContaining([
        expect.objectContaining({
          scope: "graph",
          type: "started",
          label: "prepareInput",
        }),
        expect.objectContaining({
          scope: "graph",
          type: "completed",
          label: "finalize",
        }),
      ]),
      runtimeTrace: expect.arrayContaining([
        expect.objectContaining({
          scope: "effect",
          type: "emitted",
          label: "finalResult",
        }),
      ]),
      traceArtifact: state.trace,
    });
  }, 20_000);

  it("validates provider selection in graph mode", async () => {
    const cwd = process.cwd();
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await expect(
      execAsync(`${pnpmCommand} run demo:graph --provider unsupported`, {
        cwd,
        timeout: 10_000,
      }),
    ).rejects.toThrow(/Unsupported CORRECTION_MODEL: unsupported/);
  }, 20_000);
});
