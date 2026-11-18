# 實作規劃（Plan）

決策細節見 [DECISIONS.md](./DECISIONS.md)。

## 目錄結構

檔案、公開函式與樣式規則的最新索引在專案根目錄的 [CLAUDE.md](../CLAUDE.md)（每次改動都會同步更新），這裡不再重複列出，避免過時。大致分層：

- `src/db/`：Dexie schema、型別、預設值
- `src/lib/`：純邏輯（FSRS、佇列、牌組樹、篩選、同步快照、語音 `tts/`、Google `google/`）
- `src/stores/`：Pinia stores（資料、設定、同步、UI、提醒、PWA、語音補產）
- `src/composables/`：`useLiveQuery`、`useDragSort`、`useTicker`
- `src/views/`、`src/components/`：畫面與元件
- `worker/`：Cloudflare Worker（Google 授權代理、每日提醒推播）

## 路由

| 路徑 | 頁面 |
|---|---|
| `/` | 首頁 |
| `/node/:id` | 牌組 |
| `/node/:id/stats` | 牌組統計 |
| `/card/new?deck=&type=&lang=` | 新增卡片 |
| `/card/:id` | 卡片詳情 |
| `/card/:id/edit` | 編輯卡片 |
| `/study/:mode(review\|learn)` | 正式複習／新學習（範圍等以 query 帶入） |
| `/practice` | 練習（設定與進行都在同一頁，範圍以 query 帶入） |
| `/stats` | 統計 |
| `/settings` | 設定（`#區塊` 會展開該區塊） |

## 實作階段

1. **基礎建設**：安裝套件、Tailwind、主題、版面、路由、PWA、GitHub Actions。
2. **資料層**：Dexie schema、型別、預設值、學習日、FSRS 包裝。
3. **牌組樹**：首頁、新增／重新命名／刪除／移動牌組、計數。
4. **卡片**：編輯器（Markdown 工具列與預覽、防劇透）、單字卡表單、卡片列表（篩選、排序、批次）、詳情頁。
5. **學習**：佇列、複習 UI、評分預覽、撤銷、重新評分、每日上限。
6. **練習模式**。
7. **TTS、字典**。
8. **統計**。
9. **設定頁**（全部分組＋還原預設）。
10. **Google Drive 同步／備份**、本機匯出匯入。
11. 型別檢查、lint、建置、瀏覽器實測。

## 驗收方式

- `npm run type-check`、`npm run lint`、`npm test`、`npm run build` 都通過。
- 在內建瀏覽器實際操作：建立牌組→子牌組→兩種卡片→新學習→複習→撤銷／重評→練習→統計→設定切換主色／深色。
- Google 同步需要部署 Worker 並提供 Client ID 才能實測；會先確認程式流程和錯誤狀態。
