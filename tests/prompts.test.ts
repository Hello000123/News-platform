import { describe, expect, it } from "vitest";

import {
  CONSERVATIVE_REWRITE_CORRECTION_SYSTEM_PROMPT,
  createQuotationCorrectionPrompt,
  createReviewSystemPrompt,
  createReviewUserPrompt,
  createRewriteValidationCorrectionPrompt,
  createRewriteUserPrompt,
  createUnchangedRewriteCorrectionPrompt,
  determineRequiredOutputLanguage,
  extractNumericFacts,
  extractNumericValues,
  extractComparableNumericValues,
  extractVerbatimDirectQuotations,
  extractVerbatimMixedLanguageTerms,
  extractVerbatimSourceScriptNames,
  FORMAT_CORRECTION_SYSTEM_PROMPT,
  preservesRequestedOutputLanguage,
  preservesRequiredOutputLanguage,
  QUOTATION_CORRECTION_SYSTEM_PROMPT,
  REWRITE_SYSTEM_PROMPT,
  SOURCE_FIDELITY_CORRECTION_SYSTEM_PROMPT,
} from "@/lib/server/agents/prompts";
import type { SourceSnapshot } from "@/lib/shared/contracts";
import { highReview } from "@/tests/fixtures/reviews";

const editorialSource: SourceSnapshot = {
  primaryText:
    "香港初創Blue Harbour AI於7月16日表示：「計劃會繼續。」團隊已完成測試。",
  userDraft:
    "香港初創Blue Harbour AI於7月16日表示：「計劃會繼續。」團隊已完成測試。",
  sourceUrl: "https://news.example/reference",
  linkedTitle: "測試計劃參考資料",
  linkedText: "參考資料稱20名參加者完成測試。",
  imageContext: [
    { label: "Source-page chart caption", text: "參加者：24", source: "link_caption" },
  ],
};

function embeddedJson(prompt: string) {
  return JSON.parse(prompt.slice(prompt.indexOf("{"))) as Record<string, unknown>;
}

const rewriteInstructionLatinAllowlist = new Set([
  "JSON",
  "allowedNumericFacts",
  "concise",
  "currentRefinement",
  "currentTurn",
  "earlierTurns",
  "full_article",
  "imageContext",
  "lengthOption",
  "linkedText",
  "mandatoryNumericFacts",
  "more_detailed",
  "news_brief",
  "null",
  "original",
  "outputLanguage",
  "primaryText",
  "requiredOutputLanguage",
  "rewriteContext",
  "rewriteMode",
  "rewriteSession",
  "traditional_chinese",
  "verbatimDirectQuotations",
  "verbatimMixedLanguageTerms",
  "verbatimSourceScriptNames",
]);

function unexpectedInstructionLatinTokens(text: string) {
  return Array.from(new Set(text.match(/[A-Za-z][A-Za-z0-9_]*/gu) ?? []))
    .filter((token) => !rewriteInstructionLatinAllowlist.has(token))
    .sort();
}

describe("agent prompts", () => {
  it("defines strict six-category review anchors, weights, caps, and JSON output", () => {
    const prompt = createReviewSystemPrompt(87);

    expect(prompt).toContain("strict, language-fair professional writing reviewer");
    expect(prompt).toContain("Evaluate the writing; do not rewrite it");
    expect(prompt).toContain("factualCompletenessScore (25%; legacy key)");
    expect(prompt).toContain("structureScore (20%)");
    expect(prompt).toContain("clarityScore (15%)");
    expect(prompt).toContain("languageQualityScore (15%)");
    expect(prompt).toContain("professionalismScore (15%)");
    expect(prompt).toContain("attributionScore (10%)");
    expect(prompt).toContain("90-100: writing is publication-ready");
    expect(prompt).toContain("75-89: strong writing that still needs limited editing");
    expect(prompt).toContain("60-74: understandable writing, but substantial rewriting is required");
    expect(prompt).toContain("0-39: severely deficient or fragmentary writing");
    expect(prompt).toContain("critical writing finding caps overall writing readiness at 39");
    expect(prompt).toContain("major writing finding, major structural problem");
    expect(prompt).toContain("backend recomputes it and may apply only writing-quality consistency caps");
    expect(prompt).toContain("publisher reputation");
    expect(prompt).toContain("not newsworthiness");
    expect(prompt).toContain("Apply the same standard to English and Traditional Chinese");
    expect(prompt).toContain("yesterday, recently, 昨天, 今日, or 近日");
    expect(prompt).toContain("internally unclear or directly contradictory");
    expect(prompt).toContain("Score every category independently using only visible writing evidence");
    expect(prompt).toContain("Do not fact-check");
    expect(prompt).toContain("clearly false, fictional, hypothetical, satirical, outdated, unverifiable");
    expect(prompt).toContain("Missing citations, links, evidence, named sources, or external support are never review failures");
    expect(prompt).toContain("Always set severelyIncompleteOrUnreliable=false, seriousFactualGaps=false, and unsupportedClaims=false");
    expect(prompt).not.toContain("Classify the band first");
    expect(prompt).toContain("Any category below 40 caps it at 59");
    expect(prompt).toContain('"seriousFactualGaps": false');
    expect(prompt).toContain('"category": "structure"');
    expect(prompt).toContain("Return only strict JSON");
    expect(prompt).toContain("Return PASS only if the backend-computed overall score is at least 87");
    expect(prompt).toContain('"overallScore": 49');
    expect(prompt).toContain('"readinessRisks"');
    expect(prompt).toContain('"findings"');
    expect(prompt).not.toContain("contentScore (40%)");
  });

  it("sends only the submitted draft and internal metadata to the reviewer", () => {
    const prompt = createReviewUserPrompt(editorialSource);
    const payload = embeddedJson(prompt) as {
      draftOrigin: string;
      selectedDocumentType: string;
      submittedDraft: string;
      detectedTimeContext: {
        exactDateExpressions: string[];
        relativeTimeExpressions: string[];
        uncertaintyCues: string[];
        contradictionCues: string[];
      };
    };

    expect(prompt).toContain("writing quality of submittedDraft");
    expect(prompt).toContain("No external reference material is provided to the reviewer");
    expect(prompt).not.toContain(editorialSource.linkedText);
    expect(prompt).not.toContain(editorialSource.sourceUrl);
    expect(payload).toEqual({
      draftOrigin: "user_submitted_text",
      selectedDocumentType: "news_article",
      submittedDraft: editorialSource.primaryText,
      detectedTimeContext: {
        exactDateExpressions: [],
        relativeTimeExpressions: [],
        uncertaintyCues: [],
        contradictionCues: [],
      },
    });

    const linkOnly = embeddedJson(
      createReviewUserPrompt({
        primaryText: "Retrieved article text.",
        userDraft: "",
        sourceUrl: "https://news.example/retrieved",
        imageContext: [],
      }),
    );
    expect(linkOnly).toMatchObject({
      draftOrigin: "retrieved_link_article",
      selectedDocumentType: "news_article",
      submittedDraft: "Retrieved article text.",
    });
    expect(linkOnly).not.toHaveProperty("referenceMaterial");
  });

  it("makes source authority, genuine editing, quotation fidelity, and format explicit", () => {
    for (const rule of [
      "審慎的香港新聞編輯",
      "primaryText 是主要文章",
      "審稿意見、較早的人工智能改寫及使用者改善指示只可決定編採方向",
      "每項輸出陳述都必須可由來源文字直接支持",
      "rewriteMode 為 full_article",
      "rewriteMode 為 news_brief",
      "改寫模式只改變必須覆蓋的資料範圍",
      "verbatimMixedLanguageTerms 和 verbatimSourceScriptNames 中每個項目都必須逐字出現",
      "allowedNumericFacts 中同一項事實相符",
      "只有數值相同但貨幣、單位或所指事物不同，仍屬沒有來源支持",
      "verbatimDirectQuotations 中每個項目都必須連同內部標點逐字保留",
      "不得把間接引語或輔助報道內容變成新的直接引文",
      "香港常用書面語及中文標點",
      "避免簡體字、內地新聞套語、生硬直譯",
      "正文採用倒金字塔結構",
      "不要提及本次改寫、資料檢索或來源組合過程",
      "不要只為令稿件看來不同而換字",
      "與目前編輯基準完全相同、只改空白或只改標點，不算完成改寫",
      "只有 currentRefinement.lengthOption 控制本次篇幅",
      "concise 要更短更直接",
      "more_detailed 只可加入來源明確載有而且與主題相關的細節",
      "以最新指示為準",
      "不得把相對時間轉成曆日",
      "requiredOutputLanguage 指定的語言及文字系統",
      "第一行為標題，第二行留空",
      "不得加入標記格式、評分、評論、前言、署名、來源清單或媒體歸屬",
    ]) {
      expect(REWRITE_SYSTEM_PROMPT).toContain(rule);
    }
    expect(QUOTATION_CORRECTION_SYSTEM_PROMPT).toContain(
      "逐字複製到相應段落",
    );
    expect(QUOTATION_CORRECTION_SYSTEM_PROMPT).toContain(
      "絕不可翻譯、意譯、拆分、合併",
    );
    expect(FORMAT_CORRECTION_SYSTEM_PROMPT).toContain(
      "不得只是把來源首句移作標題",
    );
    expect(SOURCE_FIDELITY_CORRECTION_SYSTEM_PROMPT).toContain(
      "只負責修正來源忠實度的機械式校正器",
    );
    expect(SOURCE_FIDELITY_CORRECTION_SYSTEM_PROMPT).toContain(
      "一次過修正驗證失敗清單中的每項問題",
    );
    expect(FORMAT_CORRECTION_SYSTEM_PROMPT).toContain(
      "遵守 rewriteMode 的覆蓋範圍",
    );
    expect(CONSERVATIVE_REWRITE_CORRECTION_SYSTEM_PROMPT).toContain(
      "正在修正未能擺脫來源複製的稿件",
    );
    expect(CONSERVATIVE_REWRITE_CORRECTION_SYSTEM_PROMPT).toContain(
      "只有 rewriteMode 為 news_brief 時",
    );
  });

  it("keeps authored rewrite instructions in Traditional Chinese except machine identifiers", () => {
    const initialPromptPreamble = createRewriteUserPrompt(editorialSource, null).split(
      "\n\n{",
      1,
    )[0];
    const instructionPrompts = [
      REWRITE_SYSTEM_PROMPT,
      QUOTATION_CORRECTION_SYSTEM_PROMPT,
      SOURCE_FIDELITY_CORRECTION_SYSTEM_PROMPT,
      FORMAT_CORRECTION_SYSTEM_PROMPT,
      CONSERVATIVE_REWRITE_CORRECTION_SYSTEM_PROMPT,
      initialPromptPreamble,
    ];

    expect(instructionPrompts.flatMap(unexpectedInstructionLatinTokens)).toEqual([]);
  });

  it("sends the full source snapshot, review feedback, and detected language to rewrite", () => {
    const prompt = createRewriteUserPrompt(editorialSource, highReview);
    const payload = embeddedJson(prompt) as {
      rewriteMode: string;
      requiredOutputLanguage: string;
      allowedNumericFacts: Array<{ value: string; unit: string | null }>;
      verbatimDirectQuotations: string[];
      verbatimMixedLanguageTerms: string[];
      verbatimSourceScriptNames: string[];
      mandatoryNumericFacts: Array<{ value: string; unit: string | null }>;
      source: SourceSnapshot;
      reviewFeedback: unknown;
      rewriteSession: {
        earlierTurns: unknown[];
        currentTurn: unknown;
        currentRefinement: { lengthOption: null; instruction: string };
      };
    };

    expect(prompt).toContain("已明確要求改寫，不論審稿分數如何");
    expect(prompt).toContain("改寫模式：完整文章改寫");
    expect(prompt).toContain("語言鎖定：繁體中文");
    expect(payload.rewriteMode).toBe("full_article");
    expect(payload.requiredOutputLanguage).toMatch(/^繁體中文/);
    expect(payload.allowedNumericFacts).toEqual([
      { value: "7", unit: "time:month" },
      { value: "16", unit: "time:day" },
      { value: "20", unit: "count:person" },
      { value: "24", unit: null },
    ]);
    expect(payload.mandatoryNumericFacts).toEqual([
      { value: "7", unit: "time:month" },
      { value: "16", unit: "time:day" },
    ]);
    expect(payload.verbatimDirectQuotations).toEqual(["「計劃會繼續。」"]);
    expect(payload.verbatimMixedLanguageTerms).toContain("Blue Harbour AI");
    expect(payload.source).toEqual(editorialSource);
    expect(payload.reviewFeedback).toEqual(highReview);
    expect(payload.rewriteSession).toEqual({
      earlierTurns: [],
      currentTurn: null,
      currentRefinement: { lengthOption: null, instruction: "" },
    });
  });

  it("uses Traditional-Chinese instructions for quotation, echo, and validation corrections", () => {
    const quotationPrompt = createQuotationCorrectionPrompt(
      "測試標題\n\n發言人說：「已改動。」",
      [
        {
          kind: "modified",
          original: "「計劃會繼續。」",
          rewrite: "「已改動。」",
          sourceParagraph: 1,
          rewriteParagraph: 2,
          sourceExcerpt: "發言人表示：「計劃會繼續。」",
          differenceSummary: "引文內容不同。",
          action: "逐字還原來源引文。",
        },
      ],
      editorialSource,
    );
    const unchangedPrompt = createUnchangedRewriteCorrectionPrompt(
      editorialSource.primaryText,
      editorialSource,
      highReview,
    );
    const validationPrompt = createRewriteValidationCorrectionPrompt(
      "測試標題",
      {
        code: "INVALID_REWRITE_FORMAT",
        message: "The candidate did not use the required format.",
      },
      editorialSource,
      highReview,
    );

    expect(quotationPrompt).toContain("只處理以下不符的引文：");
    expect(quotationPrompt).toContain("候選稿件：");
    expect(unchangedPrompt).toContain("候選稿與現行編輯基準完全相同");
    expect(unchangedPrompt).toContain("改寫模式：完整文章改寫");
    expect(unchangedPrompt).toContain("語言鎖定：繁體中文");
    expect(validationPrompt).toContain("只限一次修正");
    expect(validationPrompt).toContain("候選稿沒有採用第一行標題、第二行留空");
    expect(validationPrompt).toContain("INVALID_REWRITE_FORMAT");
    expect(validationPrompt).not.toContain("The candidate did not use the required format.");
  });

  it("sends the current version, ordered prior turns, all instructions, and latest preference", () => {
    const prompt = createRewriteUserPrompt(editorialSource, highReview, {
      history: [
        {
          rewrittenText: "First headline\n\nFirst rewritten version.",
          lengthOption: "concise",
          instruction: "Make the opening more engaging.",
        },
        {
          rewrittenText: "Second headline\n\nSecond rewritten version.",
          lengthOption: "more_detailed",
          instruction: "Move the quotation to the second paragraph.",
        },
      ],
      refinement: {
        lengthOption: "concise",
        instruction: "Use a more formal tone and retain the confirmed 30 seats.",
      },
    });
    const payload = embeddedJson(prompt) as {
      allowedNumericFacts: Array<{ value: string; unit: string | null }>;
      rewriteSession: {
        earlierTurns: Array<Record<string, unknown>>;
        currentTurn: Record<string, unknown>;
        currentRefinement: Record<string, unknown>;
      };
    };

    expect(payload.rewriteSession.earlierTurns).toEqual([
      {
        rewrittenText: "First headline\n\nFirst rewritten version.",
        lengthOption: "concise",
        instruction: "Make the opening more engaging.",
      },
    ]);
    expect(payload.rewriteSession.currentTurn).toEqual({
      rewrittenText: "Second headline\n\nSecond rewritten version.",
      lengthOption: "more_detailed",
      instruction: "Move the quotation to the second paragraph.",
    });
    expect(payload.rewriteSession.currentRefinement).toEqual({
      lengthOption: "concise",
      instruction: "Use a more formal tone and retain the confirmed 30 seats.",
    });
    expect(payload.allowedNumericFacts.some(({ value }) => value === "30")).toBe(false);
  });

  it("uses title-bounded coverage for a news brief without weakening evidence checks", () => {
    const briefSource: SourceSnapshot = {
      primaryText:
        "Google Pixel 9手機今日推出，售價為40美元。\n\n團隊表示：「電池續航更長。」機身支援30 W充電。",
      userDraft: "",
      linkedTitle: "Google Pixel 9售價40美元",
      linkedText: "另一篇報道亦指售價為40美元。",
      imageContext: [],
    };
    const prompt = createRewriteUserPrompt(briefSource, null, {
      history: [],
      refinement: { lengthOption: null, instruction: "" },
      outputLanguage: "traditional_chinese",
      relaxedFidelity: true,
    });
    const payload = embeddedJson(prompt) as {
      rewriteMode: string;
      allowedNumericFacts: Array<{ value: string; unit: string | null }>;
      verbatimDirectQuotations: string[];
      verbatimMixedLanguageTerms: string[];
      mandatoryNumericFacts: Array<{ value: string; unit: string | null }>;
    };

    expect(prompt).toContain("改寫模式：精簡新聞簡報");
    expect(prompt).toContain("正文的非核心細節及來源引文可以省略");
    expect(payload.rewriteMode).toBe("news_brief");
    expect(payload.verbatimDirectQuotations).toEqual([]);
    expect(payload.verbatimMixedLanguageTerms).toContain("Google Pixel 9");
    expect(payload.mandatoryNumericFacts).toEqual([
      { value: "9", unit: null },
      { value: "40", unit: "currency:usd" },
    ]);
    expect(payload.allowedNumericFacts).toContainEqual({ value: "30", unit: "w" });
  });

  it("extracts supported quotation styles, mixed-language terms, and numeric values exactly", () => {
    expect(
      extractVerbatimDirectQuotations(
        "甲說：「第一句。」乙說：『第二句。』丙說：“Third quote.” 丁說：‘Fourth quote.’",
      ),
    ).toEqual(["「第一句。」", "『第二句。』", "“Third quote.”", "‘Fourth quote.’"]);
    expect(
      extractVerbatimMixedLanguageTerms(
        "香港初創Blue Harbour AI在Cyberport測試3.5 million筆記錄，由Dr. 陳美玲負責。",
      ),
    ).toEqual(["Blue Harbour AI", "Cyberport", "3.5 million", "Dr. 陳美玲"]);
    expect(extractNumericValues("A 3.5 million pilot had 448,000 records and rose 18%.")).toEqual([
      "3.5",
      "448000",
      "18",
    ]);
    expect(
      extractComparableNumericValues("共有5.8萬人、4.2億元及3千宗；another 58,000 people."),
    ).toEqual(["58000", "420000000", "3000"]);
    expect(extractComparableNumericValues("The budget was 4.2 million and 3 thousand.")).toEqual([
      "4200000",
      "3000",
    ]);
    expect(extractNumericFacts("售價40美元，首批128部，已有十萬人預訂。")).toEqual([
      { value: "40", unit: "currency:usd", raw: "40" },
      { value: "128", unit: "count:unit", raw: "128" },
      { value: "100000", unit: "count:person", raw: "十萬" },
    ]);
    expect(extractNumericFacts("The team has 20 workers and uses 30 W.")).toEqual([
      { value: "20", unit: "count:person", raw: "20" },
      { value: "30", unit: "w", raw: "30" },
    ]);
    expect(
      extractVerbatimSourceScriptNames(
        "王繹嘉、陳凱然、馬端行考獲佳績。超級狀元劉彥彤表示，程熹、羅苡庭，並多謝家人、老師及朋友到場。",
      ),
    ).toEqual(["王繹嘉", "陳凱然", "馬端行", "劉彥彤", "程熹", "羅苡庭"]);
  });

  it("normalizes English dates, multipliers, and hyphenated inch measurements", () => {
    expect(
      extractNumericFacts(
        "The console launched in 2013, its successor arrived in 2020, and support is expected through 2027.",
      ),
    ).toEqual(
      expect.arrayContaining([
        { value: "2013", unit: "time:year", raw: "2013" },
        { value: "2020", unit: "time:year", raw: "2020" },
        { value: "2027", unit: "time:year", raw: "2027" },
      ]),
    );
    expect(
      extractNumericFacts(
        "The 2026 eclipse occurs on August 12 and is the first total eclipse since 2024.",
      ),
    ).toEqual(
      expect.arrayContaining([
        { value: "2026", unit: "time:year", raw: "2026" },
        { value: "8", unit: "time:month", raw: "August" },
        { value: "12", unit: "time:day", raw: "12" },
        { value: "2024", unit: "time:year", raw: "2024" },
      ]),
    );
    expect(extractNumericFacts("The system offers 2x the memory bandwidth.")).toContainEqual({
      value: "2",
      unit: "ratio:multiplier",
      raw: "2",
    });
    expect(
      extractNumericFacts("A 27-inch panel can switch to a 24-inch custom format."),
    ).toEqual(
      expect.arrayContaining([
        { value: "27", unit: "length:inch", raw: "27" },
        { value: "24", unit: "length:inch", raw: "24" },
      ]),
    );
  });

  it("detects and enforces the primary input language automatically", () => {
    const traditionalDraft =
      "香港初創公司於7月16日表示，已在數碼港完成首輪測試，項目主管稱開始日期尚未確定。";
    const simplifiedDraft =
      "研究机构于7月16日发布初步测试结果，项目负责人表示数据仍在审核。";
    const englishDraft = "The reporter filed the English article today.";

    expect(determineRequiredOutputLanguage(traditionalDraft)).toMatch(/^Traditional Chinese/);
    expect(determineRequiredOutputLanguage(simplifiedDraft)).toMatch(/^Simplified Chinese/);
    expect(determineRequiredOutputLanguage(englishDraft)).toBe("English");
    expect(determineRequiredOutputLanguage("Breaking news")).toBe("English");
    expect(determineRequiredOutputLanguage("Breaking")).toBe("English");
    expect(determineRequiredOutputLanguage("雨")).toMatch(/^Chinese/);
    expect(determineRequiredOutputLanguage("「下雨」")).toMatch(/^Chinese/);
    expect(determineRequiredOutputLanguage("Le conseil a approuvé le projet mardi.")).toMatch(
      /^Original primary language/,
    );

    expect(
      preservesRequiredOutputLanguage(
        traditionalDraft,
        "Testing is complete\n\nOfficials said the testing process is complete.",
      ),
    ).toBe(false);
    expect(
      preservesRequiredOutputLanguage(
        traditionalDraft,
        "測試已完成\n\n項目主管表示測試工作已完成。",
      ),
    ).toBe(true);
    expect(
      preservesRequiredOutputLanguage(
        englishDraft,
        "English report filed\n\nOfficials said the English report was filed today.",
      ),
    ).toBe(true);
    expect(
      preservesRequiredOutputLanguage(
        englishDraft,
        "報道已提交\n\n官員表示，英文報道已於今日提交。",
      ),
    ).toBe(false);
    expect(preservesRequiredOutputLanguage("Breaking", "突發\n\n消息已公布。")).toBe(false);
    expect(preservesRequiredOutputLanguage("「下雨」", "Rain\n\nThe report says rain.")).toBe(false);
  });

  it("allows the pipeline to explicitly request a Traditional Chinese edition", () => {
    const englishDraft = "Officials said the new service will open on 16 July.";
    const prompt = createRewriteUserPrompt(englishDraft, null, {
      history: [],
      refinement: { lengthOption: null, instruction: "" },
      outputLanguage: "traditional_chinese",
    });

    expect(prompt).toContain("語言鎖定：繁體中文");
    expect(
      preservesRequestedOutputLanguage(
        englishDraft,
        "新服務將於7月16日啟用\n\n官員表示，新服務將於7月16日啟用。",
        "traditional_chinese",
      ),
    ).toBe(true);
    expect(
      preservesRequestedOutputLanguage(
        englishDraft,
        "Service opens\n\nOfficials said the new service will open on 16 July.",
        "traditional_chinese",
      ),
    ).toBe(false);
  });
});
