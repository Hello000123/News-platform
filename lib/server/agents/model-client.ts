import {
  deepSeekPublicDiagnostics,
  requestDeepSeekCompletion,
} from "@/lib/server/agents/deepseek-client";
import {
  grokPublicDiagnostics,
  requestGrokCompletion,
  type CompletionRequest,
  type CompletionStage,
} from "@/lib/server/agents/grok-client";
import { AppError } from "@/lib/server/errors";
import {
  DEFAULT_SELECTABLE_MODEL,
  isSelectableModelId,
  type SelectableModelId,
} from "@/lib/shared/models";

export type { CompletionRequest, CompletionStage };

const MAX_MODEL_COMPLETION_ATTEMPTS = 2;
const MODEL_COMPLETION_RETRY_DELAY_MS = 500;
const TRANSIENT_MODEL_ERROR_CODES = new Set([
  "XAI_NETWORK_ERROR",
  "XAI_RATE_LIMIT",
  "XAI_UNAVAILABLE",
  "DEEPSEEK_NETWORK_ERROR",
  "DEEPSEEK_RATE_LIMIT",
  "DEEPSEEK_UNAVAILABLE",
  "MALFORMED_AI_RESPONSE",
  "EMPTY_AI_RESPONSE",
]);

function selectedModel(model?: SelectableModelId) {
  return model ?? DEFAULT_SELECTABLE_MODEL;
}

export function modelPublicDiagnostics(
  stage: CompletionStage,
  httpStatus: number,
  causeSummary: string,
  retryable: boolean,
  model?: SelectableModelId,
) {
  return selectedModel(model) === "deepseek-v4-pro"
    ? deepSeekPublicDiagnostics(stage, httpStatus, causeSummary, retryable)
    : grokPublicDiagnostics(stage, httpStatus, causeSummary, retryable, "grok-4.5");
}

export async function requestModelCompletion(request: CompletionRequest) {
  const model = selectedModel(request.model);
  if (!isSelectableModelId(model)) {
    throw new AppError(
      "UNSUPPORTED_MODEL",
      "Unsupported AI model. Choose DeepSeek V4 Pro or Grok 4.5.",
      400,
      {
        publicDetails: {
          stage: request.stage,
          model: String(model),
          retryable: false,
        },
      },
    );
  }

  for (let attempt = 1; attempt <= MAX_MODEL_COMPLETION_ATTEMPTS; attempt += 1) {
    try {
      if (model === "deepseek-v4-pro") {
        return await requestDeepSeekCompletion({ ...request, model });
      }
      return await requestGrokCompletion({ ...request, model: "grok-4.5" });
    } catch (error) {
      const retryableIncompleteResponse =
        error instanceof AppError &&
        error.code === "INCOMPLETE_AI_RESPONSE" &&
        /inference capacity|system resource/iu.test(error.publicDetails?.causeSummary ?? "");
      const retryable =
        error instanceof AppError &&
        error.publicDetails?.retryable === true &&
        (TRANSIENT_MODEL_ERROR_CODES.has(error.code) || retryableIncompleteResponse);
      if (!retryable || attempt === MAX_MODEL_COMPLETION_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, MODEL_COMPLETION_RETRY_DELAY_MS));
    }
  }

  throw new Error("Unreachable model completion state.");
}
