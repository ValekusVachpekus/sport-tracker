import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, Download, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import { downloadJson } from './download'
import { copyWorkout, dateKey, programExport, readNumber, shortDays, weekdays, type Day, type Exercise, type Program, type Slot } from './model'

const emptyWorkout: Day = { name: '', slots: [] }

export function ProgramEditor({ initial, today, onSave }: { initial: { program: Program; revision: number }; today: number; onSave: (program: Program, revision: number) => Promise<number> }) {
  const [program, setProgram] = useState(initial.program)
  const [revision, setRevision] = useState(initial.revision)
  const [index, setIndex] = useState(today)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [exerciseId, setExerciseId] = useState('')
  const [newName, setNewName] = useState('')
  const [bodyweight, setBodyweight] = useState(false)
  const [creating, setCreating] = useState(false)
  const [catalog, setCatalog] = useState(false)
  const [rename, setRename] = useState<{ slotId: string; name: string }>()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [createError, setCreateError] = useState('')
  const [renameError, setRenameError] = useState('')
  // Keep input strings until save so intermediate decimal values stay editable.
  const [startingWeights, setStartingWeights] = useState<Record<string, string>>({})
  const template = program.templates.find(item => item.id === templateId) ?? program.templates[0]
  const day = showTemplates ? template ?? emptyWorkout : program.days[index]
  const selectedExercise = program.exercises.find(exercise => exercise.id === exerciseId && !exercise.archived)

  function nameExists(name: string) {
    const normalized = name.toLocaleLowerCase('ru')
    return program.exercises.some(item => item.name.toLocaleLowerCase('ru') === normalized)
  }

  function withRenamedExercise() {
    if (!rename) return program
    const name = rename.name.trim()
    if (!name) {
      setRenameError('Введи название.')
      return null
    }
    return withWorkout({ ...day, slots: day.slots.map(slot => slot.id === rename.slotId ? { ...slot, name } : slot) })
  }

  function applyRename() {
    const next = withRenamedExercise()
    if (!next) return
    update(next)
    setRename(undefined)
  }

  function update(next: Program) {
    setProgram(next)
    setSaved(false)
  }
  function withWorkout(next: Day): Program {
    return showTemplates
      ? { ...program, templates: program.templates.map(item => item.id === template?.id ? { ...next, id: item.id } : item) }
      : { ...program, days: program.days.map((item, i) => i === index ? next : item) }
  }
  function updateDay(next: Day) {
    update(withWorkout(next))
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
      ...withWorkout({ ...day, slots: [...day.slots, slot] }),
      exercises,
    })
    setExerciseId('')
  }
  function createExercise() {
    const name = newName.trim()
    if (!name) return
    if (nameExists(name)) {
      setCreateError('Упражнение с таким названием уже есть в каталоге.')
      return
    }
    const exercise: Exercise = { id: crypto.randomUUID(), name, bodyweight, archived: false }
    addToDay(exercise, [...program.exercises, exercise])
    setNewName('')
    setBodyweight(false)
    setCreateError('')
    setCreating(false)
  }
  function move(position: number, distance: number) {
    const slots = [...day.slots]
    const [slot] = slots.splice(position, 1)
    slots.splice(position + distance, 0, slot)
    updateDay({ ...day, slots })
  }

  function normalizeWorkout<T extends Day>(item: T, context: string): T {
    return {
      ...item,
      name: item.name.trim() || (item.slots.length ? 'Тренировка' : ''),
      slots: item.slots.map(slot => {
        const name = slot.name ?? program.exercises.find(x => x.id === slot.exerciseId)?.name
        const raw = startingWeights[slot.id] ?? String(slot.start ?? '')
        const start = raw.trim() ? readNumber(raw) : null
        if (start !== null && !(start >= 0 && start <= 9999)) {
          throw new Error(`${context}, ${name}: проверь стартовый вес.`)
        }
        if (!Number.isInteger(slot.sets) || slot.sets < 1 || slot.sets > 30 ||
            !Number.isInteger(slot.min) || !Number.isInteger(slot.max) || slot.min < 1 || slot.max < slot.min || slot.max > 999) {
          throw new Error(`${context}, ${name}: укажи 1–30 подходов и корректный диапазон повторений.`)
        }
        return { ...slot, start }
      }),
    }
  }

  function normalizeProgram(next: Program): Program {
    return {
      ...next,
      days: next.days.map((item, i) => normalizeWorkout(item, weekdays[i])),
      templates: next.templates.map(item => normalizeWorkout(item, item.name || 'Шаблон')),
    }
  }

  function selectWorkout() {
    setExerciseId('')
    setRename(undefined)
    setCreating(false)
    setCatalog(false)
    setError('')
  }

  function createTemplate(workout: Day) {
    const next = { ...workout, id: crypto.randomUUID() }
    update({ ...program, templates: [...program.templates, next] })
    setTemplateId(next.id)
  }

  function saveDayAsTemplate() {
    const next = withRenamedExercise()
    if (!next) return
    try {
      const snapshot = copyWorkout(normalizeWorkout(next.days[index], weekdays[index]))
      createTemplate(snapshot)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось скопировать тренировку.')
    }
  }

  function assignTemplate() {
    if (!template?.slots.length) return
    if (day.slots.length && !window.confirm(`Заменить «${day.name || 'Тренировка'}» на «${template.name || 'Тренировка'}»?`)) return
    try {
      updateDay(copyWorkout(normalizeWorkout(template, template.name || 'Шаблон')))
      selectWorkout()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось назначить тренировку.')
    }
  }

  function downloadProgram() {
    setExportError('')
    const next = withRenamedExercise()
    if (!next) return
    try {
      const now = new Date()
      downloadJson(`sport-tracker-program-${dateKey(now)}.json`, programExport(normalizeProgram(next), now))
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Не удалось скачать программу.')
    }
  }

  async function save() {
    setError('')
    setExportError('')
    setSaved(false)
    const next = withRenamedExercise()
    if (!next) return
    try {
      const normalized = normalizeProgram(next)
      setBusy(true)
      setRevision(await onSave(normalized, revision))
      setProgram(normalized)
      setRename(undefined)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить программу.')
    } finally { setBusy(false) }
  }

  return <>
    <header className="page-heading section-title">
      <h1>Программа</h1>
      <button className="icon program-export" type="button" aria-label="Экспорт программы в JSON" title="Экспорт программы в JSON"
        disabled={busy} onClick={downloadProgram}><Download /></button>
    </header>
    {exportError && <p className="feedback error" role="alert">{exportError}</p>}
    <fieldset disabled={busy} className="editor">
      <div className="segments" aria-label="Редактор программы">
        <button aria-pressed={!showTemplates} onClick={() => {
          if (showTemplates) { setShowTemplates(false); selectWorkout() }
        }}>Расписание</button>
        <button aria-pressed={showTemplates} onClick={() => {
          if (!showTemplates) { setShowTemplates(true); selectWorkout() }
        }}>Шаблоны</button>
      </div>
      {!showTemplates && <div className="week program-week" aria-label="Дни недели">
        {shortDays.map((label, i) => <button key={label} aria-pressed={index === i} className={index === i ? 'selected' : ''} onClick={() => {
          if (i === index) return
          setIndex(i)
          selectWorkout()
        }}>
          {label}<span>{program.days[i].slots.length || '–'}</span>
        </button>)}
      </div>}
      {(showTemplates || template) && <div className="program-toolbar">
        {template && <select aria-label="Шаблон тренировки" value={template.id} onChange={event => {
          setTemplateId(event.target.value)
          if (showTemplates) selectWorkout()
        }}>
          {program.templates.map(item => <option key={item.id} value={item.id}>{item.name || 'Без названия'}</option>)}
        </select>}
        {showTemplates ? <>
          <button className="secondary program-action" onClick={() => {
            createTemplate({ name: 'Новый шаблон', slots: [] })
            selectWorkout()
          }}><Plus /> Новый шаблон</button>
          {template && <button className="icon" aria-label="Удалить шаблон" title="Удалить шаблон" onClick={() => {
            if (!window.confirm(`Удалить шаблон «${template.name || 'Без названия'}»?`)) return
            update({ ...program, templates: program.templates.filter(item => item.id !== template.id) })
            setTemplateId('')
            selectWorkout()
          }}><Trash2 /></button>}
        </> : <button className="secondary program-action" disabled={!template?.slots.length} onClick={assignTemplate}>На этот день</button>}
      </div>}
      {(!showTemplates || template) && <>
      <section className="panel section">
        <div className="program-toolbar workout-name-row">
          <label>{showTemplates ? 'Название шаблона' : 'Название тренировки'}
            <input value={day.name} placeholder="Например, Верх тела" maxLength={70} onChange={event => updateDay({ ...day, name: event.target.value })} />
          </label>
          {!showTemplates && day.slots.length > 0 && <>
            <button className="text-button program-action" onClick={saveDayAsTemplate}><Copy /> В шаблоны</button>
            <button className="icon" aria-label="Освободить день" title="Освободить день" onClick={() => {
              if (!window.confirm(`Убрать тренировку из расписания на этот день?`)) return
              updateDay(emptyWorkout)
              selectWorkout()
            }}><X /></button>
          </>}
        </div>
        <div className="section-title"><h2>Упражнения</h2><span className="muted">{day.slots.length}</span></div>
        {day.slots.map((slot, position) => {
          const exercise = program.exercises.find(x => x.id === slot.exerciseId)!
          const exerciseName = slot.name ?? exercise.name
          return <div className="slot" key={slot.id}>
            <div className="section-title">
              <h3><button type="button" className="exercise-name" aria-label={`Переименовать: ${exerciseName}`} onClick={() => {
                setRename({ slotId: slot.id, name: exerciseName })
                setRenameError('')
              }}><span>{exerciseName}</span><Pencil /></button></h3>
              <div className="actions">
                <button type="button" className="icon" aria-label={`Выше: ${exerciseName}`} disabled={!position} onClick={() => move(position, -1)}><ArrowUp /></button>
                <button type="button" className="icon" aria-label={`Ниже: ${exerciseName}`} disabled={position === day.slots.length - 1} onClick={() => move(position, 1)}><ArrowDown /></button>
                <button type="button" className="icon" aria-label={`Убрать: ${exerciseName}`} onClick={() => {
                  if (rename?.slotId === slot.id) setRename(undefined)
                  updateDay({ ...day, slots: day.slots.filter(item => item.id !== slot.id) })
                }}><Trash2 /></button>
              </div>
            </div>
            {rename?.slotId === slot.id && <form className="rename-form" onSubmit={event => { event.preventDefault(); applyRename() }}>
              <input autoFocus aria-label="Новое название упражнения" aria-invalid={Boolean(renameError)} aria-describedby={renameError ? 'rename-error' : undefined}
                maxLength={80} value={rename.name} onChange={event => {
                  setRename({ ...rename, name: event.target.value })
                  setRenameError('')
                  setSaved(false)
                }} />
              <button type="submit" className="icon secondary" aria-label="Применить название"><Check /></button>
              <button type="button" className="icon" aria-label="Отменить переименование" onClick={() => setRename(undefined)}><X /></button>
              {renameError && <p id="rename-error" className="rename-error" role="alert">{renameError}</p>}
            </form>}
            <div className={`field-grid${exercise.bodyweight ? '' : ' field-grid-weighted'}`}>
              {([['sets', 'Подходы', 'Подходы'], ['min', 'Повт. от', 'Повторы от'], ['max', 'Повт. до', 'Повторы до']] as const).map(([field, label, accessibleLabel]) =>
                <label key={field}>{label}<input aria-label={accessibleLabel} inputMode="numeric" value={slot[field] || ''} onChange={event => updateSlot(slot.id, { [field]: Number(event.target.value.replace(/\D/g, '')) })} /></label>)}
              {!exercise.bodyweight &&
                <label>Старт, кг<input inputMode="decimal" placeholder="—" value={startingWeights[slot.id] ?? slot.start ?? ''} onChange={event => {
                  setStartingWeights({ ...startingWeights, [slot.id]: event.target.value })
                  setSaved(false)
                }} /></label>}
            </div>
          </div>
        })}
      </section>
      <section className="panel add-exercise" aria-label="Добавить упражнение">
        <div className="add-row">
          <select aria-label="Упражнение из каталога" value={exerciseId} onChange={event => setExerciseId(event.target.value)}>
            <option value="">Из каталога</option>
            {program.exercises.filter(x => !x.archived).map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
          </select>
          <button className="secondary add-choice" aria-label="Добавить в программу" title="Добавить в программу" disabled={!selectedExercise} onClick={() => {
            if (selectedExercise) addToDay(selectedExercise)
          }}><Plus /><span>Добавить</span></button>
          <button className="text-button create-toggle" aria-label="Создать своё упражнение" aria-expanded={creating} onClick={() => {
            setCreating(!creating)
            setCatalog(false)
          }}>Своё</button>
          <button className="icon catalog-toggle" aria-label="Каталог упражнений" title="Каталог упражнений" aria-expanded={catalog} onClick={() => {
            setCatalog(!catalog)
            setCreating(false)
          }}><Settings2 /></button>
        </div>
        {creating && <form className="create-exercise" onSubmit={event => { event.preventDefault(); createExercise() }}>
          <input aria-label="Название нового упражнения" placeholder="Название упражнения" autoFocus value={newName} maxLength={80} onChange={event => {
            setNewName(event.target.value)
            setCreateError('')
          }} />
          <label className="check"><input type="checkbox" checked={bodyweight} onChange={event => setBodyweight(event.target.checked)} /> С собственным весом</label>
          {createError && <p className="rename-error" role="alert">{createError}</p>}
          <button type="submit" className="secondary" disabled={!newName.trim()}>Создать и добавить</button>
        </form>}
        {catalog && <ul className="catalog">
          {program.exercises.map(exercise => <li key={exercise.id}><span>{exercise.name}</span><button className="text-button" onClick={() => {
            update({ ...program, exercises: program.exercises.map(x => x.id === exercise.id ? { ...x, archived: !x.archived } : x) })
            if (exerciseId === exercise.id) setExerciseId('')
          }}>{exercise.archived ? 'Вернуть' : 'В архив'}</button></li>)}
        </ul>}
      </section>
      </>}
      {error && <p className="feedback error" role="alert">{error}</p>}
      {saved && <p className="feedback" role="status">Программа сохранена.</p>}
      <button className="primary" onClick={save}>{busy ? 'Сохранение…' : 'Сохранить программу'}</button>
    </fieldset>
  </>
}
