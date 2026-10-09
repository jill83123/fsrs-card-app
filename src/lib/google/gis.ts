/* Google Identity Services token flow (no backend, drive.appdata scope only). */

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const TOKEN_KEY = 'sr.google.token'

interface StoredToken {
  token: string
  expiresAt: number
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(o?: { prompt?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(o: {
    client_id: string
    scope: string
    callback: (r: TokenResponse) => void
    error_callback?: (e: { type: string; message?: string }) => void
  }): TokenClient
  revoke(token: string, done?: () => void): void
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } }
  }
}

let gisPromise: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('無法載入 Google 登入元件，請檢查網路'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

export function cachedToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as StoredToken
    return t.expiresAt - 60_000 > Date.now() ? t.token : null
  } catch {
    return null
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/** Load the Google script ahead of time so a later click can open the popup immediately. */
export function preloadGis() {
  void loadGis().catch(() => {})
}

let client: TokenClient | null = null
let clientFor = ''
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null

function getClient(clientId: string): TokenClient {
  if (client && clientFor === clientId) return client
  clientFor = clientId
  client = window.google!.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: (r) => {
      const p = pending
      pending = null
      if (!p) return
      if (r.error || !r.access_token) {
        p.reject(new Error(r.error_description || r.error || '授權失敗'))
        return
      }
      // Google lets the user untick individual permissions on the consent screen
      if (!window.google!.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
        p.reject(
          new Error(
            '沒有取得雲端硬碟權限，請重新連線，並在 Google 授權畫面勾選「應用程式資料」的權限',
          ),
        )
        return
      }
      const stored: StoredToken = {
        token: r.access_token,
        expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
      }
      localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
      p.resolve(r.access_token)
    },
    error_callback: (e) => {
      const p = pending
      pending = null
      p?.reject(
        new Error(
          e.type === 'popup_closed'
            ? '已取消登入'
            : e.type === 'popup_failed_to_open'
              ? '瀏覽器擋住了 Google 登入視窗，請再按一次，或允許這個網站開啟彈出式視窗'
              : e.message || e.type,
        ),
      )
    },
  })
  return client
}

function openPopup(clientId: string, selectAccount: boolean) {
  return new Promise<string>((resolve, reject) => {
    pending?.reject(new Error('已取消登入'))
    pending = { resolve, reject }
    getClient(clientId).requestAccessToken({ prompt: selectAccount ? 'select_account' : '' })
  })
}

/**
 * Opens Google's popup, so it must be called synchronously from a click handler: browsers
 * block popups opened after an await. When the script is already loaded (see preloadGis)
 * the popup opens without any await.
 */
export function requestToken(clientId: string, selectAccount = false): Promise<string> {
  if (!clientId) return Promise.reject(new Error('尚未設定 Google OAuth Client ID'))
  if (window.google?.accounts?.oauth2) return openPopup(clientId, selectAccount)
  return loadGis().then(() => openPopup(clientId, selectAccount))
}

export async function revokeToken() {
  const t = cachedToken()
  clearToken()
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t)
}
