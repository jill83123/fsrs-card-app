# FSRS 記憶卡

離線優先的間隔重複記憶卡 App（PWA），用 [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) 演算法安排複習時間，可安裝到手機或電腦桌面使用。

技術：Vite、Vue 3、Tailwind CSS、ts-fsrs、Dexie（IndexedDB）。

> **本專案僅供個人使用，不會有任何商業用途。**
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
- Worker 不儲存任何資料，Token 只是經過。

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

編輯 [worker/wrangler.toml](worker/wrangler.toml)：

| 欄位 | 填什麼 |
|---|---|
| `GOOGLE_CLIENT_ID` | 上一步的用戶端 ID |
| `ALLOWED_ORIGINS` | 允許呼叫 Worker 的網站，逗號分隔，含 `https://`、不含結尾斜線，要和上面的「JavaScript 來源」一致 |

部署並設定密鑰：

```sh
npx wrangler deploy                             # 印出 Worker 網址
npx wrangler secret put GOOGLE_CLIENT_SECRET    # 貼上用戶端密鑰（貼上時不會顯示字元）
```

`deploy` 印出的 `https://fsrs-sync-auth.<子網域>.workers.dev` 就是「同步服務網址」。之後改了 Worker 程式只要重跑 `npx wrangler deploy`，密鑰會保留。

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

1. 在 `worker/` 建立 `.dev.vars`（已被 git 忽略），寫入 `GOOGLE_CLIENT_SECRET=...`。
2. 執行 `npx wrangler dev`，Worker 會跑在 `http://localhost:8787`。
3. 把 App 設定裡的「同步服務網址」改成這個網址。測完記得改回雲端的網址。

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
