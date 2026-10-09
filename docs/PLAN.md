# 實作規劃（Plan）

決策細節見 [DECISIONS.md](./DECISIONS.md)。

## 目錄結構

```
src/
  main.ts / App.vue            入口、版面（頂部列＋底部導覽）
  assets/main.css              Tailwind v4 ＋ 主題變數（主色、深色模式）
  db/
    types.ts                   Node / Card / ReviewLog / Settings 型別
    index.ts                   Dexie schema、通用寫入（自動更新 updatedAt）
    defaults.ts                設定預設值、詞性預設、字典預設
  lib/
    id.ts / date.ts            UUID、學習日計算
    fsrs.ts                    依設定建立 scheduler、評分、重評、熟悉度、間隔提示
    queue.ts                   建立複習／新學習佇列、每日上限
    tree.ts                    牌組樹、範圍內的牌組與卡片
    cards.ts                   卡片完成度、顯示文字、篩選排序
    markdown.ts                markdown-it ＋ ||防劇透|| ＋ DOMPurify
    color.ts                   主色 → 色階
    tts/                       index（統一入口）、piper、webspeech
    ocr.ts                     tesseract.js 包裝
    google/                    gis（token）、drive（REST）、sync（合併、備份）
    backup.ts                  匯出／匯入 JSON 快照
  stores/
    settings.ts                同步設定＋裝置設定、主題套用
    sync.ts                    同步狀態機
  composables/
    useLiveQuery.ts            Dexie liveQuery → Vue ref
    useStudyDay.ts             目前學習日（每分鐘更新）
  components/                  共用 UI（PillTabs、IconButton、Sheet、MarkdownView、
                               MarkdownEditor、CardFace、RatingBar、Heatmap…）
  views/
    HomeView                   學習日＋換日時間、同步狀態、牌組樹、新增
    NodeView                   牌組頁：入口、子牌組、卡片列表（篩選／排序／批次）
    CardEditView               新增／編輯卡片（正反卡、單字卡）
    CardDetailView             預覽、FSRS 資訊、紀錄、重新評分
    StudyView                  正式複習／新學習
    PracticeSetupView          練習：選卡與選項
    PracticeView               練習進行
    OcrView                    OCR 新增單字
    StatsView                  熱力圖、未來 7 天
    SettingsView               分組設定
```

## 路由

| 路徑 | 頁面 |
|---|---|
| `/` | 首頁 |
| `/node/:id` | 牌組 |
| `/card/new?deck=` | 新增卡片 |
| `/card/:id` | 卡片詳情 |
| `/card/:id/edit` | 編輯卡片 |
| `/study/:mode(review\|learn)?scope=` | 正式複習／新學習（scope 不帶＝全部） |
| `/practice?scope=&cards=` | 練習設定 → 開始 |
| `/ocr?deck=` | OCR |
| `/stats` | 統計 |
| `/settings` | 設定 |

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
11. **OCR**。
12. 型別檢查、lint、建置、瀏覽器實測。

## 驗收方式

- `npm run type-check`、`npm run lint`、`npm run build` 都通過。
- 在內建瀏覽器實際操作：建立牌組→子牌組→兩種卡片→新學習→複習→撤銷／重評→練習→統計→設定切換主色／深色。
- Google 同步需要使用者提供 Client ID 才能實測；會先確認程式流程和錯誤狀態。
