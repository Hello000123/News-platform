interface SupportingReportPromptSource {
  feedName: string;
  title: string;
  url: string;
}

export const POPULAR_PIPELINE_REWRITE_INSTRUCTION =
  "撰寫一篇供編輯審閱的香港繁體中文精簡新聞報道。以最重要而且有來源支持的新聞點作導語，採用準確標題、短段落及倒金字塔結構；不得提及排名、熱門程度、來源數量或批次處理。";

export const COMBINED_PIPELINE_REWRITE_INSTRUCTION =
  "主要文章是主稿；已標示的相關報道只可用作相互印證及補充。只採用明確相關、獲來源直接支持而且沒有衝突的細節；如來源矛盾，不得平均數字、拼湊結論或自行判定真偽，應保留主稿的不確定性或省略有衝突的輔助細節。不要重複同一事實，也不得把輔助報道內容改成新的直接引文。";

export const PIPELINE_REWRITE_FIDELITY_INSTRUCTION =
  "主要文章標題中的核心事件、具名人物、品牌、型號及數值是最低覆蓋要求。非核心正文細節和來源引文可以省略；但每項實際採用的人名、名稱、日期、數值、貨幣、單位、限定語及引文都必須與來源相符。相同數值如配上不同單位或所指事物，仍屬錯誤。";

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
