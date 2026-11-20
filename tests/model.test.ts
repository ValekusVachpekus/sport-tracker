import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doneCount, newProgram, progressPoints, readNumber, recentForSlot, startWorkout, suggestedWeight, type HistoryRow, type Slot, type WorkoutExercise } from '../src/model.ts'

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
  assert.equal(suggestedWeight({ ...slot, step: null }, session('60')), null)
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
