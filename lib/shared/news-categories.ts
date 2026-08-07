export const NEWS_CATEGORY_VALUES = [
  "technology",
  "social-enterprise",
] as const;

export type NewsCategory = (typeof NEWS_CATEGORY_VALUES)[number];

export interface NewsCategoryDefinition {
  value: NewsCategory;
  label: string;
  englishLabel: string;
  href: string;
  description: string;
}

export const NEWS_CATEGORIES: readonly NewsCategoryDefinition[] = [
  {
    value: "technology",
    label: "科技",
    englishLabel: "Technology",
    href: "/technology",
    description: "追蹤人工智能、產品、數據與數碼基建如何改變香港的工作和生活。",
  },
  {
    value: "social-enterprise",
    label: "社企專欄",
    englishLabel: "Social Enterprise",
    href: "/social-enterprise",
    description: "記錄社企的營運實踐、社區創新，以及可持續影響力背後的真實方法。",
  },
] as const;

export function newsCategoryDefinition(value: NewsCategory) {
  return NEWS_CATEGORIES.find((category) => category.value === value)!;
}
