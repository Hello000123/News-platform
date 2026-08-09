import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/server/errors";
import { errorResponse } from "@/lib/server/http";
import { apiErrorResponseSchema } from "@/lib/shared/contracts";

describe("rewrite debug HTTP correlation", () => {
  it("adds a persisted debug ID without replacing the original public error", async () => {
    const response = errorResponse(
      new AppError(
        "REWRITE_LANGUAGE_MISMATCH",
        "The rewrite did not use Traditional Chinese.",
        422,
        { publicDetails: { retryable: true, attempts: 3 } },
      ),
      { debugId: "debug-log-123" },
    );
    const body = apiErrorResponseSchema.parse(await response.json());

    expect(response.status).toBe(422);
    expect(body.error).toMatchObject({
      code: "REWRITE_LANGUAGE_MISMATCH",
      message: "The rewrite did not use Traditional Chinese.",
      retryable: true,
      attempts: 3,
      debugId: "debug-log-123",
    });
  });
});
