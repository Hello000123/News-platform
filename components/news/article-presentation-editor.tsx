"use client";

import Link from "next/link";
import {
  createContext,
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";

import {
  ArticlePresentationRequestError,
  updateArticlePresentation,
} from "@/lib/client/article-presentation-api";
import {
  applyArticleTextStyle,
  ARTICLE_IMAGE_MAX_ASPECT_RATIO,
  ARTICLE_IMAGE_MAX_SCALE_PERCENT,
  ARTICLE_IMAGE_MIN_ASPECT_RATIO,
  ARTICLE_IMAGE_MIN_SCALE_PERCENT,
  ARTICLE_IMAGE_SCALE_STEP,
  ARTICLE_PRESENTATION_FONT_FAMILIES,
  ARTICLE_PRESENTATION_FONT_SIZES,
  articlePresentationBlockText,
  articlePresentationFingerprint,
  articlePresentationSelectionStyle,
  replaceArticleText,
  type ArticlePresentation,
  type ArticlePresentationFontFamily,
  type ArticlePresentationFontSize,
  type ArticlePresentationSegment,
  type ArticlePresentationStylePatch,
} from "@/lib/shared/article-presentation";

type TextSelection = {
  kind: "text";
  blockId: string;
  start: number;
  end: number;
  baseFontSize: number | null;
};

type EditorSelection = TextSelection | { kind: "image" } | null;
type SelectionOffsets = { start: number; end: number };
type ChangeCaseMode = "sentence" | "lower" | "upper" | "capitalize" | "toggle";

interface ArticlePresentationEditorContextValue {
  editMode: boolean;
  presentation: ArticlePresentation;
  selection: EditorSelection;
  captureTextSelection: (blockId: string, element: HTMLElement) => void;
  updateBlockText: (
    blockId: string,
    nextText: string,
    selectionAfterInput: SelectionOffsets | null,
  ) => void;
  replaceTextSelection: (
    blockId: string,
    start: number,
    end: number,
    replacement: string,
  ) => void;
  selectImage: () => void;
  applyStyle: (patch: ArticlePresentationStylePatch) => void;
  resizeImage: (direction: -1 | 1) => void;
  previewImageGeometry: (widthPercent: number, aspectRatio: number) => void;
  commitImageGeometry: () => void;
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

function selectionOffsets(container: HTMLElement): SelectionOffsets | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1) return null;
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
  return start <= end ? { start, end } : { start: end, end: start };
}

function findTextPoint(container: HTMLElement, requestedOffset: number) {
  const offset = Math.max(0, requestedOffset);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let lastTextNode: Text | null = null;
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    lastTextNode = textNode;
    if (remaining <= textNode.data.length) {
      return { node: textNode as Node, offset: remaining };
    }
    remaining -= textNode.data.length;
  }
  if (lastTextNode) {
    return { node: lastTextNode as Node, offset: lastTextNode.data.length };
  }
  return { node: container as Node, offset: 0 };
}

function textOffsetForPoint(
  container: HTMLElement,
  node: Node | null,
  nodeOffset: number,
) {
  if (!node || (!container.contains(node) && node !== container)) return null;
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, nodeOffset);
  return range.toString().length;
}

function moveSelectionToBlockBoundary(
  container: HTMLElement,
  boundary: "start" | "end",
  extend: boolean,
) {
  const browserSelection = window.getSelection();
  const currentOffset =
    textOffsetForPoint(
      container,
      browserSelection?.focusNode ?? null,
      browserSelection?.focusOffset ?? 0,
    ) ?? 0;
  const targetOffset = boundary === "start" ? 0 : container.textContent?.length ?? 0;
  const range = document.createRange();
  if (extend) {
    const start = findTextPoint(container, Math.min(currentOffset, targetOffset));
    const end = findTextPoint(container, Math.max(currentOffset, targetOffset));
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } else {
    const target = findTextPoint(container, targetOffset);
    range.setStart(target.node, target.offset);
    range.collapse(true);
  }
  browserSelection?.removeAllRanges();
  browserSelection?.addRange(range);
}

function restoreTextSelection(selection: TextSelection) {
  const container = Array.from(
    document.querySelectorAll<HTMLElement>("[data-presentation-block]"),
  ).find((candidate) => candidate.dataset.presentationBlock === selection.blockId);
  if (!container) return;
  const start = findTextPoint(container, selection.start);
  const end = findTextPoint(container, selection.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const browserSelection = window.getSelection();
  browserSelection?.removeAllRanges();
  browserSelection?.addRange(range);
  container.focus({ preventScroll: true });
}

function scheduleTextSelectionRestore(selection: TextSelection) {
  const schedule = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
  schedule(() => restoreTextSelection(selection));
}

function selectedComputedFontSize(container: HTMLElement) {
  const selection = window.getSelection();
  const node = selection?.rangeCount ? selection.getRangeAt(0).startContainer : null;
  const element =
    node instanceof Element ? node : node?.parentElement ?? container;
  const parsed = Number.parseFloat(window.getComputedStyle(element).fontSize);
  return Number.isFinite(parsed) ? parsed : null;
}

function textDifference(previous: string, next: string) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start += 1;
  }
  let suffix = 0;
  while (
    suffix < previous.length - start &&
    suffix < next.length - start &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
  ) {
    suffix += 1;
  }
  return {
    start,
    end: previous.length - suffix,
    replacement: next.slice(start, next.length - suffix),
  };
}

function changeTextCase(value: string, mode: ChangeCaseMode) {
  if (mode === "lower") return value.toLocaleLowerCase();
  if (mode === "upper") return value.toLocaleUpperCase();
  if (mode === "capitalize") {
    return value.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (match, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase()}`,
    );
  }
  if (mode === "toggle") {
    return Array.from(value, (character) => {
      const upper = character.toLocaleUpperCase();
      const lower = character.toLocaleLowerCase();
      return character === upper && character !== lower ? lower : upper;
    }).join("");
  }
  const lower = value.toLocaleLowerCase();
  return lower.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

function fontFamilyLabel(family: ArticlePresentationFontFamily) {
  const labels: Record<ArticlePresentationFontFamily, string> = {
    default: "Article default",
    pmingliu: "PMingLiU",
    "microsoft-jhenghei": "Microsoft JhengHei",
    serif: "Editorial serif",
    sans: "Sans serif",
    arial: "Arial",
    calibri: "Calibri",
    georgia: "Georgia",
    "times-new-roman": "Times New Roman",
    monospace: "Monospace",
  };
  return labels[family];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function RibbonButton({
  label,
  title,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="news-presentation-ribbon-button"
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ArticlePresentationEditorProvider({
  articleId,
  editMode,
  initialDraft,
  initialPublished,
  exitHref,
  editorLabel = "article",
  children,
}: {
  articleId: string;
  editMode: boolean;
  initialDraft: ArticlePresentation;
  initialPublished: ArticlePresentation;
  exitHref?: string;
  editorLabel?: string;
  children: ReactNode;
}) {
  const initialPresentation = editMode ? initialDraft : initialPublished;
  const [presentation, setPresentation] = useState(initialPresentation);
  const presentationRef = useRef(initialPresentation);
  const [savedPresentation, setSavedPresentation] = useState(initialDraft);
  const [publishedPresentation, setPublishedPresentation] =
    useState(initialPublished);
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [busyAction, setBusyAction] = useState<"save" | "publish" | null>(null);
  const [status, setStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [historyControls, setHistoryControls] = useState({
    canUndo: false,
    canRedo: false,
  });
  const allowNavigationRef = useRef(false);
  const historyRef = useRef<ArticlePresentation[]>([initialPresentation]);
  const historyIndexRef = useRef(0);

  const dirty =
    articlePresentationFingerprint(presentation) !==
    articlePresentationFingerprint(savedPresentation);
  const hasUnpublishedChanges =
    articlePresentationFingerprint(presentation) !==
    articlePresentationFingerprint(publishedPresentation);
  const textSelection = selection?.kind === "text" ? selection : null;
  const hasTextRange = Boolean(
    textSelection && textSelection.end > textSelection.start,
  );
  const selectionStyle = useMemo(
    () =>
      textSelection
        ? articlePresentationSelectionStyle(
            presentation,
            textSelection.blockId,
            textSelection.start,
            textSelection.end,
          )
        : null,
    [presentation, textSelection],
  );
  const { canUndo, canRedo } = historyControls;

  const setWithoutHistory = useCallback((next: ArticlePresentation) => {
    presentationRef.current = next;
    setPresentation(next);
  }, []);

  const recordPresentation = useCallback(
    (next: ArticlePresentation, nextSelection?: TextSelection | null) => {
      if (
        articlePresentationFingerprint(next) ===
        articlePresentationFingerprint(presentationRef.current)
      ) {
        return false;
      }
      const retained = historyRef.current.slice(0, historyIndexRef.current + 1);
      retained.push(next);
      historyRef.current = retained.slice(-100);
      historyIndexRef.current = historyRef.current.length - 1;
      setWithoutHistory(next);
      setHistoryControls({ canUndo: true, canRedo: false });
      if (nextSelection) {
        setSelection(nextSelection);
        scheduleTextSelectionRestore(nextSelection);
      }
      return true;
    },
    [setWithoutHistory],
  );

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0 || busyAction) return;
    historyIndexRef.current -= 1;
    setWithoutHistory(historyRef.current[historyIndexRef.current]);
    setSelection(null);
    setErrorMessage("");
    setStatus("Undid the last editing change.");
    setHistoryControls({
      canUndo: historyIndexRef.current > 0,
      canRedo: true,
    });
  }, [busyAction, setWithoutHistory]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1 || busyAction) return;
    historyIndexRef.current += 1;
    setWithoutHistory(historyRef.current[historyIndexRef.current]);
    setSelection(null);
    setErrorMessage("");
    setStatus("Redid the last editing change.");
    setHistoryControls({
      canUndo: true,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    });
  }, [busyAction, setWithoutHistory]);

  useEffect(() => {
    if (!editMode) return;
    const handleHistoryShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handleHistoryShortcut);
    return () => document.removeEventListener("keydown", handleHistoryShortcut);
  }, [editMode, redo, undo]);

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
    if (!offsets) return;
    const nextSelection: TextSelection = {
      kind: "text",
      blockId,
      ...offsets,
      baseFontSize: selectedComputedFontSize(element),
    };
    setSelection(nextSelection);
    if (offsets.end > offsets.start) {
      setStatus("Text selected. Choose a Home ribbon command or type to replace it.");
    }
  }

  function updateBlockText(
    blockId: string,
    nextText: string,
    selectionAfterInput: SelectionOffsets | null,
  ) {
    const normalizedText = nextText
      .replace(/\u00a0/gu, " ")
      .replace(/[\r\n\u2028\u2029]+/gu, " ");
    const previous = articlePresentationBlockText(presentationRef.current, blockId);
    if (previous === null || previous === normalizedText) return;
    const difference = textDifference(previous, normalizedText);
    const next = replaceArticleText(
      presentationRef.current,
      blockId,
      difference.start,
      difference.end,
      difference.replacement,
    );
    const caret = selectionAfterInput
      ? {
          kind: "text" as const,
          blockId,
          ...selectionAfterInput,
          baseFontSize: textSelection?.baseFontSize ?? null,
        }
      : null;
    if (recordPresentation(next, caret)) {
      setErrorMessage("");
      setStatus("Text changed. Save or publish when ready.");
    }
  }

  function replaceTextSelection(
    blockId: string,
    start: number,
    end: number,
    replacement: string,
  ) {
    const normalized = replacement
      .replace(/\u00a0/gu, " ")
      .replace(/[\r\n\u2028\u2029]+/gu, " ");
    const next = replaceArticleText(
      presentationRef.current,
      blockId,
      start,
      end,
      normalized,
    );
    const caret: TextSelection = {
      kind: "text",
      blockId,
      start: start + normalized.length,
      end: start + normalized.length,
      baseFontSize: textSelection?.baseFontSize ?? null,
    };
    if (recordPresentation(next, caret)) {
      setErrorMessage("");
      setStatus("Text changed. Save or publish when ready.");
    }
  }

  function applyStyle(patch: ArticlePresentationStylePatch) {
    if (!textSelection || textSelection.end <= textSelection.start) return;
    const next = applyArticleTextStyle(
      presentationRef.current,
      textSelection.blockId,
      textSelection.start,
      textSelection.end,
      patch,
    );
    if (recordPresentation(next, textSelection)) {
      setErrorMessage("");
      setStatus("Formatting changed. Save or publish when ready.");
    }
  }

  function adjustFontSize(direction: -1 | 1) {
    if (!textSelection || !hasTextRange) return;
    const current =
      typeof selectionStyle?.fontSize === "number"
        ? selectionStyle.fontSize
        : textSelection.baseFontSize ?? 16;
    const sizes = ARTICLE_PRESENTATION_FONT_SIZES as readonly number[];
    const nextSize =
      direction > 0
        ? sizes.find((size) => size > current)
        : [...sizes].reverse().find((size) => size < current);
    if (nextSize) applyStyle({ fontSize: nextSize as ArticlePresentationFontSize });
  }

  function applyCase(mode: ChangeCaseMode) {
    if (!textSelection || !hasTextRange) return;
    const blockText = articlePresentationBlockText(
      presentationRef.current,
      textSelection.blockId,
    );
    if (blockText === null) return;
    const replacement = changeTextCase(
      blockText.slice(textSelection.start, textSelection.end),
      mode,
    );
    const next = replaceArticleText(
      presentationRef.current,
      textSelection.blockId,
      textSelection.start,
      textSelection.end,
      replacement,
    );
    const nextSelection: TextSelection = {
      ...textSelection,
      end: textSelection.start + replacement.length,
    };
    if (recordPresentation(next, nextSelection)) {
      setErrorMessage("");
      setStatus("Text case changed. Save or publish when ready.");
    }
  }

  function resizeImage(direction: -1 | 1) {
    if (selection?.kind !== "image") return;
    const current = presentationRef.current;
    const next = {
      ...current,
      imageScalePercent: clamp(
        current.imageScalePercent + direction * ARTICLE_IMAGE_SCALE_STEP,
        ARTICLE_IMAGE_MIN_SCALE_PERCENT,
        ARTICLE_IMAGE_MAX_SCALE_PERCENT,
      ),
    };
    if (recordPresentation(next)) {
      setErrorMessage("");
      setStatus("Image width changed. Save or publish when ready.");
    }
  }

  function previewImageGeometry(widthPercent: number, aspectRatio: number) {
    setWithoutHistory({
      ...presentationRef.current,
      imageScalePercent: Math.round(
        clamp(
          widthPercent,
          ARTICLE_IMAGE_MIN_SCALE_PERCENT,
          ARTICLE_IMAGE_MAX_SCALE_PERCENT,
        ),
      ),
      imageAspectRatio: Number(
        clamp(
          aspectRatio,
          ARTICLE_IMAGE_MIN_ASPECT_RATIO,
          ARTICLE_IMAGE_MAX_ASPECT_RATIO,
        ).toFixed(3),
      ),
    });
  }

  function commitImageGeometry() {
    const currentHistory = historyRef.current[historyIndexRef.current];
    const current = presentationRef.current;
    if (
      articlePresentationFingerprint(currentHistory) !==
      articlePresentationFingerprint(current)
    ) {
      const retained = historyRef.current.slice(0, historyIndexRef.current + 1);
      retained.push(current);
      historyRef.current = retained.slice(-100);
      historyIndexRef.current = historyRef.current.length - 1;
      setHistoryControls({ canUndo: true, canRedo: false });
      setErrorMessage("");
      setStatus("Image resized. Save or publish when ready.");
    }
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
        presentationRef.current,
      );
      setWithoutHistory(result.presentation);
      historyRef.current[historyIndexRef.current] = result.presentation;
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
    updateBlockText,
    replaceTextSelection,
    selectImage: () => {
      if (!editMode) return;
      setSelection({ kind: "image" });
      setStatus("Image selected. Double-click it to reveal the drag handle.");
    },
    applyStyle,
    resizeImage,
    previewImageGeometry,
    commitImageGeometry,
  };

  const controlsDisabled = Boolean(busyAction);
  const textControlsDisabled = controlsDisabled || !hasTextRange;
  const imageSelected = selection?.kind === "image";
  const resolvedExitHref = exitHref ?? `/news/${encodeURIComponent(articleId)}`;

  return (
    <ArticlePresentationEditorContext.Provider value={context}>
      {editMode ? (
        <section
          className="news-presentation-editor"
          aria-label={`Restricted ${editorLabel} presentation editor`}
        >
          <div className="news-presentation-editor-inner news-v1-page-shell">
            <div className="news-presentation-actions">
              <div className="news-presentation-quick-actions" aria-label="Editing history">
                <RibbonButton
                  label="Undo"
                  title="Undo (Ctrl+Z)"
                  disabled={controlsDisabled || !canUndo}
                  onClick={undo}
                >
                  <span aria-hidden="true">↶</span>
                </RibbonButton>
                <RibbonButton
                  label="Redo"
                  title="Redo (Ctrl+Y)"
                  disabled={controlsDisabled || !canRedo}
                  onClick={redo}
                >
                  <span aria-hidden="true">↷</span>
                </RibbonButton>
              </div>
              <span className="news-presentation-home-tab">Home</span>
              <Link className="news-presentation-exit" href={resolvedExitHref}>
                Exit editing
              </Link>
              <button
                className="news-presentation-button news-presentation-button-secondary"
                type="button"
                disabled={controlsDisabled || !dirty}
                onClick={() => void persist("save")}
              >
                {busyAction === "save" ? "Saving…" : "Save Changes"}
              </button>
              <button
                className="news-presentation-button news-presentation-button-primary"
                type="button"
                disabled={controlsDisabled || (!dirty && !hasUnpublishedChanges)}
                onClick={() => void persist("publish")}
              >
                {busyAction === "publish" ? "Publishing…" : "Publish"}
              </button>
            </div>

            <div
              className="news-presentation-toolbar"
              role="toolbar"
              aria-label="Home text formatting ribbon"
            >
              <div className="news-presentation-ribbon-group news-presentation-font-group">
                <div className="news-presentation-font-row">
                  <label className="news-presentation-select-field">
                    <span className="sr-only">Font</span>
                    <select
                      aria-label="Font"
                      title="Font"
                      value={
                        selectionStyle?.fontFamily === undefined
                          ? "mixed"
                          : selectionStyle?.fontFamily ?? "default"
                      }
                      disabled={textControlsDisabled}
                      onChange={(event) =>
                        applyStyle({
                          fontFamily:
                            event.target.value === "default"
                              ? null
                              : (event.target.value as ArticlePresentationFontFamily),
                        })
                      }
                    >
                      {selectionStyle?.fontFamily === undefined ? (
                        <option value="mixed">Mixed fonts</option>
                      ) : null}
                      {ARTICLE_PRESENTATION_FONT_FAMILIES.map((family) => (
                        <option value={family} key={family}>
                          {fontFamilyLabel(family)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="news-presentation-size-field">
                    <span className="sr-only">Font size</span>
                    <select
                      aria-label="Font size"
                      title="Font size"
                      value={
                        typeof selectionStyle?.fontSize === "number"
                          ? selectionStyle.fontSize
                          : selectionStyle?.fontSize === undefined
                            ? "mixed"
                            : "default"
                      }
                      disabled={textControlsDisabled}
                      onChange={(event) =>
                        applyStyle({
                          fontSize:
                            event.target.value === "default"
                              ? null
                              : (Number(event.target.value) as ArticlePresentationFontSize),
                        })
                      }
                    >
                      {selectionStyle?.fontSize === undefined ? (
                        <option value="mixed">—</option>
                      ) : null}
                      <option value="default">Auto</option>
                      {ARTICLE_PRESENTATION_FONT_SIZES.map((size) => (
                        <option value={size} key={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <RibbonButton
                    label="Increase font size"
                    title="Increase font size"
                    disabled={textControlsDisabled}
                    onClick={() => adjustFontSize(1)}
                  >
                    <span className="news-presentation-grow" aria-hidden="true">A↑</span>
                  </RibbonButton>
                  <RibbonButton
                    label="Decrease font size"
                    title="Decrease font size"
                    disabled={textControlsDisabled}
                    onClick={() => adjustFontSize(-1)}
                  >
                    <span className="news-presentation-shrink" aria-hidden="true">A↓</span>
                  </RibbonButton>
                  <label className="news-presentation-case-field">
                    <span className="sr-only">Change case</span>
                    <select
                      aria-label="Change case"
                      title="Change case"
                      defaultValue=""
                      disabled={textControlsDisabled}
                      onChange={(event) => {
                        if (event.target.value) applyCase(event.target.value as ChangeCaseMode);
                        event.target.value = "";
                      }}
                    >
                      <option value="" disabled>Aa</option>
                      <option value="sentence">Sentence case</option>
                      <option value="lower">lowercase</option>
                      <option value="upper">UPPERCASE</option>
                      <option value="capitalize">Capitalize Each Word</option>
                      <option value="toggle">tOGGLE cASE</option>
                    </select>
                  </label>
                </div>

                <div className="news-presentation-font-row news-presentation-format-row">
                  <RibbonButton
                    label="Bold"
                    title="Bold"
                    pressed={selectionStyle?.bold === true}
                    disabled={textControlsDisabled}
                    onClick={() => applyStyle({ bold: selectionStyle?.bold !== true })}
                  ><strong aria-hidden="true">B</strong></RibbonButton>
                  <RibbonButton
                    label="Italic"
                    title="Italic"
                    pressed={selectionStyle?.italic === true}
                    disabled={textControlsDisabled}
                    onClick={() => applyStyle({ italic: selectionStyle?.italic !== true })}
                  ><em aria-hidden="true">I</em></RibbonButton>
                  <RibbonButton
                    label="Underline"
                    title="Underline"
                    pressed={selectionStyle?.underline === true}
                    disabled={textControlsDisabled}
                    onClick={() => applyStyle({ underline: selectionStyle?.underline !== true })}
                  ><span className="news-presentation-underline" aria-hidden="true">U</span></RibbonButton>
                  <RibbonButton
                    label="Strikethrough"
                    title="Strikethrough"
                    pressed={selectionStyle?.strikethrough === true}
                    disabled={textControlsDisabled}
                    onClick={() => applyStyle({ strikethrough: selectionStyle?.strikethrough !== true })}
                  ><span className="news-presentation-strike" aria-hidden="true">ab</span></RibbonButton>
                  <RibbonButton
                    label="Subscript"
                    title="Subscript"
                    pressed={selectionStyle?.script === "subscript"}
                    disabled={textControlsDisabled}
                    onClick={() =>
                      applyStyle({
                        script: selectionStyle?.script === "subscript" ? "normal" : "subscript",
                      })
                    }
                  ><span aria-hidden="true">X<sub>2</sub></span></RibbonButton>
                  <RibbonButton
                    label="Superscript"
                    title="Superscript"
                    pressed={selectionStyle?.script === "superscript"}
                    disabled={textControlsDisabled}
                    onClick={() =>
                      applyStyle({
                        script: selectionStyle?.script === "superscript" ? "normal" : "superscript",
                      })
                    }
                  ><span aria-hidden="true">X<sup>2</sup></span></RibbonButton>

                  <div className="news-presentation-color-control">
                    <label title="Text highlight colour">
                      <span className="sr-only">Text highlight colour</span>
                      <span className="news-presentation-highlight-icon" aria-hidden="true">ab</span>
                      <input
                        type="color"
                        aria-label="Text highlight colour"
                        value={selectionStyle?.highlightColor ?? "#fff59d"}
                        disabled={textControlsDisabled}
                        onChange={(event) => applyStyle({ highlightColor: event.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Remove text highlight"
                      title="No highlight"
                      disabled={textControlsDisabled || !selectionStyle?.highlightColor}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyStyle({ highlightColor: null })}
                    >×</button>
                  </div>

                  <div className="news-presentation-color-control">
                    <label title="Font colour">
                      <span className="sr-only">Font colour</span>
                      <span className="news-presentation-font-color-icon" aria-hidden="true">A</span>
                      <input
                        type="color"
                        aria-label="Font colour"
                        value={selectionStyle?.fontColor ?? "#181713"}
                        disabled={textControlsDisabled}
                        onChange={(event) => applyStyle({ fontColor: event.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Use automatic font colour"
                      title="Automatic font colour"
                      disabled={textControlsDisabled || !selectionStyle?.fontColor}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyStyle({ fontColor: null })}
                    >×</button>
                  </div>
                </div>
                <span className="news-presentation-ribbon-label">Font</span>
              </div>

              <div className="news-presentation-ribbon-group news-presentation-image-group">
                <div className="news-presentation-image-controls" aria-label="Selected image size">
                  <RibbonButton
                    label="Make image smaller"
                    title="Make image smaller"
                    disabled={
                      controlsDisabled ||
                      !imageSelected ||
                      presentation.imageScalePercent <= ARTICLE_IMAGE_MIN_SCALE_PERCENT
                    }
                    onClick={() => resizeImage(-1)}
                  >−</RibbonButton>
                  <output aria-live="polite">{presentation.imageScalePercent}%</output>
                  <RibbonButton
                    label="Make image larger"
                    title="Make image larger"
                    disabled={
                      controlsDisabled ||
                      !imageSelected ||
                      presentation.imageScalePercent >= ARTICLE_IMAGE_MAX_SCALE_PERCENT
                    }
                    onClick={() => resizeImage(1)}
                  >+</RibbonButton>
                </div>
                <p>Double-click, then drag. Hold Ctrl to keep the original ratio.</p>
                <span className="news-presentation-ribbon-label">Picture size</span>
              </div>
            </div>

            <div className="news-presentation-messages">
              <p className="news-presentation-help">
                Edit words directly or select text and use the Home ribbon. Blocks and page layout stay locked.
              </p>
              {status ? (
                <p className="news-presentation-status" role="status">{status}</p>
              ) : null}
              {errorMessage ? (
                <p className="news-presentation-error" role="alert">{errorMessage}</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {children}
    </ArticlePresentationEditorContext.Provider>
  );
}

function segmentStyle(segment: ArticlePresentationSegment): CSSProperties {
  const familyMap: Record<ArticlePresentationFontFamily, string | undefined> = {
    default: undefined,
    pmingliu: '"PMingLiU", "MingLiU", "Songti TC", serif',
    "microsoft-jhenghei": '"Microsoft JhengHei", "PingFang TC", sans-serif',
    serif: "var(--serif)",
    sans: "var(--sans)",
    arial: 'Arial, "PingFang TC", sans-serif',
    calibri: 'Calibri, "Segoe UI", Arial, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    "times-new-roman": '"Times New Roman", "PMingLiU", serif',
    monospace: "ui-monospace, SFMono-Regular, Consolas, monospace",
  };
  const decorations = [
    segment.underline ? "underline" : "",
    segment.strikethrough ? "line-through" : "",
  ].filter(Boolean);
  return {
    ...(familyMap[segment.fontFamily ?? "default"]
      ? { fontFamily: familyMap[segment.fontFamily ?? "default"] }
      : {}),
    ...(segment.fontSize ? { fontSize: `min(${segment.fontSize}px, 12vw)` } : {}),
    ...(segment.bold ? { fontWeight: 700 } : {}),
    ...(segment.italic ? { fontStyle: "italic" } : {}),
    ...(decorations.length > 0 ? { textDecorationLine: decorations.join(" ") } : {}),
    ...(segment.script === "subscript"
      ? { verticalAlign: "sub", fontSize: "0.75em" }
      : segment.script === "superscript"
        ? { verticalAlign: "super", fontSize: "0.75em" }
        : {}),
    ...(segment.highlightColor ? { backgroundColor: segment.highlightColor } : {}),
    ...(segment.fontColor ? { color: segment.fontColor } : {}),
  };
}

function fallbackSegment(text: string): ArticlePresentationSegment {
  return {
    text,
    fontFamily: null,
    fontSize: null,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    script: "normal",
    highlightColor: null,
    fontColor: null,
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
  const segments = block?.segments ?? [fallbackSegment(text)];
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
      contentEditable={editor.editMode ? "plaintext-only" : undefined}
      suppressContentEditableWarning={editor.editMode}
      spellCheck={editor.editMode}
      role={editor.editMode ? "textbox" : undefined}
      aria-label={editor.editMode ? `Editable ${blockId.replace(":", " ")}` : undefined}
      aria-multiline={editor.editMode ? false : undefined}
      onBeforeInput={(event) => {
        const inputType = (event.nativeEvent as InputEvent).inputType;
        if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
          event.preventDefault();
        }
      }}
      onInput={(event) => {
        const offsets = selectionOffsets(event.currentTarget);
        editor.updateBlockText(
          blockId,
          event.currentTarget.textContent ?? "",
          offsets,
        );
      }}
      onPaste={(event) => {
        if (!editor.editMode) return;
        const offsets = selectionOffsets(event.currentTarget);
        if (!offsets) return;
        event.preventDefault();
        editor.replaceTextSelection(
          blockId,
          offsets.start,
          offsets.end,
          event.clipboardData.getData("text/plain"),
        );
      }}
      onMouseUp={(event) =>
        editor.captureTextSelection(blockId, event.currentTarget)
      }
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          moveSelectionToBlockBoundary(
            event.currentTarget,
            event.key === "Home" ? "start" : "end",
            event.shiftKey,
          );
          editor.captureTextSelection(blockId, event.currentTarget);
        }
      }}
      onKeyUp={(event) =>
        editor.captureTextSelection(blockId, event.currentTarget)
      }
      tabIndex={editor.editMode ? 0 : undefined}
    >
      {segments.map((segment, index) => {
        const leadingWhitespace =
          index > 0 ? segment.text.match(/^\s+/u)?.[0] ?? "" : "";
        const visibleText = leadingWhitespace
          ? segment.text.slice(leadingWhitespace.length)
          : segment.text;
        return (
          <Fragment key={index}>
            {leadingWhitespace}
            <span style={segmentStyle(segment)}>{visibleText}</span>
          </Fragment>
        );
      })}
    </span>
  );
}

export function ArticlePresentationImage({
  src,
  alt,
  intrinsicWidth = 1200,
  intrinsicHeight = 675,
}: {
  src: string;
  alt: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
}) {
  const editor = useArticlePresentationEditor();
  const selected = editor.selection?.kind === "image";
  const [resizeReady, setResizeReady] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => dragCleanupRef.current?.(), []);

  function enableResize() {
    if (!editor.editMode) return;
    editor.selectImage();
    setResizeReady(true);
  }

  function handleImageKeyDown(event: KeyboardEvent<HTMLImageElement>) {
    if (!editor.editMode || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    enableResize();
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const frame = frameRef.current;
    const image = imageRef.current;
    const parent = frame?.parentElement;
    if (!frame || !image || !parent) return;
    event.preventDefault();
    event.stopPropagation();
    editor.selectImage();

    const frameRect = frame.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const parentWidth = Math.max(parentRect.width, frameRect.width, 1);
    const startWidth = Math.max(frameRect.width, 1);
    const startHeight = Math.max(
      frameRect.height,
      startWidth / (intrinsicWidth / intrinsicHeight),
      1,
    );
    const startX = event.clientX;
    const startY = event.clientY;
    const originalAspectRatio = clamp(
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : intrinsicWidth / intrinsicHeight,
      ARTICLE_IMAGE_MIN_ASPECT_RATIO,
      ARTICLE_IMAGE_MAX_ASPECT_RATIO,
    );

    const move = (pointerEvent: PointerEvent) => {
      const width = clamp(
        startWidth + pointerEvent.clientX - startX,
        parentWidth * (ARTICLE_IMAGE_MIN_SCALE_PERCENT / 100),
        parentWidth,
      );
      let aspectRatio = originalAspectRatio;
      if (!pointerEvent.ctrlKey) {
        const requestedHeight = Math.max(
          40,
          startHeight + pointerEvent.clientY - startY,
        );
        aspectRatio = clamp(
          width / requestedHeight,
          ARTICLE_IMAGE_MIN_ASPECT_RATIO,
          ARTICLE_IMAGE_MAX_ASPECT_RATIO,
        );
      }
      editor.previewImageGeometry((width / parentWidth) * 100, aspectRatio);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      dragCleanupRef.current = null;
      editor.commitImageGeometry();
    };
    dragCleanupRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  const customAspectRatio = editor.presentation.imageAspectRatio;
  return (
    <span
      ref={frameRef}
      className={
        "news-presentation-image-frame" +
        (editor.editMode ? " news-presentation-image-frame-editable" : "") +
        (selected ? " news-presentation-image-selected" : "")
      }
      data-custom-aspect={customAspectRatio ? "true" : "false"}
      style={{
        width: `${editor.presentation.imageScalePercent}%`,
        ...(customAspectRatio ? { aspectRatio: customAspectRatio } : {}),
      }}
      onDoubleClick={enableResize}
    >
      {/* Arbitrary editor-supplied hosts cannot be safely enumerated in Next image remotePatterns. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        className={
          "news-presentation-image" +
          (editor.editMode ? " news-presentation-image-editable" : "")
        }
        src={src}
        width={intrinsicWidth}
        height={intrinsicHeight}
        alt={alt}
        loading="eager"
        fetchPriority="high"
        role={editor.editMode ? "button" : undefined}
        tabIndex={editor.editMode ? 0 : undefined}
        aria-pressed={editor.editMode ? selected : undefined}
        aria-label={
          editor.editMode
            ? `${alt}. Double-click to show the resize handle.`
            : undefined
        }
        style={
          customAspectRatio
            ? { width: "100%", height: "100%", objectFit: "fill" }
            : { width: "100%" }
        }
        onClick={editor.editMode ? editor.selectImage : undefined}
        onKeyDown={handleImageKeyDown}
      />
      {editor.editMode && selected && resizeReady ? (
        <button
          className="news-presentation-resize-handle"
          type="button"
          aria-label="Drag to resize image"
          title="Drag freely; hold Ctrl to keep the original aspect ratio"
          onPointerDown={beginDrag}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              event.preventDefault();
              editor.resizeImage(-1);
            } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              event.preventDefault();
              editor.resizeImage(1);
            }
          }}
        >
          <span aria-hidden="true">↘</span>
        </button>
      ) : null}
    </span>
  );
}
