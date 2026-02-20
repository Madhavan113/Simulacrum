export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''
const ADMIN_KEY_STORAGE_KEY = 'simulacrum_admin_key'

export function getAdminKey(): string | null {
  try {
    return localStorage.getItem(ADMIN_KEY_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAdminKey(key: string | null): void {
  try {
    if (key) {
      localStorage.setItem(ADMIN_KEY_STORAGE_KEY, key)
    } else {
      localStorage.removeItem(ADMIN_KEY_STORAGE_KEY)
    }
  } catch { /* noop */ }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAdminKey()
  if (!key) {
    throw new ApiError(403, 'Admin key not set. Enter your admin key in the dashboard.')
  }
  return apiFetch<T>(path, {
    ...init,
    headers: { 'X-Admin-Key': key, ...init?.headers },
  })
}
