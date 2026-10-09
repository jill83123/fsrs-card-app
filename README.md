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
3. （選用）預設 Google Client ID：在 repo 的 **Settings → Secrets and variables → Actions**，切到 **Variables** 分頁按 **New repository variable**，名稱填 `VITE_GOOGLE_CLIENT_ID`，值填用戶端 ID（`xxxx.apps.googleusercontent.com`），然後重新部署（重新 push，或在 Actions 頁面重新執行部署）。
   - 部署後 App 的 Client ID 欄位會預先帶入這個值，仍可在設定中修改；已經填過其他值的裝置維持原本的值。
   - 用戶端 ID 不是機密，會出現在前端程式中，所以用 Variables 即可，不需要 Secrets。真正限制使用的是 Google Cloud 的「已授權的 JavaScript 來源」與測試使用者名單。
   - 本機開發也想帶入預設值時，在專案根目錄建立 `.env.local`（不會被 commit），內容為 `VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com`，再重新啟動 `npm run dev`。

`vite.config.ts` 使用 `base: './'` 搭配 hash 路由，所以不需要設定 repo 名稱。

## Google Drive 同步

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立專案。
2. **啟用 Google Drive API**：「API 和服務」→「程式庫」，搜尋「Google Drive API」並按「啟用」。
3. 設定 OAuth 同意畫面（左側選單的 **Google Auth Platform**，舊版介面稱為「OAuth 同意畫面」）：
   - **品牌**：填寫應用程式名稱、使用者支援電子郵件與開發人員聯絡電子郵件。
   - **目標對象**：使用者類型選「外部」，並在「測試使用者」加入自己的 Google 帳號（測試狀態下只有名單內的帳號能登入，最多 100 個）。
   - **資料存取**：按「新增或移除範圍」，搜尋並勾選下列範圍（找不到時貼到「手動新增範圍」），按「更新」後再按「儲存」：
     ```
     https://www.googleapis.com/auth/drive.appdata
     ```
     這個範圍只能讀寫 App 專用的隱藏資料夾（appDataFolder），看不到雲端硬碟裡的其他檔案；資料會佔用雲端硬碟容量。若搜尋不到，通常是第 2 步的 Drive API 尚未啟用。
4. **用戶端** → 建立用戶端，類型選「網頁應用程式」，在「已授權的 JavaScript 來源」加入部署網址（例如 `https://<帳號>.github.io`）以及開發用的 `http://localhost:5173`。
5. 把用戶端 ID 填到 App 的「設定 → Google Drive 同步與備份」，按「連線 Google Drive」。
6. Google 授權畫面列出雲端硬碟權限時，確認它有勾選；沒勾選的話 App 會提示重新連線。

> 測試狀態下登入時會出現「Google 尚未驗證這個應用程式」，點「繼續」即可。Google 的授權約 1 小時到期，到期後首頁同步狀態會顯示需要重新登入，點一下即可。

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
| Tesseract 語言檔 | jsDelivr | 英文約 4MB，日／韓約 10MB+ |

下載後都會快取在瀏覽器中，可以離線使用。合成過的發音也會保存下來，同一個字只會合成一次。
