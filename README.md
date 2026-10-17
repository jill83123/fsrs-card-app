# FSRS 記憶卡

離線優先的 FSRS 記憶卡 PWA（Vite + Vue 3 + Tailwind CSS + ts-fsrs）。

> **本專案僅供個人使用，不會有任何商業用途。**
> 專案中部分資源帶有非商業或 copyleft 授權，例如韓文聲音 `ko_KR-kss-medium` 的 KSS 語料（CC BY-NC-SA 4.0）與 espeak-ng（GPL-3.0），皆以個人、非商業使用為前提採用。

- 產品與技術決策：[docs/DECISIONS.md](docs/DECISIONS.md)
- 實作規劃：[docs/PLAN.md](docs/PLAN.md)

## 開發

```sh
npm install
npm run dev        # 開發伺服器
npm run build      # 型別檢查 + 建置到 dist/
npm run lint       # oxlint + eslint
```

## 部署（GitHub Pages）

1. 推送到 `main` 分支，`.github/workflows/deploy.yml` 會自動建置並部署。
2. 在 repo 的 **Settings → Pages** 把 Source 設為 **GitHub Actions**。

`vite.config.ts` 使用 `base: './'` 搭配 hash 路由，所以不需要設定 repo 名稱。只改 `worker/` 內的檔案不會觸發部署。

## Google Drive 同步

資料會同步到你 Google Drive 的 App 專用隱藏資料夾（`drive.appdata`，看不到其他檔案）。

登入使用 Authorization Code Flow：換取 Token 需要 Client Secret，而 Client Secret 不能放在前端，所以放了一個很小的 Cloudflare Worker（[worker/](worker/)）保管它。

- **第一次連線**：Google 登入視窗只出現一次，App 把授權碼交給 Worker，Worker 補上 Client Secret 向 Google 換到 Token，交還給 App。
- **之後**：App 帶著長效的 Refresh Token 請 Worker 換新的 Access Token（約每小時一次），全程在背景，不會再跳出視窗。
- Worker 不儲存任何資料，Token 只是經過。

設定分三段：Google Cloud、Cloudflare Worker、App。

### 1. Google Cloud

在 [Google Cloud Console](https://console.cloud.google.com/)：

1. 建立專案，到「API 和服務」→「程式庫」啟用 **Google Drive API**。
2. 左側選單 **Google Auth Platform**，依序設定：
   - **品牌**：應用程式名稱、使用者支援電子郵件、開發人員聯絡電子郵件。「應用程式首頁」與「隱私權政策」是必填，可暫時填寫 App 的首頁網址（部署網址）。標誌等其他欄位不填。
   - **目標對象**：使用者類型選「外部」。
   - **資料存取**：「新增或移除範圍」，勾選（找不到時貼到「手動新增範圍」）後按「更新」「儲存」：
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

- `GOOGLE_CLIENT_ID`：用戶端 ID。
- `ALLOWED_ORIGINS`：允許呼叫 Worker 的網站（逗號分隔，含 `https://`，不含結尾斜線），要和上面的「JavaScript 來源」一致。

部署並設定密鑰：

```sh
npx wrangler deploy                             # 印出 Worker 網址
npx wrangler secret put GOOGLE_CLIENT_SECRET    # 貼上用戶端密鑰（貼上時不會顯示字元）
```

`deploy` 印出的 `https://fsrs-sync-auth.<子網域>.workers.dev` 就是「同步服務網址」。之後改了 Worker 程式只要重跑 `npx wrangler deploy`，密鑰會保留。

### 3. App

在「設定 → Google Drive 同步與備份」貼上同步服務網址，按「連線 Google Drive」，授權畫面列出雲端硬碟權限時確認它有勾選。每台裝置各貼一次。

網址只存在各裝置的瀏覽器裡，不要設成 GitHub 變數或寫進程式：打包進去就會公開，陌生人打開網站就能用自己的 Google 帳號連到你的 OAuth 用戶端。

### 疑難排解

- **「Google 沒有提供長效授權」**：Google 只在第一次授權時給 Refresh Token。到 <https://myaccount.google.com/permissions> 移除這個 App 的存取權，再重新連線。
- **一週後又要手動登入**：同意畫面還是「測試」狀態，請改成「正式版」。
- **無法連到同步服務**：檢查網址是否正確，以及 `ALLOWED_ORIGINS` 是否包含目前網站。
- **看 Worker 紀錄**：`cd worker && npx wrangler tail`。
- **本機跑 Worker**：在 `worker/` 建立 `.dev.vars`（已被 ignore），寫入 `GOOGLE_CLIENT_SECRET=...`，執行 `npx wrangler dev`（Worker 會跑在 `http://localhost:8787`），再把 App 設定裡的「同步服務網址」改成這個網址。測完記得改回雲端的網址。

## 外部資源

| 功能 | 來源 | 大小（首次使用時下載） |
|---|---|---|
| Kokoro-82M（日文、英文，標準／高速模式） | huggingface.co | 約 92MB／326MB |
| kuromoji 日文辭典（Kokoro 日文斷詞） | jsDelivr | 約 17MB |
| misaki 詞表 `ja_words.txt` | 隨專案部署 | 約 0.5MB（gzip） |
| misaki 英文發音字典 `us_gold.json`、`us_silver.json` | 隨專案部署 | 約 1.5MB（gzip） |
| onnxruntime WASM（CPU／WebGPU） | 隨專案部署 | 約 14MB／27MB |
| espeak-ng（韓文發音、英文字典查不到的字） | 隨專案部署 | 約 18MB |
| 韓文聲音 `ko_KR-kss-medium` | huggingface.co | 約 63MB |

下載後都會快取在瀏覽器中，可以離線使用。合成過的發音也會保存下來，同一個字只會合成一次。
