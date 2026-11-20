import { useEffect, useRef, useState } from 'react'
import { localDate, progressPoints, type Exercise, type HistoryRow, type Point } from './model'

const format = new Intl.NumberFormat('ru', { maximumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' })

function Chart({ points, metric }: { points: Point[]; metric: 'max' | 'volume' | 'reps' }) {
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
      const max = Math.max(1, ...points.map(point => point[metric]))
      const left = 52, bottom = height - 25, top = 16, right = width - 16
      context.font = '12px system-ui'
      for (let i = 0; i <= 4; i++) {
        const y = bottom - (bottom - top) * i / 4
        context.fillStyle = '#aeb3ad'
        context.fillText(format.format(max * i / 4), 0, y + 4, 46)
        context.strokeStyle = '#343936'
        context.beginPath()
        context.moveTo(left, y)
        context.lineTo(right, y)
        context.stroke()
      }
      const coords = points.map((point, i) => [
        points.length === 1 ? (left + right) / 2 : left + (right - left) * i / (points.length - 1),
        bottom - (bottom - top) * point[metric] / max,
      ])
      context.strokeStyle = '#c9f46e'
      context.fillStyle = '#c9f46e'
      context.lineWidth = 2
      context.beginPath()
      coords.forEach(([x,y], i) => i ? context.lineTo(x,y) : context.moveTo(x,y))
      context.stroke()
      for (const [x,y] of coords) {
        context.beginPath()
        context.arc(x,y,3,0,Math.PI * 2)
        context.fill()
      }
      context.fillStyle = '#aeb3ad'
      context.fillText(date.format(localDate(points[0].date)), left, height - 4)
      if (points.length > 1) {
        const text = date.format(localDate(points.at(-1)!.date))
        context.fillText(text, right - context.measureText(text).width, height - 4)
      }
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    draw()
    return () => observer.disconnect()
  }, [points, metric])
  return <canvas ref={ref} aria-hidden="true" />
}

export function Progress({ history, exercises }: { history: HistoryRow[]; exercises: Exercise[] }) {
  const logged = new Set(history.flatMap(({ workout }) => workout.exercises.filter(item => item.entries.some(set => set.status === 'done')).map(item => item.slot.exerciseId)))
  const options = exercises.filter(x => logged.has(x.id))
  const [selected, select] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [weightedMetric, setMetric] = useState<'max' | 'volume'>('max')
  const exercise = options.find(x => x.id === selected) ?? options[0]
  const metric = exercise?.bodyweight ? 'reps' : weightedMetric
  const points = exercise ? progressPoints(history, exercise.id, weeks) : []
  const first = points[0]?.[metric]
  const last = points.at(-1)?.[metric]
  const change = points.length > 1 && first > 0 && last !== undefined ? 100 * (last - first) / first : null
  const unit = metric === 'reps' ? 'повт.' : 'кг'
  const title = { max: 'Максимальный вес', volume: 'Объём нагрузки', reps: 'Всего повторений' }[metric]
  return <>
    <header className="page-heading"><p className="eyebrow">Результаты</p><h1>Прогресс</h1></header>
    {!exercise ? <section className="panel section"><h2>Пока нет данных</h2><p className="muted">Заверши тренировку, чтобы увидеть результаты по упражнениям.</p></section> : <>
      <section className="panel section">
        <label>Упражнение<select value={exercise.id} onChange={e => select(e.target.value)}>{options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="segments">{[[4, '4 недели'], [12, '12 недель'], [0, 'Всё время']].map(([value, label]) => <button key={value} aria-pressed={weeks === value} onClick={() => setWeeks(Number(value))}>{label}</button>)}</div>
        {!exercise.bodyweight && <div className="segments"><button aria-pressed={metric === 'max'} onClick={() => setMetric('max')}>Макс. вес</button><button aria-pressed={metric === 'volume'} onClick={() => setMetric('volume')}>Объём</button></div>}
        {points.length ? <>
          <div className="chart-heading"><h2>{title}</h2><strong>{format.format(last!)} {unit}</strong><p className="muted">{change === null ? 'Недостаточно данных для сравнения' : `${change > 0 ? '+' : ''}${format.format(change)}% за выбранный период`}</p></div>
          <Chart points={points} metric={metric} />
          <details className="disclosure"><summary>Данные графика</summary><table><thead><tr><th>Дата</th><th>{title}, {unit}</th></tr></thead><tbody>
            {points.map(point => <tr key={point.id}><td>{date.format(localDate(point.date))}</td><td>{format.format(point[metric])}</td></tr>)}
          </tbody></table></details>
        </> : <p className="muted">За этот период нет тренировок с упражнением.</p>}
      </section>
    </>}
  </>
}
