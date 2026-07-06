import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createArtifactBundleManifest,
  serializeArtifactBundleManifest,
} from "../artifacts/artifactBundleManifest.js";
import { loadArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import { createEvidenceReportViewModel } from "../report/createEvidenceReportViewModel.js";
import { renderEvidenceReportHtml } from "../report/renderEvidenceReportHtml.js";

async function main() {
  const outputDir = resolve(process.cwd(), ".output");
  const bundle = await loadReportBundle(outputDir);
  const reportHtml = renderEvidenceReportHtml(
    createEvidenceReportViewModel(bundle),
  );
  const manifest = createArtifactBundleManifest({
    command: "demo:report",
    mode: "report",
    provider: bundle.manifest.run.provider,
    artifacts: {
      ...bundle.manifest.artifacts,
      report: {
        path: "report.html",
        mediaType: "text/html",
        schema: null,
      },
    },
  });

  await Promise.all([
    writeFile(resolve(outputDir, "report.html"), reportHtml, "utf8"),
    writeFile(
      resolve(outputDir, "manifest.json"),
      serializeArtifactBundleManifest(manifest),
      "utf8",
    ),
  ]);

  console.log("Static evidence report written to:");
  console.log("- ./.output/report.html");
  console.log("- ./.output/manifest.json");
}

async function loadReportBundle(outputDir: string) {
  const manifestPath = resolve(outputDir, "manifest.json");

  try {
    return await loadArtifactBundle(outputDir);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT" && fileError.path === manifestPath) {
      throw new Error(
        'No artifact bundle found at ./.output/manifest.json. Run "pnpm run demo:compare" before "pnpm run demo:report".',
      );
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
