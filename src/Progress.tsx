import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { bodyMassPoints, completionColor, dateKey, journalExport, localDate, progressPoints, progressSummary, workoutCompletion, type HistoryRow, type Program, type Workout } from './model'

const format = new Intl.NumberFormat('ru', { maximumFractionDigits: 2 })
const massFormat = new Intl.NumberFormat('ru', { maximumFractionDigits: 3 })
const date = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' })

type ChartPoint = ReturnType<typeof bodyMassPoints>[number] & { completion: number | null }

function Chart({ points, focusRange }: { points: ChartPoint[]; focusRange: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    function draw() {
      if (!canvas || !context) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const ratio = window.devicePixelRatio || 1
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.scale(ratio, ratio)
      const values = points.map(point => point.value)
      const min = focusRange ? Math.max(0, Math.floor(Math.min(...values) - 1)) : 0
      const max = focusRange ? Math.ceil(Math.max(...values) + 1) : Math.max(1, ...values)
      const left = 52, bottom = height - 25, top = 16, right = width - 16
      context.font = '12px system-ui'
      for (let i = 0; i <= 4; i++) {
        const y = bottom - (bottom - top) * i / 4
        context.fillStyle = '#aeb3ad'
        context.fillText(format.format(min + (max - min) * i / 4), 0, y + 4, 46)
        context.strokeStyle = '#343936'
        context.beginPath()
        context.moveTo(left, y)
        context.lineTo(right, y)
        context.stroke()
      }
      const coords = points.map((point, i) => [
        left + (right - left) * i / (points.length - 1),
        bottom - (bottom - top) * (point.value - min) / (max - min),
      ])
      context.strokeStyle = '#8c9b86'
      context.lineWidth = 2
      context.beginPath()
      coords.forEach(([x,y], i) => i ? context.lineTo(x,y) : context.moveTo(x,y))
      context.stroke()
      coords.forEach(([x, y], i) => {
        const percent = points[i].completion
        context.fillStyle = percent === null ? '#aeb3ad' : completionColor(percent)
        context.beginPath()
        context.arc(x,y,4,0,Math.PI * 2)
        context.fill()
      })
      context.fillStyle = '#aeb3ad'
      context.fillText(date.format(localDate(points[0].date)), left, height - 4)
      const text = date.format(localDate(points.at(-1)!.date))
      context.fillText(text, right - context.measureText(text).width, height - 4)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    draw()
    return () => observer.disconnect()
  }, [points, focusRange])
  return <canvas ref={ref} aria-hidden="true" />
}

export function Progress({ history, program, queue }: { history: HistoryRow[]; program: Program; queue: Workout[] }) {
  const logged = new Set(history.flatMap(({ workout }) => workout.exercises.filter(item => item.entries.some(set => set.status === 'done')).map(item => item.slot.exerciseId)))
  const options = program.exercises.filter(x => logged.has(x.id))
  const [showMass, setShowMass] = useState(false)
  const [selected, select] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [weightedMetric, setMetric] = useState<'max' | 'volume'>('max')
  const summary = useMemo(() => progressSummary(history, weeks), [history, weeks])
  const completion = useMemo(() => new Map(history.map(({ workout }) => [workout.id, workoutCompletion(workout).percent])), [history])
  const exercise = options.find(x => x.id === selected) ?? options[0]
  const metric = exercise?.bodyweight ? 'reps' : weightedMetric
  const values = showMass ? bodyMassPoints(history, weeks) : exercise
    ? progressPoints(history, exercise.id, weeks).map(point => ({ id: point.id, date: point.date, value: point[metric] }))
    : []
  const points: ChartPoint[] = values.map(point => ({ ...point, completion: completion.get(point.id) ?? null }))
  const first = points[0]?.value
  const last = points.at(-1)?.value
  const change = points.length > 1 && first > 0 && last !== undefined
    ? showMass ? Math.round((last - first) * 1000) / 1000 : 100 * (last - first) / first
    : null
  const unit = !showMass && metric === 'reps' ? 'повт.' : 'кг'
  const title = showMass ? 'Масса тела' : { max: 'Максимальный вес', volume: 'Объём нагрузки', reps: 'Всего повторений' }[metric]
  const numbers = showMass ? massFormat : format

  function downloadJournal() {
    const now = new Date()
    const content = JSON.stringify(journalExport(program, history, queue, now), null, 2)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `sport-tracker-${dateKey(now)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return <>
    <header className="page-heading progress-heading">
      <h1>Прогресс</h1>
      <button className="text-button export-button" aria-label="Экспорт журнала в JSON" onClick={downloadJournal}><Download /> Экспорт JSON</button>
    </header>
    <div className="progress-controls">
      <div className="segments" aria-label="Показатель прогресса">
        <button aria-pressed={!showMass} onClick={() => setShowMass(false)}>Упражнения</button>
        <button aria-pressed={showMass} onClick={() => setShowMass(true)}>Масса тела</button>
      </div>
      <select aria-label="Период" value={weeks} onChange={event => setWeeks(Number(event.target.value))}>
        <option value={4}>4 недели</option><option value={12}>12 недель</option><option value={0}>Всё время</option>
      </select>
    </div>
    <dl className="panel progress-summary" aria-label="Сводка за период">
      <div><dt>Тренировки</dt><dd>{summary.workouts}</dd></div>
      <div>
        <dt title="Выполненные подходы в процентах от плана за период">Подходы</dt>
        <dd>{summary.sets}/{summary.plannedSets}
          {summary.completion !== null && <small className="summary-completion" style={{ color: completionColor(summary.completion) }}>{summary.completion}%</small>}
        </dd>
      </div>
      <div>
        <dt title="Среднее изменение с первого по последний результат по упражнениям с двумя или более записями. Для упражнений с весом сравнивается максимальный вес, для упражнений с собственным весом — число повторений.">Средний прогресс</dt>
        <dd>{summary.averageChange === null ? '—' : `${summary.averageChange > 0 ? '+' : ''}${format.format(summary.averageChange)}%`}
          {summary.comparedExercises > 0 && <small> · {summary.comparedExercises} упр.</small>}
        </dd>
      </div>
    </dl>
    {!showMass && !exercise ? <section className="panel section"><p className="muted">Пока нет завершённых тренировок.</p></section> :
      <section className="panel section">
        {!showMass && exercise && <div className="progress-exercise">
          <select aria-label="Упражнение" value={exercise.id} onChange={event => select(event.target.value)}>{options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {!exercise.bodyweight && <select aria-label="Показатель упражнения" value={weightedMetric} onChange={event => setMetric(event.target.value === 'volume' ? 'volume' : 'max')}>
            <option value="max">Макс. вес</option><option value="volume">Объём</option>
          </select>}
        </div>}
        {points.length ? <>
          <div className="chart-heading"><h2>{title}</h2><strong>{numbers.format(last!)} {unit}</strong>
            {change !== null && <p className="muted">{change > 0 ? '+' : ''}{numbers.format(change)}{showMass ? ' кг' : '%'} за период</p>}
            {points.length === 1 && <p className="muted">
              <time dateTime={points[0].date}>{date.format(localDate(points[0].date))}</time>
              {points[0].completion !== null && <> · <span style={{ color: completionColor(points[0].completion) }}>{points[0].completion}% подходов</span></>}
            </p>}
          </div>
          {points.length > 1 && <>
            <Chart points={points} focusRange={showMass} />
            <p className="chart-legend"><i className="attendance-scale" /> Цвет точки — выполнение подходов</p>
            <details className="disclosure"><summary>Данные графика</summary><table><thead><tr><th>Дата</th><th>{title}, {unit}</th><th>Подходы, %</th></tr></thead><tbody>
              {points.map(point => <tr key={point.id}>
                <td>{date.format(localDate(point.date))}</td><td>{numbers.format(point.value)}</td>
                <td style={{ color: point.completion === null ? undefined : completionColor(point.completion) }}>{point.completion ?? '—'}</td>
              </tr>)}
            </tbody></table></details>
          </>}
        </> : <p className="muted">{showMass ? 'За этот период нет замеров.' : 'За этот период нет тренировок с упражнением.'}</p>}
      </section>
    }
  </>
}
