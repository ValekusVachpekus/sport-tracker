import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bodyMassPoints, completionColor, copyWorkout, doneCount, journalExport, newProgram, progressPoints, progressSummary, readBodyMass, readNumber, recentForSlot, startWorkout, suggestedWeight, trainingWeeks, upgradeProgram, workoutCompletion, type HistoryRow, type Slot, type WorkoutExercise } from '../src/model.ts'

const slot: Slot = { id: 'bench', exerciseId: 'standard-1', sets: 3, min: 8, max: 10, start: 60, step: 2.5 }
const session = (weight: string, reps = '10'): WorkoutExercise => ({
  slot, name: 'Жим', bodyweight: false, entries: Array.from({ length: 3 }, () => ({ weight, reps, status: 'done' })),
})
const row = (id: string, date: string, item: WorkoutExercise): HistoryRow => ({
  revision: 0, workout: { id, date, title: 'Верх', day: 0, exercises: [item] },
})

test('предлагает прибавку после одной тренировки и принимает запятую в весе', () => {
  assert.equal(suggestedWeight(slot, session('60,5')), 63)
  assert.equal(suggestedWeight(slot, session('60', '9')), null)
  assert.equal(suggestedWeight({ ...slot, step: null }, session('60')), 62.5)
  assert.equal(suggestedWeight({ ...slot, step: 5 }, session('60')), 65)
  assert.ok(Number.isNaN(readNumber('60,5 кг')))
})

test('пропущенный подход, смешанные веса и вес тела исключают прибавку', () => {
  const item = session('60')
  item.entries[1].status = 'skipped'
  assert.equal(suggestedWeight(slot, item), null)
  item.entries[1] = { weight: '62', reps: '10', status: 'done' }
  assert.equal(suggestedWeight(slot, item), null)
  assert.equal(suggestedWeight(slot, { ...session('60'), bodyweight: true }), null)
})

test('новая тренировка использует последние значения и не засчитывает их автоматически', () => {
  const program = newProgram()
  program.days[0].slots.push(slot)
  const history = [row('last', '2026-11-20', session('62,5')), row('older', '2026-11-18', session('60'))]
  const workout = startWorkout(program, 0, history)
  assert.equal(recentForSlot(history, slot)?.entries[0].weight, '62,5')
  assert.equal(workout.exercises[0].entries[0].weight, '62,5')
  assert.equal(doneCount(workout), 0)
  program.days[0].slots[0] = { ...slot, max: 15 }
  assert.equal(workout.exercises[0].slot.max, 10)
})

test('прогресс учитывает только отмеченные подходы за выбранный период', () => {
  const current = session('62,5')
  current.entries[1].status = 'skipped'
  const points = progressPoints([
    row('new', '2026-11-20', current),
    row('old', '2026-11-13', session('60')),
    row('outside', '2026-10-01', session('50')),
  ], slot.exerciseId, 4, new Date(2026, 10, 20))
  assert.deepEqual(points.map(({ id, max, volume, reps }) => [id, max, volume, reps]), [
    ['old', 60, 1800, 30], ['new', 62.5, 1250, 20],
  ])
})

test('масса тела необязательна, принимает запятую и учитывается за выбранный период', () => {
  assert.equal(readBodyMass(' 78,45 '), 78.45)
  assert.equal(readBodyMass('0'), null)
  assert.equal(readBodyMass('-2'), null)
  assert.equal(readBodyMass(''), null)
  assert.equal(readBodyMass(), null)
  const rows = [
    row('new', '2026-11-20', session('60')),
    row('no-mass', '2026-11-18', session('60')),
    row('old', '2026-11-13', session('60')),
    row('outside', '2026-10-01', session('50')),
  ]
  rows[0].workout.bodyMassKg = '78,45'
  rows[2].workout.bodyMassKg = '79.1'
  rows[3].workout.bodyMassKg = '80'
  assert.deepEqual(bodyMassPoints(rows, 4, new Date(2026, 10, 20)), [
    { id: 'old', date: '2026-11-13', value: 79.1 },
    { id: 'new', date: '2026-11-20', value: 78.45 },
  ])
})

test('сводка усредняет изменения по сопоставимым упражнениям и считает тренировки и подходы', () => {
  const bodyweightSlot = { ...slot, exerciseId: 'pull-ups' }
  const first = row('first', '2026-11-13', session('50'))
  const last = row('last', '2026-11-20', session('60'))
  first.workout.exercises.push({ ...session('', '10'), slot: bodyweightSlot, bodyweight: true })
  last.workout.exercises.push({ ...session('', '9'), slot: bodyweightSlot, bodyweight: true })
  last.workout.exercises.push({ ...session('20'), slot: { ...slot, exerciseId: 'new' } })
  assert.deepEqual(progressSummary([last, first], 4, new Date(2026, 10, 20)), {
    workouts: 2, sets: 15, plannedSets: 15, completion: 100, averageChange: 5, comparedExercises: 2,
  })
  assert.equal(progressSummary([last], 0).averageChange, null)
})

test('экспорт включает программу и завершённые тренировки с числовыми замерами без дублей', () => {
  const saved = row('saved', '2026-11-13', session('62,5'))
  saved.workout.bodyMassKg = '78,1'
  saved.workout.exercises[0].entries[1].status = 'skipped'
  const pending = row('pending', '2026-11-20', session('65')).workout
  const program = newProgram()
  const data = journalExport(program, [saved], [pending, saved.workout], new Date('2026-11-20T09:00:00Z'))
  assert.deepEqual(data.workouts.map(workout => [workout.id, workout.syncPending]), [['pending', true], ['saved', false]])
  assert.equal(data.workouts[1].bodyMassKg, 78.1)
  assert.deepEqual(data.workouts[1].completion, { completed: 2, planned: 3, percent: 67 })
  assert.equal(data.workouts[1].exercises[0].sets[0].weightKg, 62.5)
  assert.equal(data.workouts[1].exercises[0].sets[1].reps, null)
  assert.equal(data.program.days[0].weekday, 'Понедельник')
})

test('удалённая тренировка исключается из подсказок, прогресса и экспорта', () => {
  const saved = row('removed', '2026-11-20', session('62,5'))
  saved.workout.deleted = true
  const original = { ...saved.workout, deleted: undefined }
  assert.equal(recentForSlot([saved], slot), undefined)
  assert.equal(progressSummary([saved], 0).workouts, 0)
  assert.deepEqual(journalExport(newProgram(), [saved], [original]).workouts, [])
})

test('календарь строит недели с понедельника, в том числе на границе года', () => {
  const now = new Date(2027, 0, 1, 12)
  const weeks = trainingWeeks(now, 2)
  assert.equal(weeks[0][0], '2026-12-21')
  assert.equal(weeks[1][0], '2026-12-28')
  assert.equal(weeks[1][6], '2027-01-03')
  assert.equal(trainingWeeks(now, 2, 2)[1][6], '2026-12-20')
})

test('процент выполнения учитывает пропущенные и дополнительные подходы', () => {
  const record = row('score', '2026-11-20', session('60'))
  const sets = record.workout.exercises[0].entries
  sets[1].status = 'skipped'
  assert.deepEqual(workoutCompletion(record.workout), { completed: 2, planned: 3, percent: 67 })
  sets[1].status = 'done'
  sets.push({ ...sets[0] }, { ...sets[0], status: 'open' })
  assert.deepEqual(workoutCompletion(record.workout), { completed: 4, planned: 3, percent: 133 })
  assert.equal(progressSummary([record], 0).completion, 133)
  assert.equal(completionColor(133), completionColor(100))
  assert.notEqual(completionColor(75), completionColor(100))
  assert.notEqual(completionColor(0), completionColor(75))
})

test('старое расписание получает шаблоны и сохраняет связи с историей', () => {
  const { days, exercises } = newProgram()
  days[0] = { name: 'Понедельник', slots: [{ ...slot }] }
  days[1] = { name: 'Ноги', slots: [{ ...slot, id: 'legs' }] }
  days[2].name = 'Среда'
  const upgraded = upgradeProgram({ days, exercises })
  assert.deepEqual(upgraded.templates.map(item => item.name), ['Тренировка 1', 'Ноги'])
  assert.equal(upgraded.days[0].slots[0].id, slot.id)
  assert.notEqual(upgraded.templates[0].slots[0].id, slot.id)
  assert.equal(upgraded.days[2].name, '')
  assert.deepEqual(upgradeProgram(upgraded), upgraded)
})

test('два дня получают независимые копии одного шаблона', () => {
  const program = newProgram()
  const template = { id: 'upper', name: 'Верх тела', slots: [{ ...slot, name: 'Жим на наклонной' }] }
  program.days[0] = copyWorkout(template)
  program.days[3] = copyWorkout(template)
  program.days[3].name = 'Верх, тяжёлая'
  program.days[3].slots[0].name = 'Жим'
  program.days[3].slots[0].start = 72
  assert.equal(program.days[0].name, 'Верх тела')
  assert.equal(program.days[0].slots[0].start, 60)
  assert.equal(template.slots[0].name, 'Жим на наклонной')
  assert.notEqual(program.days[0].slots[0].id, program.days[3].slots[0].id)
  assert.equal(startWorkout(program, 0, []).exercises[0].name, 'Жим на наклонной')
})
