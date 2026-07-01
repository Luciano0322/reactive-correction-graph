import type { FinalResult } from "../schemas/correction.js";

export function renderResultMarkdown(result: FinalResult | undefined) {
  if (!result) return "# Reactive Correction Result\n\nNo final result emitted.\n";

  const summary = result.summary.map((item) => `- ${item}`).join("\n");
  const unresolved =
    result.unresolvedIssues.length > 0
      ? result.unresolvedIssues.map((item) => `- ${item}`).join("\n")
      : "- None";

  return [
    "# Reactive Correction Result",
    "",
    "## Revised Draft",
    "",
    result.revisedDraft,
    "",
    "## Correction Summary",
    "",
    summary,
    "",
    "## Unresolved Issues",
    "",
    unresolved,
    "",
  ].join("\n");
}
