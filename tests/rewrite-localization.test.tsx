// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewWorkspacePage } from "@/components/review-workspace-page";
import { QuotationFailurePanel } from "@/components/quotation-failure-panel";
import { ApiRequestError, requestReview, requestRewrite } from "@/lib/client/api";
import {
  REWRITE_LOCALE_STORAGE_KEY,
  RewriteI18nProvider,
} from "@/lib/client/rewrite-i18n";
import type { ReviewApiResponse, RewriteApiResponse } from "@/lib/shared/contracts";
import { highReview } from "@/tests/fixtures/reviews";

vi.mock("@/lib/client/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/api")>();
  return {
    ...actual,
    requestReview: vi.fn(),
    requestRewrite: vi.fn(),
  };
});

const reviewMock = vi.mocked(requestReview);
const rewriteMock = vi.mocked(requestRewrite);

const testUser = {
  id: "user-1",
  email: "client@example.test",
  fullName: "Client Editor",
  role: "client" as const,
};

function renderPage() {
  return render(
    <ReviewWorkspacePage
      user={testUser}
      passScore={80}
      initialModel="grok-4.5"
    />,
  );
}

describe("Rewrite–Review localization", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("defaults to English and switches to persisted zh-HK without changing the draft", async () => {
    const user = userEvent.setup();
    const firstRender = renderPage();

    expect(screen.getByRole("heading", { name: /From rough draft to/u })).toBeTruthy();
    const editor = screen.getByRole("textbox", { name: /News draft/u });
    await user.type(editor, "Keep this draft exactly as written.");
    await user.click(
      screen.getByRole("button", {
        name: "Switch interface language to Traditional Chinese",
      }),
    );

    expect(await screen.findByRole("heading", { name: /由初稿變成/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: "審閱草稿" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /新聞草稿/u }) as HTMLTextAreaElement).value)
      .toBe("Keep this draft exactly as written.");
    expect(window.localStorage.getItem(REWRITE_LOCALE_STORAGE_KEY)).toBe("zh-HK");
    expect(document.title).toBe("審閱工作區 | PressReady");

    firstRender.unmount();
    renderPage();
    expect(await screen.findByRole("button", { name: "審閱草稿" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "將介面語言切換為英文" })).toBeTruthy();
    await waitFor(() => expect(document.title).toBe("審閱工作區 | PressReady"));
  });

  it("shows the combined upload-limit validation in Traditional Chinese", async () => {
    window.localStorage.setItem(REWRITE_LOCALE_STORAGE_KEY, "zh-HK");
    renderPage();
    await screen.findByRole("button", { name: "審閱草稿" });

    const input = document.querySelector("#draft-file") as HTMLInputElement;
    const sixMegabytes = new File(
      [new Uint8Array(6 * 1024 * 1024)],
      "six.pdf",
      { type: "application/pdf" },
    );
    const fiveMegabytes = new File(
      [new Uint8Array(5 * 1024 * 1024)],
      "five.pdf",
      { type: "application/pdf" },
    );
    fireEvent.change(input, { target: { files: [sixMegabytes] } });
    fireEvent.change(input, { target: { files: [fiveMegabytes] } });

    expect(
      await screen.findByText(/所有已選檔案的合計大小不可超過 10 MB/u),
    ).toBeTruthy();
    expect(screen.queryByText("five.pdf")).toBeNull();
  });

  it("localizes review and rewrite controls without translating source or generated text", async () => {
    const sourceText = "Source copy must remain in English.";
    const generatedText = "Generated article stays exactly as returned.";
    const reviewResponse: ReviewApiResponse = {
      review: highReview,
      source: {
        primaryText: sourceText,
        userDraft: sourceText,
        imageContext: [],
      },
      passScore: 80,
      message: "Review complete. Choose how to continue.",
    };
    const rewriteResponse: RewriteApiResponse = {
      finalText: generatedText,
      validation: { status: "passed", attempts: 1 },
    };
    reviewMock.mockResolvedValue(reviewResponse);
    rewriteMock.mockResolvedValue(rewriteResponse);
    window.localStorage.setItem(REWRITE_LOCALE_STORAGE_KEY, "zh-HK");
    const user = userEvent.setup();
    renderPage();

    const editor = await screen.findByRole("textbox", { name: /新聞草稿/u });
    await user.type(editor, sourceText);
    await user.click(screen.getByRole("button", { name: "審閱草稿" }));
    expect(await screen.findByText("評分理由")).toBeTruthy();
    expect((editor as HTMLTextAreaElement).value).toBe(sourceText);

    await user.click(screen.getByRole("button", { name: "使用 AI 改寫" }));
    expect(await screen.findByRole("heading", { name: "AI 改寫新聞稿" })).toBeTruthy();
    await waitFor(() => {
      expect((screen.getByLabelText("最終新聞稿文字") as HTMLTextAreaElement).value)
        .toBe(generatedText);
    });
  });

  it("maps stable API error codes and diagnostics to localized messages", async () => {
    reviewMock.mockRejectedValue(
      new ApiRequestError(
        "XAI_TIMEOUT",
        "The upstream English timeout must not be shown.",
        {
          retryable: true,
          stage: "review_request",
          provider: "xAI",
          model: "grok-4.5",
          httpStatus: 0,
          causeSummary: "An English provider diagnostic must not be shown.",
        },
      ),
    );
    window.localStorage.setItem(REWRITE_LOCALE_STORAGE_KEY, "zh-HK");
    const user = userEvent.setup();
    renderPage();

    const editor = await screen.findByRole("textbox", { name: /新聞草稿/u });
    await user.type(editor, "測試草稿");
    await user.click(screen.getByRole("button", { name: "審閱草稿" }));

    expect(await screen.findByText("AI 供應商回應需時過長，請再試一次。")).toBeTruthy();
    expect(screen.getByText("審閱代理要求")).toBeTruthy();
    expect(
      screen.getByText("供應商回報要求失敗。請檢查所選模型及帳戶權限。"),
    ).toBeTruthy();
    expect(screen.queryByText(/upstream English timeout/u)).toBeNull();
    expect(screen.queryByText(/English provider diagnostic/u)).toBeNull();
  });

  it("localizes deterministic quotation errors while preserving quoted and candidate text", async () => {
    window.localStorage.setItem(REWRITE_LOCALE_STORAGE_KEY, "zh-HK");
    render(
      <RewriteI18nProvider>
        <QuotationFailurePanel
          issues={[
            {
              kind: "modified",
              original: "“Keep this quotation.”",
              rewrite: "“Changed quotation.”",
              sourceParagraph: 2,
              rewriteParagraph: 3,
              sourceExcerpt: "A source excerpt.",
              differenceSummary: "English quotation difference.",
              action: "English quotation action.",
            },
          ]}
          candidateText="Candidate article text remains unchanged."
          attempts={2}
          busy={false}
          onRetry={vi.fn()}
        />
      </RewriteI18nProvider>,
    );

    expect(await screen.findByRole("heading", { name: "改寫版本需要修正引述" })).toBeTruthy();
    expect(screen.getByText("引述字句與來源不完全相同。")).toBeTruthy();
    expect(screen.getByText("請逐字還原來源引述，只在引號外修改。")).toBeTruthy();
    expect(screen.getByText("“Keep this quotation.”")).toBeTruthy();
    expect(screen.getByText("“Changed quotation.”")).toBeTruthy();
    expect(
      (screen.getByLabelText("產生的草稿 — 尚未通過發佈驗證") as HTMLTextAreaElement).value,
    ).toBe("Candidate article text remains unchanged.");
    expect(screen.queryByText("English quotation difference.")).toBeNull();
    expect(screen.queryByText("English quotation action.")).toBeNull();
  });
});
