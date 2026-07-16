import { exec } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { loadArtifactBundle } from "../artifacts/loadArtifactBundle.js";

const execAsync = promisify(exec);

describe("reference demo CLI", () => {
  it("writes a runtime artifact bundle to a temporary output directory", async () => {
    const cwd = process.cwd();
    const outputDir = await mkdtemp(join(tmpdir(), "rcg-reference-"));
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    try {
      const { stdout } = await execAsync(`${pnpmCommand} run demo:reference`, {
        cwd,
        timeout: 10_000,
        env: {
          ...process.env,
          REFERENCE_OUTPUT_DIR: outputDir,
        },
      });

      const bundle = await loadArtifactBundle(outputDir);
      const state = bundle.artifacts.state?.content as {
        draft?: string;
        finalResult?: {
          revisedDraft?: string;
        };
      };

      expect({
        command: bundle.manifest.run.command,
        mode: bundle.manifest.run.mode,
        provider: bundle.manifest.run.provider,
        artifactNames: Object.keys(bundle.artifacts),
        result: bundle.artifacts.result,
        state,
        trace: bundle.artifacts.trace,
        stdout,
      }).toEqual({
        command: "demo:reference",
        mode: "runtime",
        provider: "deterministic-mock",
        artifactNames: [
          "result",
          "state",
          "trace",
          "executionSummary",
          "savings",
          "scorecard",
        ],
        result: expect.objectContaining({
          path: "result.md",
          mediaType: "text/markdown",
          content: expect.stringContaining("Mock correction notes"),
        }),
        state: expect.objectContaining({
          draft: expect.stringContaining("Reactive Correction Graph"),
          finalResult: expect.objectContaining({
            revisedDraft: expect.stringContaining("Mock correction notes"),
          }),
        }),
        trace: expect.objectContaining({
          path: "trace.json",
          mediaType: "application/json",
          content: expect.arrayContaining([
            expect.objectContaining({
              scope: "effect",
              type: "emitted",
              label: "finalResult",
            }),
          ]),
        }),
        stdout: expect.stringContaining(outputDir),
      });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("reports clear fixture errors for missing or invalid reference scenario files", async () => {
    const cwd = process.cwd();
    const missingFixtureDir = await mkdtemp(
      join(tmpdir(), "rcg-reference-missing-"),
    );
    const invalidFixtureDir = await mkdtemp(
      join(tmpdir(), "rcg-reference-invalid-"),
    );
    const outputDir = await mkdtemp(join(tmpdir(), "rcg-reference-output-"));
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    try {
      await writeFile(
        join(missingFixtureDir, "reference-scenario.json"),
        JSON.stringify({
          kind: "reference-application",
          fixturePaths: {
            initialDraft: "reference-article.md",
            styleGuide: "missing-style-guide.md",
            metadata: "reference-scenario.json",
          },
          proofTarget: "Exercise clear fixture errors.",
          description: "A broken reference scenario.",
          initialUserIntent: "Explain the broken fixture.",
          styleOnlyStyleGuide: "Use concise language.",
          claimChangingDraftChange: "A changed claim.",
          executionBoundary: {
            provider: "mock",
            requiresNetwork: false,
            requiresOllama: false,
            requiresLangSmith: false,
            requiresApiKey: false,
          },
          transitions: [
            {
              id: "initial",
              proofTarget: "baseline",
            },
          ],
        }),
        "utf8",
      );
      await writeFile(
        join(missingFixtureDir, "reference-article.md"),
        "Reference draft for a broken fixture.",
        "utf8",
      );
      await writeFile(
        join(invalidFixtureDir, "reference-scenario.json"),
        "{ invalid json",
        "utf8",
      );

      await expect(
        execAsync(
          `${pnpmCommand} run demo:reference -- --scenario-dir "${missingFixtureDir}" --output-dir "${outputDir}"`,
          { cwd, timeout: 10_000 },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "Reference scenario fixture missing: missing-style-guide.md",
        ),
      });

      await expect(
        execAsync(
          `${pnpmCommand} run demo:reference -- --scenario-dir "${invalidFixtureDir}" --output-dir "${outputDir}"`,
          { cwd, timeout: 10_000 },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "Reference scenario fixture invalid: reference-scenario.json must be valid JSON",
        ),
      });
    } finally {
      await rm(missingFixtureDir, { recursive: true, force: true });
      await rm(invalidFixtureDir, { recursive: true, force: true });
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 20_000);
});
