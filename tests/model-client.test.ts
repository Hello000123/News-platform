import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requestModelCompletion,
  type CompletionRequest,
} from "@/lib/server/agents/model-client";

const baseRequest: CompletionRequest = {
  stage: "review_request",
  systemPrompt: "Return valid JSON.",
  userPrompt: "Review this draft.",
  responseFormat: "json",
  maxTokens: 1_000,
};

function completionResponse(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("model provider router", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects removed or arbitrary model identifiers before any provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const model of ["grok-4.3", "arbitrary-provider-model"]) {
      await expect(
        requestModelCompletion({
          ...baseRequest,
          model: model as CompletionRequest["model"],
        }),
      ).rejects.toMatchObject({
        code: "UNSUPPORTED_MODEL",
        status: 400,
        publicMessage: "Unsupported AI model. Choose DeepSeek V4 Pro or Grok 4.5.",
        publicDetails: {
          stage: "review_request",
          model,
          retryable: false,
        },
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries one transient provider failure and returns the completed rewrite", async () => {
    vi.useFakeTimers();
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_STREAM", "false");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "temporary" } }), {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(completionResponse("Recovered rewrite."));
    vi.stubGlobal("fetch", fetchMock);

    const completion = requestModelCompletion({
      ...baseRequest,
      stage: "rewrite_request",
      responseFormat: "text",
    });
    await vi.advanceTimersByTimeAsync(501);

    await expect(completion).resolves.toBe("Recovered rewrite.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
