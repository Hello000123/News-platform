import { describe, expect, it } from "vitest";

import {
  feedInputSchema,
  feedUpdateSchema,
  pipelineRewriteInputSchema,
  pipelineStatusUpdateSchema,
} from "@/lib/shared/feeds-contracts";

describe("feeds contracts", () => {
  it("accepts a valid feed input and normalises the URL", () => {
    const input = feedInputSchema.parse({
      name: "  World   News ",
      url: "https://feeds.example/world.xml#fragment",
    });
    expect(input.name).toBe("World News");
    expect(input.url).toBe("https://feeds.example/world.xml");
  });

  it("rejects invalid feed URLs", () => {
    expect(() =>
      feedInputSchema.parse({ name: "Bad", url: "not-a-url" }),
    ).toThrow();
  });

  it("rejects feeds with a control-character name", () => {
    expect(() =>
      feedInputSchema.parse({ name: "Bad\u0007name", url: "https://example.com/x" }),
    ).toThrow();
  });

  it("requires status for feed updates", () => {
    expect(() =>
      feedUpdateSchema.parse({
        name: "World News",
        url: "https://feeds.example/world.xml",
      }),
    ).toThrow();
    expect(
      feedUpdateSchema.parse({
        name: "World News",
        url: "https://feeds.example/world.xml",
        status: "paused",
      }).status,
    ).toBe("paused");
  });

  it("defaults pipeline rewrite instruction to empty and accepts length options", () => {
    const input = pipelineRewriteInputSchema.parse({ lengthOption: "concise" });
    expect(input.instruction).toBe("");
    expect(input.lengthOption).toBe("concise");
  });

  it("validates pipeline status transitions", () => {
    expect(pipelineStatusUpdateSchema.parse({ status: "approved" }).status).toBe(
      "approved",
    );
    expect(() =>
      pipelineStatusUpdateSchema.parse({ status: "rewritten" }),
    ).toThrow();
  });
});
