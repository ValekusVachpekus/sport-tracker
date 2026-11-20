import { newProgram, type HistoryRow, type Program, type Workout } from './model'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const storageKey = `sport-tracker:auth:${url}:${import.meta.env.BASE_URL}`
export const configured = /^https?:\/\/[^/]+$/.test(url) && key.startsWith('sb_publishable_') && key !== 'sb_publishable_replace_me'

type Session = { access_token: string; refresh_token: string; expires_at?: number; expires_in: number; user: { id: string } }
export type ProgramRow = { program: Program; revision: number }

export function session(): Session | null {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null') }
  catch { return null }
}

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('apikey', key)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(url + path, { ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(12000) })
  } catch {
    throw new Error('Связь с базой недоступна. Попробуй ещё раз.')
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new ApiError(response.status, detail.message ?? detail.msg ?? detail.error_description ?? 'Ошибка базы данных')
  }
  return response.status === 204 || !response.headers.get('content-type')?.includes('json')
    ? undefined as T : response.json()
}

async function token(grant: string, body: object) {
  return request<Session>(`/auth/v1/token?grant_type=${grant}`, { method: 'POST', body: JSON.stringify(body) })
}

function saveSession(value: Session) {
  value.expires_at ??= Math.floor(Date.now() / 1000) + value.expires_in
  localStorage.setItem(storageKey, JSON.stringify(value))
  return value
}

export async function signIn(email: string, password: string) {
  try { return saveSession(await token('password', { email, password })).user.id }
  catch (error) {
    if (error instanceof ApiError && [400, 401].includes(error.status)) throw new Error('Проверь почту и пароль.')
    throw error
  }
}

export async function signOut() {
  const former = session()
  localStorage.removeItem(storageKey)
  if (former) await request('/auth/v1/logout?scope=local', { method: 'POST' }, former.access_token).catch(() => undefined)
}

let refreshing: Promise<Session> | undefined
function validSession(owner: string, rejectedToken?: string) {
  async function refresh() {
    const current = session()
    if (!current || current.user.id !== owner) throw new Error('Войди в аккаунт для синхронизации.')
    if (current.access_token !== rejectedToken && (current.expires_at ?? 0) > Date.now() / 1000 + 45) return current
    try {
      const next = await token('refresh_token', { refresh_token: current.refresh_token })
      const latest = session()
      if (latest?.user.id !== owner) throw new Error('Войди в аккаунт для синхронизации.')
      return latest.refresh_token === current.refresh_token ? saveSession(next) : latest
    } catch (error) {
      if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
        throw new Error('Сессия истекла. Выйди и войди снова. Черновик и очередь сохранятся на этом устройстве.')
      }
      throw error
    }
  }
  const runRefresh = async () => navigator.locks ? await navigator.locks.request(storageKey, refresh) : await refresh()
  const pending = refreshing ??= runRefresh().finally(() => { refreshing = undefined })
  return pending.then(current => {
    if (current.user.id !== owner) throw new Error('Аккаунт изменился. Обнови страницу.')
    return current
  })
}

async function data<T>(owner: string, path: string, options?: RequestInit) {
  const current = await validSession(owner)
  try {
    return await request<T>('/rest/v1/' + path, options, current.access_token)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    const next = await validSession(owner, current.access_token)
    return request<T>('/rest/v1/' + path, options, next.access_token)
  }
}

export async function loadProgram(owner: string) {
  const table = `programs?user_id=eq.${owner}&select=program,revision`
  const [existing] = await data<ProgramRow[]>(owner, table)
  if (existing) return existing
  await data(owner, 'programs?on_conflict=user_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ user_id: owner, program: newProgram() }),
  })
  const [created] = await data<ProgramRow[]>(owner, table)
  if (!created) throw new Error('Не удалось открыть программу.')
  return created
}

export async function saveProgram(owner: string, program: Program, revision: number) {
  const [row] = await data<ProgramRow[]>(owner, `programs?user_id=eq.${owner}&revision=eq.${revision}&select=program,revision`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ program, revision: revision + 1 }),
  })
  if (!row) throw new Error('Программу уже изменили на другом устройстве. Скопируй нужные правки и обнови страницу.')
  return row
}

export async function history(owner: string) {
  const rows: HistoryRow[] = []
  const query = `workouts?user_id=eq.${owner}&select=workout,revision&order=workout_date.desc,created_at.desc,id.desc`
  for (let offset = 0; ; offset += 200) {
    const page = await data<HistoryRow[]>(owner, `${query}&limit=200&offset=${offset}`)
    rows.push(...page)
    if (page.length < 200) return rows
  }
}

export function uploadWorkout(owner: string, workout: Workout) {
  return data(owner, 'workouts?on_conflict=user_id,id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ user_id: owner, id: workout.id, workout_date: workout.date, workout }),
  })
}

export async function editWorkout(owner: string, workout: Workout, revision: number) {
  const [row] = await data<HistoryRow[]>(owner, `workouts?user_id=eq.${owner}&id=eq.${workout.id}&revision=eq.${revision}&select=workout,revision`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ workout, revision: revision + 1 }),
  })
  if (!row) throw new Error('Запись уже изменили. Обнови страницу и открой её снова.')
  return row
}
