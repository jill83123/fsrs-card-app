# CLAUDE.md — agent 專用入口

FSRS 記憶卡：離線優先的 PWA（Vue 3 + Pinia + Dexie + Tailwind v4 + ts-fsrs），介面為繁體中文；後端只有一支小 Cloudflare Worker（Google 授權代理與每日提醒推播）。

## 維護規則（必讀）

**只要新增、刪除、改名檔案、路由、資料表、store 欄位、公開函式、設定項或指令，就在同一次改動內更新本檔對應的那一行。**

- 一行一個檔案（或一個路由、資料表、指令）；寫「負責什麼」，不寫實作細節。路徑一律從專案根目錄算起。
- 新增檔案 → 在對應段落加一行；刪除檔案 → 刪掉那行；改名 → 改路徑，並檢查別處有無引用舊名。
- 公開函式 = 被別的檔案 import 的 `export`；列在檔案那行的括號裡，只列對外有用的。
- 本檔與程式碼不一致時，以程式碼為準，並順手修正本檔。`docs/PLAN.md`（分層概覽、路由、實作階段）與 `docs/DECISIONS.md`（產品決策）都不是檔案索引，找檔案以本檔為準。
- 使用者看得到的功能有增減或改變（新功能、拿掉的功能、行為改變），或資料模型／產品決策變了，同一次改動內也要對照更新 `README.md` 的功能清單與 `docs/DECISIONS.md`；只寫已存在於程式的內容，改前先對照程式確認。純畫面微調（顏色、間距）不用。
- 查東西的順序：先看本檔 → 直接開對應檔案；不要全專案 grep。

## 指令（`package.json`）

| 指令 | 作用 |
| --- | --- |
| `npm run dev` | 開發伺服器（vite，`server.host: true`，區網手機可連；`.claude/launch.json` 的 `dev` 用 5173、`preview` 用 4173） |
| `npm run build` | `type-check`（`vue-tsc --build`）與 `build-only`（`vite build`）並行，輸出 `dist/` |
| `npm run preview` | 預覽建置結果 |
| `npm run type-check` | 只做型別檢查 |
| `npm run lint` | `lint:oxlint`（`oxlint . --fix`）→ `lint:eslint`（`eslint . --fix --cache`） |
| `npm run format` | `prettier --write --experimental-cli src/` |
| `npm test` / `npm run test:watch` | vitest 一次執行／監看 |
| `worker/` 內 `npm run dev` / `deploy` / `sync-config` | 本機跑 Worker／部署／讓 `wrangler.local.toml` 跟上範例 |

Node 需要 `^22.18.0 || >=24.12.0`。路徑別名 `@` → `src/`。程式碼風格：無分號、單引號、printWidth 100（`.prettierrc.json`），LF 換行（`.gitattributes`）。

## 架構速覽

- 啟動（`src/main.ts`）：載入 `main.css` → `createPinia` → `await useSettings().load()` → `useData().start()`、`useSync().init()`、`useReminder().init()` → 掛載 router → mount。
- 資料流：畫面／元件 → store（`stores/data.ts` 為主）→ Dexie（`db/`）；`liveQuery` 把 IndexedDB 變動推回 store 的 `shallowRef`，畫面只讀 store。
- 同步：每次本機寫入呼叫 `markLocalChange()`（寫 localStorage `sr.lastLocalChange` 並派發 `sr:local-change` 事件）→ `stores/sync.ts` 聽到後延遲上傳；紀錄用 `updatedAt` 做 last-write-wins，刪除只標 `deleted`／`purged`（軟刪除，不真刪）。
- 路由為 hash history；`meta.nav` = 顯示底部導覽（`App.vue` 讀）、`meta.syncFirst` = 進頁前先 `syncBeforeEdit()`（router `beforeEach` 讀）；學習路由另有 `meta.focus`，但目前沒有任何程式讀它。
- 每張卡有正面排程 `sched` 與可選的反面排程 `rsched`（單字卡「意思→單字」）；學習佇列的鍵是 `id` 或 `id:r`（`sideKey`／`parseKey`）。
- 「學習日」以換日時間（`study.rolloverHour`）切分，格式 `YYYY-MM-DD`，不是日曆日（`lib/date.ts`）。

## 路由（`src/router/index.ts`）

| 路徑 | name | 畫面 | meta |
| --- | --- | --- | --- |
| `/` | `home` | `views/HomeView.vue`（同步載入，其餘皆動態 import） | nav |
| `/node/:id` | `node` | `views/NodeView.vue` | nav |
| `/node/:id/stats` | `node-stats` | `views/DeckStatsView.vue` | nav |
| `/card/new` | `card-new` | `views/CardEditView.vue` | syncFirst |
| `/card/:id` | `card` | `views/CardDetailView.vue` | — |
| `/card/:id/edit` | `card-edit` | `views/CardEditView.vue` | syncFirst |
| `/study/:mode(review\|learn)` | `study` | `views/StudyView.vue` | focus（未被讀取）, syncFirst |
| `/practice` | `practice` | `views/PracticeView.vue`（從 `StudyEntry.vue` 帶 query 進入） | — |
| `/stats` | `stats` | `views/StatsView.vue` | nav |
| `/settings` | `settings` | `views/SettingsView.vue`（`/settings#sync` 等 hash 會展開並捲到該區塊） | nav |
| 其他 | — | 轉回 `/` | — |

## 根目錄與建置設定

- `package.json` — 套件與 scripts；`engines.node` 限制見上。
- `vite.config.ts` — `base: './'`、plugins（vue、tailwindcss、devtools、VitePWA）、`__APP_VERSION__`（git 短 hash · 日期）、`@` 別名、`server.host`、`optimizeDeps.exclude: onnxruntime-web`。
- `vite.config.ts`（PWA 區塊）— `registerType: 'prompt'`、manifest（名稱、`theme_color #5f93c4`）、workbox：`importScripts: push-sw.js`、precache `js/css/html/svg/ico/woff2`、runtimeCaching（同源 `.wasm|.data` → `wasm`；`cdn.jsdelivr.net` → `cdn-assets`）。
- `vitest.config.ts` — 測試設定，與 vite.config 分開（不載入 PWA／devtools）；只收 `src/**/__tests__/**/*.test.ts`，環境 node。
- `index.html` — 入口 HTML（`lang=zh-Hant`、`viewport-fit=cover`、`theme-color #eeedea`、載入 `/src/main.ts`）。
- `env.d.ts` — vite／pwa 型別參考與全域常數 `__APP_VERSION__` 宣告。
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — 專案參照；app 含 `src/**`（排除 `__tests__`）、開 `noUncheckedIndexedAccess`、`@/*` 路徑。
- `eslint.config.ts` — eslint flat config（vue + typescript + oxlint 對接 + prettier 關閉格式規則），忽略 `dist`／`coverage`。
- `.oxlintrc.json` — oxlint：`correctness` 類為 error。
- `.prettierrc.json` / `.prettierignore` — prettier 設定；後者排除 `src/lib/tts/data/us_*.json`（壓縮字典）。
- `.editorconfig` / `.gitattributes` / `.gitignore` — 編輯器與換行規則、忽略清單（`dist`、`*.local`、`.eslintcache` 等）。
- `.vscode/extensions.json` — 建議安裝的 VS Code 擴充。
- `.claude/launch.json` — preview 伺服器設定（`dev`、`preview`）。
- `README.md` — 使用者向說明、部署、Google Drive 同步設定流程。
- `docs/DECISIONS.md` — 產品與技術決策紀錄；`docs/PLAN.md` — 實作規劃（分層概覽、路由、階段；檔案索引以本檔為準）。
- `.github/workflows/deploy.yml` — push 到 `main` 時 `npm ci` → `npm test` → `npm run build` → 部署 GitHub Pages；也可手動 `workflow_dispatch`。`paths-ignore` 見下節。

### CI 的 paths-ignore（`.github/workflows/deploy.yml`）

只改下列檔案的 push 不會觸發部署：`worker/**`（Worker 另用 wrangler 部署）、`docs/**`、`**/*.md`、`.vscode/**`、`.editorconfig`、`.prettierrc.json`、`.prettierignore`、`.oxlintrc.json`、`eslint.config.ts`、`.claude/**`（`CLAUDE.md`、`README.md` 已被 `**/*.md` 涵蓋）。新增「不影響建置產物」的檔案類型時，同步補進這份清單與此行。

## 資料層（`src/db/`）

- `src/db/index.ts` — Dexie 資料庫 `recall-cards`（`db`）：資料表 `nodes`（`id, parentId, updatedAt`）、`cards`（`id, deckId, updatedAt, sched.due`）、`logs`（`id, cardId, studyDay, review, updatedAt`）、`meta`（`key`）；目前只有 `version(1)`。匯出 `markLocalChange`、`lastLocalChange`、`CHANGE_EVENT`、`stamp`（單調遞增時間戳）、`getMeta`、`setMeta`。**改 schema 要加新的 `version(n)`，不要改舊的。**
- `src/db/types.ts` — 全部型別：`SyncFields`（`id/createdAt/updatedAt/deleted/purged`）、`TreeNode`（牌組，皆為 deck；`kind: 'folder'` 只存在於舊資料）、`Card` = `BasicCard | VocabCard`、`SchedState`、`Sense`、`Example`、`DerivedWord`、`Relations`、`ReviewLogRecord`、`Dictionary`、`PosOption`、`SyncedSettings`、`DeviceSettings`、`MetaRecord`、`Lang`、`DeckColor`。
- `src/db/defaults.ts` — 預設值與常數：`LANGS`、`langLabel`、`PRIMARY_PRESETS`、`DECK_COLORS`／`DECK_COLOR_KEYS`／`deckColorCss`、`DEFAULT_POS`（id 發佈後不可改，只能改 label 或加新 id）、`isDefaultPos`、`DEFAULT_DICTIONARIES`、`defaultSynced()`、`defaultDevice()`。

### 儲存位置一覽

| 位置 | 鍵／名稱 | 內容 |
| --- | --- | --- |
| IndexedDB | `nodes` / `cards` / `logs` / `meta` | 同步的資料；`meta` 的 `settings` 鍵存 `SyncedSettings`（`SETTINGS_META_KEY`） |
| localStorage | `sr.device` | `DeviceSettings`（不同步） |
| localStorage | `sr.dictVersion` / `sr.ttsVersion` | 預設字典／語音遷移版本 |
| localStorage | `sr.lastLocalChange` | 最後一次本機寫入時間 |
| localStorage | `sr.google.token` / `sr.google.refresh` | Access／Refresh Token（`lib/google/gis.ts`） |
| localStorage | `sr.google.connected` / `.lastSync` / `.lastAutoBackup` / `.conflict` | 同步狀態（`stores/sync.ts`） |
| localStorage | `sr.lastLang` | 最後使用的卡片語言（`CardEditView`、`ImportCardsSheet`） |
| localStorage | `sr.exampleMarksMigrated` | 例句標記遷移已做過（`stores/data.ts`） |
| localStorage | `sr.cardInfoOpen` / `sr.stats.deck` | 卡片詳細頁資訊展開／統計頁選的牌組 |
| localStorage | `kokoro-diag` | Kokoro 載入階段診斷（`lib/tts/kokoro.ts`） |
| localStorage | `sr.deckpick.<範圍 id 或 *>` | 各範圍排除學習的牌組 id（`StudyEntry.vue`） |
| sessionStorage | `sr.filter.<storageKey>` / `sr.browse.cards` / `sr.practice.cards` | 卡片列表篩選、詳細頁前後翻的 id 清單、練習的卡片 id |
| Cache Storage | `tts-audio`（`audioCache.ts`）／`tts-models`（`fetchCache.ts`） | 合成語音片段／語音模型檔 |

## Store（`src/stores/`，Pinia setup 風格）

- `src/stores/data.ts` — `useData`（最大的 store）。狀態：`nodes`、`cards`（未刪除且未封存）、`archivedNodes`、`archivedTree`、`todayLogs`、`ready`、`now`、`today`、`dayEnd`。查詢：`nodeById`、`cardById`、`cardsByDeck`、`scheduler`、`reverseDecks`、`sidesOf`、`limitsOf`、`doneToday`、`deckStats`、`scopeStats`、`decksStats`、`scopeProgress`、`cardsInScope`、`cardsInDecks`、`pausedIds`。動作：`start`、`createNode`、`updateNode`、`reorderNodes`、`reorderCards`、`deleteNode`、`setArchived`、`setPaused`、`setPausedMany`、`listDeleted`、`restoreNode`、`purgeDeleted`、`saveCard`、`addCards`、`syncRelations`、`patchCards`、`resetCards`、`applyRating`、`undoLog`、`latestLog`、`rerate`、`rebucketRecentLogs`。內含舊資料遷移（folder→deck、例句標記）。
- `src/stores/settings.ts` — `useSettings`：`synced`（`SyncedSettings`，存 `meta.settings`）、`device`（`DeviceSettings`，存 localStorage）、`isDark`；`load`、`applyRemote`、`toggleDark`、`resetSynced`、`resetDevice`、`resetPos`、`resetAll`；含 `mergeDefaults` 補新欄位、預設字典／語音版本遷移。**新增設定項時改 `db/types.ts` + `db/defaults.ts`，`mergeDefaults` 會自動補舊資料。**
- `src/stores/sync.ts` — `useSync`：Google Drive 同步狀態機。狀態 `connected`、`lastSync`、`status`（`off|idle|dirty|syncing|reauth|offline|error`）、`error`、`backups`、`busy`、`preEditWaiting`、`conflict`；動作 `init`、`connect`、`disconnect`、`syncNow`、`syncBeforeEdit`、`refreshBackups`、`backupNow`、`restoreBackup`、`wipeEverywhere`、`deleteAllBackups`、`reloadSettings`、`dismissConflict`；另匯出 `conflictItems`、`describeConflict`。遠端檔 `sync.json.gz`，備份 `backup-(auto|manual)-<時間>.json.gz` 保留 3 份。
- `src/stores/ui.ts` — `useUi`：全域 `toasts`、`dialog` 與 `toast`、`dismiss`、`confirm`、`confirmCheck`、`prompt`、`closeDialog`（由 `UiLayer.vue` 繪出）。需要確認／輸入／提示一律用它，不要自己做 dialog。
- `src/stores/backfill.ts` — `useBackfill`：背景補產單字／例句語音（`progress`、`start`、`stop`、`findUnused`、`removeUnused`），換頁不中斷。
- `src/stores/reminder.ts` — `useReminder`：每日提醒（Web Push）訂閱與上傳排程（`supported`、`busy`、`error`、`init`、`enable`、`disable`、`test`）。
- `src/stores/pwa.ts` — `usePwa`：service worker 更新（`needRefresh`、`checking`、`checkNow`、`update`）與安裝（`canInstall`、`installed`、`isIos`、`install`）。

## 邏輯（`src/lib/`，純函式為主，測試在 `src/lib/__tests__/`）

- `src/lib/fsrs.ts` — ts-fsrs 包裝：`makeScheduler`、`toFsrs`／`fromFsrs`、`emptySched`、`retrievability`、`previewIntervals`、`retentionImpact`、`parseSteps`／`isValidSteps`、`GRADES`、`STATE_LABEL`、重匯出 `Rating`／`State`。
- `src/lib/cards.ts` — 卡片輔助：`isComplete`／`isStudyable`、`Side`、`schedOf`、`sideKey`／`parseKey`、`activeSides`、`canReverse`、`isLearned`、`plainText`、`sensesOf`／`sortPinned`／`applySenses`、`groupExamples`／`sortExamples`（例句依詞義分組與排序）、`findWordMark`、`cardTitle`／`cardSubtitle`／`typeBadge`、`templateLabel`、`newBasicCard`／`newVocabCard`。
- `src/lib/session.ts` — 學習佇列：`buildSession`、`newKeys`、`pickNext`、`remaining`、`snapshotOf`、`getSession`／`putSession`／`dropSession`（記憶體 Map；key 由 `StudyView` 組成：`模式:範圍:牌組清單:學習日[:新卡挑選]`）、`NewFilter`。
- `src/lib/newPick.ts` — 「挑選要學的新卡」暫存（依範圍存記憶體）：`emptyPick`、`isPickActive`、`setPick`／`getPick`、`toFilter`。
- `src/lib/tree.ts` — 牌組樹：`childrenOf`、`deckRows`、`deckPickerOptions`、`subtreeIds`、`decksInScope`、`pickedDecks`、`pathTo`、`validParents`，以及繼承設定 `effectiveReverse`／`effectiveLimits`／`effectiveTemplate`。
- `src/lib/filter.ts` — 卡片列表篩選與排序：`CardFilter`、`defaultFilter`、`activeFilterCount`、`applyFilter`、`FAM_BUCKETS`、`SORT_OPTIONS`、`isSortKey`。
- `src/lib/date.ts` — 學習日與格式化：`studyDayOf`／`studyDayStart`／`studyDayEnd`、`addDays`、`ymd`／`parseYmd`、`formatDayLabel`／`weekdayLabel`／`formatHour`／`formatDateTime`／`formatRelative`／`formatInterval`／`formatCountdown`。
- `src/lib/id.ts` — `uid()`、`shuffle()`。
- `src/lib/spelling.ts` — 練習頁拼寫／意思比對：`normalizeAnswer`、`isSpellingCorrect`、`isMeaningCorrect`、`pickExample`。
- `src/lib/relations.ts` — 單字關聯（同義、反義、衍生、易混淆）：`REL_KINDS`、`DICT_REL_KINDS`、`normWord`、`findVocab`、`relCount`。
- `src/lib/importCards.ts` — 批次匯入單字文字：`parseImport`、`matchPos`、`importPrompt`（產生給 AI 的提示詞）、`ImportRow`／`ImportResult`。
- `src/lib/markdown.ts` — `renderMarkdown`：markdown-it + `||防劇透||` 規則 + DOMPurify。
- `src/lib/liveMarkdown.ts` — CodeMirror 即時預覽外掛（`liveMarkdown`）與清單續寫指令（`continueList`），給 `MarkdownEditor.vue`。
- `src/lib/romanize.ts` — 韓文 → 修訂羅馬字（照實際發音）：`romanizeKorean`。
- `src/lib/dictLookup.ts` — 只剩 `DictResult` 型別；線上查字功能已移除，「從字典填入」按鈕暫時隱藏。
- `src/lib/snapshot.ts` — 資料快照：`takeSnapshot`、`isSnapshot`、`mergeIntoLocal`（逐筆 last-write-wins 並回報衝突）、`restoreSnapshot`、`gzipJson`／`gunzipJson`、`SNAPSHOT_VERSION`。
- `src/lib/backup.ts` — JSON 備份：`exportJson`（下載）、`importJson`、`wipeLocal`。
- `src/lib/purge.ts` — 刪除保留期：`DELETED_KEEP_DAYS`（30 天）、`purgeAt`、`purgeExpired`、`DeletedDeck`／`ArchivedDeck`。
- `src/lib/reminder.ts` — 算出每日提醒時段與當時待複習／新卡數：`reminderSlots`、`REMINDER_DAYS`、`ReminderSlot`。
- `src/lib/push.ts` — 瀏覽器端 Web Push 與 Worker `/push/*` 呼叫：`pushSupported`、`currentSubscription`、`subscribePush`、`unsubscribePush`、`uploadSlots`、`sendTestPush`、`newGroupId`。
- `src/lib/google/gis.ts` — Google 授權（經 Worker 換 token）：`setWorkerUrl`、`requestToken`、`refreshAccessToken`、`cachedToken`、`hasRefreshToken`、`clearToken`、`revokeToken`、`preloadGis`。
- `src/lib/google/drive.ts` — Drive v3 `appDataFolder` REST 客戶端：`listFiles`、`downloadFile`、`createFile`、`updateFile`、`deleteFile`、`DriveAuthError`。

### 語音（`src/lib/tts/`）

- `src/lib/tts/index.ts` — 對外唯一入口：`speak`、`playClip`、`stopSpeaking`、`speaking`／`ttsError`、`systemVoices`／`onVoicesChanged`、`setKokoroBackend`、`prefetchSpeech`、`backfillSpeech`、`unusedSpeech`、`regenerateSpeech`；系統語音走 `speechSynthesis`，Kokoro／Piper 產 wav 後存 `tts-audio`。改合成結果時要調高 `KOKORO_REV` 讓舊快取失效。
- `src/lib/tts/reading.ts` — `speechInput`：把使用者寫的讀音轉成合成輸入（日文假名、韓文諺文、英文音標→音素）。
- `src/lib/tts/autoReading.ts` — `canAutoReading`、`generateReading`：依語言自動產生讀音。
- `src/lib/tts/kokoro.ts` — Kokoro 主執行緒端：`KOKORO_VOICES`、`isKokoroVoice`、`loadKokoro`、`kokoroWav`、`isKokoroLoaded`、`isKokoroModelCached`、`resetKokoro`、`onKokoroProgress`、`webgpuAvailable`、診斷 `getKokoroDiag`／`clearKokoroDiag`。
- `src/lib/tts/kokoro.worker.ts` — Web Worker：文字 → 音素 → onnxruntime-web 推論，一次處理一個請求。
- `src/lib/tts/kokoroConfig.ts` — 模型來源與各 backend 的檔名（`KOKORO_REPO`、`KOKORO_MODEL_FILE`、`kokoroModelUrl`）。
- `src/lib/tts/enG2p.ts` — 英文 → Kokoro 音素（misaki 移植）：`englishToPhonemes`、`readingToPhonemes`、`espeakToMisaki`、`preloadEnglishG2p`。
- `src/lib/tts/jaG2p.ts` — 日文 → 音素／假名（kuromoji 斷詞）：`japaneseToPhonemes`、`japaneseToKana`、`preloadJapaneseG2p`。
- `src/lib/tts/num2kana.ts` — 整數 → 平假名（`numberToKana`）。
- `src/lib/tts/kk.ts` — 音素 → KK 音標：`misakiToKk`、`generateKk`。
- `src/lib/tts/espeak.ts` — espeak-ng WASM 音素化：`phonemize`、`loadPhonemizerAssets`。
- `src/lib/tts/espeakPiper.ts` — 韓文 Piper 語音（espeak 音素）：`ESPEAK_VOICES`、`isEspeakVoice`、`loadEspeakVoice`、`espeakAudioUrl`、`isEspeakVoiceLoaded`／`isEspeakVoiceDownloaded`、`clearEspeakCache`、`onEspeakProgress`。
- `src/lib/tts/audioCache.ts` — Cache Storage `tts-audio`：`readAudio`、`hasAudio`、`writeAudio`、`allAudioKeys`、`unusedAudioKeys`、`deleteAudio`、`clearAudioCache`。
- `src/lib/tts/fetchCache.ts` — `fetchCached`（模型下載，附進度，存 `tts-models`）、`isCached`、`clearModelCache`。
- `src/lib/tts/samples.ts` — 設定頁試聽：`SAMPLE_TEXT`、`sampleFile`、`sampleUrl`（對應 `public/tts-samples/*.wav`）。
- `src/lib/tts/wav.ts` — `toNormalizedWav`：PCM → 音量正規化 wav。
- `src/lib/tts/data/hepburn.json`、`ja_words.txt`、`us_gold.json`、`us_silver.json` — 日文羅馬字表、日文詞表、美式英文發音字典（`us_*.json` 為壓縮格式，不要用 prettier 整理）。
- `src/types/piper-wasm.d.ts` — `@diffusionstudio/piper-wasm` 的型別宣告。

### 測試（`src/lib/__tests__/`）

- `helpers.ts` — 測試用的造卡片／牌組工具（非測試檔）。
- `cards.test.ts`、`date.test.ts`、`filter.test.ts`、`fsrs.test.ts`、`importCards.test.ts`、`session.test.ts`、`spelling.test.ts`、`tree.test.ts` — 對應 `src/lib/` 同名檔。
- `pushGroup.test.ts` — 測 `worker/src/push.js` 的 `PushGroup`（Durable Object）。

## Composables（`src/composables/`）

- `src/composables/useLiveQuery.ts` — `useLiveQuery(factory, initial, deps?)`：把 Dexie liveQuery 變成 `shallowRef`，離開作用域自動退訂。
- `src/composables/useDragSort.ts` — 長條清單拖曳排序：`useDragSort(onMove)`、`moved(list, from, to)`；項目標 `data-sort-item`，把手需 `touch-none`。
- `src/composables/useTicker.ts` — 全站共用的一秒時鐘，給倒數顯示。

## 畫面（`src/views/`，每個對應一條路由）

- `src/views/HomeView.vue` — 首頁：牌組樹（`NodeList`）、學習入口、同步狀態、提醒邀請、新增牌組。
- `src/views/NodeView.vue` — 單一牌組：子牌組、卡片列表、匯入、新增卡片、卡片狀態分佈。
- `src/views/DeckStatsView.vue` — 單一牌組統計（包 `StatsPanel`，帶牌組範圍）。
- `src/views/StatsView.vue` — 全域統計，可選牌組範圍（記在 `sr.stats.deck`）。
- `src/views/CardDetailView.vue` — 卡片詳細：卡面、例句、關聯、複習紀錄（可改上一次評分）、星號／暫停／刪除／重設、移動牌組、重新產生語音；鍵盤左右鍵或橫向滑動前後翻（依 `sr.browse.cards`）。
- `src/views/CardEditView.vue` — 新增／編輯卡片（基本卡與單字卡），含詞義釘選與拖曳排序、例句依詞義分組（各組自己新增，例句可用「歸到詞義」面板歸類或移到其他詞義）、讀音自動產生、關聯編輯；儲存按鈕在右上角。
- `src/views/StudyView.vue` — 複習／學習：依 `lib/session.ts` 的佇列出題、FSRS 評分與間隔預覽、復原（`undoLog`）、學習中卡片倒數。
- `src/views/PracticeView.vue` — 不影響排程的練習：牌組挑選、卡片篩選、翻卡／拼寫／意思作答（也會讀 sessionStorage 的 `sr.practice.cards`）。
- `src/views/SettingsView.vue` — 設定頁，以 `SettingsSection` 分區（id）：`appearance`、`study`、`fsrs`、`pos`、`tts`、`reading`、`dict`、`sync`、`reminder`、`archive`、`data`（匯出／匯入／清除）、`install`、`about`（版本與更新）。

## 元件（`src/components/`）

### 版面與共用

- `src/App.vue` — 根版面：`max-w-2xl` 置中容器、底部導覽（首頁／統計／設定，`meta.nav` 時顯示）、新版本提示、`UiLayer`。
- `src/components/UiLayer.vue` — 全域浮層：同步前載入遮罩（`sync-cover`）、`ui.dialog` 對話框、`ui.toasts` 提示；Teleport 到 body。
- `src/components/PageHeader.vue` — 固定在頂端的頁首（返回鍵＋置中標題；插槽 `left`／`title`／`subtitle`／`right`；props `back`／`hideBack`）。
- `src/components/BottomSheet.vue` — 底部彈出面板（`v-model` 開關，`title`），所有 `*Sheet` 的外殼。
- `src/components/PillTabs.vue` — 泛型分段選項（`v-model`）。
- `src/components/SelectBox.vue` — 自製下拉選單，用法同原生 `<select>`（子層放 `<option>`，支援樹狀選項與收合）。
- `src/components/ToggleSwitch.vue` / `NumberStepper.vue` / `RangeSlider.vue` — 開關／加減數字／滑桿（滑桿拇指大小與 `main.css` 的 `--range-thumb` 連動）。
- `src/components/TimeField.vue` — 兩個滾輪選 `HH:MM`（分鐘 5 分一格）。

### 牌組與卡片

- `src/components/NodeList.vue` / `NodeRow.vue` / `NodeLegend.vue` — 牌組列表（可拖曳排序；長按列進入多選，浮動列可批次暫停／恢復、改名（限選一個）、封存、刪除，皆有確認窗）／單列／「可複習、新卡」色塊圖例。
- `src/components/NodeFormSheet.vue` — 新增／編輯牌組（名稱、上層；預設卡片類型、反向、每日上限收在預設摺疊的「進階設定」）。
- `src/components/MoveDeckSheet.vue` / `DeckPickSheet.vue` — 選擇要移入的牌組／挑選要排除或納入學習的牌組。
- `src/components/StudyEntry.vue` — 學習入口：待複習／新卡數與倒數，進入 `/study/*` 或 `/practice`。
- `src/components/NewPickSheet.vue` — 挑選這次要學哪些新卡（受每日上限提示）。
- `src/components/CardList.vue` — 牌組內卡片列表：篩選、排序（存在牌組上）、排序鈕開啟後長按拖曳手動排序、長按卡片進入多選後批次星號／暫停／刪除／重設／移動牌組。
- `src/components/CardListItem.vue` — 卡片列表單列。
- `src/components/CardFilterSheet.vue` — 卡片篩選面板（對應 `lib/filter.ts`）。
- `src/components/CardFace.vue` — 卡片正反面渲染（基本卡／單字卡、反面填空提示、隨機例句（優先抽釘選詞義的）與依詞義順序的「查看更多例句」）；學習、練習、詳細頁共用。
- `src/components/CardExamples.vue` — 卡片詳細頁底下的例句（多詞義時每個詞義一張卡片，標題帶詞性與詞義）、備註、衍生字（可轉成卡片；插槽放關聯詞，順序為例句、備註、關聯詞、衍生字）。
- `src/components/ExampleText.vue` — 例句文字，標記部分上色。
- `src/components/SenseList.vue` — 詞義列表（詞性標籤＋詞義兩欄，釘選有圖示）。
- `src/components/RelationEditor.vue` — 單字關聯編輯（`linkWord`、`start` 對外）。
- `src/components/ImportCardsSheet.vue` — 批次匯入單字。
- `src/components/DictLinks.vue` / `DictResultSheet.vue` — 字典外部連結（擋 `javascript:`）／字典查詢結果面板（功能暫時隱藏）。
- `src/components/SpeakButton.vue` — 發音按鈕（`run` 對外）。
- `src/components/MarkdownEditor.vue` / `MarkdownView.vue` — CodeMirror 6 即時預覽編輯器／唯讀渲染（點 `.spoiler` 揭曉）。
- `src/components/SyncChip.vue` — 首頁的同步狀態小標。
- `src/components/ReminderPrompt.vue` — 在尚未啟用提醒的裝置邀請開啟（需點擊才能要通知權限）。

### 設定子元件（`src/components/settings/`）

- `SettingsSection.vue` — 可收合的分區（`reset` 事件，支援 `#hash` 展開）；`SettingRow.vue` — 單列設定（標題＋說明＋右側控制）。
- `PosSettings.vue` — 詞性選項管理（預設只能隱藏，自訂可刪，拖曳排序）。
- `DictSettings.vue` — 字典連結管理（依語言分組）。
- `ReadingSettings.vue` — 讀音風格（IPA／KK）與整批重產／清空讀音。
- `TtsSettings.vue` — 語音：引擎／模型、Kokoro 下載與診斷、補產語音、快取清理。
- `ReminderSettings.vue` — 每日提醒的時間、內容、本機開關與測試。
- `SyncSettings.vue` — Worker 網址、連線 Google、同步／備份／還原／衝突。
- `ArchiveSettings.vue` — 封存與已刪除牌組管理；`ArchivedDeckItem.vue`／`DeletedDeckItem.vue` 為其單列。

### 統計（`src/components/stats/`）

- `src/components/StatsPanel.vue` — 統計主面板，props `scope`；區塊 id：`retention`、`heatmap`、`forecast`、`ratings`、`stability`、`hard`。
- `StatsSection.vue` — 帶標題的區塊外框；`BarChart.vue`／`BarRows.vue`／`DonutChart.vue`／`DueCalendar.vue`／`CardStateBar.vue` — 圖表。
- `ChartTip.vue` + `useTip.ts` — 圖表浮動提示與其控制。
- `colors.ts` — `CHART_BLUE`、`STATE_COLORS`（卡片狀態 → 顏色）。

## 後端（`worker/`，Cloudflare Worker，與前端分開部署，不受 CI 影響）

- `worker/src/index.js` — 入口：CORS 白名單（`ALLOWED_ORIGINS`）；`GET /config`、`POST /token`、`POST /refresh`、`POST /revoke`（Google 授權代理，Client Secret 只在此）；`/push/*` 交給 `push.js`。
- `worker/src/push.js` — 每日提醒（Web Push）：`handlePush`、`messageOf`、Durable Object `PushGroup`（每個提醒群組一個；路由 `GET /push/key`、`POST /push/sync`、`/push/unsubscribe`、`/push/test`）。
- `worker/wrangler.toml` — 範例設定（佔位字）：`GOOGLE_CLIENT_ID`、`ALLOWED_ORIGINS`、`VAPID_*`、DO 綁定 `PUSH`、migrations v1→v2。真實值放被忽略的 `wrangler.local.toml`。
- `worker/package.json` — scripts：`dev`、`deploy`、`sync-config`。
- `worker/scripts/deploy.mjs` — 部署：先同步設定、擋未填項目，部署時把 `VAPID_PRIVATE_JWK` 轉成加密 secret。
- `worker/scripts/gen-vapid.mjs` — 產生 VAPID 金鑰寫進 `wrangler.local.toml`。
- `worker/scripts/sync-config.mjs` — 讓 `wrangler.local.toml` 跟上範例並列出未填項目（`--check`）。
- `worker/.gitignore`、`worker/package-lock.json` — 忽略本機設定與 `.wrangler`／鎖檔。
- `public/push-sw.js` — 被 workbox `importScripts` 進 service worker：收到推播顯示通知、點擊聚焦 App。

## 靜態資源（`public/`）

- `favicon.ico`、`apple-touch-icon.png`、`icon.svg`、`icon-maskable.svg` — 圖示（PWA manifest 與 `index.html` 引用）。
- `tts-samples/*.wav` — 語音試聽範例，檔名由 `sampleFile(voiceId)` 決定。

## 樣式規則（`src/assets/main.css` 為唯一來源；Tailwind v4，無 `tailwind.config`）

### 顏色
- 全部走 CSS 變數，深色模式由 `<html class="dark">` 切換（`@custom-variant dark`）；`settings.isDark` 決定。**不要寫死色碼，用語意色：**
  - `bg-bg` 頁面底、`bg-surface` 卡片／面板、`bg-surface-2` 次層底、`text-ink` 文字、`text-muted` 次要文字、`border-line` 邊線。
  - `primary`（預設 `#5f93c4`，使用者可改）、`primary-soft`（14% 混 surface）、`primary-strong`（混 ink，用於淺底上的主色文字）。
  - 狀態色 `danger`、`success`、`warn`（`bg-danger`、`text-success` …）。
- 牌組粉彩色：`DECK_COLORS`（`db/defaults.ts`），用 `deckColorCss(c)` 取值；深色模式靠 `--tint-base`／`--tint-amount` 混暗。
- 用 `dark:` 變體的地方極少（目前只有 `SelectBox`、`ReminderPrompt`、`SettingsSection`），優先靠變數自動適配。
- 圖表色：`components/stats/colors.ts`。

### 共用 class（`@layer components`，定義在 `main.css`）
- 卡片：`card`（圓角 2xl、細邊框、`p-5`）。
- 按鈕：`btn`（最小高 40px）＋ `btn-primary` / `btn-soft` / `btn-ghost` / `btn-danger`；`btn-sm`（最小高 32px，行內操作）；`icon-btn`（40px 方形圖示鈕）。
- 選項鈕：`pill` ＋ `pill-active` / `pill-idle`（目前實際只有一處使用，分段選項請用 `PillTabs`）。
- 輸入：`input`（最小高 44px；textarea 自動補 padding）、`input-sm`（34px，卡片內的篩選用）。
- 勾選：`check`（需加 `peer`）＋緊接 `check-icon`（`@lucide/vue` 的 `Check`）。
- 標籤：`label`（小字大寫灰）、`section-label`（卡片表單分組標題，較重）、`chip` / `chip-on`。
- Markdown：`.md`（內文排版，含 `mark` 標記筆底色、`.tint`）、`.spoiler`／`.revealed`（防劇透）。
- 其他：`.scrollbar-none`、`.range`（滑桿）、`.leader`／`.leader-divide`（虛線分隔）。
- 少數元件有自己的 `<style>`：`DictResultSheet`（`.pick`）、`TimeField`（`.wheel`）、`UiLayer`（`.sync-cover`）皆 scoped；`MarkdownEditor` 是非 scoped（改 CodeMirror 的 `.cm-*`）。
- 圖示一律用 `@lucide/vue`。

### 字級
- 字體：`font-sans`（Inter Variable → Chiron Hei HK → 系統 CJK 字型）、`font-mono`（IBM Plex Mono）；全站 `tabular-nums`（數字等寬）。
- 本文 `text-sm`、輔助／標籤 `text-xs`（最常用）、頁首標題 `text-lg font-bold`、底部導覽 `text-[11px]`、圖表與極小註記 `text-[10px]`／`text-[11px]`、卡面與大數字 `text-2xl`／`text-4xl`。**不要自創其他像素值。**

### 層級（z-index）
| z | 用途 |
| --- | --- |
| `z-10` | 圖表提示 `ChartTip` |
| `z-20` | 固定頁首（`PageHeader`、首頁／學習／練習自己的 header）、練習頁底部操作列 |
| `z-30` | 底部導覽（`App.vue`） |
| `z-40` | `BottomSheet` 與遮罩、更新提示、`CardList` 的浮動操作列 |
| `z-50` | `UiLayer` 對話框與 toast |
| `z-[60]` | 同步前全螢幕載入遮罩 |
| `z-[70]` | `SelectBox` 下拉清單（要蓋過面板與對話框） |

頁首與導覽用實色 `bg-bg`／`bg-surface`（不用毛玻璃，iOS 會讓標題模糊）；固定在底部的元素要加 `pb-[env(safe-area-inset-bottom)]`，頂部容器已有 `pt-[env(safe-area-inset-top)]`。版面高度用 `dvh`。

### 動畫
- Vue transition 名稱（定義在 `main.css`）：`fade`（0.15s 透明度，遮罩）、`sheet`（0.22s 位移 24px＋透明度，面板與 toast）。
- 一般互動：`transition` / `transition-colors` / `transition-transform`；按鈕按下 `active:scale-[0.98]`（`icon-btn` 為 `scale-95`）；載入圖示 `animate-spin`。
- `UiLayer` 的 `sync-cover-in`：遮罩延遲 0.3s 才 0.2s 淡入，短同步不閃。
- 不要新增自訂 `@keyframes`，除非上面都不適用；新增時在本段補一行。
