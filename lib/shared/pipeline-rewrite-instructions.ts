interface SupportingReportPromptSource {
  feedName: string;
  title: string;
  url: string;
}

export const POPULAR_PIPELINE_REWRITE_INSTRUCTION =
  "建立一篇清晰的繁體中文新聞報道，供編輯人員審閱。只採用同組報道中有明確依據且互不衝突的事實。";

export const COMBINED_PIPELINE_REWRITE_INSTRUCTION =
  "這是一篇綜合新聞簡報。把已標示的相關報道只當作相互印證的來源資料，只保留各來源明確載明且彼此一致的事實；不要重複同一細節，也不要把輔助報道中的引述改成新的直接引文。";

export const PIPELINE_REWRITE_FIDELITY_INSTRUCTION =
  "準確保留主要文章標題中的事實、具名人物、品牌及型號名稱，以及關鍵數字。精簡稿可以壓縮非必要的正文細節，但不得更改或捏造稿件採用的姓名、數字、日期或引文，也不得遺漏必須保留的項目。";

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
