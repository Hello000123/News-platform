# PressReady 網站人員交接手冊（純人員版本）

**文件用途：** 員工離職、職責轉移及接任者入職  
**文件語言：** 香港繁體中文  
**編製日期：** 2026 年 8 月 20 日  
**正式環境資料快照日期：** 2026 年 8 月 19 日（香港時間）  
**正式網站：** <https://pressready-review.931smd-cloudflare-account.workers.dev>  
**Cloudflare Worker：** `pressready-review`  
**主要本機程式碼資料夾：** `News-platform/`  
**GitHub：** <https://github.com/Hello000123/News-platform>

本手冊只供公司人員閱讀、執行及簽署，包括離職員工、接任技術人員、管理層、編採人員、保安／私隱負責人及事故應變人員。內容只涵蓋由人員承擔的責任、實際操作、決策、核對及簽署程序。

PressReady 網站本身設有 AI 審稿及改寫功能，因此本手冊仍會說明該產品功能的人工操作、供應商、成本及保安風險。這些內容屬於網站營運知識，所有最後決定仍由獲授權人員負責。

本手冊不包含密碼、API key、session、一次性設定連結、私人文件、資料庫內容或其他秘密值。所有秘密資料只可透過公司批准的密碼管理器或服務後台移交。

---

## 1. 交接完成的標準

這次交接只有在以下事情全部完成後，才可視為真正完成：

- 公司已正式指定產品、編採、技術、Cloudflare、GitHub、資料、保安、私隱及財務負責人。
- 接任者已用自己的公司帳戶登入所有必要服務，而不是沿用離職員工的登入狀態。
- 接任者已親自示範一次帳戶管理、新聞匯入、文章審核、發佈、更正及下架流程。
- 接任技術人員已保全三個本機程式碼版本，並確認 GitHub 不再是唯一且不完整的副本。
- 正式環境目前使用的 Worker、D1 migration、R2 bucket、secret 名稱及供應商設定已重新查核並留下日期。
- D1 備份已放進公司批准的加密儲存位置，並確認檔案可讀。
- R2 備份、保留及復原負責人已指定。
- 公司已決定如何處理 `PASSWORD_PEPPER`，之後才可輪換 `AUTH_SECRET`。
- 接任者可在沒有離職員工協助的情況下完成登入、查閱帳單、取得備份及啟動事故升級處理。
- 所有未完成事項都有具名負責人、期限及公司接受的風險紀錄。
- 離職員工、接任者及管理層已簽署最後清單。

單純交出一份文件、把密碼傳給另一個人，或確認網站目前仍可開啟，都不代表交接完成。

## 2. 最重要的三項風險

### 2.1 GitHub 並未保存全部程式碼

在 2026 年 8 月 19 日的核實狀態中，主要本機 `main` branch 比 `origin/main` 多 14 個 commit，另有 17 個已修改但未 commit 的 tracked files，以及未追蹤的測試和交接文件。因此，只從 GitHub 預設 branch 重新下載，不能完整重建離職當日的工作狀態。

此外，本機另有兩個不能立即刪除的版本：

- `News-platform-latest/`
- `AI-Agent-News-Review-Rewrite/`

這兩個資料夾可能有不同 branch、remote、commit 或未保存變更。名稱包含「AI-Agent」不代表它是一套交接工具；它是其中一個本機程式碼 checkout 的名稱。

### 2.2 `AUTH_SECRET` 同時可能是密碼 pepper

正式環境快照有 `AUTH_SECRET`，但沒有獨立列出的 `PASSWORD_PEPPER`。現有程式碼在沒有有效 `PASSWORD_PEPPER` 時，會退回使用 `AUTH_SECRET` 作為 password pepper。

因此，在沒有遷移方案或所有使用者重設密碼的安排前輪換 `AUTH_SECRET`，可能令現有帳戶全部無法通過密碼驗證。離職並不構成立即盲目輪換這個 secret 的理由。必須先由技術及保安負責人批准方案、測試回復方法，再執行變更。

### 2.3 發佈、監察及備份仍依賴人工

儲存庫內未發現完整的受保護 CI/CD、自動 D1／R2 備份、與 Git commit 相連的部署紀錄、持久 observability pipeline，或已核實的公司自訂網域。正式發佈及復原工作仍高度依賴人員正確執行指令和留下紀錄。

接任者首月應優先改善這些部分，而不是在沒有保護措施下增加更多功能。

## 3. 立即停止及保全事項

在完成程式碼保全前，任何人都不得：

- 刪除三個本機程式碼資料夾。
- 執行 `git reset --hard`、`git clean` 或其他會丟失本機變更的指令。
- force-push `main` 或覆寫遠端歷史。
- 假設 GitHub 預設 branch 就是正式環境來源。
- 從一個身份不明、未審核或 dirty 的 working tree 發佈正式環境。
- 清理離職員工電腦後才開始找程式碼。
- 把 `.env`、`.dev.vars`、資料庫匯出或供應商 key commit 到 Git。

任何保存操作都應由兩人核對：一人執行，一人確認目標資料夾、branch、remote 及將會上傳的檔案。

## 4. 首 24 小時的人員工作次序

1. 由管理層指定交接統籌人及技術接任者。
2. 暫停清理離職員工電腦及撤銷相關服務權限。
3. 把本手冊存入公司批准的文件位置，限制在合適的內部權限範圍。
4. 填寫下一節的擁有權表及事故聯絡表。
5. 由接任技術人員盤點三個本機 checkout，記錄每個 checkout 的 branch、commit、remote、ahead/behind 及 dirty files。
6. 先檢查變更有沒有 secret，再建立安全 branch、push 及開 pull request 保存工作。
7. 找出最接近正式 Worker 的已審核 commit，明確標示仍未能證實的差異。
8. 接任者以自己的公司身份登入 GitHub、Cloudflare、Resend、xAI、DeepSeek、帳單及密碼管理器。
9. 由第二位公司管理員確認帳戶復原方法及最低兩位管理員仍可使用。
10. 匯出 D1 到批准的加密位置，記錄 checksum、日期、執行人及保留期限。
11. 指定 R2 備份及 restore 測試負責人。
12. 以接任者帳戶完成公開頁、登入、員工區、pipeline 及登出的 smoke test。
13. 確認帳單及保安通知不再只寄往離職員工個人地址。
14. 完成上述驗收後，才按公司離職程序撤銷個人權限。

## 5. 人員及擁有權登記表

不得在此表填寫密碼或 key。證據欄應填公司內部工單、權限截圖、服務邀請或批准紀錄的連結。

| 範疇 | 最終負責人 | 日常操作人 | 後備人 | 權限已測試 | 證據／內部紀錄 |
| --- | --- | --- | --- | --- | --- |
| 產品範圍及推出決定 | **待填** | **待填** | **待填** | [ ] | **待填** |
| 編採標準、發佈及更正 | **待填** | **待填** | **待填** | [ ] | **待填** |
| 應用程式維護 | **待填** | **待填** | **待填** | [ ] | **待填** |
| GitHub organization／repository | **待填** | **待填** | **待填** | [ ] | **待填** |
| Cloudflare 帳戶及帳單 | **待填** | **待填** | **待填** | [ ] | **待填** |
| D1 資料庫及復原 | **待填** | **待填** | **待填** | [ ] | **待填** |
| R2 檔案、備份及保留 | **待填** | **待填** | **待填** | [ ] | **待填** |
| Resend 帳戶、sender、domain 及帳單 | **待填** | **待填** | **待填** | [ ] | **待填** |
| xAI 帳戶、額度及帳單 | **待填** | **待填** | **待填** | [ ] | **待填** |
| DeepSeek 帳戶、額度及帳單 | **待填** | **待填** | **待填** | [ ] | **待填** |
| 密碼管理器及公司復原程序 | **待填** | **待填** | **待填** | [ ] | **待填** |
| 保安事故 | **待填** | **待填** | **待填** | [ ] | **待填** |
| 私隱及資料要求 | **待填** | **待填** | **待填** | [ ] | **待填** |
| 非辦公時間升級處理 | **待填** | **待填** | **待填** | [ ] | **待填** |

## 6. 權限轉移的人工驗收方法

每個外部服務都要逐一完成，不能只確認「已發邀請」。

1. 接任者登出離職員工留下的 session。
2. 接任者在自己的裝置，以自己的公司身份登入。
3. 核對 organization、account、team、project 及 billing profile 是否正確。
4. 確認角色足以完成其工作，但沒有不必要的最高權限。
5. 執行一項安全的 read-only 操作，證明不是只看見登入畫面。
6. 如需要管理權限，使用不影響正式環境的設定頁確認權限。
7. 第二位公司管理員確認自己也可登入及執行復原。
8. 把保安、帳單、配額及服務中斷通知改到受監察的公司地址。
9. 記錄測試日期、人員、角色及證據。
10. 只有在公司復原途徑已測試後，才移除離職員工個人電郵、裝置及 token。

2026 年 8 月 19 日的 Wrangler 查核顯示身份為 `info@931smd.com`。這只是當日觀察，接任者必須重新核對，不可視為永久擁有權證明。

## 7. 公司事故聯絡表

| 嚴重程度 | 例子 | 初步回應時間 | 決策人 | 技術人 | 編採／溝通人 | 渠道 |
| --- | --- | --- | --- | --- | --- | --- |
| Critical | 網站全面中斷、入侵、重大資料外洩 | **待填** | **待填** | **待填** | **待填** | **待填** |
| High | 全部登入失敗、大範圍錯誤發佈、開支失控 | **待填** | **待填** | **待填** | **待填** | **待填** |
| Medium | 單一供應商中斷、feed 積壓、電郵失敗 | **待填** | **待填** | **待填** | **待填** | **待填** |
| Low | 外觀問題、單一 feed 暫停、文件更新 | **待填** | **待填** | **待填** | **待填** | **待填** |

事故紀錄至少包括：開始時間、發現人、受影響頁面／使用者、最後正常時間、近期變更、已採取動作、批准人、目前狀態及下一次更新時間。

## 8. PressReady 是甚麼

PressReady 是一個以 Next.js 16、React 19 及 TypeScript 建立的新聞平台，透過 OpenNext 部署到 Cloudflare Workers。它有四個主要部分：

1. 公開新聞網站。
2. 需登入的稿件審閱及改寫工作區。
3. 需登入的新聞匯入、編輯及發佈 pipeline。
4. 僅供員工使用的帳戶、feed、用量及版面管理功能。

主要外部服務：

| 服務 | 用途 | 交接重點 |
| --- | --- | --- |
| GitHub | 原始程式碼及 pull request | 目前遠端並不完整；先保存本機工作 |
| Cloudflare Workers | 網站 runtime | 確認 Worker、deployment、權限及帳單 |
| Cloudflare D1 | 帳戶、文章、feed、session、設定及 audit data | 備份、migration、restore 權限 |
| Cloudflare R2 | 私人申請附件及受管理圖片 | 必須保持私人；建立備份及保留政策 |
| Resend | 帳戶及停權相關電郵 | 快照使用測試 sender；應驗證公司 domain |
| xAI | Grok 模型 | 模型權限、配額、帳單、key 管理 |
| DeepSeek | DeepSeek 模型 | 模型權限、配額、帳單、key 管理 |

## 9. 使用者類型及權限

### 公開訪客

公開訪客可以閱讀已發佈文章、進入登入頁及申請帳戶。他們不能看私人 draft、pipeline、員工管理資料或附件。

### 客戶

已批准並完成密碼設定的客戶可以登入，使用稿件審閱／改寫、檔案文字擷取及 pipeline 功能。現時客戶亦可發佈或下架 pipeline 文章；如果公司政策不希望客戶有此能力，必須把它列為產品及授權變更，不可只靠口頭規定。

### 員工

員工有客戶功能，並可管理帳戶申請、客戶、AI 使用門檻、feed、員工帳戶、公開 presentation 及客戶摘要。

所有真正權限必須由 server route 驗證。畫面上看不見按鈕並不等於沒有權限。

## 10. 主要頁面

| 頁面 | 用途 |
| --- | --- |
| `/` | 公開首頁 |
| `/technology` | 科技分類 |
| `/social-enterprise` | 社企分類 |
| `/news` | 新聞索引 |
| `/news/[id]` | 公開文章 |
| `/request-account` | 帳戶申請 |
| `/request-submitted` | 申請確認 |
| `/login` | 登入 |
| `/setup-password` | 已批准帳戶設定密碼 |
| `/review` | 稿件審閱及改寫 |
| `/pipeline` | 內容匯入、編輯及發佈 |
| `/employee` | 員工管理首頁 |
| `/employee/requests/[id]` | 個別帳戶申請 |
| `/employee/clients/[id]` | 個別客戶資料及摘要 |

## 11. 帳戶申請及批准流程

### 申請人操作

1. 進入 `/request-account`。
2. 填寫公司及聯絡資料。
3. 如有需要，上載支援文件。
4. 提交後查看 `/request-submitted`。

### 員工處理

1. 進入 `/employee` 的 **Account Approval**。
2. 打開個別申請，核對資料及附件。
3. 按公司政策決定批准或拒絕。
4. 批准後，系統會建立或更新帳戶並發出設定密碼連結。
5. 如對方沒有收到，可在確認電郵地址及狀態後使用重發功能。
6. 不得把設定連結複製到公開 ticket、普通聊天群組或未加密電郵。
7. 記錄批准人、日期及任何例外決定。

目前帳戶電郵依賴 Resend。快照所記錄的 sender 為 `onboarding@resend.dev`，屬測試用途；普通收件人可能受限制。公司應完成自有 domain 驗證並更新 sender。

## 12. 客戶帳戶停權、復權及刪除

### 停權

在臨時、調查中或可恢復的情況，先使用停權。停權保留帳戶及相關資料，並應記錄原因、批准人、開始時間及預計覆核時間。

### 復權

復權前核對原停權原因是否已解決、身份是否正確、是否需要重設密碼或撤銷舊 session。完成後由帳戶本人重新登入驗證。

### 刪除

刪除是永久操作，會移除客戶及相關伺服器資料。只有在下列條件全部成立時才可執行：

- 業務負責人書面批准。
- 私隱／資料負責人確認保留要求。
- 技術人員列出會受影響的資料。
- 已決定是否需要合法保留、匯出或審計證據。
- 由第二人核對正確帳戶。

不得因為「暫時不想讓使用者登入」而使用刪除；這種情況應停權。

## 13. 新聞 feed 的日常操作

員工在 **News Feeds** 可以建立、編輯、暫停、恢復及移除 feed，也可手動 fetch。

Cloudflare cron 每日 `00:00 UTC`，即香港時間 `08:00` 觸發。D1 內的排程設定會再決定是否真的執行。2026 年 8 月 19 日快照是 enabled，間隔 1,440 分鐘。

每日檢查：

- `last_auto_fetch_at` 是否合理更新。
- 各 feed 最後成功及失敗時間。
- 是否只有單一來源失敗，還是全部來源都失敗。
- pipeline 是否有合理數量的新文章。
- 來源有沒有改版、反機械人 challenge 或回傳不完整內容。

出現問題時：

1. 先查看排程及最近錯誤。
2. 只執行一次受控手動 fetch，避免重複大量請求。
3. 判斷是來源本身、網絡、解析器、Cloudflare 還是資料庫問題。
4. 持續受阻的單一來源應暫停，不要立即刪除。
5. 不得繞過新聞網站的保護或存取限制。
6. 修正解析器後，更新 `directives/scrape_news.md` 的已知行為。

移除 feed 可能同時移除相關 pipeline data。臨時問題使用 pause，不要使用 remove。

## 14. 編採 pipeline 及人工發佈流程

文章狀態包括 `new`、`rewritten`、`approved`、`discarded`。Feed 或 JSON 匯入後不會自動公開。

建議人工流程：

1. 在 `/pipeline` 選擇文章。
2. 確認來源網址、標題、作者、時間及完整原文。
3. RSS 摘要只可視為預覽，不得假設是完整原文。
4. 如使用產品內的 AI 改寫功能，由人員選擇模型、語言、篇幅及指示。
5. 查看 rewrite diagnostics，確認沒有錯誤或資料不足警告。
6. 人工編輯標題、內文、分類、圖片及 credit。
7. 使用 **Save changes** 保存待審版本。
8. 由有權人員完成事實、法律、私隱及編採檢查。
9. 只有批准後才使用 **Publish to homepage**。
10. 發佈後在桌面及流動裝置開啟公開文章，檢查標題、內文、圖片及分類。
11. 記錄發佈人、批准人、時間及必要的來源證據。

其他實際按鈕可能包括 **Rewrite draft**、**Rewrite again**、**Rewrite & publish**、**Update homepage**、**View live post**、**Unpublish** 及 **Discard**。如公司需要兩人審批，不應使用會直接公開的 **Rewrite & publish**。

### 發佈前核對表

- [ ] 原文完整，不只是 feed 摘要。
- [ ] 人名、機構名、職銜、日期及地點正確。
- [ ] 數字、貨幣、百分比、單位、型號及排名正確。
- [ ] 引語內容及說話者正確，沒有製造引語。
- [ ] 文章沒有加入來源無法支持的陳述。
- [ ] 語言轉換沒有改變原意。
- [ ] 分類正確。
- [ ] 圖片有使用權，credit 正確，沒有私人資料。
- [ ] 必要的第二人批准已完成。
- [ ] 發佈後檢查人及檢查時間已記錄。

## 15. 更正、下架及有害內容

如果已發佈文章有重大錯誤、侵權、私隱問題或可能造成傷害：

1. 保存公開 URL、畫面截圖、發現時間及投訴內容。
2. 通知編採及決策負責人。
3. 如風險持續，取得批准後先 **Unpublish**。
4. 核對來源、AI 改寫輸出、人工編輯及 presentation 變更。
5. 只根據可靠證據修正。
6. 由另一位有權人員覆核。
7. 重新發佈後再次檢查公開頁。
8. 記錄更正原因、批准人、時間及對外溝通。

不要為了掩蓋錯誤而刪除事故證據或日誌。

## 16. 網站內的 AI 審稿及改寫功能

這一節只描述 PressReady 產品內的功能，由人員操作及負責最後決定。

在 `/review`，客戶或員工可提交文字、公開來源 URL 或支援檔案的文字，選擇 Grok 或 DeepSeek，取得結構化審閱，再明確要求改寫。審閱不會自動公開文章，改寫也不代表內容已獲批准。

人員必須：

- 確認輸入資料有權交給相關供應商處理。
- 不輸入不必要的個人、機密或受限制資料。
- 檢查模型輸出的事實、引語、數字及語意。
- 在公開前完成正常編採批准。
- 留意 xAI／DeepSeek 的配額、費用、模型權限及服務中斷。
- 不把供應商回應當作法律、財務或合規意見。

瀏覽器只把目前來源及成功改寫回合保存在該分頁的 session storage；這不是完整的帳戶文章歷史。關閉分頁或清理瀏覽器資料後，相關內容可能消失。

## 17. 公開版面 presentation 編輯

只有員工可操作公開 presentation。Draft 與已發佈設定分開：

- **Save** 只保存私人 draft，不會立即改公開頁。
- **Publish** 才更新公開版面。
- **Discard** 放棄未發佈 draft。
- Undo／redo 只用於目前編輯流程，不能代替正式版本紀錄。

Presentation 適合修改文字樣式、字體、大小、顏色及指定圖片位置／尺寸。來源事實錯誤應回到 pipeline 修正，不應只在 presentation 畫面遮蓋。

## 18. 上載檔案及私人 R2 資料

支援 PDF、DOCX、PPTX、XLSX、PNG、JPEG/JPG 及 WebP。一般限制是最多 50 個檔案、合共 10 MiB。系統會檢查 extension、MIME、file signature、archive path traversal、加密內容、macro、zip bomb 及解析時間。

R2 binding 名稱為 `ACCOUNT_DOCUMENTS`，必須保持私人。帳戶附件與新聞圖片使用不同 namespace，應由應用程式 route 驗證權限後才提供。

人員不得：

- 為帳戶申請附件設定公開 R2 URL 或 public domain。
- 把私人 object key 放到公開文章或 ticket。
- 下載附件到不受管理的個人裝置後長期保存。
- 在未確認保留政策前大量刪除 object。

公司須補充 R2 lifecycle、orphan cleanup、備份、restore、access log 及加密儲存政策。

## 19. 系統架構及技術組成

| 層面 | 技術／服務 | 作用 |
| --- | --- | --- |
| Web framework | Next.js 16 App Router | 頁面、route handler、rendering |
| UI | React 19 | 互動及 server-rendered UI |
| 程式語言 | TypeScript 5.9 strict | 應用程式及測試 |
| Edge packaging | `@opennextjs/cloudflare` | 把 Next.js 建成 Worker |
| Hosting | Cloudflare Workers | 正式網站 runtime |
| Database | Cloudflare D1 | 帳戶、session、文章、feed、設定、用量 |
| Object storage | Cloudflare R2 | 私人文件及圖片 |
| Validation | Zod | 請求及供應商回應檢查 |
| Email | Resend API | 帳戶生命週期通知 |
| AI provider | xAI／DeepSeek | 產品內審閱、改寫、圖片分析及摘要 |
| Testing | Vitest、Testing Library、Miniflare | 程式及 Worker 驗證 |
| Optional scraper | Python、Beautiful Soup、feedparser | 外部新聞收集及 JSON 匯入 |

Cloudflare runtime 的重要設定：

- Worker：`pressready-review`
- Entry point：`worker.ts`
- Compatibility date：`2026-07-28`
- D1 binding：`DB`
- R2 binding：`ACCOUNT_DOCUMENTS`
- Asset binding：`ASSETS`
- Cron：`0 0 * * *`
- CPU 上限：30,000 ms
- Subrequest 上限：1,000
- Observability：儲存庫設定為停用

## 20. 程式碼位置速查

| 路徑 | 內容 |
| --- | --- |
| `app/` | 網頁及 HTTP route handlers |
| `components/` | 畫面元件 |
| `lib/client/` | 瀏覽器 API、密碼 proof、檔案及 session 邏輯 |
| `lib/server/agents/` | PressReady 產品內的模型連接、審閱／改寫及驗證程式 |
| `lib/server/auth/` | 帳戶、session、rate limit、使用量及電郵 |
| `lib/server/feeds/` | Feed、熱門分組、pipeline 及 diagnostics |
| `lib/server/sources/` | URL／DNS／redirect／SSRF 防護及來源擷取 |
| `lib/server/uploads/` | 檔案驗證、文字擷取、圖片分析及儲存 |
| `lib/shared/` | 共用 schema、types、model 及分類 |
| `migrations/` | D1 migration `0001` 至 `0021` |
| `tests/` | Unit、component、route 及 integration tests |
| `execution/` | Python scraper |
| `directives/` | Scraper 的人員標準作業程序 |
| `scripts/` | 本機／遠端員工帳戶建立 |
| `worker.ts` | Worker fetch 及 scheduled ingestion |
| `wrangler.jsonc` | Cloudflare binding、variables、limits、assets 及 cron |

## 21. 程式碼保全程序

先在每個 checkout 執行 read-only 盤點：

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
git remote -v
git log --oneline --decorate -n 20
```

對主要 `News-platform/`：

1. 保存完整 `git status` 輸出到公司批准的交接紀錄。
2. 檢查所有 diff，不要在共享紀錄貼出 secret。
3. 確認哪些檔案屬已有工作、哪些是交接文件。
4. 建立明確的保全 branch，例如：

```bash
git switch -c handover/wip-2026-08-19
```

5. 逐項 stage 已審核檔案；不要使用不經檢查的全域加入方式。
6. 再次檢查 staged diff 及秘密資料。
7. commit 並 push 保全 branch：

```bash
git commit -m "chore: preserve website handover state"
git push -u origin handover/wip-2026-08-19
```

8. 開 pull request，列出已知限制、未完成測試及正式環境對應的不確定性。
9. 盤點另外兩個 checkout 的獨有 commit 及檔案，再決定保存、合併或封存。

以上命令會建立 branch、commit 及遠端狀態，必須由有 GitHub 權限並獲公司批准的人員執行。不得 force-push `main`。

## 22. Secret 及設定移交

移交時只在文件記錄 secret 名稱、用途、擁有人及輪換日期，不得記錄值。

重點名稱包括：

- `AUTH_SECRET`
- `PASSWORD_PEPPER`
- `RESEND_API_KEY`
- `XAI_API_KEY`
- `DEEPSEEK_API_KEY`
- D1／R2 bindings 及 Cloudflare account access

每一項要記錄：服務、用途、正式／測試環境、公司擁有人、後備管理員、儲存位置、最後輪換日期、下一次覆核日及相關 runbook。

輪換任何 secret 前：

1. 找出所有使用位置。
2. 確認新值先在安全位置保存。
3. 準備 rollback。
4. 確認會否令 session、密碼 proof、電郵或供應商請求失效。
5. 選定維護時間並通知受影響人員。
6. 變更後立即 smoke test。
7. 撤銷舊值並記錄完成時間。

`AUTH_SECRET` 必須額外遵守前述 pepper 風險，不可直接套用一般輪換流程。

## 23. 本機開發環境

基本需求：Node.js 22.13 或以上、npm。Python scraper 才需要 Python 3.12 或 Docker。Miniflare／OpenNext 測試需允許 loopback。

```bash
cd "/path/to/news platform (real)/News-platform"
npm ci
cp .env.example .env.local
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

瀏覽 <http://localhost:3000>。

注意：

- 不要把 `.env.local` 或 `.dev.vars` commit。
- 本機電郵應使用 `APP_ENV=development` 及 `EMAIL_DELIVERY_MODE=preview`。
- 本機員工帳戶可用 `npm run create-employee:local`。
- `npm run create-employee:remote` 會改正式資料，只可經批准執行。
- `npm run preview` 通常在 <http://localhost:8787>。
- `listen EPERM 127.0.0.1` 可能是受限制環境不准綁定 loopback，不一定是程式錯誤。

## 24. 測試及品質檢查

常用檢查：

```bash
npm run typecheck
npx eslint . --ignore-pattern '.tmp/**'
npm run test:unit
npm run build
npm run preview
python -m unittest discover -s execution/tests -v
```

2026 年 8 月 19 日已記錄通過：

- TypeScript typecheck。
- 暫時略過 `.tmp/**` 的 ESLint。
- Production build。
- 8 個 focused test files，共 136 tests。
- 13 個 authentication integration tests。
- 在允許 loopback 的環境下，相關 Miniflare tests。

不得聲稱以下已完整通過：

- 現時的 `npm test` 一鍵 release gate。
- 一次完整、乾淨、無長時間停頓的 Vitest suite。
- 離職電腦上的 Python scraper tests。

原因包括 `.tmp/` lint 問題、完整 suite 曾長時間沒有輸出，以及 Python venv／Beautiful Soup 尚未建立。真實模型 evaluation 可能收費，只可經產品／財務批准。

## 25. 正式發佈程序

只可從 clean、已審核、已 push 的 commit 發佈。發佈紀錄必須填：工單、執行人、覆核人、branch、commit SHA、PR、migration、備份、測試、rollback 版本、維護時間及溝通渠道。

建議順序：

```bash
git status --short --branch
git rev-parse HEAD
npm ci
npx wrangler d1 migrations list pressready-auth --remote
mkdir -p .tmp/backups
npx wrangler d1 export pressready-auth --remote --output .tmp/backups/pressready-auth-YYYY-MM-DDTHHMM.sql
npm run typecheck
npx eslint . --ignore-pattern '.tmp/**'
npx vitest run --reporter=verbose
npm run build
npm run db:migrate:remote
npx wrangler d1 migrations list pressready-auth --remote
npm run deploy
npx wrangler deployments status --json
npx wrangler secret list
```

這些命令會讀取或改變遠端正式環境，必須由獲批准的人員執行。D1 匯出屬敏感資料；產生後要計算 checksum、確認可讀、移到公司批准的加密位置，並從工作電腦安全清理，不得 commit。

如 migration 命令結果不清楚，先查 migration 狀態，不要盲目重跑。

### 發佈後人工 smoke test

- [ ] 首頁可以開啟。
- [ ] 科技及社企分類正常。
- [ ] 至少一篇公開文章正常。
- [ ] 登入頁及帳戶申請頁正常。
- [ ] 接任員工帳戶可登入及開啟員工區。
- [ ] Pipeline 可讀，權限正確。
- [ ] 客戶不能進入員工限定功能。
- [ ] 登出會令受保護頁面失去 session。
- [ ] Feed 設定及最近紀錄可讀。
- [ ] 只有在批准預算、測試帳戶及收件人後，才測試真實 AI 或電郵。

最後記錄 Worker version、deployment ID、commit SHA、migration、備份、所有 smoke result、例外情況及監察負責人。

## 26. Worker rollback

先列出 deployment：

```bash
npx wrangler deployments list
```

只有在確認已知良好版本、schema 相容性及決策人後，才執行：

```bash
npx wrangler rollback <known-good-version-id> --message "Rollback: <incident-id and reason>"
```

歷史上一個 version ID `f11dc00a-2621-43bd-8366-59e0ea3d444e` 只可作歷史參考，不能在未重新核實時假設它仍是正確 rollback 目標。

Worker rollback 只回復程式碼，不會回復：

- D1 migration 或資料。
- R2 object。
- 已發出的電郵。
- 已送出的供應商請求或費用。

Rollback 後仍要做完整 smoke test、記錄結果及通知相關人員。

## 27. D1 備份及資料復原

一般情況下，小而明確的資料問題應優先使用經審核的精準修正。只有大範圍損壞才考慮 point-in-time restore。

查詢及 restore 指令：

```bash
npx wrangler d1 time-travel info pressready-auth
npx wrangler d1 time-travel restore pressready-auth
```

Restore 前必須：

1. 確認 Cloudflare 當時的保留時間。
2. 明確寫出目標日期、時間及時區。
3. 列出目標時間後所有可能丟失的合法寫入。
4. 先做最新 D1 export。
5. 確認目標 schema 與 Worker 相容。
6. 取得資料負責人及事故決策人批准。
7. 計劃如何補回合法新資料。
8. 暫停會繼續寫入的操作。

Restore 後要核對 migration、登入、feed、文章狀態、presentation 及 R2 reference。D1 restore 不會自動回復 R2，因此兩者要分開核對。

## 28. R2 復原要求

目前未發現儲存庫內有自動 R2 backup 流程。公司需要建立並定期測試：

- Object inventory 及 checksum。
- 加密備份目的地。
- 保留及刪除期限。
- Versioning 或同等復原能力。
- 失聯 object／orphan cleanup。
- 從備份還原到非正式環境的測試。
- 與 D1 reference 的一致性核對。

在完成政策前，不得假設刪除 R2 object 可以由 D1 Time Travel 恢復。

## 29. 日常、每週及每月工作

### 每日

- 檢查首頁、分類及一篇公開文章。
- 查看 pending account requests。
- 查看緊急更正或投訴。
- 檢查 pipeline 是否有新內容及 feed error。
- 查看 Resend、xAI、DeepSeek 或 Cloudflare 警告。
- 記錄任何停權、刪除、下架及正式變更。

### 每週

- 檢查客戶停權及 AI 用量門檻。
- 檢查模型費用、rate limit 及異常用量。
- 檢查 Resend delivery、bounce 及 domain 狀態。
- 確認最新備份紀錄及可讀性。
- 處理持續失敗的 feed。
- 確認最近發佈可追溯到 commit。
- 確認值班及後備負責人可聯絡。

### 每月

- 覆核 privileged access 及離職帳戶。
- 確認至少兩位公司 Cloudflare 管理員。
- 測試公司密碼管理器復原。
- 執行或排定 D1／R2 restore 測試。
- 覆核資料保留及刪除政策。
- 覆核模型用量及停權門檻。
- 檢查 CI、測試及部署紀錄。
- 更新聯絡人及本手冊。

## 30. Monitoring 及日誌

目前 `wrangler.jsonc` 的 observability 是 disabled，未有儲存庫定義的持久 log、metric 及 alert pipeline。即時 Worker log 可使用：

```bash
npx wrangler tail pressready-review --format pretty
```

最低應監察：Worker 錯誤率、延遲、CPU、subrequest；route 4xx/5xx；登入及 rate-limit 異常；電郵 accepted/failed/bounce；模型錯誤、延遲及費用；feed 成功及遲延；D1 error/migration；R2 failure；文章發佈／下架；備份及 restore 測試。

不得在 log 記錄 API key、密碼、password proof、raw token、完整私人稿件、附件、D1 export 或無上限的供應商回應。

## 31. 事故：網站全面中斷或大量 5xx

1. 用第二個網絡或裝置確認，不要只依賴自己的瀏覽器。
2. 記錄開始時間、routes、status code、地區及截圖。
3. 查看 Cloudflare status、最近 deployment、migration、secret 變更及 Worker tail。
4. 判斷是 static pages、dynamic routes、D1 還是全部功能。
5. 凍結非必要變更。
6. 保存 log 及時間線。
7. 由事故決策人選擇修正或 rollback。
8. 只有在 schema 相容時才 rollback。
9. 完成 smoke test並按約定頻率更新相關人員。

## 32. 事故：全部使用者不能登入

1. 分別確認員工及客戶是否都受影響。
2. 查最近 `AUTH_SECRET`、`PASSWORD_PEPPER`、session TTL、deployment 及 migration 變更。
3. 不要再輪換 secret。
4. 如果 pepper 已變，評估恢復相容 pepper 或安排所有帳戶重新設定密碼。
5. 核對 session、user status、manual／automatic suspension 及 expiry。
6. 修復後用測試員工及客戶帳戶驗證。
7. 記錄根因、影響及防止再次發生的工作。

單一使用者問題則檢查 normalized email、setup 狀態、active/disabled、停權及 rate limit。不得查看或重設其他人的密碼；使用正式 setup／resend／recovery 程序。

## 33. 事故：電郵、模型供應商或異常費用

### 電郵

核對 recipient、message type、D1 delivery metadata、Resend status、billing、domain、suppression、sender 設定及 secret 名稱。只有在問題修復後才重發受保護連結，並使用批准的收件人。

### 網站內模型功能

記錄 model、操作階段、安全 debug ID、時間及影響範圍。分辨 xAI 或 DeepSeek；查看服務狀態、帳單、rate limit、model permission、endpoint 及已清理的 diagnostics。只有公司政策允許才切換供應商。

### 異常費用

立即通知產品、技術、保安及財務負責人；查看 D1 usage 及供應商 dashboard；找出 client、route、model、時間、automation 或 key 泄漏。必要時按批准程序停權帳戶、調整有 audit 的 threshold 或輪換供應商 key，並保存帳單證據。

## 34. 事故：私人文件或資料外洩

1. 視為保安及私隱事故。
2. 保存相關時間、route、object key、log ID 及受影響範圍。
3. 檢查 R2 public setting 及應用程式授權。
4. 先停止不安全存取，但不要刪除調查證據。
5. 判斷受影響人士、資料類型及暴露期間。
6. 通知公司保安、私隱及法律負責人。
7. 根據公司及法定要求決定通知及補救。
8. 必要時輪換相關 credential、撤銷 session 並修正 route。

## 35. 保安及私隱最低要求

現有程式包含 server-only key、模型 allowlist、Zod schema、server role check、same-origin／CSRF、防止直接保存 raw setup token、scrypt＋pepper、登入 rate limit、session revocation、private R2、upload/archive 防護、URL／DNS／redirect SSRF 檢查及 security headers。

接任團隊應優先：

- 建立獨立且穩定的 `PASSWORD_PEPPER` 方案。
- 加入受保護 CI/CD 及 service identity。
- 建立經清理的持久 logs、metrics 及 alerts。
- 自動化 D1／R2 加密備份及 restore 測試。
- 驗證 Resend 公司 domain。
- 確認公司自訂 domain、TLS 及 DNS 擁有權。
- 定期做 dependency／vulnerability review。
- 定義未發佈稿件、申請附件、日誌、用量及備份的保留期。
- 建立資料當事人查閱、改正及刪除流程。
- 按最低權限管理 Cloudflare、GitHub、Resend 及模型供應商角色。

## 36. 已知風險表

| 風險 | 影響 | 必要行動 | 狀態 |
| --- | --- | --- | --- |
| GitHub 缺少本機工作 | 無法重建或追查 | 保存三個 checkout、開安全 PR | Open |
| 正式 deployment 無可靠 Git SHA | 難以 audit／rollback | 每次部署記錄 commit | Open |
| 無受保護 CI/CD | 人工錯誤及個人權限風險 | 建立受保護 pipeline | Open |
| 沒有獨立 `PASSWORD_PEPPER` | 輪換 secret 可令密碼失效 | 設計及測試 migration | Open |
| Resend 使用測試 sender | 普通收件人可能收不到 | 驗證公司 domain | Open |
| Observability disabled | 缺少事故證據 | 建立經清理監察 | Open |
| `npm test` release gate 不穩 | 可能漏過問題 | 修 `.tmp/**`、suite timeout | Open |
| Scraper 測試環境缺失 | 修改後無法驗證 | 建立固定 venv／CI | Open |
| 無自動 D1／R2 備份 | 資料復原風險 | 加密備份及 restore drill | Open |
| DNS rebinding／egress gap | SSRF 風險 | 審視 resolver-pinning egress | Open |
| 供應商依賴 | 中斷、價格及模型變更 | 設定告警及 fallback policy | Open |
| 文件可能過時 | 接任者跟錯程序 | 設定更新觸發點 | Open |

「已知風險」不等於公司已接受風險。任何延遲處理的項目都應有正式接受紀錄。

## 37. 離職當日最終清單

### 人員及權限

- [ ] 所有最終、日常及後備負責人已填寫。
- [ ] 事故及非辦公時間聯絡方法已測試。
- [ ] 接任者以自己的公司帳戶登入 GitHub、Cloudflare、Resend、xAI、DeepSeek、billing 及 password manager。
- [ ] 至少兩位公司人員擁有可用的 Cloudflare 管理／復原權限。
- [ ] 帳單及保安通知已改到公司監察地址。

### 程式碼

- [ ] 三個本機 checkout 已保全及盤點。
- [ ] 14 個本機 commit 已安全保存。
- [ ] 17 個 tracked file 變更及 untracked files 已逐項審核。
- [ ] 已做 secret review。
- [ ] 安全 branch 已 push，pull request 已開。
- [ ] 已記錄最接近正式 Worker 的 commit 及不確定差異。

### 資料及復原

- [ ] 已重新查詢 D1 migration 狀態。
- [ ] 最新 D1 export 已產生、checksum、確認可讀並移到批准的加密位置。
- [ ] D1 保留及 restore 負責人已指定。
- [ ] R2 備份、保留及 restore 負責人已指定。
- [ ] `PASSWORD_PEPPER` 方案已在任何 `AUTH_SECRET` rotation 前批准。

### 營運示範

- [ ] 已示範帳戶批准、拒絕及重發設定連結。
- [ ] 已示範客戶停權及復權；刪除程序已講解但未以真實帳戶試驗。
- [ ] 已示範 feed pause／resume／manual fetch。
- [ ] 已示範 pipeline 匯入、編輯、審核、發佈、更正及下架。
- [ ] 已示範 presentation 的 Save、Publish 及 Discard 差異。
- [ ] 已說明模型用量、費用及人工核對責任。
- [ ] 已示範部署紀錄、Worker log、rollback 決策及 D1 restore 前置條件。

### 離職處理

- [ ] 交接文件、Git、工單及聊天沒有 secret 或私人資料。
- [ ] 接任者可獨立完成關鍵工作。
- [ ] 公司復原方法已由第二人測試。
- [ ] 離職員工的個人 token、session、裝置及角色只在上述條件完成後撤銷。
- [ ] 撤銷後再做一次公司帳戶登入及復原測試。

## 38. 接任者第一個月安排

### 第一日

- 閱讀本手冊的風險及停止事項。
- 完成所有 access test。
- 完成公開頁、登入及員工區 smoke test。
- 找到公司 password manager、backup、billing、incident 及 change record。
- 除非正在處理事故，第一日不要直接改正式環境。

### 首三日

- 由離職員工或現任操作人員示範帳戶生命週期。
- 親自操作一個安全的 feed、pipeline 及 publication 練習。
- 查看模型供應商用量及 Resend 狀態。
- 閱讀最近 deployment、migration 及事故紀錄。
- 確認 D1／R2 備份及聯絡人。

### 第一週

- 完成所有本機程式碼保存及 pull request。
- 比較三個 checkout。
- 把正式 Worker 對應到最接近的 commit。
- 修正或排期修正 lint／完整測試問題。
- 建立 Python scraper 測試環境。
- 確定 Resend domain、pepper、backup 及 observability 計劃。

### 首 30 日

- 建立受保護、與 commit 相連的 CI/CD。
- 令完整測試 suite 有固定 timeout 及清晰結果。
- 啟用適當的 logs、metrics 及 alerts。
- 建立自動加密備份及非正式環境 restore drill。
- 完成 `PASSWORD_PEPPER` 方案。
- 驗證公司電郵 sender/domain。
- 覆核 SSRF egress、防火牆及 rate-limit。
- 更新過時文件，決定 custom domain，演練 Worker rollback 及資料復原。

## 39. 最終簽署

每位簽署人應確認自己已閱讀與其職責相關的部分、實際測試所需權限，並知道未完成風險。

| 角色 | 姓名 | 日期及時間（HKT） | 確認內容 | 簽署／內部證據 |
| --- | --- | --- | --- | --- |
| 離職員工 | **待填** | **待填** | 已交出已知系統、程式碼及營運資料 | **待填** |
| 新技術負責人 | **待填** | **待填** | 已保全程式碼並測試技術權限 | **待填** |
| 編採負責人 | **待填** | **待填** | 已確認發佈、更正及下架流程 | **待填** |
| 管理層 | **待填** | **待填** | 已指定擁有人並接受／處理未完成風險 | **待填** |
| 保安負責人 | **待填** | **待填** | 已確認 secret、事故及撤權程序 | **待填** |
| 私隱／資料負責人 | **待填** | **待填** | 已確認資料保留、附件及刪除程序 | **待填** |

## 40. 文件維護

公司必須指定本手冊的文件負責人。以下情況發生後要更新：

- 正式 deployment 或 migration。
- Worker、D1、R2、Resend、xAI 或 DeepSeek 設定改變。
- 登入、session、secret、pepper 或角色改變。
- 帳戶、feed、pipeline、發佈、presentation 或檔案流程改變。
- 備份、restore 或事故演練有新結果。
- 聯絡人、供應商擁有人或帳單負責人改變。
- 公司處理過事故並得到新經驗。
- 再次發生員工離職或擁有權轉移。

所有正式環境資料都要標明查核日期。文件更新應保留 Git 歷史或公司文件版本紀錄。永遠不要把 secret、一次性連結、私人附件、完整資料庫匯出或個人資料加入本手冊。

補充參考：

- [繁體中文詳細技術版](WEBSITE_HANDOVER_DETAILED_ZH-HK.md)
- [英文詳細技術版](WEBSITE_HANDOVER_DETAILED.md)
- [英文較短技術版](WEBSITE_HANDOVER.md)
- [英文簡易版](WEBSITE_HANDOVER_PLAIN_LANGUAGE.md)

如補充文件與實際程式碼或正式環境不同，先停止具破壞性的操作，重新核實並更新有日期的紀錄；不要以沒有日期的舊文件覆蓋現況。
