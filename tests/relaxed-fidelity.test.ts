import { describe, expect, it, vi } from "vitest";

import { runRewriteAgent } from "@/lib/server/agents/rewrite-agent";
import { extractVerbatimMixedLanguageTerms, extractComparableNumericValues, sourceLead } from "@/lib/server/agents/prompts";
import type { SourceSnapshot } from "@/lib/shared/contracts";

function snapshot(
  primaryText: string,
  options: { linkedTitle?: string; linkedText?: string } = {},
): SourceSnapshot {
  return { primaryText, userDraft: primaryText, imageContext: [], ...options };
}

const pixelTagSource = [
  "Apple 的 AirTag 推出後大受歡迎，有外媒最近亦取得一張疑似「Google Pixel Tag」的相片，該產品同時開始在網上多個商店商品清單出現，如果屬實將是 Google 首款自家追蹤裝置，直接挑戰 Apple AirTag。",
  "Pixel Tag 採用橢圓豆形設計，正面設有明顯 Google「G」標誌，底部設有一個細小開孔，估計內置喇叭，方便用戶就近搜尋物品時發出提示聲，9to5Google 取得歐洲商店的商品清單，型號為 GA12506，顏色命名為「Fog Light」（霧光灰），產品描述指裝置小巧、輕便耐用，可低調貼附於重要物品，透過 Google「Find My Device」網絡隨時在手機查看物品位置。",
  "目前未有直接證據顯示裝置支援超寬頻（UWB）精準定位技術，電池屬可更換抑或可充電式亦未有定論，裝置外形似乎缺乏內置掛勾裝置，估計需依賴第三方配件。",
  "Pixel Tag 預料售價低於 40 美元，並支援 iOS 及 Android 裝置，Android 16 QPR2 更新亦加入相關支援，Google 期望與 Samsung 及 Chipolo 等品牌合作，建立更完整的 Find Hub 生態系統。",
].join("\n\n");

const bylineArticle = "IT之家 8 月 3 日消息，騰訊北極光工作室研發的 PvEvP 獵殺奪寶 FPS 新作《灰境行者》於 7 月 30 日公布了最新預告片，首次展示獨立於 PvP 之外的「三人合作 PvE」玩法模式。\n\n官方同步宣布，遊戲首次 PC 測試將於 9 月正式開啟，目前《灰境行者》頁面已在 Steam 上線。";

// Drops "9to5Google" (body term) and body numbers — previously rejected.
const deficientSummary = `Google 追蹤裝置 Pixel Tag 圖片流出

Google 的追蹤裝置「Google Pixel Tag」圖片流出，直接挑戰 Apple AirTag。裝置採用橢圓豆形設計，外媒指型號為 GA12506，顏色命名為「Fog Light」。目前未有證據顯示支援精準定位技術，電池設計亦未有定論，預料售價將低於 40 美元，並支援 iOS 及 Android 裝置，預定今年推出。`;

const inventedNumberSummary = `Google 追蹤裝置「Pixel Tag」圖片流出

Google 的追蹤裝置「Google Pixel Tag」圖片流出，直接挑戰 Apple AirTag。外媒指型號為 GA12506，售價將為 99 美元，並於今年推出。`;

const relaxedContext = {
  history: [] as never[],
  refinement: { lengthOption: null, instruction: "" },
  outputLanguage: "traditional_chinese" as const,
  relaxedFidelity: true,
};
const strictContext = { ...relaxedContext, relaxedFidelity: false };

describe("pipeline relaxed fidelity", () => {
  it("strips source byline before extracting mandatory terms", () => {
    const lead = sourceLead(bylineArticle);
    const terms = extractVerbatimMixedLanguageTerms(lead, 5);
    const numbers = extractComparableNumericValues(lead);
    expect(lead).not.toContain("IT之家");
    expect(terms).not.toContain("IT之家");
    expect(terms).toContain("PvEvP");
    expect(numbers).toContain("30");
  });

  it("bounds a scraper article that has no blank-line paragraph boundary", () => {
    const lead = sourceLead(`公司公布新產品，並交代主要功能。${"後續規格及背景資料。".repeat(120)}`);
    expect(Array.from(lead).length).toBeLessThanOrEqual(600);
  });

  it("accepts a brief that omits body terms in relaxed mode", async () => {
    const result = await runRewriteAgent(
      snapshot(pixelTagSource),
      null,
      async () => deficientSummary,
      relaxedContext,
    );
    expect(result.finalText).toContain("Pixel Tag");
  });

  it("still rejects the same brief in strict mode", async () => {
    await expect(
      runRewriteAgent(snapshot(pixelTagSource), null, async () => deficientSummary, strictContext),
    ).rejects.toMatchObject({ status: 422, code: "INEXACT_MIXED_LANGUAGE_TERM" });
  });

  it("still rejects an invented number in relaxed mode", async () => {
    await expect(
      runRewriteAgent(
        snapshot(pixelTagSource),
        null,
        async () => inventedNumberSummary,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it.each([
    {
      source:
        "The console launched in 2013, its successor arrived in 2020, and support is expected through 2027.",
      title: "遊戲主機支援年期",
      candidate:
        "遊戲主機支援年期\n\n報道指主機於2013年推出，後繼型號於2020年面世，支援預計延續至2027年。",
    },
    {
      source:
        "The 2026 solar eclipse takes place on August 12 and is the first total eclipse since 2024.",
      title: "日食觀賞指南",
      candidate:
        "2026年日食觀賞指南\n\n2026年8月12日將出現日食，這是2024年以來首次日全食。",
    },
    {
      source: "The system offers 2x the memory bandwidth of the comparison system.",
      title: "記憶體頻寬比較",
      candidate: "記憶體頻寬比較\n\n新系統的記憶體頻寬是比較系統的2倍。",
    },
    {
      source: "The monitor has a 27-inch panel and a 24-inch custom format mode.",
      title: "螢幕尺寸說明",
      candidate: "螢幕尺寸說明\n\n螢幕採用27吋面板，並提供24吋自訂顯示模式。",
    },
  ])("accepts supported numeric localization: $title", async ({ source, title, candidate }) => {
    const result = await runRewriteAgent(
      snapshot(source, { linkedTitle: title }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
    expect(result.validation).toEqual({ status: "passed", attempts: 1 });
  });

  it("does not turn a model-number fragment into an inch measurement", async () => {
    const badCandidate =
      "螢幕尺寸說明\n\nGigabyte GO27Q24A 採用27吋面板，並提供24吋原生顯示。";
    await expect(
      runRewriteAgent(
        snapshot("The Gigabyte GO27Q24A monitor has a 27-inch panel.", {
          linkedTitle: "螢幕尺寸說明",
        }),
        null,
        async () => badCandidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("rejects source numbers that are swapped onto different units", async () => {
    const badCandidate =
      "公司公布新裝置\n\n公司表示新裝置售價為 128 美元，首批供應 40 部。";
    await expect(
      runRewriteAgent(
        snapshot("公司表示新裝置售價為 40 美元，首批供應 128 部。"),
        null,
        async () => badCandidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("does not treat generated related-report labels as numeric evidence", async () => {
    const badCandidate = "公司公布新產品\n\n公司公布 1 款新產品。";
    await expect(
      runRewriteAgent(
        snapshot("公司公布新產品。", {
          linkedText:
            "相關報道 1 — Example\n標題：另一報道\n來源網址：https://example.com/story\n公司同日公布產品。",
        }),
        null,
        async () => badCandidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("rejects an unsupported Chinese-written quantity", async () => {
    const badCandidate = "公司公布新產品\n\n公司表示新產品已有十萬人預訂。";
    await expect(
      runRewriteAgent(
        snapshot("公司公布新產品，並表示稍後交代銷售安排。"),
        null,
        async () => badCandidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("rejects an invented quotation even when multiple source quotations are omitted", async () => {
    const badCandidate =
      "公司公布新產品\n\n公司周五公布新產品，行政總裁陳大文說：「產品已獲大量客戶預訂。」";
    await expect(
      runRewriteAgent(
        snapshot(
          "公司周五公布新產品。行政總裁陳大文說：「產品將於下月推出。」他補充說：「售價稍後公布。」\n\n公司表示產品將在香港發售。",
        ),
        null,
        async () => badCandidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_QUOTATION" });
  });

  it("sends all deterministic failures in the single correction attempt", async () => {
    const deficientCandidate = "新產品推出\n\n公司公布新產品。";
    const completion = vi.fn().mockResolvedValue(deficientCandidate);

    await expect(
      runRewriteAgent(
        snapshot("公司公布 Google Pixel 9，售價為 40 美元。", {
          linkedTitle: "Google Pixel 9 售價 40 美元",
        }),
        null,
        completion,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "INEXACT_MIXED_LANGUAGE_TERM" });

    expect(completion).toHaveBeenCalledTimes(2);
    expect(completion.mock.calls[1][0].userPrompt).toContain("INEXACT_MIXED_LANGUAGE_TERM");
    expect(completion.mock.calls[1][0].userPrompt).toContain("MISSING_REWRITE_NUMBER");
    expect(completion.mock.calls[1][0]).toMatchObject({
      systemPrompt: expect.stringContaining("只負責修正來源忠實度的機械式校正器"),
      temperature: 0,
    });
  });
});
