"use client";

import Link from "next/link";
import {
  createContext,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArticlePresentationRequestError,
  updateArticlePresentation,
} from "@/lib/client/article-presentation-api";
import {
  applyArticleTextStyle,
  ARTICLE_IMAGE_MAX_SCALE_PERCENT,
  ARTICLE_IMAGE_MIN_SCALE_PERCENT,
  ARTICLE_IMAGE_SCALE_STEP,
  ARTICLE_PRESENTATION_FONT_FAMILIES,
  ARTICLE_PRESENTATION_FONT_SIZES,
  articlePresentationFingerprint,
  type ArticlePresentation,
  type ArticlePresentationFontFamily,
  type ArticlePresentationFontSize,
  type ArticlePresentationStylePatch,
} from "@/lib/shared/article-presentation";

type EditorSelection =
  | { kind: "text"; blockId: string; start: number; end: number }
  | { kind: "image" }
  | null;

interface ArticlePresentationEditorContextValue {
  editMode: boolean;
  presentation: ArticlePresentation;
  selection: EditorSelection;
  captureTextSelection: (blockId: string, element: HTMLElement) => void;
  selectImage: () => void;
  applyStyle: (patch: ArticlePresentationStylePatch) => void;
  resizeImage: (direction: -1 | 1) => void;
}

const ArticlePresentationEditorContext =
  createContext<ArticlePresentationEditorContextValue | null>(null);

function useArticlePresentationEditor() {
  const value = useContext(ArticlePresentationEditorContext);
  if (!value) {
    throw new Error("Article presentation controls require their editor provider.");
  }
  return value;
}

function selectionOffsets(container: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }
  const beforeStart = document.createRange();
  beforeStart.selectNodeContents(container);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = document.createRange();
  beforeEnd.selectNodeContents(container);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  const start = beforeStart.toString().length;
  const end = beforeEnd.toString().length;
  return start < end ? { start, end } : { start: end, end: start };
}

export function ArticlePresentationEditorProvider({
  articleId,
  editMode,
  initialDraft,
  initialPublished,
  children,
}: {
  articleId: string;
  editMode: boolean;
  initialDraft: ArticlePresentation;
  initialPublished: ArticlePresentation;
  children: ReactNode;
}) {
  const initialPresentation = editMode ? initialDraft : initialPublished;
  const [presentation, setPresentation] = useState(initialPresentation);
  const [savedPresentation, setSavedPresentation] = useState(initialDraft);
  const [publishedPresentation, setPublishedPresentation] =
    useState(initialPublished);
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [busyAction, setBusyAction] = useState<"save" | "publish" | null>(null);
  const [status, setStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const allowNavigationRef = useRef(false);

  const dirty =
    articlePresentationFingerprint(presentation) !==
    articlePresentationFingerprint(savedPresentation);
  const hasUnpublishedChanges =
    articlePresentationFingerprint(presentation) !==
    articlePresentationFingerprint(publishedPresentation);

  useEffect(() => {
    if (!editMode || !dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const confirmLinkNavigation = (event: MouseEvent) => {
      if (allowNavigationRef.current || event.defaultPrevented) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      if (
        window.confirm(
          "You have unsaved presentation changes. Leave this page and discard them?",
        )
      ) {
        allowNavigationRef.current = true;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", confirmLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", confirmLinkNavigation, true);
    };
  }, [dirty, editMode]);

  function captureTextSelection(blockId: string, element: HTMLElement) {
    if (!editMode) return;
    const offsets = selectionOffsets(element);
    if (!offsets || offsets.start === offsets.end) return;
    setSelection({ kind: "text", blockId, ...offsets });
    setStatus("Text selected. Choose a font family or size from the toolbar.");
  }

  function applyStyle(patch: ArticlePresentationStylePatch) {
    if (selection?.kind !== "text") return;
    setPresentation((current) =>
      applyArticleTextStyle(
        current,
        selection.blockId,
        selection.start,
        selection.end,
        patch,
      ),
    );
    setErrorMessage("");
    setStatus("Formatting changed. Save or publish when ready.");
  }

  function resizeImage(direction: -1 | 1) {
    if (selection?.kind !== "image") return;
    setPresentation((current) => ({
      ...current,
      imageScalePercent: Math.min(
        ARTICLE_IMAGE_MAX_SCALE_PERCENT,
        Math.max(
          ARTICLE_IMAGE_MIN_SCALE_PERCENT,
          current.imageScalePercent + direction * ARTICLE_IMAGE_SCALE_STEP,
        ),
      ),
    }));
    setErrorMessage("");
    setStatus("Image size changed. Save or publish when ready.");
  }

  async function persist(action: "save" | "publish") {
    if (busyAction || (action === "save" && !dirty)) return;
    setBusyAction(action);
    setErrorMessage("");
    setStatus("");
    try {
      const result = await updateArticlePresentation(
        articleId,
        action,
        presentation,
      );
      setPresentation(result.presentation);
      setSavedPresentation(result.presentation);
      if (action === "publish") setPublishedPresentation(result.presentation);
      setStatus(
        action === "publish"
          ? "Presentation published. The saved version is now live."
          : result.hasUnpublishedChanges
            ? "Changes saved as a draft. The public article is unchanged."
            : "Changes saved.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof ArticlePresentationRequestError
          ? error.message
          : "The article presentation could not be saved. Try again.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  const context: ArticlePresentationEditorContextValue = {
    editMode,
    presentation,
    selection,
    captureTextSelection,
    selectImage: () => {
      if (!editMode) return;
      setSelection({ kind: "image" });
      setStatus("Hero image selected. Use the toolbar to resize it.");
    },
    applyStyle,
    resizeImage,
  };

  return (
    <ArticlePresentationEditorContext.Provider value={context}>
      {editMode ? (
        <section
          className="news-presentation-editor news-v1-page-shell"
          aria-label="Restricted article presentation editor"
        >
          <div className="news-presentation-actions">
            <Link className="news-presentation-exit" href={`/news/${encodeURIComponent(articleId)}`}>
              Exit editing
            </Link>
            <button
              className="news-presentation-button news-presentation-button-secondary"
              type="button"
              disabled={Boolean(busyAction) || !dirty}
              onClick={() => void persist("save")}
            >
              {busyAction === "save" ? "Saving…" : "Save Changes"}
            </button>
            <button
              className="news-presentation-button news-presentation-button-primary"
              type="button"
              disabled={
                Boolean(busyAction) || (!dirty && !hasUnpublishedChanges)
              }
              onClick={() => void persist("publish")}
            >
              {busyAction === "publish" ? "Publishing…" : "Publish"}
            </button>
          </div>
          <div
            className="news-presentation-toolbar"
            role="toolbar"
            aria-label="Article formatting"
          >
            <label>
              <span>Font family</span>
              <select
                defaultValue=""
                disabled={selection?.kind !== "text" || Boolean(busyAction)}
                onChange={(event) => {
                  const value = event.target.value;
                  applyStyle({
                    fontFamily:
                      value === ""
                        ? null
                        : (value as ArticlePresentationFontFamily),
                  });
                }}
              >
                <option value="">Article default</option>
                {ARTICLE_PRESENTATION_FONT_FAMILIES.filter(
                  (family) => family !== "default",
                ).map((family) => (
                  <option value={family} key={family}>
                    {family === "sans" ? "Sans serif" : `${family[0].toUpperCase()}${family.slice(1)}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Font size</span>
              <select
                defaultValue=""
                disabled={selection?.kind !== "text" || Boolean(busyAction)}
                onChange={(event) =>
                  applyStyle({
                    fontSize: event.target.value
                      ? (Number(event.target.value) as ArticlePresentationFontSize)
                      : null,
                  })
                }
              >
                <option value="">Article default</option>
                {ARTICLE_PRESENTATION_FONT_SIZES.map((size) => (
                  <option value={size} key={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
            <div className="news-presentation-image-controls" aria-label="Selected image size">
              <button
                type="button"
                disabled={
                  selection?.kind !== "image" ||
                  presentation.imageScalePercent <= ARTICLE_IMAGE_MIN_SCALE_PERCENT ||
                  Boolean(busyAction)
                }
                onClick={() => resizeImage(-1)}
              >
                Smaller image
              </button>
              <output aria-live="polite">{presentation.imageScalePercent}%</output>
              <button
                type="button"
                disabled={
                  selection?.kind !== "image" ||
                  presentation.imageScalePercent >= ARTICLE_IMAGE_MAX_SCALE_PERCENT ||
                  Boolean(busyAction)
                }
                onClick={() => resizeImage(1)}
              >
                Larger image
              </button>
            </div>
          </div>
          <p className="news-presentation-help">
            Select article text to change its type. Select the hero image to resize it.
            Article blocks and page layout are locked.
          </p>
          {status ? (
            <p className="news-presentation-status" role="status">
              {status}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="news-presentation-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>
      ) : null}
      {children}
    </ArticlePresentationEditorContext.Provider>
  );
}

function segmentStyle(
  fontFamily: ArticlePresentationFontFamily | null,
  fontSize: number | null,
): CSSProperties {
  const family =
    fontFamily === "serif"
      ? "var(--serif)"
      : fontFamily === "sans"
        ? "var(--sans)"
        : fontFamily === "monospace"
          ? "ui-monospace, SFMono-Regular, Consolas, monospace"
          : undefined;
  return {
    ...(family ? { fontFamily: family } : {}),
    ...(fontSize ? { fontSize: `min(${fontSize}px, 12vw)` } : {}),
  };
}

export function ArticlePresentationText({
  blockId,
  text,
}: {
  blockId: string;
  text: string;
}) {
  const editor = useArticlePresentationEditor();
  const block = editor.presentation.blocks.find((item) => item.id === blockId);
  const segments =
    block && block.segments.map((segment) => segment.text).join("") === text
      ? block.segments
      : [{ text, fontFamily: null, fontSize: null }];
  const selected =
    editor.selection?.kind === "text" && editor.selection.blockId === blockId;
  return (
    <span
      className={
        "news-presentation-text" +
        (editor.editMode ? " news-presentation-text-editable" : "") +
        (selected ? " news-presentation-text-selected" : "")
      }
      data-presentation-block={blockId}
      onMouseUp={(event) =>
        editor.captureTextSelection(blockId, event.currentTarget)
      }
      onKeyUp={(event) =>
        editor.captureTextSelection(blockId, event.currentTarget)
      }
      tabIndex={editor.editMode ? 0 : undefined}
    >
      {segments.map((segment, index) => (
        <span
          style={segmentStyle(segment.fontFamily, segment.fontSize)}
          key={`${index}-${segment.text.slice(0, 24)}`}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
}

export function ArticlePresentationImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const editor = useArticlePresentationEditor();
  const selected = editor.selection?.kind === "image";
  function handleKeyDown(event: KeyboardEvent<HTMLImageElement>) {
    if (!editor.editMode || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    editor.selectImage();
  }
  return (
    // Arbitrary editor-supplied hosts cannot be safely enumerated in Next image remotePatterns.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={
        "news-presentation-image" +
        (editor.editMode ? " news-presentation-image-editable" : "") +
        (selected ? " news-presentation-image-selected" : "")
      }
      src={src}
      width={1200}
      height={675}
      alt={alt}
      loading="eager"
      fetchPriority="high"
      role={editor.editMode ? "button" : undefined}
      tabIndex={editor.editMode ? 0 : undefined}
      aria-pressed={editor.editMode ? selected : undefined}
      aria-label={
        editor.editMode
          ? `${alt}. Select this image for resizing.`
          : undefined
      }
      style={{ width: `${editor.presentation.imageScalePercent}%` }}
      onClick={editor.editMode ? editor.selectImage : undefined}
      onKeyDown={handleKeyDown}
    />
  );
}
