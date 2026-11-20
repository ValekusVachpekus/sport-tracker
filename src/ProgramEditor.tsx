import { useState } from 'react'
import { Archive, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { readNumber, shortDays, weekdays, type Exercise, type Program, type Slot } from './model'

export function ProgramEditor({ initial, today, onSave }: { initial: { program: Program; revision: number }; today: number; onSave: (program: Program, revision: number) => Promise<number> }) {
  const [program, setProgram] = useState(initial.program)
  const [revision, setRevision] = useState(initial.revision)
  const [index, setIndex] = useState(today)
  const [exerciseId, setExerciseId] = useState('')
  const [newName, setNewName] = useState('')
  const [bodyweight, setBodyweight] = useState(false)
  const [catalog, setCatalog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [createError, setCreateError] = useState('')
  const [addedId, setAddedId] = useState('')
  // Keep input strings until save so intermediate decimal values stay editable.
  const [weights, setWeights] = useState<Record<string, string>>({})
  const day = program.days[index]
  const selectedExercise = program.exercises.find(exercise => exercise.id === exerciseId && !exercise.archived)
  const addedSlot = day.slots.find(slot => slot.id === addedId)
  const addedExercise = program.exercises.find(exercise => exercise.id === addedSlot?.exerciseId)

  function update(next: Program) {
    setProgram(next)
    setSaved(false)
  }
  function updateDay(next: typeof day) {
    update({ ...program, days: program.days.map((item, i) => i === index ? next : item) })
  }
  function updateSlot(id: string, values: Partial<Slot>) {
    updateDay({ ...day, slots: day.slots.map(item => item.id === id ? { ...item, ...values } : item) })
  }
  function newSlot(id: string): Slot {
    return { id: crypto.randomUUID(), exerciseId: id, sets: 3, min: 8, max: 12, start: null, step: null }
  }
  function addToDay(exercise: Exercise, exercises = program.exercises) {
    const slot = newSlot(exercise.id)
    update({
      exercises,
      days: program.days.map((item, i) => i === index ? { ...item, slots: [...item.slots, slot] } : item),
    })
    setAddedId(slot.id)
    setExerciseId('')
  }
  function createExercise() {
    const name = newName.trim()
    if (!name) return
    if (program.exercises.some(exercise => exercise.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) {
      setCreateError('Упражнение с таким названием уже есть в каталоге.')
      return
    }
    const exercise: Exercise = { id: crypto.randomUUID(), name, bodyweight, archived: false }
    addToDay(exercise, [...program.exercises, exercise])
    setNewName('')
    setBodyweight(false)
    setCreateError('')
  }
  function move(position: number, distance: number) {
    const slots = [...day.slots]
    const [slot] = slots.splice(position, 1)
    slots.splice(position + distance, 0, slot)
    updateDay({ ...day, slots })
  }

  async function save() {
    setError('')
    setSaved(false)
    try {
      const normalized = {
        ...program,
        days: program.days.map((item, i) => ({
          ...item, name: item.name.trim() || weekdays[i],
          slots: item.slots.map(slot => {
            const exercise = program.exercises.find(x => x.id === slot.exerciseId)!
            const fields = { start: slot.start, step: slot.step }
            for (const field of ['start', 'step'] as const) {
              const raw = weights[slot.id + field] ?? String(slot[field] ?? '')
              fields[field] = raw.trim() ? readNumber(raw) : null
              const value = fields[field]
              if (value !== null && !(value >= (field === 'step' ? 0.001 : 0) && value <= 9999)) {
                throw new Error(`${weekdays[i]}, ${exercise.name}: проверь вес и шаг прибавки.`)
              }
            }
            if (!Number.isInteger(slot.sets) || slot.sets < 1 || slot.sets > 30 ||
                !Number.isInteger(slot.min) || !Number.isInteger(slot.max) || slot.min < 1 || slot.max < slot.min || slot.max > 999) {
              throw new Error(`${weekdays[i]}, ${exercise.name}: укажи 1–30 подходов и корректный диапазон повторений.`)
            }
            return { ...slot, ...fields }
          }),
        })),
      }
      setBusy(true)
      setRevision(await onSave(normalized, revision))
      setProgram(normalized)
      setAddedId('')
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить программу.')
    } finally { setBusy(false) }
  }

  return <>
    <header className="page-heading"><p className="eyebrow">Расписание</p><h1>Программа</h1></header>
    <div className="week program-week" aria-label="Дни недели">
      {shortDays.map((label, i) => <button key={label} aria-pressed={index === i} className={index === i ? 'selected' : ''} onClick={() => {
        if (i === index) return
        setIndex(i)
        setExerciseId('')
        setAddedId('')
      }}>
        {label}<span>{program.days[i].slots.length || '–'}</span>
      </button>)}
    </div>
    <fieldset disabled={busy} className="editor">
      <section className="panel section">
        <label>Название тренировки<input value={day.name} maxLength={70} onChange={event => updateDay({ ...day, name: event.target.value })} /></label>
        <div className="section-title"><h2>Упражнения в программе</h2><span className="muted">{day.slots.length}</span></div>
        {day.slots.length === 0 && <p className="muted">Добавь упражнения, чтобы запланировать тренировку на этот день.</p>}
        {day.slots.map((slot, position) => {
          const exercise = program.exercises.find(x => x.id === slot.exerciseId)!
          return <div className="slot" key={slot.id}>
            <div className="section-title">
              <h3>{exercise.name}</h3>
              <div className="actions">
                <button type="button" className="icon" aria-label={`Выше: ${exercise.name}`} disabled={!position} onClick={() => move(position, -1)}><ArrowUp /></button>
                <button type="button" className="icon" aria-label={`Ниже: ${exercise.name}`} disabled={position === day.slots.length - 1} onClick={() => move(position, 1)}><ArrowDown /></button>
                <button type="button" className="icon" aria-label={`Убрать: ${exercise.name}`} onClick={() => updateDay({ ...day, slots: day.slots.filter(item => item.id !== slot.id) })}><Trash2 /></button>
              </div>
            </div>
            <div className="field-grid">
              {([['sets', 'Подходы'], ['min', 'Повторы от'], ['max', 'Повторы до']] as const).map(([field, label]) =>
                <label key={field}>{label}<input inputMode="numeric" value={slot[field] || ''} onChange={event => updateSlot(slot.id, { [field]: Number(event.target.value.replace(/\D/g, '')) })} /></label>)}
              {!exercise.bodyweight && ([['start', 'Старт, кг'], ['step', 'Шаг, кг']] as const).map(([field, label]) =>
                <label key={field}>{label}<input inputMode="decimal" placeholder="—" value={weights[slot.id + field] ?? slot[field] ?? ''} onChange={event => {
                  setWeights({ ...weights, [slot.id + field]: event.target.value })
                  setSaved(false)
                }} /></label>)}
            </div>
          </div>
        })}
      </section>
      <section className="panel section add-exercise" aria-labelledby="add-exercise-heading">
        <h2 id="add-exercise-heading">Добавить упражнение</h2>
        <div className="add-row">
          <label>Из каталога
            <select value={exerciseId} onChange={event => setExerciseId(event.target.value)}>
              <option value="">Выбери упражнение</option>
              {program.exercises.filter(x => !x.archived).map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
            </select>
          </label>
          <button className="secondary" disabled={!selectedExercise} onClick={() => {
            if (selectedExercise) addToDay(selectedExercise)
          }}><Plus /> Добавить в программу</button>
        </div>
        <details className="disclosure">
          <summary>Создать своё упражнение</summary>
          <label>Название<input value={newName} maxLength={80} onChange={event => {
            setNewName(event.target.value)
            setCreateError('')
          }} /></label>
          <label className="check"><input type="checkbox" checked={bodyweight} onChange={event => setBodyweight(event.target.checked)} /> С собственным весом</label>
          {createError && <p className="feedback error" role="alert">{createError}</p>}
          <button className="secondary" disabled={!newName.trim()} onClick={createExercise}>Создать и добавить</button>
        </details>
        <div className="add-status" role="status">
          {addedExercise && <>«{addedExercise.name}» добавлено. Сохрани программу, чтобы применить изменения.</>}
        </div>
      </section>
      <section className="panel section">
        <button className="text-button" aria-expanded={catalog} onClick={() => setCatalog(!catalog)}><Archive /> {catalog ? 'Свернуть каталог' : 'Управлять каталогом'}</button>
        {catalog && <ul className="catalog">
          {program.exercises.map(exercise => <li key={exercise.id}><span>{exercise.name}</span><button className="text-button" onClick={() => {
            update({ ...program, exercises: program.exercises.map(x => x.id === exercise.id ? { ...x, archived: !x.archived } : x) })
            if (exerciseId === exercise.id) setExerciseId('')
          }}>{exercise.archived ? 'Вернуть' : 'В архив'}</button></li>)}
        </ul>}
      </section>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {saved && <p className="feedback" role="status">Программа сохранена.</p>}
      <button className="primary" onClick={save}>{busy ? 'Сохранение…' : 'Сохранить программу'}</button>
    </fieldset>
  </>
}
