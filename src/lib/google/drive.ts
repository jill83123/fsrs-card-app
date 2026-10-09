/* Minimal Drive v3 REST client for the appDataFolder. */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
  size?: string
  appProperties?: Record<string, string>
}

export class DriveAuthError extends Error {}

async function call(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new DriveAuthError(`Google 授權已失效（${res.status}）`)
  }
  if (!res.ok)
    throw new Error(`Google Drive 錯誤 ${res.status}: ${await res.text().catch(() => '')}`)
  return res
}

export async function listFiles(token: string, namePrefix?: string): Promise<DriveFile[]> {
  const q = namePrefix ? `name contains '${namePrefix.replace(/'/g, "\\'")}'` : ''
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime,size,appProperties)',
    pageSize: '100',
    orderBy: 'modifiedTime desc',
  })
  if (q) params.set('q', q)
  const res = await call(token, `${API}/files?${params}`)
  const data = (await res.json()) as { files: DriveFile[] }
  return data.files
}

export async function downloadFile(token: string, id: string): Promise<Blob> {
  const res = await call(token, `${API}/files/${id}?alt=media`)
  return res.blob()
}

export async function createFile(
  token: string,
  name: string,
  body: Blob,
  appProperties?: Record<string, string>,
): Promise<DriveFile> {
  const meta = { name, parents: ['appDataFolder'], appProperties }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  form.append('file', body)
  const res = await call(
    token,
    `${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties`,
    { method: 'POST', body: form },
  )
  return res.json()
}

export async function updateFile(token: string, id: string, body: Blob): Promise<DriveFile> {
  const res = await call(
    token,
    `${UPLOAD}/files/${id}?uploadType=media&fields=id,name,modifiedTime,size,appProperties`,
    { method: 'PATCH', body },
  )
  return res.json()
}

export async function deleteFile(token: string, id: string) {
  await call(token, `${API}/files/${id}`, { method: 'DELETE' })
}
