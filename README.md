# FSRS 記憶卡

離線優先的間隔重複記憶卡 App（PWA），用 [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) 演算法安排複習時間，可安裝到手機或電腦桌面使用。

技術：Vite、Vue 3、Tailwind CSS、ts-fsrs、Dexie（IndexedDB）。

> **本專案僅供個人使用，不會有任何商業用途。**
>
> 專案中部分資源帶有非商業或 copyleft 授權，例如韓文聲音 `ko_KR-kss-medium` 的 KSS 語料（CC BY-NC-SA 4.0）與 espeak-ng（GPL-3.0），皆以個人、非商業使用為前提採用。

## 功能

- **牌組與卡片**：樹狀牌組，支援正反卡與單字卡（英、日、韓），卡片內容可用 Markdown，並有 `||防劇透||` 語法。
- **學習與練習**：每日複習／新學習，可設定上限與換日時間；另有不影響排程的練習模式。
- **統計**：學習熱力圖、未來到期卡片、熟練程度分佈。
- **發音**：系統語音，或在瀏覽器內執行的 Kokoro、Piper 離線語音合成。
- **字典**：單字卡可自訂字典連結，並能查詢字典自動帶入意思與例句。
- **備份與同步**：匯出／匯入 JSON，或同步到自己的 Google Drive（選用）。
- **離線可用**：資料存在瀏覽器本機，不需要帳號。

## 文件

- [docs/DECISIONS.md](docs/DECISIONS.md)：產品與技術決策
- [docs/PLAN.md](docs/PLAN.md)：實作規劃與目錄結構

## 開發

需要 Node.js 22.18 以上（或 24.12 以上）。

```sh
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm run build      # 型別檢查 + 建置到 dist/
npm run lint       # oxlint + eslint
```

## 部署（GitHub Pages）

1. 推送到 `main` 分支，`.github/workflows/deploy.yml` 會自動建置並部署。
2. 在 repo 的 **Settings → Pages** 把 Source 設為 **GitHub Actions**。

`vite.config.ts` 使用 `base: './'` 搭配 hash 路由，所以不需要設定 repo 名稱。只改 `worker/` 內的檔案不會觸發部署。

## Google Drive 同步（選用）

不設定也能正常使用，只是資料只存在這台裝置，需要靠 JSON 匯出入來搬資料。想在多台裝置間同步才需要做下面的設定。

資料會存到你 Google Drive 的 App 專用隱藏資料夾（`drive.appdata`），App 看不到你其他的檔案。

### 運作方式

Google 換取長效授權需要 Client Secret，但密鑰不能放在前端，所以用一個很小的 Cloudflare Worker（[worker/](worker/)）保管。

- **第一次連線**：Google 登入視窗只出現一次，App 把授權碼交給 Worker，Worker 補上 Client Secret 向 Google 換到 Token，再交還給 App。
- **之後**：App 帶著長效的 Refresh Token 請 Worker 換新的 Access Token（約每小時一次），全程在背景進行，不會再跳出視窗。
- Google 登入這一段，Worker 不儲存任何資料，Token 只是經過。（每日提醒會另外存推播訂閱，見下方。）

### 設定流程

| 步驟 | 要做什麼 | 你會得到 |
|---|---|---|
| 1. Google Cloud | 啟用 Drive API、設定同意畫面、建立 OAuth 用戶端 | 用戶端 ID 與用戶端密鑰 |
| 2. Cloudflare Worker | 填入用戶端 ID、部署、設定密鑰 | 同步服務網址 |
| 3. App | 在設定頁貼上同步服務網址並連線 | 開始同步 |

### 1. Google Cloud

在 [Google Cloud Console](https://console.cloud.google.com/) 操作：

1. 建立專案，到「API 和服務」→「程式庫」啟用 **Google Drive API**。
2. 左側選單 **Google Auth Platform**，依序設定：
   - **品牌**：填應用程式名稱、使用者支援電子郵件、開發人員聯絡電子郵件。「應用程式首頁」與「隱私權政策」為必填，可暫時填 App 的部署網址。標誌等其他欄位不填。
   - **目標對象**：使用者類型選「外部」。
   - **資料存取**：「新增或移除範圍」，勾選下列範圍（找不到時貼到「手動新增範圍」），再按「更新」「儲存」：
     ```
     https://www.googleapis.com/auth/drive.appdata
     ```
3. **用戶端** → 建立用戶端，類型選「網頁應用程式」，「已授權的 JavaScript 來源」加入：
   - `https://<帳號>.github.io`（部署後的網站）
   - `http://localhost:5173`（本機開發）

   「已授權的重新導向 URI」不用填。建立後記下**用戶端 ID**和**用戶端密鑰**。
4. **目標對象 → 發布應用程式**，把狀態改成「正式版」。
   - 一定要做：測試狀態下 Refresh Token 7 天就失效，會又需要手動登入。
   - `drive.appdata` 是非敏感範圍，個人使用不必送 Google 驗證，也不要上傳標誌（會觸發驗證）。
   - 之後登入會看到「Google 尚未驗證這個應用程式」，點「進階」→「前往…（不安全）」即可。

### 2. Cloudflare Worker

先到 [Cloudflare](https://dash.cloudflare.com/sign-up) 註冊免費帳號並驗證信箱，其餘用指令：

```sh
cd worker
npm install
npx wrangler login      # 瀏覽器開啟授權頁，按允許
```

[worker/wrangler.toml](worker/wrangler.toml) 是會被 commit 的範例，真實的值不要寫在裡面。先產生你自己的設定檔 `worker/wrangler.local.toml`（已被 git 忽略，之後都用這份）：

```sh
npm run sync-config
```

它會從範例複製一份。之後範例新增了設定，再執行一次（或直接部署，部署時會自動做），新的項目會補進你的檔案，已填的值不會被動到。

編輯 `wrangler.local.toml`：

| 欄位 | 填什麼 |
|---|---|
| `GOOGLE_CLIENT_ID` | 上一步的用戶端 ID |
| `ALLOWED_ORIGINS` | 允許呼叫 Worker 的網站，逗號分隔，含 `https://`、不含結尾斜線，要和上面的「JavaScript 來源」一致 |

部署並設定密鑰：

```sh
npm run deploy                                  # 印出 Worker 網址
npx wrangler secret put GOOGLE_CLIENT_SECRET    # 貼上用戶端密鑰（貼上時不會顯示字元）
```

`deploy` 印出的 `https://fsrs-sync-auth.<子網域>.workers.dev` 就是「同步服務網址」。之後改了 Worker 程式只要重跑 `npm run deploy`，密鑰會保留。部署前它會先檢查 `wrangler.local.toml` 有沒有還沒填的項目，有的話會列出來並停下，不會把佔位字部署上去。

### 3. App

在「設定 → Google Drive 同步與備份」貼上同步服務網址，按「連線 Google Drive」。授權畫面列出雲端硬碟權限時，確認它有勾選。每台裝置各貼一次。

> 網址只存在各裝置的瀏覽器裡，不要設成 GitHub 變數或寫進程式。打包進去就會公開，陌生人打開網站就能用自己的 Google 帳號連到你的 OAuth 用戶端。

### 疑難排解

| 狀況 | 處理方式 |
|---|---|
| 「Google 沒有提供長效授權」 | Google 只在第一次授權時給 Refresh Token。到 <https://myaccount.google.com/permissions> 移除這個 App 的存取權，再重新連線。 |
| 一週後又要手動登入 | 同意畫面還是「測試」狀態，請改成「正式版」。 |
| 無法連到同步服務 | 檢查網址是否正確，以及 `ALLOWED_ORIGINS` 是否包含目前網站。 |
| 想看 Worker 紀錄 | `cd worker && npx wrangler tail` |
| 想在本機跑 Worker | 見下方說明。 |

**本機跑 Worker：**

1. 在 `worker/` 建立 `.dev.vars`（已被 git 忽略），寫入 `GOOGLE_CLIENT_SECRET=...`（只有在本機跑 Worker 才需要）。
2. 執行 `npm run dev`，Worker 會跑在 `http://localhost:8787`。
3. 把 App 設定裡的「同步服務網址」改成這個網址。測完記得改回雲端的網址。

## 每日提醒（選用）

每天在指定時間推播通知，有待複習的卡片或可學的新卡才會響，App 沒開也會響。不設定也能正常使用。

需要先完成上面的「Google Drive 同步」的 Worker 部署（提醒是由同一個 Worker 送出的），再多做一次下面的設定。

### 運作方式

網頁在關閉後無法自己定時叫醒，所以由 Worker 負責準時送出：

- App 算出接下來一週每天提醒時的待複習與可學新卡數量，連同這台裝置的推播訂閱傳給 Worker。
- Worker 每 5 分鐘檢查一次，時間到而且數量大於 0 才推播，沒有要做的卡片就不會發送通知。
- Worker 只存推播訂閱和數量，不存卡片內容。訂閱存在 Cloudflare KV；超過 30 天沒更新的訂閱會自動清掉。
- 可以多人共用同一個 Worker：每台裝置各存一筆，Worker 每次只讀「時間快到」的那幾筆，人多也不會變慢。Worker 只會對 Chrome、Firefox、Safari、Edge 的推播服務網址發送通知。

### 設定流程

| 步驟 | 要做什麼 | 你會得到 |
|---|---|---|
| 1. KV | 建立存放訂閱的 KV | 一串 id |
| 2. 推播金鑰 | 產生一組 VAPID 金鑰 | 公鑰與私鑰 |
| 3. 部署 | 填入其餘設定、重新部署 Worker | 推播功能上線 |
| 4. App | 在設定頁開啟每日提醒並測試 | 收到測試通知 |

以下指令都在 `worker/` 資料夾執行。還沒登入 Cloudflare 的話先 `npx wrangler login`。

### 1. 建立 KV

```sh
npx wrangler kv namespace create fsrs-push
```

指令會印出一段設定，裡面的 `id`（一串 32 字的英數字）貼到 `worker/wrangler.local.toml`（沒有的話先執行 `npm run sync-config` 產生），取代 `REPLACE_WITH_KV_NAMESPACE_ID`：

```toml
[[kv_namespaces]]
binding = "PUSH"
id = "你拿到的 id"
```

KV 的名稱（`fsrs-push`）只是標籤，可以自己取；`binding` 是程式讀取用的名字，必須維持 `"PUSH"`。指令印出的設定裡的 `binding` 不用照抄，只拿 `id`。KV 在 Cloudflare 免費方案就能用。

### 2. 產生推播金鑰

推播金鑰（VAPID）是自己產生的，不用去任何地方申請：

```sh
node scripts/gen-vapid.mjs
```

它會產生兩樣東西：

| 項目 | 去哪裡看 | 怎麼處理 |
|---|---|---|
| 公鑰 | 自動寫進 `worker/wrangler.local.toml` 的 `VAPID_PUBLIC_KEY` | 不用自己填；這個檔案已被 git 忽略 |
| 私鑰 | 自動寫進同一個 `wrangler.local.toml` 的 `VAPID_PRIVATE_JWK`，不會印在畫面上 | 不用自己填；這個檔案已被 git 忽略，所以不會被 commit |

`wrangler.local.toml` 裡已經有私鑰時，腳本會拒絕再產生一組（新的金鑰會讓所有已開啟提醒的裝置失效），確定要重來才加 `--force`。

另外把 `wrangler.local.toml` 的 `VAPID_SUBJECT` 改成自己的信箱，格式是 `mailto:你的信箱`（推播服務有狀況時用來聯絡你）。

### 3. 部署

填好 `wrangler.local.toml` 裡其餘的值（KV 的 `id`、`VAPID_SUBJECT`，以及同步用的 `GOOGLE_CLIENT_ID`、`ALLOWED_ORIGINS`）後：

```sh
npm run deploy
```

`npm run deploy` 會先部署設定，再把私鑰以 Cloudflare 的加密「密鑰」存上去，所以儀表板看不到它的明文。私鑰只留在你本機被 git 忽略的 `wrangler.local.toml`。

部署前請再確認 `wrangler.local.toml` 裡的 `GOOGLE_CLIENT_ID` 與 `ALLOWED_ORIGINS` 是你真實的值，不是範例佔位字。部署會用檔案裡的值取代線上的設定，填錯會讓 Google 登入失效。已經設過的密鑰（例如 `GOOGLE_CLIENT_SECRET`）不會被清掉。

### 4. 在 App 開啟

1. 到「設定 → 每日提醒」，打開開關，瀏覽器問是否允許通知時選「允許」。
2. 選提醒時間，以及要提醒「複習」、「新學習」或兩者。
3. 按「傳送測試通知」，幾秒內收到就完成了。

每台想收到通知的裝置，都要各自做第 4 步；提醒時間與內容會跟著同步，但通知授權每台要自己給。在其他裝置開過提醒時，沒開啟的裝置首頁會問要不要一起開。

### 注意事項與限制

- 送達時間可能比設定的時間晚幾分鐘。
- 提醒依最後一次開啟 App 時的進度安排，連續一週沒開啟 App 就會停止。
- iPhone 要 iOS 16.4 以上，並先用 Safari「加入主畫面」，再從主畫面的圖示開啟。
- 推播金鑰只要產生一次。重新產生會讓所有訂閱失效，各裝置要重新開啟提醒。
- 私鑰無法從 Cloudflare 讀回，但本機的 `wrangler.local.toml` 還在就能重新部署；兩邊都弄丟的話，用 `--force` 重新產生一組、重新設定即可。

### 疑難排解

| 狀況 | 處理方式 |
|---|---|
| 開啟時提示要先填同步服務網址 | 到「Google Drive 同步與備份」填入 Worker 網址，按提示的「前往設定」可直接跳過去。 |
| 「Worker 尚未設定推播」 | KV 的 id、`VAPID_PUBLIC_KEY` 或私鑰其中一項沒設好，回頭檢查上面第 1 到 3 步並重新部署。 |
| 「通知權限已被封鎖」 | 瀏覽器已拒絕過通知。到瀏覽器的網站設定把通知改成允許，再回來開啟。 |
| 測試通知收不到 | 確認 App 已「安裝」或加入主畫面；用 `npx wrangler tail` 看 Worker 紀錄。 |
| 想重新來過 | 在 App 關閉再開啟「每日提醒」，會重新建立這台裝置的訂閱。 |

## 外部資源

語音與辭典資料較大，第一次使用到對應功能時才會下載，之後快取在瀏覽器中可離線使用。合成過的發音也會保存，同一個字只會合成一次。

| 功能 | 來源 | 大小 |
|---|---|---|
| Kokoro-82M（日文、英文，標準／高速模式） | huggingface.co | 約 92MB／326MB |
| kuromoji 日文辭典（Kokoro 日文斷詞） | jsDelivr | 約 17MB |
| 韓文聲音 `ko_KR-kss-medium` | huggingface.co | 約 63MB |
| misaki 詞表 `ja_words.txt` | 隨專案部署 | 約 0.5MB（gzip） |
| misaki 英文發音字典 `us_gold.json`、`us_silver.json` | 隨專案部署 | 約 1.5MB（gzip） |
| onnxruntime WASM（CPU／WebGPU） | 隨專案部署 | 約 14MB／27MB |
| espeak-ng（韓文發音、英文字典查不到的字） | 隨專案部署 | 約 18MB |
