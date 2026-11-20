import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, BarChart3, CalendarDays, ChevronRight, ClipboardList, Dumbbell, LogOut, Play, RefreshCw, Trash2 } from 'lucide-react'
import * as api from './api'
import { changeLocal, emptyLocal, readLocal } from './storage'
import { completionColor, doneCount, localDate, readBodyMass, recentForSlot, shortDays, startWorkout, workoutCompletion, type HistoryRow, type Workout } from './model'
import { ProgramEditor } from './ProgramEditor'
import { WorkoutEditor } from './WorkoutEditor'
import { Progress } from './Progress'
import { TrainingCalendar } from './TrainingCalendar'
import './style.css'

const tabs = [
  { id: 'today', label: 'Сегодня', Icon: CalendarDays },
  { id: 'program', label: 'Программа', Icon: ClipboardList },
  { id: 'history', label: 'История', Icon: Activity },
  { id: 'progress', label: 'Прогресс', Icon: BarChart3 },
] as const
type Tab = typeof tabs[number]['id']
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось сохранить данные.'
const prettyDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' })
const todayFormat = new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' })
const kgFormat = new Intl.NumberFormat('ru', { maximumFractionDigits: 3 })

function WorkoutDate({ workout }: { workout: Workout }) {
  const mass = readBodyMass(workout.bodyMassKg)
  return <span>{prettyDate.format(localDate(workout.date))}{mass !== null && ` · Масса тела ${kgFormat.format(mass)} кг`}</span>
}

function HistoryScore({ completion }: { completion: ReturnType<typeof workoutCompletion> }) {
  const { completed, planned, percent } = completion
  return <span className="history-score" aria-label={`${completed} из ${planned} подходов${percent === null ? '' : `, ${percent}%`}`}>
    {percent !== null && <strong style={{ color: completionColor(percent) }}>{percent}%</strong>}
    <small>{completed}/{planned}</small>
  </span>
}

function Brand() {
  return <div className="brand"><span className="brand-icon"><Dumbbell size={21} /></span><span>Sport Tracker</span></div>
}

function Login({ enter }: { enter: (owner: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try { enter(await api.signIn(String(values.get('email')).trim(), String(values.get('password')))) }
    catch (cause) { setError(message(cause)) }
    finally { setBusy(false) }
  }
  return <main className="auth">
    <Brand />
    <section className="panel section auth-panel">
      <h1>{api.configured ? 'Вход' : 'Подключение к журналу'}</h1>
      {api.configured ? <form onSubmit={submit}>
        <label>Почта<input name="email" type="email" autoComplete="username" required /></label>
        <label>Пароль<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="feedback error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Вход…' : 'Войти'}</button>
      </form> : <p className="muted">Добавь адрес проекта Supabase и публичный ключ в настройки сборки. Инструкция есть в README.</p>}
    </section>
  </main>
}

function Journal({ owner, exit }: { owner: string; exit: () => void }) {
  const [tab, setTab] = useState<Tab>('today')
  const [program, setProgram] = useState<api.ProgramRow>()
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyReady, setHistoryReady] = useState(false)
  const [local, setLocal] = useState(emptyLocal)
  const [localReady, setLocalReady] = useState(false)
  const [edit, setEdit] = useState<HistoryRow>()
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(navigator.onLine)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [syncError, setSyncError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [dayOverride, setDayOverride] = useState<number>()
  const activeSync = useRef(false)
  const removedWorkoutIds = useRef(new Set<string>())
  const today = (now.getDay() + 6) % 7
  const day = dayOverride ?? today

  const sync = useCallback(async () => {
    if (activeSync.current || !navigator.onLine) return
    activeSync.current = true
    setLoading(true)
    setSyncError('')
    try {
      const pending = (await readLocal(owner)).queue
      for (const workout of pending) {
        await api.uploadWorkout(owner, workout)
        const next = await changeLocal(owner, state => ({ ...state, queue: state.queue.filter(item => item.id !== workout.id) }))
        setLocal(current => ({ ...current, queue: next.queue }))
      }
      const [schedule, entries] = await Promise.all([api.loadProgram(owner), api.history(owner)])
      setProgram(current => current && current.revision > schedule.revision ? current : schedule)
      setHistory(current => {
        const revisions = new Map(current.map(row => [row.workout.id, row]))
        return entries.filter(row => !removedWorkoutIds.current.has(row.workout.id)).map(row => {
          const cached = revisions.get(row.workout.id)
          return cached && cached.revision > row.revision ? cached : row
        })
      })
      setHistoryReady(true)
    } catch (error) { setSyncError(message(error)) }
    finally {
      activeSync.current = false
      setLoading(false)
    }
  }, [owner])

  useEffect(() => {
    void readLocal(owner).then(state => { setLocal(state); setLocalReady(true) }).catch(error => setNotice(message(error)))
    void sync()
    const online = () => { setConnected(true); void sync() }
    const offline = () => setConnected(false)
    const visible = () => {
      if (!document.hidden) { setNow(new Date()); void sync() }
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visible)
    const clock = setInterval(() => setNow(new Date()), 60_000)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visible)
      clearInterval(clock)
    }
  }, [owner, sync])

  useEffect(() => {
    if (!local.queue.length || !connected) return
    const retry = setInterval(() => void sync(), 30_000)
    return () => clearInterval(retry)
  }, [local.queue.length, connected, sync])

  function navigate(target: Tab) {
    setTab(target)
    setEdit(undefined)
    window.scrollTo(0, 0)
  }

  async function start() {
    if (!program || !connected || !program.program.days[day].slots.length) return
    setBusy(true)
    setNotice('')
    try {
      const refreshed = (await api.history(owner)).filter(row => !removedWorkoutIds.current.has(row.workout.id))
      const workout = startWorkout(program.program, day, refreshed)
      const previous = Object.fromEntries(workout.exercises.flatMap(item => {
        const prior = recentForSlot(refreshed, item.slot)
        return prior ? [[item.slot.id, prior]] : []
      }))
      const state = await changeLocal(owner, current => current.draft ? current : { ...current, draft: { workout, previous } })
      setLocal(state)
      setHistory(refreshed)
      window.scrollTo(0, 0)
    } catch (error) { setNotice(message(error)) }
    finally { setBusy(false) }
  }

  const draft = local.draft
  const draftId = draft?.workout.id
  const unsaved = useRef(false)
  function changeDraft(apply: (workout: Workout) => Workout) {
    // A transactional update keeps the queue and other drafts intact across tabs.
    const update = (state: typeof local) => !state.draft || state.draft.workout.id !== draftId ? state
      : { ...state, draft: { ...state.draft, workout: apply(state.draft.workout) } }
    setLocal(update)
    void changeLocal(owner, update).catch(() => {
      unsaved.current = true
      setNotice('Часть изменений пока хранится на экране. Заверши тренировку перед закрытием вкладки.')
    })
  }

  async function closeDraft(finish: boolean) {
    if (!draft || (finish && !doneCount(draft.workout))) return
    if (!finish && !window.confirm('Отменить тренировку и удалить черновик?')) return
    setBusy(true)
    setNotice('')
    try {
      const state = await changeLocal(owner, current => {
        if (!current.draft || current.draft.workout.id !== draft.workout.id) return current
        const workout = unsaved.current ? draft.workout : current.draft.workout
        if (finish && !doneCount(workout)) throw new Error('Сначала запиши хотя бы один подход.')
        return { draft: null, queue: finish ? [...current.queue, workout] : current.queue }
      })
      setLocal(state)
      unsaved.current = false
      if (finish) { navigate('history'); void sync() }
    } catch (error) { setNotice(message(error)) }
    finally { setBusy(false) }
  }

  async function saveEdit() {
    if (!edit || !connected) return
    setBusy(true)
    setNotice('')
    try {
      const saved = await api.editWorkout(owner, edit.workout, edit.revision)
      setHistory(current => current.map(row => row.workout.id === saved.workout.id ? saved : row))
      setEdit(undefined)
    } catch (error) { setNotice(message(error)) }
    finally { setBusy(false) }
  }

  async function removeWorkout({ workout, revision }: HistoryRow) {
    if (!connected || busy || !window.confirm(`Удалить «${workout.title}» за ${prettyDate.format(localDate(workout.date))}?`)) return
    setBusy(true)
    setNotice('')
    try {
      await api.editWorkout(owner, { ...workout, deleted: true }, revision)
      removedWorkoutIds.current.add(workout.id)
      setHistory(current => current.filter(row => row.workout.id !== workout.id))
    } catch (error) { setNotice(message(error)) }
    finally { setBusy(false) }
  }

  const schedule = program?.program.days[day]
  const planned = schedule?.slots ?? []
  const queueIds = new Set(local.queue.map(workout => workout.id))
  const showDraft = tab === 'today' && draft
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <nav aria-label="Разделы">
        {tabs.map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon /><span>{label}</span></button>)}
      </nav>
      <button className="text-button logout" onClick={exit}><LogOut /> Выйти</button>
    </aside>
    <div className="content">
      <div className="mobile-top"><Brand /><button className="icon" aria-label="Выйти" onClick={exit}><LogOut /></button></div>
      <main>
        {!connected && <p className="feedback" role="status">Нет связи. Начатую тренировку можно продолжить.</p>}
        {local.queue.length > 0 && <div className="feedback sync" role="status"><span>Ожидает синхронизации: {local.queue.length}</span><button className="text-button" disabled={!connected || loading} onClick={() => void sync()}><RefreshCw /> Повторить</button></div>}
        {syncError && connected && <div className="feedback error sync"><span role="alert">{syncError}</span><button className="text-button" disabled={loading} onClick={() => void sync()}>Повторить</button></div>}
        {notice && <p className="feedback error" role="alert">{notice}</p>}
        {showDraft && <WorkoutEditor workout={draft.workout} previous={draft.previous} change={changeDraft} complete={() => void closeDraft(true)} cancel={() => void closeDraft(false)} busy={busy} />}
        {tab === 'today' && !draft && <>
          <header className="page-heading today-heading"><h1>Сегодня</h1><p className="heading-meta">{todayFormat.format(now)}</p></header>
          {program ? <>
            <div className="week" aria-label="Выбрать день тренировки">
              {shortDays.map((label, i) => {
                const d = new Date(now)
                d.setDate(d.getDate() - today + i)
                return <button key={label} className={day === i ? 'selected' : ''} aria-pressed={day === i} onClick={() => setDayOverride(i)}>
                  {label}<span>{d.getDate()}</span>{program.program.days[i].slots.length > 0 && <i aria-label="Есть тренировка" />}
                </button>
              })}
            </div>
            <section className="panel today-card">
              <div className="today-copy">
                <h2>{planned.length ? schedule?.name || 'Тренировка' : 'День отдыха'}</h2>
                {planned.length > 0 && <p className="muted">{planned.length} упр. · {planned.reduce((sum, item) => sum + item.sets, 0)} подх.</p>}
                {planned.length ? <button className="primary" disabled={!connected || !localReady || busy} onClick={() => void start()}><Play fill="currentColor" /> Начать тренировку</button>
                  : <button className="secondary" onClick={() => navigate('program')}>Открыть программу</button>}
              </div>
              <div className="plate" aria-hidden="true"><div className="plate-inner"><div /></div></div>
            </section>
            {planned.length > 0 && <section className="panel section">
              <div className="section-title"><h2>Упражнения</h2></div>
              <ul className="overview-list">{planned.map(item => <li key={item.id}><span>{item.name ?? program.program.exercises.find(x => x.id === item.exerciseId)?.name}</span><span className="muted">{item.sets} × {item.min === item.max ? item.min : `${item.min}–${item.max}`}</span></li>)}</ul>
            </section>}
          </> : <section className="panel section"><p className="muted">{loading ? 'Загружаем программу…' : 'Программа доступна после подключения к базе.'}</p></section>}
        </>}
        {tab === 'program' && (program ? <ProgramEditor initial={program} today={today} onSave={async (next, revision) => {
          const saved = await api.saveProgram(owner, next, revision)
          setProgram(saved)
          return saved.revision
        }} /> : <p className="feedback">Для редактирования программы нужна связь с базой.</p>)}
        {tab === 'history' && edit && <WorkoutEditor workout={edit.workout} previous={{}} change={apply => setEdit(current => current && { ...current, workout: apply(current.workout) })}
          complete={() => void saveEdit()} cancel={() => setEdit(undefined)} busy={busy || !connected} editing />}
        {tab === 'history' && !edit && <>
          <header className="page-heading"><h1>История</h1></header>
          {(historyReady || local.queue.length > 0) && <TrainingCalendar now={now} workouts={[
            ...history.map(row => row.workout), ...local.queue,
          ]} program={historyReady && connected ? program?.program : undefined} />}
          <section className="panel section">
            {!connected && <p className="muted">Полная история откроется при подключении.</p>}
            {connected && !historyReady && <p className="muted">{loading ? 'Загружаем историю…' : 'История пока недоступна.'}</p>}
            {connected && historyReady && !history.length && !local.queue.length && <p className="muted">Пока нет тренировок.</p>}
            <ul className="history-list">
              {local.queue.map(workout => {
                const completion = workoutCompletion(workout)
                return <li className="history-entry" key={workout.id} style={{ backgroundColor: completionColor(completion.percent, 54, .09) }}>
                  <div><strong>{workout.title}</strong><WorkoutDate workout={workout} /><small>Ожидает отправки</small></div>
                  <HistoryScore completion={completion} />
                </li>
              })}
              {connected && history.filter(({ workout }) => !queueIds.has(workout.id)).map(row => {
                const completion = workoutCompletion(row.workout)
                return <li className="history-entry" key={row.workout.id} style={{ backgroundColor: completionColor(completion.percent, 54, .09) }}>
                  <button className="history-row" onClick={() => { setEdit(row); window.scrollTo(0,0) }}>
                    <div><strong>{row.workout.title}</strong><WorkoutDate workout={row.workout} /></div>
                    <HistoryScore completion={completion} /><ChevronRight />
                  </button>
                  <button className="icon history-delete" aria-label={`Удалить тренировку: ${row.workout.title}`} disabled={busy}
                    onClick={() => void removeWorkout(row)}><Trash2 /></button>
                </li>
              })}
            </ul>
          </section>
        </>}
        {tab === 'progress' && (program && historyReady && connected ? <Progress history={history} program={program.program} queue={local.queue} /> : <p className="feedback">Подключись к интернету, чтобы загрузить прогресс.</p>)}
      </main>
    </div>
  </div>
}

function App() {
  const [owner, setOwner] = useState(() => api.configured ? api.session()?.user.id : undefined)
  return owner ? <Journal key={owner} owner={owner} exit={() => { void api.signOut(); setOwner(undefined) }} /> : <Login enter={setOwner} />
}

createRoot(document.getElementById('root')!).render(<App />)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(console.error))
}
