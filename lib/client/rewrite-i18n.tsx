"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export const REWRITE_LOCALE_STORAGE_KEY = "pressready_rewrite_locale";
export const REWRITE_LOCALES = ["en", "zh-HK"] as const;

export type RewriteLocale = (typeof REWRITE_LOCALES)[number];

const EN_MESSAGES = {
  documentTitle: "Review workspace | PressReady",
  languageSwitchAria: "Switch interface language to Traditional Chinese",
  languageSwitchText: "繁體中文",
  accountNavigation: "Account navigation",
  newsSite: "News Site",
  newsPipeline: "News Pipeline",
  adminPanel: "Admin Panel",
  logout: "Logout",
  loggingOut: "Logging out…",
  logoutFailed: "Logout failed. Please try again.",
  heroEyebrow: "AI news-report assistant",
  heroTitlePrefix: "From rough draft to",
  heroTitleHighlight: "publication-ready news.",
  heroCopy:
    "Get a clear quality assessment and practical feedback first. Then edit the draft yourself or ask AI to turn the reviewed version into a news report.",
  workflowLabel: "Review workflow",
  workflowAddTitle: "Add your draft",
  workflowAddSubtitle: "Paste or type",
  workflowReviewTitle: "Get a review",
  workflowReviewSubtitle: "Scored out of 100",
  workflowChooseTitle: "Choose your next step",
  workflowChooseSubtitle: "Edit or rewrite with AI",
  footerAccuracy:
    "AI can make mistakes. Verify names, dates, quotations, statistics, and attributions.",
  footerSession:
    "The active article session is kept only in this browser tab and is cleared at logout.",
  sourceInput: "Source input",
  addArticleOrDraft: "Add the article or draft",
  pasteTextOrUrl: "Paste text or add one public article URL.",
  privacyNote: "Sent to the selected AI provider only when submitted",
  changeModelAria: "Change AI model. Current model: {model}",
  aiModel: "AI model",
  change: "Change",
  chooseAiModel: "Choose the AI model",
  highReasoningEvery: "Both options use high reasoning for every review and rewrite.",
  highReasoning: "High reasoning",
  recommended: "Recommended",
  deepseekDescription: "DeepSeek's flagship reasoning model for detailed editorial analysis.",
  grokDescription: "Latest flagship for the strongest review and rewrite quality.",
  changeModelRequiresReview: "Changing the model requires a new review before rewriting.",
  done: "Done",
  draftLabel: "News draft or article text",
  draftPlaceholder: "Paste a report, announcement, or set of news notes…",
  draftHelp: "The submitted copy is scored separately from external references.",
  word: "word",
  words: "words",
  characters: "characters",
  unknownType: "Unknown type",
  uploadZoneTitle: "Attach files or drop them here",
  uploadHelp:
    "PDF, DOCX, PPTX, XLSX, PNG, JPG, JPEG, or WebP; 10 MB combined maximum.",
  chooseFiles: "Choose files",
  file: "file",
  files: "files",
  filesSelected: "{count} {fileLabel} selected · Combined size {size} / 10 MB",
  extractingFiles: "Extracting files…",
  extractSelectedFiles: "Extract selected files",
  extractingContent: "Extracting readable content",
  readyToExtract: "Ready to extract",
  contentExtractedChoice: "Content extracted — choose how to add it",
  contentAdded: "Content added to the draft editor",
  extractedTruncated: "Extracted content was shortened to the 50,000-character editor limit.",
  removeFileAria: "Remove {name}",
  remove: "Remove",
  addExtractedGroup: "Add extracted file content",
  keepCurrentDraft: "Keep the current draft?",
  appendReplaceHelp: "Append the extracted content, or replace the editor with it.",
  appendToDraft: "Append to draft",
  replaceDraft: "Replace draft",
  publicArticleUrl: "Public article URL",
  urlHelp: "The server retrieves a bounded text snapshot.",
  reviewingDraft: "Reviewing Draft",
  reviewDraft: "Review Draft",
  rewritingDraft: "Rewriting Draft",
  rewriteDraft: "Rewrite Draft",
  passThreshold: "Pass threshold",
  reviewInProgress: "Review in progress",
  rewriteInProgress: "Rewrite in progress",
  reviewLoading: "Scoring the submitted copy and preparing calibrated review feedback.",
  rewriteLoading: "Creating and validating the latest requested rewrite.",
  longReasoning:
    " {model} is still working at high reasoning effort; complex requests can take several minutes.",
  elapsed: "Elapsed: {time}",
  elapsedMinutes: "{minutes}m {seconds}s",
  elapsedSeconds: "{seconds}s",
  requestFailed: "We could not complete that request",
  requestDiagnostics: "Request diagnostics",
  stage: "Stage",
  provider: "Provider",
  model: "Model",
  httpStatus: "HTTP status",
  noResponse: "No response",
  cause: "Cause",
  reviewAgentRequest: "Review Agent request",
  rewriteAgentRequest: "Rewrite Agent request",
  retryRewrite: "Retry Rewrite",
  reviewResultRegion: "Review result",
  genericProcessingError: "Something went wrong while processing the draft. Please try again.",
  filesProcessError: "The files could not be processed. Try again or remove the affected file.",
  appendLimitError:
    "Appending these files would exceed the 50,000-character draft limit. Replace the draft or shorten the existing text first.",
  inputRequired: "Enter draft text or a source URL before requesting a review.",
  draftLimitError: "Drafts are limited to 50,000 characters.",
  historyLimitError:
    "This article session has reached its {count}-rewrite context limit. Start a new draft to begin a fresh session.",
  copyError: "The browser could not copy the output. Select the text and copy it manually.",
  validationError: "Check the submitted draft and source details, then try again.",
  invalidSourceUrl: "Enter a valid public article URL.",
  nonPublicSource: "Use a public article URL that the server can retrieve safely.",
  sourceFetchFailed: "The source page could not be retrieved. Check the URL and try again.",
  sourceFetchTimeout: "The source page took too long to retrieve. Try again later.",
  sourceTooLarge: "The source page is too large to process safely.",
  unsupportedSourceType: "The source URL did not return a supported article format.",
  emptySource: "The source did not contain usable article text. Paste the article and try again.",
  providerTimeout: "The AI provider took too long to respond. Please try again.",
  providerFailed: "The selected AI provider could not complete the request. Please try again.",
  rewriteValidationFailed:
    "The generated rewrite did not pass the required safety checks. Retry the rewrite.",
  sessionExpired: "Your session has expired. Sign in again and retry.",
  forbidden: "You do not have permission to complete this request.",
  accountSuspended:
    "Your account is temporarily suspended because {observed} requests in {period} exceeded the configured limit of {threshold}. Account access resumes at {expiresAt}.",
  accountSuspendedGeneric:
    "Your account is temporarily suspended. Check the expiry time and try again later.",
  suspensionLast15Minutes: "the last 15 minutes",
  suspensionLast1Hour: "the last hour",
  suspensionLast6Hours: "the last 6 hours",
  suspensionLast12Hours: "the last 12 hours",
  suspensionLast24Hours: "the last 24 hours",
  requestFailedGeneric: "The request could not be completed. Please try again.",
  diagnosticCauseGeneric:
    "The provider reported a request failure. Check the selected model and account access.",
  uploadCombinedLimit: "The combined size of all selected files cannot exceed the 10 MB limit.",
  uploadFileCount: "Select no more than 50 files per submission.",
  uploadSingleTooLarge: "The selected file is larger than the 10 MB limit.",
  uploadEmpty: "The selected file is empty.",
  uploadUnsupported:
    "Unsupported file format. Choose a PDF, DOCX, PPTX, XLSX, PNG, JPG, JPEG, or WebP file.",
  uploadTypeMismatch: "The file type does not match its extension. Export the file again and retry.",
  uploadUnsafe: "The file could not be processed safely. Export a clean copy and try again.",
  uploadPasswordProtected: "Password-protected files are not supported. Upload an unlocked copy.",
  uploadTimeout: "The files took too long to process. Try simpler files.",
  uploadInvalid: "The selected files are invalid. Review the file list and try again.",
  reviewResult: "Review result",
  staleReviewTitle: "Review applies to an earlier version",
  staleReviewBody:
    "You changed the draft or source URL after this review. Review the updated source input again before requesting an AI rewrite.",
  scoreOutOf100: "{score} out of 100",
  passedReview: "Passed review",
  belowThreshold: "Below pass threshold",
  reviewComplete: "Review complete",
  changesRecommended: "Review complete — changes recommended",
  reviewMeetsMessage:
    "This copy meets the quality threshold. Review the calibrated feedback, then rewrite whenever you choose.",
  reviewBelowMessage:
    "This copy is below the quality threshold. Review the calibrated feedback, then request a rewrite.",
  readiness: "Readiness",
  publicationReady: "Publication-ready",
  strongLimited: "Strong — limited editing needed",
  substantialRewrite: "Usable — substantial rewrite needed",
  weakDraft: "Weak draft",
  severelyDeficient: "Severely deficient",
  consistencyCap: "Consistency cap",
  rewriteWithAi: "Rewrite with AI",
  editDraftMyself: "Edit draft myself",
  categoryScores: "Category scores",
  scoreContent: "Content completeness & consistency (25%)",
  scoreStructure: "Structure & organisation (20%)",
  scoreClarity: "Clarity & readability (15%)",
  scoreGrammar: "Grammar & language (15%)",
  scoreProfessional: "News professionalism (15%)",
  scoreAttribution: "Attribution & quotation clarity (10%)",
  reasonContent: "Content completeness & consistency",
  reasonStructure: "Structure & organisation",
  reasonClarity: "Clarity & readability",
  reasonGrammar: "Grammar & language",
  reasonProfessional: "News professionalism",
  reasonAttribution: "Attribution & quotation clarity",
  findingLine: "[{category} — {severity}] {issue} Evidence: {evidence} Action: {recommendation}",
  scoreRationale: "Score rationale",
  strengths: "Strengths",
  findings: "Findings",
  missingInformation: "Missing or unclear information",
  recommendedImprovements: "Recommended improvements",
  noneIdentified: "None identified.",
  finalOutput: "Final output",
  outputTitle: "AI-rewritten news report",
  outputHelp:
    "Created from the reviewed draft and its feedback. Verify every name, date, number, quotation, attribution, and retained placeholder before publication.",
  aiRewritten: "AI rewritten",
  finalTextLabel: "Final news report text",
  copied: "Copied",
  copyToClipboard: "Copy to Clipboard",
  rewriteAgainWithAi: "Rewrite with AI Again",
  startNewDraft: "Start New Draft",
  refineNextRewrite: "Refine the next rewrite",
  refinementHelp: "Length options are optional. Choose one or leave both unselected.",
  lengthAndDetail: "Length and detail",
  optional: "(optional)",
  concise: "Concise",
  moreDetailed: "More detailed",
  improvementInstructions: "Improvement instructions",
  improvementPlaceholder: "Describe how you want the article improved",
  rewriteAgain: "Rewrite Again",
  cancel: "Cancel",
  copiedStatus: "The final news report was copied to your clipboard.",
  quotationCheck: "Quotation check",
  quotationCorrectionTitle: "Rewrite needs quotation correction",
  quotationCorrectionBody:
    "The generated article is not marked as final. Automatic correction is limited to one retry to avoid a retry loop.",
  quotationAttempts: " ({count} total attempts)",
  quotationModified: "Quoted wording was modified",
  quotationOmitted: "Quotation was omitted",
  quotationSplit: "Quotation was split",
  quotationMerged: "Quotation was merged",
  quotationPunctuation: "Punctuation inside the quotation changed",
  quotationDifferenceModified: "Quotation wording differs from the source.",
  quotationDifferenceOmitted: "No corresponding quotation appears in the rewrite.",
  quotationDifferenceSplit: "The source quotation was split in the rewrite.",
  quotationDifferenceMerged: "Source quotations were merged in the rewrite.",
  quotationDifferencePunctuation: "Punctuation inside the quotation differs from the source.",
  quotationActionModified: "Restore the source quotation exactly and edit only outside it.",
  quotationActionOmitted: "Restore the complete source quotation near its attribution.",
  quotationActionSplit: "Restore the source quotation as one intact quotation.",
  quotationActionMerged: "Restore each source quotation separately and exactly.",
  quotationActionPunctuation: "Restore the quotation's internal punctuation exactly.",
  paragraphProblem: "Paragraph {paragraph}: {problem}",
  original: "Original",
  rewrite: "Rewrite",
  problem: "Problem",
  action: "Action",
  noQuotation: "No corresponding quotation was found.",
  candidateLabel: "Generated draft — not validated for publication",
} as const;

type RewriteMessageKey = keyof typeof EN_MESSAGES;

const ZH_HK_MESSAGES: Record<RewriteMessageKey, string> = {
  documentTitle: "審閱工作區 | PressReady",
  languageSwitchAria: "將介面語言切換為英文",
  languageSwitchText: "English",
  accountNavigation: "帳戶導覽",
  newsSite: "新聞網站",
  newsPipeline: "新聞流程",
  adminPanel: "管理後台",
  logout: "登出",
  loggingOut: "正在登出…",
  logoutFailed: "登出失敗，請再試一次。",
  heroEyebrow: "AI 新聞稿助理",
  heroTitlePrefix: "由初稿變成",
  heroTitleHighlight: "可發佈的新聞稿。",
  heroCopy: "先取得清晰的質素評估和實用意見，再自行修改草稿，或讓 AI 將已審閱版本改寫成新聞稿。",
  workflowLabel: "審閱流程",
  workflowAddTitle: "加入草稿",
  workflowAddSubtitle: "貼上或輸入文字",
  workflowReviewTitle: "取得審閱",
  workflowReviewSubtitle: "以 100 分評分",
  workflowChooseTitle: "選擇下一步",
  workflowChooseSubtitle: "自行修改或使用 AI 改寫",
  footerAccuracy: "AI 可能出錯。請核對姓名、日期、引述、統計數字及資料出處。",
  footerSession: "目前文章工作階段只保留在此瀏覽器分頁，登出時會清除。",
  sourceInput: "來源輸入",
  addArticleOrDraft: "加入文章或草稿",
  pasteTextOrUrl: "貼上文字，或加入一個公開文章網址。",
  privacyNote: "只會在提交後傳送給所選 AI 供應商",
  changeModelAria: "更改 AI 模型。目前模型：{model}",
  aiModel: "AI 模型",
  change: "更改",
  chooseAiModel: "選擇 AI 模型",
  highReasoningEvery: "兩個選項都會為每次審閱及改寫使用高推理模式。",
  highReasoning: "高推理模式",
  recommended: "建議",
  deepseekDescription: "DeepSeek 的旗艦推理模型，適合詳細編採分析。",
  grokDescription: "最新旗艦模型，提供最強的審閱及改寫質素。",
  changeModelRequiresReview: "更改模型後，必須重新審閱才可改寫。",
  done: "完成",
  draftLabel: "新聞草稿或文章文字",
  draftPlaceholder: "貼上報告、公告或新聞筆記…",
  draftHelp: "提交的內容會與外部參考資料分開評分。",
  word: "字詞",
  words: "字詞",
  characters: "字元",
  unknownType: "未知類型",
  uploadZoneTitle: "附加檔案或拖放至此",
  uploadHelp: "支援 PDF、DOCX、PPTX、XLSX、PNG、JPG、JPEG 或 WebP；合計上限為 10 MB。",
  chooseFiles: "選擇檔案",
  file: "個檔案",
  files: "個檔案",
  filesSelected: "已選擇 {count} {fileLabel} · 合計大小 {size} / 10 MB",
  extractingFiles: "正在擷取檔案…",
  extractSelectedFiles: "擷取所選檔案",
  extractingContent: "正在擷取可讀內容",
  readyToExtract: "準備擷取",
  contentExtractedChoice: "內容已擷取 — 請選擇加入方式",
  contentAdded: "內容已加入草稿編輯器",
  extractedTruncated: "擷取內容已縮短至 50,000 字元的編輯器上限。",
  removeFileAria: "移除 {name}",
  remove: "移除",
  addExtractedGroup: "加入已擷取的檔案內容",
  keepCurrentDraft: "保留目前草稿？",
  appendReplaceHelp: "將擷取內容附加至草稿，或取代編輯器內的內容。",
  appendToDraft: "附加至草稿",
  replaceDraft: "取代草稿",
  publicArticleUrl: "公開文章網址",
  urlHelp: "伺服器會擷取有長度限制的文字快照。",
  reviewingDraft: "正在審閱草稿",
  reviewDraft: "審閱草稿",
  rewritingDraft: "正在改寫草稿",
  rewriteDraft: "改寫草稿",
  passThreshold: "合格分數",
  reviewInProgress: "正在審閱",
  rewriteInProgress: "正在改寫",
  reviewLoading: "正在評分提交內容並準備校準後的審閱意見。",
  rewriteLoading: "正在建立並驗證最新要求的改寫版本。",
  longReasoning: " {model} 仍在以高推理模式處理；複雜要求可能需時數分鐘。",
  elapsed: "已用時間：{time}",
  elapsedMinutes: "{minutes}分 {seconds}秒",
  elapsedSeconds: "{seconds}秒",
  requestFailed: "未能完成此要求",
  requestDiagnostics: "要求診斷資料",
  stage: "階段",
  provider: "供應商",
  model: "模型",
  httpStatus: "HTTP 狀態",
  noResponse: "沒有回應",
  cause: "原因",
  reviewAgentRequest: "審閱代理要求",
  rewriteAgentRequest: "改寫代理要求",
  retryRewrite: "重試改寫",
  reviewResultRegion: "審閱結果",
  genericProcessingError: "處理草稿時發生問題，請再試一次。",
  filesProcessError: "未能處理檔案。請重試或移除有問題的檔案。",
  appendLimitError: "附加這些檔案會超出 50,000 字元的草稿上限。請取代草稿，或先縮短現有文字。",
  inputRequired: "請輸入草稿文字或來源網址，然後再要求審閱。",
  draftLimitError: "草稿上限為 50,000 字元。",
  historyLimitError: "此文章工作階段已達 {count} 次改寫的內容上限。請開始新草稿以建立新的工作階段。",
  copyError: "瀏覽器未能複製輸出。請選取文字後手動複製。",
  validationError: "請檢查提交的草稿及來源資料，然後再試一次。",
  invalidSourceUrl: "請輸入有效的公開文章網址。",
  nonPublicSource: "請使用伺服器可安全擷取的公開文章網址。",
  sourceFetchFailed: "未能擷取來源頁面。請檢查網址後再試一次。",
  sourceFetchTimeout: "擷取來源頁面需時過長，請稍後再試。",
  sourceTooLarge: "來源頁面太大，無法安全處理。",
  unsupportedSourceType: "來源網址並非受支援的文章格式。",
  emptySource: "來源沒有可用的文章文字。請貼上文章後再試。",
  providerTimeout: "AI 供應商回應需時過長，請再試一次。",
  providerFailed: "所選 AI 供應商未能完成要求，請再試一次。",
  rewriteValidationFailed: "產生的改寫版本未通過必要安全檢查，請重試改寫。",
  sessionExpired: "工作階段已過期。請重新登入後再試。",
  forbidden: "你沒有權限完成此要求。",
  accountSuspended:
    "你的帳戶已暫停使用 AI 要求，原因是{period}內錄得 {observed} 次要求，超過已設定的 {threshold} 次上限。AI 使用權將於 {expiresAt} 恢復。",
  accountSuspendedGeneric:
    "你的帳戶已暫停使用 AI 要求。請查看暫停屆滿時間，並於稍後再試。",
  suspensionLast15Minutes: "過去 15 分鐘",
  suspensionLast1Hour: "過去 1 小時",
  suspensionLast6Hours: "過去 6 小時",
  suspensionLast12Hours: "過去 12 小時",
  suspensionLast24Hours: "過去 24 小時",
  requestFailedGeneric: "未能完成要求，請再試一次。",
  diagnosticCauseGeneric: "供應商回報要求失敗。請檢查所選模型及帳戶權限。",
  uploadCombinedLimit: "所有已選檔案的合計大小不可超過 10 MB。",
  uploadFileCount: "每次提交最多可選擇 50 個檔案。",
  uploadSingleTooLarge: "所選檔案超過 10 MB 上限。",
  uploadEmpty: "所選檔案是空白的。",
  uploadUnsupported: "不支援此檔案格式。請選擇 PDF、DOCX、PPTX、XLSX、PNG、JPG、JPEG 或 WebP 檔案。",
  uploadTypeMismatch: "檔案類型與副檔名不符。請重新匯出檔案後再試。",
  uploadUnsafe: "未能安全處理此檔案。請匯出乾淨版本後再試。",
  uploadPasswordProtected: "不支援受密碼保護的檔案。請上載已解除鎖定的版本。",
  uploadTimeout: "處理檔案需時過長。請嘗試較簡單的檔案。",
  uploadInvalid: "所選檔案無效。請檢查檔案清單後再試。",
  reviewResult: "審閱結果",
  staleReviewTitle: "此審閱適用於較早版本",
  staleReviewBody: "你在審閱後更改了草稿或來源網址。請重新審閱更新後的來源，再要求 AI 改寫。",
  scoreOutOf100: "{score} / 100 分",
  passedReview: "審閱合格",
  belowThreshold: "低於合格分數",
  reviewComplete: "審閱完成",
  changesRecommended: "審閱完成 — 建議修改",
  reviewMeetsMessage: "此內容符合質素門檻。請查看校準後的意見，並在準備好時要求改寫。",
  reviewBelowMessage: "此內容低於質素門檻。請查看校準後的意見，然後要求改寫。",
  readiness: "可發佈程度",
  publicationReady: "可直接發佈",
  strongLimited: "良好 — 只需少量修改",
  substantialRewrite: "可用 — 需要大幅改寫",
  weakDraft: "草稿較弱",
  severelyDeficient: "嚴重不足",
  consistencyCap: "一致性分數上限",
  rewriteWithAi: "使用 AI 改寫",
  editDraftMyself: "自行修改草稿",
  categoryScores: "分類評分",
  scoreContent: "內容完整及一致性（25%）",
  scoreStructure: "結構及組織（20%）",
  scoreClarity: "清晰度及可讀性（15%）",
  scoreGrammar: "文法及語言（15%）",
  scoreProfessional: "新聞專業程度（15%）",
  scoreAttribution: "資料出處及引述清晰度（10%）",
  reasonContent: "內容完整及一致性",
  reasonStructure: "結構及組織",
  reasonClarity: "清晰度及可讀性",
  reasonGrammar: "文法及語言",
  reasonProfessional: "新聞專業程度",
  reasonAttribution: "資料出處及引述清晰度",
  findingLine: "[{category} — {severity}] {issue} 證據：{evidence} 建議：{recommendation}",
  scoreRationale: "評分理由",
  strengths: "優點",
  findings: "發現",
  missingInformation: "缺少或不清楚的資料",
  recommendedImprovements: "建議改善事項",
  noneIdentified: "未有發現。",
  finalOutput: "最終輸出",
  outputTitle: "AI 改寫新聞稿",
  outputHelp: "內容根據已審閱草稿及意見產生。發佈前請核對每個姓名、日期、數字、引述、資料出處及保留的佔位符。",
  aiRewritten: "AI 已改寫",
  finalTextLabel: "最終新聞稿文字",
  copied: "已複製",
  copyToClipboard: "複製到剪貼簿",
  rewriteAgainWithAi: "再次使用 AI 改寫",
  startNewDraft: "開始新草稿",
  refineNextRewrite: "調整下一次改寫",
  refinementHelp: "篇幅選項並非必填。可選擇一項，或兩項都不選。",
  lengthAndDetail: "篇幅及詳細程度",
  optional: "（選填）",
  concise: "精簡",
  moreDetailed: "更詳細",
  improvementInstructions: "改善指示",
  improvementPlaceholder: "說明你希望如何改善文章",
  rewriteAgain: "再次改寫",
  cancel: "取消",
  copiedStatus: "最終新聞稿已複製到剪貼簿。",
  quotationCheck: "引述檢查",
  quotationCorrectionTitle: "改寫版本需要修正引述",
  quotationCorrectionBody: "產生的文章尚未標記為最終版本。自動修正只會重試一次，以免形成重試循環。",
  quotationAttempts: "（共嘗試 {count} 次）",
  quotationModified: "引述字句已被修改",
  quotationOmitted: "引述已被省略",
  quotationSplit: "引述已被拆開",
  quotationMerged: "引述已被合併",
  quotationPunctuation: "引述內的標點已更改",
  quotationDifferenceModified: "引述字句與來源不完全相同。",
  quotationDifferenceOmitted: "改寫中找不到相應引述。",
  quotationDifferenceSplit: "來源引述在改寫中被拆分。",
  quotationDifferenceMerged: "多段來源引述在改寫中被合併。",
  quotationDifferencePunctuation: "引述內的標點與來源不同。",
  quotationActionModified: "請逐字還原來源引述，只在引號外修改。",
  quotationActionOmitted: "請在原有出處附近還原完整來源引述。",
  quotationActionSplit: "請將來源引述還原為一段完整引述。",
  quotationActionMerged: "請分開並逐字還原每段來源引述。",
  quotationActionPunctuation: "請逐字還原引述內的標點。",
  paragraphProblem: "第 {paragraph} 段：{problem}",
  original: "原文",
  rewrite: "改寫",
  problem: "問題",
  action: "處理方法",
  noQuotation: "找不到相應引述。",
  candidateLabel: "產生的草稿 — 尚未通過發佈驗證",
};

export type RewriteTranslator = (
  key: RewriteMessageKey,
  values?: Record<string, string | number>,
) => string;

export function isRewriteLocale(value: unknown): value is RewriteLocale {
  return typeof value === "string" && (REWRITE_LOCALES as readonly string[]).includes(value);
}

export function createRewriteTranslator(locale: RewriteLocale): RewriteTranslator {
  const messages = locale === "zh-HK" ? ZH_HK_MESSAGES : EN_MESSAGES;
  return (key, values = {}) =>
    messages[key].replace(/\{([A-Za-z0-9_]+)\}/gu, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
    );
}

interface RewriteI18nContextValue {
  locale: RewriteLocale;
  t: RewriteTranslator;
  toggleLocale: () => void;
}

const englishTranslator = createRewriteTranslator("en");
const RewriteI18nContext = createContext<RewriteI18nContextValue>({
  locale: "en",
  t: englishTranslator,
  toggleLocale: () => undefined,
});

export function RewriteI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<RewriteLocale>("en");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const stored = window.localStorage.getItem(REWRITE_LOCALE_STORAGE_KEY);
        if (isRewriteLocale(stored)) setLocale(stored);
      } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const t = useMemo(() => createRewriteTranslator(locale), [locale]);
  const toggleLocale = useCallback(() => {
    setLocale((current) => {
      const next = current === "en" ? "zh-HK" : "en";
      try {
        window.localStorage.setItem(REWRITE_LOCALE_STORAGE_KEY, next);
      } catch {
        // The selection remains active for this page even when persistence fails.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const localizedTitle = t("documentTitle");
    const applyLocalizedTitle = () => {
      if (document.title !== localizedTitle) document.title = localizedTitle;
    };
    applyLocalizedTitle();
    const observer = new MutationObserver(applyLocalizedTitle);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const timeout = window.setTimeout(applyLocalizedTitle, 0);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [t]);

  const value = useMemo(
    () => ({ locale, t, toggleLocale }),
    [locale, t, toggleLocale],
  );
  return (
    <RewriteI18nContext.Provider value={value}>
      {children}
    </RewriteI18nContext.Provider>
  );
}

export function useRewriteI18n() {
  return useContext(RewriteI18nContext);
}
