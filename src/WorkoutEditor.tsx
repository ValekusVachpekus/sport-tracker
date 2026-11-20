import { Check, Minus, Plus, RotateCcw } from 'lucide-react'
import { doneCount, suggestedWeight, validEntry, type SetEntry, type Workout, type WorkoutExercise } from './model'

export function WorkoutEditor({ workout, previous, change, complete, cancel, busy, editing = false }: {
  workout: Workout
  previous: Record<string, WorkoutExercise>
  change: (update: (workout: Workout) => Workout) => void
  complete: () => void
  cancel: () => void
  busy: boolean
  editing?: boolean
}) {
  function update(itemId: string, apply: (entries: SetEntry[]) => SetEntry[]) {
    change(current => ({
      ...current, exercises: current.exercises.map(item => item.slot.id === itemId ? { ...item, entries: apply(item.entries) } : item),
    }))
  }
  function patch(itemId: string, index: number, fields: Partial<SetEntry>) {
    update(itemId, entries => entries.map((set, i) => i === index ? { ...set, ...fields } : set))
  }
  const completed = doneCount(workout)
  return <>
    <header className="page-heading"><p className="eyebrow">{editing ? 'Редактирование истории' : 'Тренировка'}</p><h1>{workout.title}</h1><p className="muted">Подходов выполнено: {completed}</p></header>
    <fieldset className="editor" disabled={busy}>
      {workout.exercises.map(item => {
        const prior = previous[item.slot.id]
        const nextWeight = suggestedWeight(item.slot, prior)
        const label = (i: number, field: string) => `${item.name}, подход ${i + 1}: ${field}`
        return <section className="panel section workout-block" key={item.slot.id}>
          <h2>{item.name}</h2>
          <p className="muted target">{item.slot.sets} × {item.slot.min === item.slot.max ? item.slot.min : `${item.slot.min}–${item.slot.max}`} повторений</p>
          {nextWeight !== null && item.entries.some(set => set.status === 'open' && Number(set.weight.replace(',', '.')) !== nextWeight) && <div className="suggestion">
            <span>Следующий вес · <strong>{nextWeight.toLocaleString('ru')} кг</strong></span>
            <button className="text-button" onClick={() => update(item.slot.id, sets => sets.map(set => set.status === 'open' ? { ...set, weight: String(nextWeight) } : set))}>Применить</button>
          </div>}
          <div className="set-grid set-labels" aria-hidden="true"><span>№</span><span>Прошлый раз</span><span>Кг</span><span>Повторы</span><span/><span/></div>
          {item.entries.map((set, i) => {
            const old = prior?.entries[i]
            return <div className={`set-grid set-line ${set.status}`} key={i}>
              <span className="set-number">{i + 1}</span>
              <span className="set-prior">{old?.status === 'done' ? item.bodyweight ? `${old.reps} повт.` : `${old.weight} × ${old.reps}` : '—'}</span>
              {item.bodyweight ? <span className="set-prior">—</span> : <input aria-label={label(i, 'кг')} inputMode="decimal" maxLength={12} placeholder="—" value={set.weight} disabled={set.status === 'skipped'} onChange={event => {
                const weight = event.target.value
                patch(item.slot.id, i, { weight, status: set.status === 'done' && validEntry({ ...set, weight }, false) ? 'done' : 'open' })
              }} />}
              <input aria-label={label(i, 'повторы')} inputMode="numeric" maxLength={3} placeholder="—" value={set.reps} disabled={set.status === 'skipped'} onChange={event => {
                const reps = event.target.value.replace(/\D/g, '')
                patch(item.slot.id, i, { reps, status: set.status === 'done' && validEntry({ ...set, reps }, item.bodyweight) ? 'done' : 'open' })
              }} />
              <button className="icon set-done" aria-label={label(i, 'отметить подход')} aria-pressed={set.status === 'done'} disabled={set.status === 'skipped' || !validEntry(set, item.bodyweight)} onClick={() => patch(item.slot.id, i, { status: set.status === 'done' ? 'open' : 'done' })}><Check /></button>
              <button className="icon set-skip" aria-label={label(i, set.status === 'skipped' ? 'вернуть подход' : 'пропустить подход')} onClick={() => patch(item.slot.id, i, { status: set.status === 'skipped' ? 'open' : 'skipped' })}>{set.status === 'skipped' ? <RotateCcw /> : <Minus />}</button>
            </div>
          })}
          <button className="text-button add-set" onClick={() => update(item.slot.id, sets => [...sets, { weight: sets.at(-1)?.weight ?? '', reps: '', status: 'open' }])}><Plus /> Подход</button>
        </section>
      })}
      <div className="editor-footer">
        <button className="primary" disabled={!completed} onClick={complete}>{editing ? 'Сохранить изменения' : 'Завершить тренировку'}</button>
        <button className="text-button muted" onClick={cancel}>{editing ? 'Отмена' : 'Отменить тренировку'}</button>
      </div>
    </fieldset>
  </>
}
