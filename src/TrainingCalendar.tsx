import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { completionColor, completionPercent, dateKey, localDate, shortDays, trainingWeeks, workoutCompletion, type Program, type Workout } from './model'

const visibleWeeks = 5
const weekStartDate = new Intl.DateTimeFormat('ru', { day: '2-digit', month: '2-digit' })
const fullDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' })

export function TrainingCalendar({ now, workouts, program }: { now: Date; workouts: Workout[]; program?: Program }) {
  const [offset, setOffset] = useState(0)
  const today = dateKey(now)
  const completed = new Map<string, { completed: number; planned: number }>()
  const uniqueWorkouts = new Map(workouts.map(workout => [workout.id, workout]))
  for (const workout of uniqueWorkouts.values()) {
    if (workout.deleted) continue
    const score = workoutCompletion(workout)
    const total = completed.get(workout.date) ?? { completed: 0, planned: 0 }
    total.completed += score.completed
    total.planned += score.planned
    completed.set(workout.date, total)
  }
  const weeks = trainingWeeks(now, visibleWeeks, offset)
  const hasEarlier = [...completed.keys()].some(date => date < weeks[0][0])
  return <section className="panel section training-calendar" aria-labelledby="training-calendar-title">
    <div className="section-title">
      <h2 id="training-calendar-title">Тренировки по неделям</h2>
      <div className="actions">
        <button className="icon" aria-label="Предыдущие недели" disabled={!hasEarlier} onClick={() => setOffset(offset + visibleWeeks)}><ChevronLeft /></button>
        <button className="icon" aria-label="Следующие недели" disabled={!offset} onClick={() => setOffset(offset - visibleWeeks)}><ChevronRight /></button>
      </div>
    </div>
    <table className="attendance">
      <thead><tr><td />{shortDays.map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
      <tbody>{weeks.map(week => <tr key={week[0]}>
        <th scope="row">{weekStartDate.format(localDate(week[0]))}</th>
        {week.map((date, i) => {
          const score = completed.get(date)
          const percent = score ? completionPercent(score.completed, score.planned) : null
          const missed = !score && date < today && Boolean(program?.days[i].slots.length)
          const status = score ? `${score.completed}/${score.planned} подх.${percent === null ? '' : ` · ${percent}%`}` : missed ? 'Пропуск по программе' : 'Без тренировки'
          const label = `${fullDate.format(localDate(date))} · ${status}`
          const state = score ? ' completed' : missed ? ' missed' : ''
          return <td key={date} aria-label={label} title={label}>
            <span aria-hidden="true" className={`attendance-day${state}`} style={percent === null ? undefined : { backgroundColor: completionColor(percent, 43) }} />
          </td>
        })}
      </tr>)}</tbody>
    </table>
    <div className="attendance-legend">
      <span><i className="attendance-scale" /> Выполнение</span>
      <span><i className="attendance-day missed" /> Пропуск</span>
    </div>
  </section>
}
