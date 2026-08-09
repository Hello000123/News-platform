import { csrfHeaders } from "@/lib/client/auth-api";
import type { ArticlePresentation } from "@/lib/shared/article-presentation";

export class ArticlePresentationRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ArticlePresentationRequestError";
  }
}

interface ArticlePresentationUpdateResponse {
  presentation: ArticlePresentation;
  savedAt: number;
  publishedAt: number | null;
  hasUnpublishedChanges: boolean;
}

export async function updateArticlePresentation(
  articleId: string,
  action: "save" | "publish",
  presentation: ArticlePresentation,
) {
  const response = await fetch(
    `/api/employee/articles/${encodeURIComponent(articleId)}/presentation`,
    {
      method: "PATCH",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...csrfHeaders(),
      },
      body: JSON.stringify({ action, presentation }),
    },
  );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ArticlePresentationRequestError(
      "INVALID_SERVER_RESPONSE",
      "The server returned an unreadable response.",
      response.status,
    );
  }
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } }).error;
    throw new ArticlePresentationRequestError(
      error?.code ?? "ARTICLE_PRESENTATION_UPDATE_FAILED",
      error?.message ?? "The article presentation could not be saved.",
      response.status,
    );
  }
  return body as ArticlePresentationUpdateResponse;
}
