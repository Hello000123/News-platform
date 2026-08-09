// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ArticlePresentationEditorProvider,
  ArticlePresentationImage,
  ArticlePresentationText,
} from "@/components/news/article-presentation-editor";
import { createDefaultArticlePresentation } from "@/lib/shared/article-presentation";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/client/article-presentation-api", () => ({
  ArticlePresentationRequestError: class extends Error {},
  updateArticlePresentation: vi.fn(),
}));

describe("restricted article presentation editor", () => {
  afterEach(cleanup);

  it("keeps save disabled until a locked image resize changes presentation state", async () => {
    const user = userEvent.setup();
    const presentation = createDefaultArticlePresentation(10, [
      { id: "title", text: "Immutable title" },
    ]);
    render(
      <ArticlePresentationEditorProvider
        articleId="article-1"
        editMode
        initialDraft={presentation}
        initialPublished={presentation}
      >
        <h1>
          <ArticlePresentationText blockId="title" text="Immutable title" />
        </h1>
        <ArticlePresentationImage src="/image.webp" alt="Article hero" />
      </ArticlePresentationEditorProvider>,
    );

    const save = screen.getByRole("button", { name: "Save Changes" });
    const publish = screen.getByRole("button", { name: "Publish" });
    const smaller = screen.getByRole("button", { name: "Smaller image" });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(publish.hasAttribute("disabled")).toBe(true);
    expect(smaller.hasAttribute("disabled")).toBe(true);

    const image = screen.getByRole("button", {
      name: /Select this image for resizing/u,
    });
    await user.click(image);
    expect(smaller.hasAttribute("disabled")).toBe(false);
    await user.click(smaller);

    expect((image as HTMLImageElement).style.width).toBe("90%");
    expect(save.hasAttribute("disabled")).toBe(false);
    expect(publish.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("90%")).toBeTruthy();
  });

  it("renders published formatting without exposing editing controls", () => {
    const presentation = {
      ...createDefaultArticlePresentation(10, [
        { id: "title", text: "Published title" },
      ]),
      imageScalePercent: 60,
    };
    render(
      <ArticlePresentationEditorProvider
        articleId="article-1"
        editMode={false}
        initialDraft={presentation}
        initialPublished={presentation}
      >
        <h1>
          <ArticlePresentationText blockId="title" text="Published title" />
        </h1>
        <ArticlePresentationImage src="/image.webp" alt="Article hero" />
      </ArticlePresentationEditorProvider>,
    );

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.getByRole("img", { name: "Article hero" }).getAttribute("style")).toContain(
      "width: 60%",
    );
  });
});
