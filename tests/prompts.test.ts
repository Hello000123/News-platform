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
  "allowedNumericValues",
  "concise",
  "currentRefinement",
  "currentTurn",
  "earlierTurns",
  "imageContext",
  "lengthOption",
  "linkedText",
  "more_detailed",
  "null",
  "original",
  "outputLanguage",
  "primaryText",
  "requiredOutputLanguage",
  "rewriteContext",
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
      "達到刊登質素的新聞報道",
      "primaryText 是要改寫的文章，並主導其事實含義",
      "審稿意見和較早的人工智能改寫只屬編採脈絡",
      "保留重要事實、人名、職銜、日期、地點、數字",
      "不得把中文人名羅馬化或音譯",
      "每個含數字的值都必須可精確追溯至 allowedNumericValues",
      "verbatimDirectQuotations 中每個項目都是必須保留的直接引文",
      "逐字保留引文內容",
      "不得把意譯或間接引語改成新的直接引文",
      "verbatimMixedLanguageTerms 中每個項目都必須逐字保留",
      "撰寫準確標題、有力導語，以及採用倒金字塔結構的正文",
      "不要只為令輸出看來不同而換字",
      "與 primaryText 完全相同、只改空白或只改標點的稿件不算改寫",
      "requiredOutputLanguage 會按 primaryText 自動判定",
      "只有 currentRefinement.lengthOption 控制本次回應",
      "選用 concise 時，提供更短、更直接的版本",
      "選用 more_detailed 時，只可使用來源資料或使用者指示中明確出現的資訊作擴寫",
      "絕不可為增加篇幅而捏造細節",
      "以最新指示為準",
      "不得把相對時間表述轉為確實曆日",
      "一行標題、一個空白行，然後是文章正文",
      "不得加入標記格式、評分、評論、前言、署名或媒體歸屬",
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
    expect(CONSERVATIVE_REWRITE_CORRECTION_SYSTEM_PROMPT).toContain(
      "正在修正未能擺脫來源複製的稿件",
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
      requiredOutputLanguage: string;
      allowedNumericValues: string[];
      verbatimDirectQuotations: string[];
      verbatimMixedLanguageTerms: string[];
      verbatimSourceScriptNames: string[];
      source: SourceSnapshot;
      reviewFeedback: unknown;
      rewriteSession: {
        earlierTurns: unknown[];
        currentTurn: unknown;
        currentRefinement: { lengthOption: null; instruction: string };
      };
    };

    expect(prompt).toContain("已明確要求改寫，不論審稿分數如何");
    expect(prompt).toContain("語言鎖定：繁體中文");
    expect(payload.requiredOutputLanguage).toMatch(/^繁體中文/);
    expect(payload.allowedNumericValues).toEqual(["7", "16", "20", "24"]);
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
    expect(unchangedPrompt).toContain("語言鎖定：繁體中文");
    expect(validationPrompt).toContain("只限一次修正");
    expect(validationPrompt).toContain("候選稿沒有採用一行標題");
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
      allowedNumericValues: string[];
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
    expect(payload.allowedNumericValues).toContain("30");
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
    expect(
      extractVerbatimSourceScriptNames(
        "王繹嘉、陳凱然、馬端行考獲佳績。超級狀元劉彥彤表示，程熹、羅苡庭，並多謝家人、老師及朋友到場。",
      ),
    ).toEqual(["王繹嘉", "陳凱然", "馬端行", "劉彥彤", "程熹", "羅苡庭"]);
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
