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
  // Keep input strings until save so intermediate decimal values stay editable.
  const [weights, setWeights] = useState<Record<string, string>>({})
  const day = program.days[index]

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
  function addExercise() {
    const name = newName.trim()
    if (!name) return
    if (program.exercises.some(exercise => exercise.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) {
      setError('Упражнение с таким названием уже есть в каталоге.')
      return
    }
    const exercise: Exercise = { id: crypto.randomUUID(), name, bodyweight, archived: false }
    update({
      exercises: [...program.exercises, exercise],
      days: program.days.map((item, i) => i === index ? { ...item, slots: [...item.slots, newSlot(exercise.id)] } : item),
    })
    setNewName('')
    setBodyweight(false)
    setError('')
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
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить программу.')
    } finally { setBusy(false) }
  }

  return <>
    <header className="page-heading"><p className="eyebrow">Расписание</p><h1>Программа</h1></header>
    <div className="week program-week" aria-label="Дни недели">
      {shortDays.map((label, i) => <button key={label} aria-pressed={index === i} className={index === i ? 'selected' : ''} onClick={() => setIndex(i)}>
        {label}<span>{program.days[i].slots.length || '–'}</span>
      </button>)}
    </div>
    <fieldset disabled={busy} className="editor">
      <section className="panel section">
        <label>Название тренировки<input value={day.name} maxLength={70} onChange={event => updateDay({ ...day, name: event.target.value })} /></label>
        <div className="section-title"><h2>Упражнения</h2><span className="muted">{day.slots.length}</span></div>
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
        <div className="add-row">
          <select aria-label="Упражнение из каталога" value={exerciseId} onChange={event => setExerciseId(event.target.value)}>
            <option value="">Выбрать из каталога</option>
            {program.exercises.filter(x => !x.archived).map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
          </select>
          <button className="secondary" disabled={!exerciseId} onClick={() => { updateDay({ ...day, slots: [...day.slots, newSlot(exerciseId)] }); setExerciseId('') }}><Plus /> Добавить</button>
        </div>
        <details className="disclosure">
          <summary>Создать своё упражнение</summary>
          <label>Название<input value={newName} maxLength={80} onChange={event => setNewName(event.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={bodyweight} onChange={event => setBodyweight(event.target.checked)} /> С собственным весом</label>
          <button className="secondary" disabled={!newName.trim()} onClick={addExercise}>Создать и добавить</button>
        </details>
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
