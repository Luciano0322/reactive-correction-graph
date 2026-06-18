import { exec } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);

describe("demo CLI", () => {
  it("writes result, trace, and state artifacts for the example markdown input", async () => {
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
      };
    };

    expect(resultMarkdown).toContain("## Revised Draft");
    expect(resultMarkdown).toContain("Mock correction notes");
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
  }, 20_000);
});
