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
      title: "ClickFix attack",
      source: "微软发现超过250个相关域名，并提醒用户不要执行来历不明的终端命令。",
      candidate:
        "ClickFix攻擊涉及逾250個域名\n\n微軟發現攻擊涉及超過250個相關域名，並提醒用戶不要執行來歷不明的終端指令。",
    },
    {
      title: "Windows weather processes",
      source:
        "Windows 11 天气应用的内存占用是苹果天气应用的5倍，并运行着9个独立子进程。报道认为系统真正需要一整套原生应用。",
      candidate:
        "Windows 11天氣應用佔用更多記憶體\n\nWindows 11天氣應用的記憶體佔用是蘋果天氣應用的5倍，並運行9個獨立子程序。報道認為系統真正需要一套原生應用。",
    },
    {
      title: "Samsung internship",
      source: "三星启动实习生招聘。这是一项面向工程专业应届毕业生的招聘计划。",
      candidate:
        "三星啟動實習生招聘\n\n三星啟動實習生招聘，這是一項面向工程專業應屆畢業生的招聘計劃。",
    },
  ])("accepts Simplified-to-Traditional classifier conversion: $title", async ({ source, candidate }) => {
    const result = await runRewriteAgent(
      snapshot(source),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
    expect(result.validation).toEqual({ status: "passed", attempts: 1 });
  });

  it("accepts the reported Windows Weather localization without treating Windows 11 as a duration", async () => {
    const source = [
      "Windows Latest claims that the Windows 11 Weather app uses five times more RAM than macOS's Weather app.",
      "One of its writers opened the app and found that it took up 1.2GB of RAM, compared with 246.7MB on macOS.",
      "Windows Latest spotted nine Chromium processes powering it through WebView2. Microsoft has shown intent to move specific elements of Windows 11 over to WinUI 3.",
    ].join(" ");
    const candidate =
      "Windows 11 Weather app記憶體用量達macOS Weather app五倍\n\nWindows Latest一名撰稿人開啟Windows 11 Weather app後，發現它佔用1.2GB記憶體，高於macOS Weather app的246.7MB，並運行9個Chromium程序。應用程式採用WebView2技術；報道亦提到微軟正把部分Windows 11元素轉用WinUI 3。";
    const result = await runRewriteAgent(
      snapshot(source, {
        linkedTitle:
          "Windows 11's Weather app reportedly uses 5x more RAM than macOS's Weather app, with ads to boot",
      }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
    expect(result.validation).toEqual({ status: "passed", attempts: 1 });
  });

  it("accepts localized Intel core, thread, and power-phase counts", async () => {
    const source = [
      "The Nova Lake-S SKU with 12 Xe3 iGPUs would feature a 4 P-Core, 8 E-Core, and 4 LP-E core stack, yielding 16 cores and 16 threads.",
      "The iGPU-specific PL2 is 40W while the chip-wide PL2 is 154W.",
      "The 12Xe3P Nova Lake-S SKU will require two dedicated VCCGT phases for the iGPU core.",
    ].join(" ");
    const candidate =
      "Intel Nova Lake 16核心CPU的PL2達154W\n\nIntel Nova Lake-S的iGPU配備12 Xe3P核心，處理器採用4 P核心、8 E核心及4 LP-E核心，共有16核心和16條執行緒。iGPU的PL2為40W，整顆晶片的PL2為154W，並需要兩個專用VCCGT供電相位。";
    const result = await runRewriteAgent(
      snapshot(source, {
        linkedTitle:
          "Intel Nova Lake 16-Core CPU Pushes 154W PL2, While its Integrated 12 Xe3P GPU Alone Eats 40 Watts",
      }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
    expect(result.validation).toEqual({ status: "passed", attempts: 1 });
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
    {
      source: "A piece of rocket debris is set to hit the moon while orbiters observe it.",
      title: "SpaceX rocket debris set to hit the moon",
      candidate: "SpaceX火箭殘骸將撞月\n\n一枚SpaceX火箭殘骸將撞向月球，軌道探測器會觀察事件。",
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

  it("does not treat an unrelated English indefinite article as count evidence", async () => {
    const badCandidate = "SpaceX消息更新\n\n報道提到一枚SpaceX裝置。";
    await expect(
      runRewriteAgent(
        snapshot("A preferred source described the SpaceX update.", {
          linkedTitle: "SpaceX update",
        }),
        null,
        async () => badCandidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("accepts an English decade translated into a Chinese year expression", async () => {
    const candidate =
      "NASA延續撞月觀測研究\n\nNASA曾於70年代安排太空硬件撞月，以進行地震實驗。新一輪撞擊亦會由軌道探測器觀測。";
    const result = await runRewriteAgent(
      snapshot(
        "NASA deliberately crashed hardware into the moon during the Apollo missions in the 70s to conduct seismic experiments.",
        { linkedTitle: "NASA prepares to observe another lunar impact" },
      ),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
  });

  it("accepts all localized numeric facts from the reported SpaceX headline and history", async () => {
    const candidate =
      "SpaceX火箭級將以時速5,400英里撞月\n\n這枚火箭級預計以音速7倍撞向月球，撞擊威力相當於3噸TNT。NASA曾於1970年代安排太空硬件撞月，以進行地震實驗。";
    const result = await runRewriteAgent(
      snapshot(
        "NASA deliberately crashed hardware into the moon during the Apollo missions in the 70s to conduct seismic experiments.",
        {
          linkedTitle:
            "Errant SpaceX rocket stage set to smash into the moon at 5,400 mph, seven times the speed of sound — NASA and South Korean orbiters prepare to track 3-ton TNT impact",
        },
      ),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
  });

  it("accepts grammatical singular classifiers in the reported EGO charger story", async () => {
    const source =
      "本地品牌 EGO 推出兩款配備 OLED 實時顯示的 GaN 充電器。EGO 200W EXTREME 4 可同時為兩台大功率筆電充電；EGO 100W OPTIMUM GaN 3 則是牆插式充電器。";
    const candidate =
      "EGO推出兩款配OLED彩屏GaN充電器\n\nEGO推出兩款配備OLED實時顯示的GaN充電器，其中一款是EGO 200W EXTREME 4，可同時為兩部大功率筆電充電。另一款EGO 100W OPTIMUM GaN 3採用牆插式設計。";
    const result = await runRewriteAgent(
      snapshot(source, { linkedTitle: "【場料】GaN 充電器也監控　EGO 玩 OLED 彩屏" }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
  });

  it("accepts the reported Gemini app rewrite with grammatical singular wording", async () => {
    const source =
      "At I/O 2026, Google teased an AI Studio app for Android and iOS. More than 800,000 users pre-ordered it. For example, say you want to start a garden and imagine Gemini creating an app that teaches you the basics.";
    const candidate =
      "Google取消AI Studio手機App\n\nGoogle取消原定為Android及iOS推出的一款AI Studio應用程式，改為把相關功能整合至Gemini。超過800,000名用戶曾預先登記；例如一名用戶想開始園藝，Gemini可建立另一款應用程式提供協助。";
    const result = await runRewriteAgent(
      snapshot(source, {
        linkedTitle:
          "Gemini will create mobile & desktop apps in the future as AI Studio for Android, iOS is canceled",
      }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
  });

  it("accepts the reported Lenovo unit and classifier localizations", async () => {
    const source =
      "Lenovo Yoga 9i 2-in-1 Gen 11 Aura Edition採用360°鉸鏈，機身重量約1.27kg。系統內置Lenovo AI Now，提供兩種模式，並搭載Intel Core Ultra 7 355處理器。";
    const candidate =
      "Lenovo Yoga 9i 2-in-1 Gen 11 Aura Edition實測\n\nLenovo Yoga 9i 2-in-1 Gen 11 Aura Edition採用360度鉸鏈，重量約1.27公斤，並提供兩項AI聊天模式。裝置搭載Intel Core Ultra 7 355處理器。";
    const result = await runRewriteAgent(
      snapshot(source, {
        linkedTitle:
          "Lenovo Yoga 9i 2-in-1 Gen 11 Aura Edition 實測｜旗艦二合一 Intel Core Ultra 7 355 加持本地 AI 運算",
      }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
  });

  it("accepts localized X follower and view thresholds plus a vague dozens expression", async () => {
    const source =
      "Creators need at least 500 verified followers and at least 500,000 Home timeline views from verified users within the last 90 days. Earlier reporting found dozens of popular accounts were not based in the United States.";
    const candidate =
      "X改推原創內容獎勵計劃\n\n新計劃要求創作者至少擁有500名已驗證追蹤者，並在過去90日內獲得至少500,000次來自已驗證用戶的主頁時間軸瀏覽。報道亦提到，較早前有數十個熱門帳戶被揭發並非身處美國。";
    const result = await runRewriteAgent(
      snapshot(source, {
        linkedTitle:
          "X is replacing revenue sharing with a new original content rewards program",
      }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
  });

  it("still rejects changed X follower, view, and exact account counts", async () => {
    const source =
      "Creators need at least 500 verified followers and at least 500,000 Home timeline views from verified users within the last 90 days. Earlier reporting found dozens of popular accounts were not based in the United States.";
    const candidate =
      "X改推原創內容獎勵計劃\n\n新計劃要求創作者至少擁有501名已驗證追蹤者，並在過去90日內獲得至少500,001次主頁時間軸瀏覽。報道又聲稱有十個熱門帳戶。";

    await expect(
      runRewriteAgent(
        snapshot(source, {
          linkedTitle:
            "X is replacing revenue sharing with a new original content rewards program",
        }),
        null,
        async () => candidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("still rejects changed Lenovo measurements and mode counts", async () => {
    const source =
      "Lenovo Yoga 9i 2-in-1 Gen 11 Aura Edition採用360°鉸鏈，機身重量約1.27kg，並提供兩種模式及Intel Core Ultra 7 355處理器。";
    const candidate =
      "Lenovo Yoga 9i 2-in-1 Gen 11 Aura Edition實測\n\nLenovo Yoga 9i 2-in-1 Gen 11 Aura Edition採用361度鉸鏈，重量約1.28公斤，並提供三項AI模式。裝置搭載Intel Core Ultra 7 355處理器。";
    await expect(
      runRewriteAgent(
        snapshot(source, {
          linkedTitle:
            "Lenovo Yoga 9i 2-in-1 Gen 11 Aura Edition 實測｜旗艦二合一 Intel Core Ultra 7 355 加持本地 AI 運算",
        }),
        null,
        async () => candidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("accepts a ranked-list headline translated with a Chinese classifier", async () => {
    const candidate =
      "2026年8款最佳密碼管理器\n\n報道測試及評選8款密碼管理器，協助用戶管理不同帳戶。各款工具的功能和收費模式不盡相同。";
    const result = await runRewriteAgent(
      snapshot("The guide compares password managers after recent testing.", {
        linkedTitle: "8 Best Password Managers (2026), Tested and Reviewed",
      }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
  });

  it("does not treat the Hong Kong expression 一次過 as a material numeric claim", async () => {
    const candidate =
      "車用吸塵機選購指南\n\n合適的車用吸塵機可協助用戶一次過清理座椅、地墊和窄縫。選購時可比較機身大小、配件和電池續航。";
    const result = await runRewriteAgent(
      snapshot("A suitable car vacuum helps with quick cleans in seats, mats, and crevices.", {
        linkedTitle: "Best Car Vacuums: Handheld, Cordless, Shopping Tips",
      }),
      null,
      async () => candidate,
      relaxedContext,
    );

    expect(result.finalText).toBe(candidate);
  });

  it("still rejects a fabricated explicit occurrence count", async () => {
    const candidate =
      "車用吸塵機選購指南\n\n報道聲稱測試只進行了1次。文章亦提供車用吸塵機的選購建議。";
    await expect(
      runRewriteAgent(
        snapshot("The guide compares car vacuums and offers shopping advice.", {
          linkedTitle: "Best Car Vacuums: Handheld, Cordless, Shopping Tips",
        }),
        null,
        async () => candidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("still rejects a fabricated Chinese occurrence count", async () => {
    const candidate =
      "產品測試完成\n\n公司表示產品測試已完成，並聲稱測試只進行了一次。";
    await expect(
      runRewriteAgent(
        snapshot("The company completed product testing.", {
          linkedTitle: "公司完成產品測試",
        }),
        null,
        async () => candidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it("rejects reducing a supported device count from two to one", async () => {
    const candidate = "公司公布新裝置\n\n公司表示只推出一部裝置，並交代主要功能。";
    await expect(
      runRewriteAgent(
        snapshot("公司推出兩部裝置，並交代主要功能。", {
          linkedTitle: "公司公布新裝置",
        }),
        null,
        async () => candidate,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ status: 422, code: "UNTRACEABLE_REWRITE_NUMBER" });
  });

  it.each([
    "公司聲稱只測試了1款產品。報道亦提供其他產品資料。",
    "公司聲稱只測試了1部裝置。報道亦提供其他產品資料。",
    "公司聲稱有一名測試員。報道亦提供其他產品資料。",
  ])("still rejects a material unsupported singular: %s", async (body) => {
    await expect(
      runRewriteAgent(
        snapshot("The guide compares products and offers shopping advice.", {
          linkedTitle: "產品選購指南",
        }),
        null,
        async () => `產品選購指南\n\n${body}`,
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

  it("sends all deterministic failures through the bounded correction attempts", async () => {
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

    expect(completion).toHaveBeenCalledTimes(3);
    expect(completion.mock.calls[1][0].userPrompt).toContain("INEXACT_MIXED_LANGUAGE_TERM");
    expect(completion.mock.calls[1][0].userPrompt).toContain("MISSING_REWRITE_NUMBER");
    expect(completion.mock.calls[2][0].userPrompt).toContain("INEXACT_MIXED_LANGUAGE_TERM");
    expect(completion.mock.calls[2][0].userPrompt).toContain("MISSING_REWRITE_NUMBER");
    expect(completion.mock.calls[1][0]).toMatchObject({
      systemPrompt: expect.stringContaining("只負責修正來源忠實度的機械式校正器"),
      temperature: 0,
    });
  });

  it("accepts a pipeline rewrite that becomes safe on the final bounded repair", async () => {
    const deficientCandidate = "新產品推出\n\n公司公布新產品。";
    const correctedCandidate =
      "Google Pixel 9售價40美元\n\n公司公布Google Pixel 9，售價為40美元。報道只採用來源已列明的產品及價格資料。";
    const completion = vi
      .fn()
      .mockResolvedValueOnce(deficientCandidate)
      .mockResolvedValueOnce(deficientCandidate)
      .mockResolvedValueOnce(correctedCandidate);

    await expect(
      runRewriteAgent(
        snapshot("公司公布 Google Pixel 9，售價為 40 美元。", {
          linkedTitle: "Google Pixel 9 售價 40 美元",
        }),
        null,
        completion,
        relaxedContext,
      ),
    ).resolves.toEqual({
      finalText: correctedCandidate,
      validation: { status: "passed_after_retry", attempts: 3 },
    });
    expect(completion).toHaveBeenCalledTimes(3);
    expect(completion.mock.calls[2][0]).toMatchObject({
      systemPrompt: expect.stringContaining("只負責修正來源忠實度的機械式校正器"),
      temperature: 0,
    });
  });

  it("omits an optional unsupported-number sentence after both focused corrections", async () => {
    const unsafeCandidate =
      "公司公布新產品\n\n公司公布新產品，並介紹主要用途。稿件亦交代產品的基本設計。報道聲稱產品共有三套配置。";
    const completion = vi.fn().mockResolvedValue(unsafeCandidate);

    await expect(
      runRewriteAgent(
        snapshot("公司公布新產品，並介紹主要用途及基本設計。"),
        null,
        completion,
        relaxedContext,
      ),
    ).resolves.toEqual({
      finalText:
        "公司公布新產品\n\n公司公布新產品，並介紹主要用途。稿件亦交代產品的基本設計。",
      validation: { status: "passed_after_retry", attempts: 3 },
    });
    expect(completion).toHaveBeenCalledTimes(3);
  });

  it("does not deterministically remove an unsupported number from the headline", async () => {
    const unsafeCandidate =
      "公司公布三款新產品\n\n公司公布新產品，並介紹主要用途。稿件亦交代產品的基本設計。";
    const completion = vi.fn().mockResolvedValue(unsafeCandidate);

    await expect(
      runRewriteAgent(
        snapshot("公司公布新產品，並介紹主要用途及基本設計。"),
        null,
        completion,
        relaxedContext,
      ),
    ).rejects.toMatchObject({ code: "UNTRACEABLE_REWRITE_NUMBER", status: 422 });
    expect(completion).toHaveBeenCalledTimes(3);
  });
});
