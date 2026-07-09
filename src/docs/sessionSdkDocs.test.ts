import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("headless session SDK documentation", () => {
  it("documents how CLI, web, and LangGraph integrations depend on the SDK", async () => {
    const [readme, sdkDoc] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/headless-session-sdk.md", "utf8"),
    ]);

    expect(readme).toContain("Headless Session SDK");
    expect(readme).toContain("docs/headless-session-sdk.md");

    expect(sdkDoc).toContain("# Headless Correction Session SDK");
    expect(sdkDoc).toContain("createCorrectionSession");
    expect(sdkDoc).toContain("CLI integration");
    expect(sdkDoc).toContain("Web integration");
    expect(sdkDoc).toContain("LangGraph integration");
    expect(sdkDoc).toContain("session.receive(input)");
    expect(sdkDoc).toContain("session.runUntilSettled()");
    expect(sdkDoc).toContain("session.emit()");
    expect(sdkDoc).toContain("session.snapshot()");
    expect(sdkDoc).toContain("session.subscribe(listener)");
    expect(sdkDoc).toContain("session.reset()");
    expect(sdkDoc).toContain("session.dispose()");
    expect(sdkDoc).toContain("The SDK must not import HTTP, DOM, React, Vue, or CLI argument parsing");
    expect(sdkDoc).toContain("Provider and model selection stay outside the SDK");
    expect(sdkDoc).toContain("LangGraph state must stay serializable");
    expect(sdkDoc).toContain("Do not store live signal objects");
  });
});
