export type Exercise = { id: string; name: string; bodyweight: boolean; archived: boolean }
export type Slot = { id: string; exerciseId: string; sets: number; min: number; max: number; start: number | null; step: number | null }
export type Day = { name: string; slots: Slot[] }
export type Program = { exercises: Exercise[]; days: Day[] }
export type SetEntry = { weight: string; reps: string; status: 'open' | 'done' | 'skipped' }
export type WorkoutExercise = { slot: Slot; name: string; bodyweight: boolean; entries: SetEntry[] }
export type Workout = { id: string; date: string; title: string; day: number; exercises: WorkoutExercise[] }
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

export function readNumber(raw: string) {
  const value = raw.trim().replace(',', '.')
  return /^\d+(\.\d{1,3})?$/.test(value) ? Number(value) : NaN
}

export function validEntry(set: SetEntry, bodyweight: boolean) {
  const reps = readNumber(set.reps)
  const weight = readNumber(set.weight)
  return Number.isInteger(reps) && reps >= 1 && reps <= 999 && (bodyweight || (weight >= 0 && weight <= 9999))
}

export function doneCount(workout: Workout) {
  return workout.exercises.reduce((sum, item) => sum + item.entries.filter(set => set.status === 'done' && validEntry(set, item.bodyweight)).length, 0)
}

export function recentForSlot(history: HistoryRow[], slot: Slot) {
  for (const { workout } of history) {
    const item = workout.exercises.find(x => x.slot.id === slot.id && x.slot.exerciseId === slot.exerciseId)
    if (item) return item
  }
}

export function suggestedWeight(slot: Slot, previous?: WorkoutExercise) {
  if (!slot.step || !previous || previous.bodyweight) return null
  const planned = previous.entries.slice(0, slot.sets)
  const working = previous.entries.filter(set => set.status === 'done')
  const weight = readNumber(planned[0]?.weight ?? '')
  if (planned.length !== slot.sets || planned.some(set => set.status !== 'done') || !(weight > 0)) return null
  if (working.some(set => !validEntry(set, false) || readNumber(set.weight) !== weight || readNumber(set.reps) < slot.max)) return null
  const next = Math.round((weight + slot.step) * 1000) / 1000
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
export function progressPoints(history: HistoryRow[], exerciseId: string, weeks: number, today = new Date()): Point[] {
  const start = new Date(today)
  if (weeks) start.setDate(start.getDate() - weeks * 7 + 1)
  const startKey = dateKey(start)
  return history.filter(({ workout }) => !weeks || workout.date >= startKey).flatMap(({ workout }) => {
    const sets = workout.exercises.filter(x => x.slot.exerciseId === exerciseId)
      .flatMap(x => x.entries.filter(set => set.status === 'done' && validEntry(set, x.bodyweight)))
    if (!sets.length) return []
    return [{
      id: workout.id, date: workout.date,
      max: Math.max(...sets.map(set => readNumber(set.weight) || 0)),
      volume: sets.reduce((sum, set) => sum + (readNumber(set.weight) || 0) * readNumber(set.reps), 0),
      reps: sets.reduce((sum, set) => sum + readNumber(set.reps), 0),
    }]
  }).reverse()
}
