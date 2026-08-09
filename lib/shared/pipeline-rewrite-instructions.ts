interface SupportingReportPromptSource {
  feedName: string;
  title: string;
  url: string;
}

interface PipelineRewriteEvidence {
  primaryText: string;
  linkedText?: string;
}

export const MIN_DETAILED_PIPELINE_EVIDENCE_CHARS = 600;

export const POPULAR_PIPELINE_REWRITE_INSTRUCTION =
  "撰寫一篇供編輯審閱、可直接用於網站的香港繁體中文完整新聞報道。充分運用主要文章正文中與主題相關而且來源明確的內容，避免只重述標題；來源資料充足時，以導語加上至少三個短段落交代事件、背景、影響及後續，資料不足時寧可縮短而不得重複或補寫。採用準確標題、短段落及倒金字塔結構；不得提及排名、熱門程度、來源數量或批次處理。";

export const COMBINED_PIPELINE_REWRITE_INSTRUCTION =
  "主要文章是主稿；已標示的相關報道只可用作相互印證及補充。只採用明確相關、獲來源直接支持而且沒有衝突的細節；如來源矛盾，不得平均數字、拼湊結論或自行判定真偽，應保留主稿的不確定性或省略有衝突的輔助細節。不要重複同一事實，也不得把輔助報道內容改成新的直接引文。";

export const PIPELINE_REWRITE_FIDELITY_INSTRUCTION =
  "主要文章標題中的核心事件、具名人物、品牌、型號及數值是最低覆蓋要求，而非內容上限；應充分運用主要文章正文中與主題相關而且來源明確的細節，避免只重述標題。非核心正文細節和來源引文可以省略；但每項實際採用的人名、名稱、日期、數值、貨幣、單位、限定語及引文都必須與來源相符。相同數值如配上不同單位或所指事物，仍屬錯誤。";

export const SPARSE_PIPELINE_SOURCE_INSTRUCTION =
  "目前可用來源只足以撰寫精簡新聞簡報。只交代來源明確提供的核心事件及必要背景；不得為增加篇幅而推測原因、影響、規格、日期、數值、引文或後續安排。";

/**
 * A detailed article needs more than a headline-sized feed preview. Counting
 * the primary and related-report evidence prevents a short RSS teaser from
 * being expanded into unsupported copy while still allowing a well-sourced
 * multi-report cluster to use the detailed mode.
 */
export function pipelineSourceSupportsDetailedRewrite(source: PipelineRewriteEvidence) {
  const evidence = [source.primaryText, source.linkedText]
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n")
    .replace(/\s+/gu, "");
  return Array.from(evidence).length >= MIN_DETAILED_PIPELINE_EVIDENCE_CHARS;
}

export function formatSupportingReportPrompt(
  article: SupportingReportPromptSource,
  sourceText: string,
  index: number,
) {
  return [
    `相關報道 ${index} — ${article.feedName}`,
    `標題：${article.title}`,
    `來源網址：${article.url}`,
    sourceText,
  ].join("\n");
}
