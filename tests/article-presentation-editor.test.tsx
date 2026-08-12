// @vitest-environment jsdom

import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ArticlePresentationEditorProvider,
  ArticlePresentationImage,
  ArticlePresentationText,
} from "@/components/news/article-presentation-editor";
import {
  applyArticleTextStyle,
  createDefaultArticlePresentation,
  replaceArticleText,
} from "@/lib/shared/article-presentation";

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
  updatePublicPagePresentation: vi.fn(),
}));

function renderEditor(text = "Editable title") {
  const presentation = createDefaultArticlePresentation(10, [
    { id: "title", text },
  ]);
  render(
    <ArticlePresentationEditorProvider
      articleId="article-1"
      editMode
      initialDraft={presentation}
      initialPublished={presentation}
    >
      <h1>
        <ArticlePresentationText blockId="title" text={text} />
      </h1>
      <ArticlePresentationImage src="/image.webp" alt="Article hero" />
    </ArticlePresentationEditorProvider>,
  );
}

function selectText(element: HTMLElement, start: number, end: number) {
  const text = element.querySelector("span")?.firstChild;
  if (!(text instanceof Text)) throw new Error("Expected an editable text node.");
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(element);
}

describe("restricted article presentation editor", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("offers the complete Word-like Home ribbon and enables it for selected text", async () => {
    const user = userEvent.setup();
    renderEditor();

    const textbox = screen.getByRole("textbox", { name: "Editable title" });
    expect(textbox.getAttribute("contenteditable")).toBe("plaintext-only");
    for (const control of [
      "Font",
      "Font size",
      "Change case",
    ]) {
      expect(screen.getByRole("combobox", { name: control })).toBeTruthy();
    }
    for (const control of [
      "Increase font size",
      "Decrease font size",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Subscript",
      "Superscript",
    ]) {
      expect(screen.getByRole("button", { name: control })).toBeTruthy();
    }
    expect(screen.getByLabelText("Text highlight colour")).toBeTruthy();
    expect(screen.getByLabelText("Font colour")).toBeTruthy();
    expect(screen.getByLabelText("Text highlight colour HEX or RGB")).toBeTruthy();
    expect(screen.getByLabelText("Font colour HEX or RGB")).toBeTruthy();

    selectText(textbox, 0, 8);
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold.hasAttribute("disabled")).toBe(false);
    await user.click(bold);

    expect(bold.getAttribute("aria-pressed")).toBe("true");
    expect((textbox.querySelector("span") as HTMLElement).style.fontWeight).toBe("700");

    fireEvent.change(screen.getByLabelText("Text highlight colour"), {
      target: { value: "#ffcc00" },
    });
    fireEvent.change(screen.getByLabelText("Font colour"), {
      target: { value: "#245b88" },
    });
    const formattedText = textbox.querySelector("span") as HTMLElement;
    expect(formattedText.style.backgroundColor).toBe("rgb(255, 204, 0)");
    expect(formattedText.style.color).toBe("rgb(36, 91, 136)");
    expect(screen.getByRole("button", { name: "Save Changes" }).hasAttribute("disabled")).toBe(false);
  });

  it("accepts typed HEX and RGB colours for selected text", () => {
    renderEditor();
    const textbox = screen.getByRole("textbox", { name: "Editable title" });
    selectText(textbox, 0, 8);

    const highlight = screen.getByLabelText("Text highlight colour HEX or RGB");
    fireEvent.change(highlight, { target: { value: "rgb(12, 34, 56)" } });
    fireEvent.blur(highlight);
    const font = screen.getByLabelText("Font colour HEX or RGB");
    fireEvent.change(font, { target: { value: "#abcdef" } });
    fireEvent.blur(font);

    const formattedText = textbox.querySelector("span") as HTMLElement;
    expect(formattedText.style.backgroundColor).toBe("rgb(12, 34, 56)");
    expect(formattedText.style.color).toBe("rgb(171, 205, 239)");
  });

  it("edits words in place and supports Ctrl+Z undo plus Ctrl+Y redo", async () => {
    renderEditor("Original title");
    const textbox = screen.getByRole("textbox", { name: "Editable title" });
    const textNode = textbox.querySelector("span")?.firstChild;
    if (!(textNode instanceof Text)) throw new Error("Expected an editable text node.");

    textNode.data = "Edited title";
    fireEvent.input(textbox);
    await waitFor(() => expect(textbox.textContent).toBe("Edited title"));
    expect(screen.getByRole("button", { name: "Undo" }).hasAttribute("disabled")).toBe(false);

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    await waitFor(() => expect(textbox.textContent).toBe("Original title"));
    expect(screen.getByRole("button", { name: "Redo" }).hasAttribute("disabled")).toBe(false);

    fireEvent.keyDown(document, { key: "y", ctrlKey: true });
    await waitFor(() => expect(textbox.textContent).toBe("Edited title"));
  });

  it("asks for confirmation before discarding all unsaved changes", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderEditor("Original title");
    const textbox = screen.getByRole("textbox", { name: "Editable title" });
    const textNode = textbox.querySelector("span")?.firstChild;
    if (!(textNode instanceof Text)) throw new Error("Expected an editable text node.");
    textNode.data = "Unsaved title";
    fireEvent.input(textbox);

    const discard = screen.getByRole("button", { name: "Discard Change" });
    expect(discard.hasAttribute("disabled")).toBe(false);
    await user.click(discard);
    expect(textbox.textContent).toBe("Unsaved title");
    await user.click(discard);

    expect(confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(textbox.textContent).toBe("Original title"));
    expect(discard.hasAttribute("disabled")).toBe(true);
  });

  it("uses Home and End with Shift to select to the block boundaries", () => {
    renderEditor("Boundary title");
    const textbox = screen.getByRole("textbox", { name: "Editable title" });

    selectText(textbox, "Boundary title".length, "Boundary title".length);
    fireEvent.keyDown(textbox, { key: "Home", shiftKey: true });
    expect(window.getSelection()?.toString()).toBe("Boundary title");
    expect(screen.getByRole("button", { name: "Bold" }).hasAttribute("disabled")).toBe(false);

    fireEvent.keyDown(textbox, { key: "Home" });
    fireEvent.keyDown(textbox, { key: "End", shiftKey: true });
    expect(window.getSelection()?.toString()).toBe("Boundary title");
  });

  it("changes selected text case without replacing or moving its locked block", async () => {
    const user = userEvent.setup();
    renderEditor("Mixed case title");
    const textbox = screen.getByRole("textbox", { name: "Editable title" });
    selectText(textbox, 0, 10);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Change case" }),
      "upper",
    );
    await waitFor(() => expect(textbox.textContent).toBe("MIXED CASE title"));
    expect(document.querySelectorAll("[data-presentation-block='title']")).toHaveLength(1);
  });

  it("resizes only the selected image and reveals a drag handle on double-click", async () => {
    const user = userEvent.setup();
    renderEditor();

    const save = screen.getByRole("button", { name: "Save Changes" });
    const publish = screen.getByRole("button", { name: "Publish" });
    const smaller = screen.getByRole("button", { name: "Make image smaller" });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(publish.hasAttribute("disabled")).toBe(true);
    expect(smaller.hasAttribute("disabled")).toBe(true);

    const image = screen.getByRole("button", {
      name: /Double-click to show the resize handle/u,
    });
    await user.click(image);
    expect(smaller.hasAttribute("disabled")).toBe(false);
    await user.click(smaller);

    const frame = image.closest(".news-presentation-image-frame") as HTMLElement;
    expect(frame.style.width).toBe("90%");
    expect(save.hasAttribute("disabled")).toBe(false);
    expect(publish.hasAttribute("disabled")).toBe(false);
    const size = screen.getByRole("spinbutton", { name: "Picture size percentage" });
    expect((size as HTMLInputElement).value).toBe("90");

    fireEvent.change(size, { target: { value: "65" } });
    fireEvent.blur(size);
    expect(frame.style.width).toBe("65%");

    await user.dblClick(image);
    expect(screen.getByRole("button", { name: "Drag to resize image" })).toBeTruthy();
  });

  it("supports freeform drag geometry and Ctrl-constrained original aspect ratio", async () => {
    const user = userEvent.setup();
    renderEditor();
    const image = screen.getByRole("button", {
      name: /Double-click to show the resize handle/u,
    }) as HTMLImageElement;
    await user.dblClick(image);
    const frame = image.closest(".news-presentation-image-frame") as HTMLElement;
    const parent = frame.parentElement as HTMLElement;
    Object.defineProperty(frame, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 800, height: 500 }),
    });
    Object.defineProperty(parent, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 1000, height: 700 }),
    });
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 1200 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 800 });
    const handle = screen.getByRole("button", { name: "Drag to resize image" });

    fireEvent.pointerDown(handle, { clientX: 800, clientY: 500 });
    fireEvent.pointerMove(window, { clientX: 700, clientY: 650 });
    fireEvent.pointerUp(window);
    await waitFor(() => expect(frame.style.width).toBe("70%"));
    expect(Number.parseFloat(frame.style.aspectRatio)).toBeCloseTo(1.077, 2);
    expect(image.style.objectFit).toBe("fill");

    fireEvent.pointerDown(handle, { clientX: 800, clientY: 500 });
    fireEvent.pointerMove(window, {
      clientX: 600,
      clientY: 850,
      ctrlKey: true,
    });
    fireEvent.pointerUp(window);
    await waitFor(() => expect(frame.style.width).toBe("60%"));
    expect(Number.parseFloat(frame.style.aspectRatio)).toBeCloseTo(1.5, 2);
  });

  it("renders published wording, rich formatting, and image geometry without editing controls", () => {
    const initial = createDefaultArticlePresentation(10, [
      { id: "title", text: "Source title" },
    ]);
    const edited = replaceArticleText(initial, "title", 0, 6, "Published");
    const formatted = applyArticleTextStyle(edited, "title", 0, 9, {
      bold: true,
      italic: true,
      underline: true,
      highlightColor: "#fff59d",
      fontColor: "#245b88",
    });
    const presentation = {
      ...formatted,
      imageScalePercent: 60,
      imageAspectRatio: 1.25,
    };
    const { container } = render(
      <ArticlePresentationEditorProvider
        articleId="article-1"
        editMode={false}
        initialDraft={presentation}
        initialPublished={presentation}
      >
        <h1>
          <ArticlePresentationText blockId="title" text="Source title" />
        </h1>
        <ArticlePresentationImage src="/image.webp" alt="Article hero" />
      </ArticlePresentationEditorProvider>,
    );

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Published title" })).toBeTruthy();
    const frame = container.querySelector(".news-presentation-image-frame") as HTMLElement;
    expect(frame.style.width).toBe("60%");
    expect(frame.style.aspectRatio).toContain("1.25");
    expect((screen.getByAltText("Article hero") as HTMLImageElement).style.objectFit).toBe(
      "fill",
    );
    const formattedText = screen.getByText("Published");
    expect(formattedText.getAttribute("style")).toContain("font-weight: 700");
    expect(formattedText.getAttribute("style")).toContain("background-color: rgb(255, 245, 157)");
  });

  it("switches from a private draft to the published presentation when edit mode exits", async () => {
    const published = createDefaultArticlePresentation(10, [
      { id: "title", text: "Published title" },
    ]);
    const draft = replaceArticleText(
      published,
      "title",
      0,
      "Published".length,
      "Private draft",
    );
    const view = (editMode: boolean) => (
      <ArticlePresentationEditorProvider
        key={editMode ? "edit" : "read"}
        articleId="article-1"
        editMode={editMode}
        initialDraft={draft}
        initialPublished={published}
      >
        <h1>
          <ArticlePresentationText blockId="title" text="Published title" />
        </h1>
      </ArticlePresentationEditorProvider>
    );
    const { rerender } = render(view(true));

    expect(screen.getByRole("textbox", { name: "Editable title" }).textContent).toBe(
      "Private draft title",
    );
    rerender(view(false));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Published title" })).toBeTruthy(),
    );
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});
