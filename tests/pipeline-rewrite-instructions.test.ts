import { describe, expect, it } from "vitest";

import {
  COMBINED_PIPELINE_REWRITE_INSTRUCTION,
  formatSupportingReportPrompt,
  PIPELINE_REWRITE_FIDELITY_INSTRUCTION,
  POPULAR_PIPELINE_REWRITE_INSTRUCTION,
} from "@/lib/shared/pipeline-rewrite-instructions";

describe("pipeline rewrite instructions", () => {
  it("keeps every authored pipeline instruction in Traditional Chinese", () => {
    for (const instruction of [
      POPULAR_PIPELINE_REWRITE_INSTRUCTION,
      COMBINED_PIPELINE_REWRITE_INSTRUCTION,
      PIPELINE_REWRITE_FIDELITY_INSTRUCTION,
    ]) {
      expect(instruction).toMatch(/\p{Script=Han}/u);
      expect(instruction).not.toMatch(/[A-Za-z]/u);
    }
  });

  it("uses Chinese labels while preserving supporting-report data verbatim", () => {
    const prompt = formatSupportingReportPrompt(
      {
        feedName: "科技日報",
        title: "Company X 公布新服務",
        url: "https://news.example/report",
      },
      "Original supporting report text.",
      2,
    );

    expect(prompt).toContain("相關報道 2 — 科技日報");
    expect(prompt).toContain("標題：Company X 公布新服務");
    expect(prompt).toContain("來源網址：https://news.example/report");
    expect(prompt).toContain("Original supporting report text.");
    expect(prompt).not.toContain("RELATED REPORT");
    expect(prompt).not.toContain("Headline:");
    expect(prompt).not.toContain("Source URL:");
  });
});
