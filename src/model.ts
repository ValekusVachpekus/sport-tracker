export type Exercise = { id: string; name: string; bodyweight: boolean; archived: boolean }
export type Slot = { id: string; exerciseId: string; sets: number; min: number; max: number; start: number | null; step: number | null }
export type Day = { name: string; slots: Slot[] }
export type Program = { exercises: Exercise[]; days: Day[] }
export type SetEntry = { weight: string; reps: string; status: 'open' | 'done' | 'skipped' }
export type WorkoutExercise = { slot: Slot; name: string; bodyweight: boolean; entries: SetEntry[] }
export type Workout = { id: string; date: string; title: string; day: number; exercises: WorkoutExercise[]; bodyMassKg?: string; deleted?: true }
export type HistoryRow = { workout: Workout; revision: number }
export const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
export const shortDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function newProgram(): Program {
  const weighted = ['Жим штанги лёжа', 'Приседания со штангой', 'Становая тяга', 'Тяга верхнего блока', 'Тяга горизонтального блока', 'Жим гантелей', 'Жим ногами', 'Сгибание рук с гантелями', 'Разгибание рук на блоке', 'Румынская тяга']
  const bodyweight = ['Подтягивания', 'Отжимания', 'Отжимания на брусьях', 'Скручивания']
  return {
    days: weekdays.map(name => ({ name, slots: [] })),
    exercises: [...weighted, ...bodyweight].map((name, i) => ({
      id: `standard-${i + 1}`, name, bodyweight: i >= weighted.length, archived: false,
    })),
  }
}

export function dateKey(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(x => String(x).padStart(2, '0')).join('-')
}

export function localDate(key: string) {
  return new Date(`${key}T12:00:00`)
}

export function trainingWeeks(now: Date, count: number, offset = 0) {
  const monday = new Date(now)
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 - (offset + count - 1) * 7)
  return Array.from({ length: count }, (_, week) => shortDays.map((_, day) => {
    const date = new Date(monday)
    date.setDate(date.getDate() + week * 7 + day)
    return dateKey(date)
  }))
}

export function readNumber(raw: string) {
  const value = raw.trim().replace(',', '.')
  return /^\d+(\.\d{1,3})?$/.test(value) ? Number(value) : NaN
}

export function readBodyMass(raw?: string) {
  const value = readNumber(raw ?? '')
  return Number.isFinite(value) && value > 0 ? value : null
}

export function validEntry(set: SetEntry, bodyweight: boolean) {
  const reps = readNumber(set.reps)
  const weight = readNumber(set.weight)
  return Number.isInteger(reps) && reps >= 1 && reps <= 999 && (bodyweight || (weight >= 0 && weight <= 9999))
}

export function doneCount(workout: Workout) {
  return workout.exercises.reduce((sum, item) => sum + item.entries.filter(set => set.status === 'done' && validEntry(set, item.bodyweight)).length, 0)
}

export function completionPercent(completed: number, planned: number) {
  return planned > 0 ? Math.round(100 * completed / planned) : null
}

export function workoutCompletion(workout: Workout) {
  const completed = doneCount(workout)
  const planned = workout.exercises.reduce((sum, item) => sum + item.slot.sets, 0)
  return { completed, planned, percent: completionPercent(completed, planned) }
}

export function completionColor(percent: number | null, lightness = 67, opacity = 1) {
  if (percent === null) return 'transparent'
  const value = Math.min(100, Math.max(0, percent))
  const hue = value <= 75 ? 6 + value * 44 / 75 : 50 + (value - 75) * 53 / 25
  return `hsl(${Math.round(hue)} 37% ${lightness}% / ${opacity})`
}

export function recentForSlot(history: HistoryRow[], slot: Slot) {
  for (const { workout } of history) {
    if (workout.deleted) continue
    const item = workout.exercises.find(x => x.slot.id === slot.id && x.slot.exerciseId === slot.exerciseId)
    if (item) return item
  }
}

export function suggestedWeight(slot: Slot, previous?: WorkoutExercise) {
  if (!previous || previous.bodyweight) return null
  const increment = slot.step && slot.step > 0 ? slot.step : 2.5
  const planned = previous.entries.slice(0, slot.sets)
  const working = previous.entries.filter(set => set.status === 'done')
  const weight = readNumber(planned[0]?.weight ?? '')
  if (planned.length !== slot.sets || planned.some(set => set.status !== 'done') || !(weight > 0)) return null
  if (working.some(set => !validEntry(set, false) || readNumber(set.weight) !== weight || readNumber(set.reps) < slot.max)) return null
  const next = Math.round((weight + increment) * 1000) / 1000
  return next <= 9999 ? next : null
}

export function startWorkout(program: Program, dayIndex: number, history: HistoryRow[]): Workout {
  const day = program.days[dayIndex]
  return {
    id: crypto.randomUUID(), date: dateKey(new Date()), day: dayIndex, title: day.name,
    exercises: day.slots.map(slot => {
      const exercise = program.exercises.find(x => x.id === slot.exerciseId)!
      const previous = recentForSlot(history, slot)
      const last = previous?.entries.find(set => set.status === 'done')
      return {
        slot, name: exercise.name, bodyweight: exercise.bodyweight,
        entries: Array.from({ length: slot.sets }, (_, i) => {
          const sameSet = previous?.entries[i]
          const prior = sameSet?.status === 'done' ? sameSet : last
          return { weight: exercise.bodyweight ? '' : (prior?.weight ?? String(slot.start ?? '')), reps: prior?.reps ?? '', status: 'open' }
        }),
      }
    }),
  }
}

export type Point = { id: string; date: string; max: number; volume: number; reps: number }
function workoutsInPeriod(history: HistoryRow[], weeks: number, today: Date) {
  const start = new Date(today)
  if (weeks) start.setDate(start.getDate() - weeks * 7 + 1)
  const startKey = dateKey(start)
  return history.filter(({ workout }) => !workout.deleted && (!weeks || workout.date >= startKey)).map(({ workout }) => workout).reverse()
}

export function bodyMassPoints(history: HistoryRow[], weeks: number, today = new Date()) {
  return workoutsInPeriod(history, weeks, today).flatMap(workout => {
    const value = readBodyMass(workout.bodyMassKg)
    return value === null ? [] : [{ id: workout.id, date: workout.date, value }]
  })
}

export function progressPoints(history: HistoryRow[], exerciseId: string, weeks: number, today = new Date()): Point[] {
  return workoutsInPeriod(history, weeks, today).flatMap(workout => {
    const sets = workout.exercises.filter(x => x.slot.exerciseId === exerciseId)
      .flatMap(x => x.entries.filter(set => set.status === 'done' && validEntry(set, x.bodyweight)))
    if (!sets.length) return []
    return [{
      id: workout.id, date: workout.date,
      max: Math.max(...sets.map(set => readNumber(set.weight) || 0)),
      volume: sets.reduce((sum, set) => sum + (readNumber(set.weight) || 0) * readNumber(set.reps), 0),
      reps: sets.reduce((sum, set) => sum + readNumber(set.reps), 0),
    }]
  })
}

export function progressSummary(history: HistoryRow[], weeks: number, today = new Date()) {
  const workouts = workoutsInPeriod(history, weeks, today)
  const results = new Map<string, { first: number; last: number; count: number }>()
  let sets = 0
  let plannedSets = 0
  for (const workout of workouts) {
    const scores = new Map<string, number>()
    for (const item of workout.exercises) {
      const entries = item.entries.filter(set => set.status === 'done' && validEntry(set, item.bodyweight))
      sets += entries.length
      plannedSets += item.slot.sets
      if (!entries.length) continue
      const id = item.slot.exerciseId
      const prior = scores.get(id) ?? 0
      const score = item.bodyweight
        ? prior + entries.reduce((sum, set) => sum + readNumber(set.reps), 0)
        : Math.max(prior, ...entries.map(set => readNumber(set.weight)))
      scores.set(id, score)
    }
    for (const [id, score] of scores) {
      const result = results.get(id)
      if (result) {
        result.last = score
        result.count++
      } else {
        results.set(id, { first: score, last: score, count: 1 })
      }
    }
  }
  const comparable = [...results.values()].filter(result => result.count > 1 && result.first > 0)
  const averageChange = comparable.length
    ? comparable.reduce((sum, { first, last }) => sum + 100 * (last - first) / first, 0) / comparable.length
    : null
  return { workouts: workouts.length, sets, plannedSets, completion: completionPercent(sets, plannedSets), averageChange, comparedExercises: comparable.length }
}

export function journalExport(program: Program, history: HistoryRow[], queue: Workout[], now = new Date()) {
  const syncedIds = new Set(history.map(({ workout }) => workout.id))
  const records = [
    ...history.map(({ workout }) => ({ workout, syncPending: false })),
    ...queue.filter(workout => !syncedIds.has(workout.id)).map(workout => ({ workout, syncPending: true })),
  ].filter(({ workout }) => !workout.deleted).sort((a, b) => b.workout.date.localeCompare(a.workout.date))
  return {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    program: {
      exercises: program.exercises,
      days: program.days.map((day, index) => ({ ...day, weekday: weekdays[index] })),
    },
    workouts: records.map(({ workout, syncPending }) => ({
      id: workout.id,
      date: workout.date,
      title: workout.title,
      programWeekday: weekdays[workout.day],
      bodyMassKg: readBodyMass(workout.bodyMassKg),
      completion: workoutCompletion(workout),
      syncPending,
      exercises: workout.exercises.map(item => ({
        exerciseId: item.slot.exerciseId,
        planSlotId: item.slot.id,
        name: item.name,
        bodyweight: item.bodyweight,
        target: { sets: item.slot.sets, minReps: item.slot.min, maxReps: item.slot.max },
        sets: item.entries.map((set, index) => {
          const performed = set.status === 'done' && validEntry(set, item.bodyweight)
          return {
            number: index + 1,
            status: set.status,
            weightKg: performed && !item.bodyweight ? readNumber(set.weight) : null,
            reps: performed ? readNumber(set.reps) : null,
          }
        }),
      })),
    })),
  }
}
