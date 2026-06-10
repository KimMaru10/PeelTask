import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task, PersonalTask, Space } from '../types/Task'

function backendUrl(): string {
  return window.api?.getBackendUrl?.() ?? 'http://localhost:8080'
}

type CalendarMode = 'week' | 'month'

const PERSONAL_TASK_COLOR = '#7C3AED' // violet-600

type SpanPosition = 'single' | 'start' | 'middle' | 'end'

// 個人タスクは Backlog タスクと同じセル上で並べたいので、共通の表示用構造に集約する。
interface CalendarItem {
  kind: 'task' | 'personal'
  id: number
  title: string
  color: string
  dueDate: string | null
  // ホバー時の補足表示用
  badge: string | null
  // 期間ありの個人タスクが連続セルに帯描画されるときの位置。Backlog タスクは常に 'single'。
  spanPosition: SpanPosition
}

interface CalendarViewProps {
  tasks: Task[]
  spaces: Space[]
}

function toStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getMonday(date: Date): Date {
  const d = toStartOfDay(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

function getMonthDates(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1)
  const monday = getMonday(firstDay)
  const weeks: Date[][] = []

  let current = new Date(monday)
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
    if (current.getMonth() > month && current.getDay() === 1) break
  }
  return weeks
}

function getWeekDates(baseDate: Date): Date[] {
  const monday = getMonday(baseDate)
  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    dates.push(d)
  }
  return dates
}

function getSpaceColor(spaceId: number, spaces: Space[]): string {
  const space = spaces.find((s) => s.id === spaceId)
  return space?.color ?? '#FAC775'
}

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

export default function CalendarView({ tasks, spaces }: CalendarViewProps): JSX.Element {
  const navigate = useNavigate()
  const [mode, setMode] = useState<CalendarMode>('month')
  const [baseDate, setBaseDate] = useState(() => new Date())
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([])

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const res = await fetch(`${backendUrl()}/api/personal-tasks?completed=false`)
        if (!res.ok) return
        const data = (await res.json()) as PersonalTask[]
        if (!cancelled) setPersonalTasks(Array.isArray(data) ? data : [])
      } catch {
        // カレンダー上の補助表示なので失敗しても致命的でない
      }
    })()
    return (): void => {
      cancelled = true
    }
  }, [])

  const today = useMemo(() => toStartOfDay(new Date()), [])

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    const push = (key: string, item: CalendarItem): void => {
      const existing = map.get(key) ?? []
      existing.push(item)
      map.set(key, existing)
    }
    for (const task of tasks) {
      if (!task.dueDate) continue
      const date = new Date(task.dueDate)
      if (isNaN(date.getTime())) continue
      const key = toStartOfDay(date).toISOString()
      push(key, {
        kind: 'task',
        id: task.id,
        title: task.title,
        color: getSpaceColor(task.spaceId, spaces),
        dueDate: task.dueDate,
        badge: task.issueKey.split('-').pop() ?? task.issueKey,
        spanPosition: 'single'
      })
    }
    for (const p of personalTasks) {
      if (p.isCompleted || !p.dueDate) continue
      const due = new Date(p.dueDate)
      if (isNaN(due.getTime())) continue
      const dueDay = toStartOfDay(due)
      const startCandidate = p.startDate ? new Date(p.startDate) : null
      const start =
        startCandidate && !isNaN(startCandidate.getTime())
          ? toStartOfDay(startCandidate)
          : null

      if (!start || start.getTime() >= dueDay.getTime()) {
        // 開始日なし or 開始 = 期限 → 期限セルだけに 1 つ表示
        push(dueDay.toISOString(), {
          kind: 'personal',
          id: p.id,
          title: p.title,
          color: PERSONAL_TASK_COLOR,
          dueDate: p.dueDate,
          badge: '📋',
          spanPosition: 'single'
        })
        continue
      }

      // 開始 < 期限 → 全ての日に帯としてプッシュ
      const cur = new Date(start)
      while (cur.getTime() <= dueDay.getTime()) {
        const isStart = cur.getTime() === start.getTime()
        const isEnd = cur.getTime() === dueDay.getTime()
        const pos: SpanPosition = isStart ? 'start' : isEnd ? 'end' : 'middle'
        push(cur.toISOString(), {
          kind: 'personal',
          id: p.id,
          title: p.title,
          color: PERSONAL_TASK_COLOR,
          dueDate: p.dueDate,
          badge: isStart ? '📋' : '',
          spanPosition: pos
        })
        cur.setDate(cur.getDate() + 1)
      }
    }
    return map
  }, [tasks, personalTasks, spaces])

  const navigatePrev = (): void => {
    const d = new Date(baseDate)
    if (mode === 'week') d.setDate(d.getDate() - 7)
    else d.setMonth(d.getMonth() - 1)
    setBaseDate(d)
  }

  const navigateNext = (): void => {
    const d = new Date(baseDate)
    if (mode === 'week') d.setDate(d.getDate() + 7)
    else d.setMonth(d.getMonth() + 1)
    setBaseDate(d)
  }

  const goToday = (): void => setBaseDate(new Date())

  // ドラッグ中の個人タスク ID。null のときはドラッグ中でない。
  const [draggingPersonalId, setDraggingPersonalId] = useState<number | null>(null)

  // 個人タスクの期限 (および開始日) を targetDate にスライドする。
  // 範囲タスクの場合は期間を維持したまま startDate / dueDate の両方をシフト。
  // 期間なしタスクは従来通り dueDate のみ更新。
  // 楽観的更新でローカル state を即時書き換え、失敗時は元の値に戻す。
  const movePersonalTaskTo = async (taskId: number, targetDate: Date): Promise<void> => {
    const target = personalTasks.find((p) => p.id === taskId)
    if (!target) return
    const targetDay = toStartOfDay(targetDate)
    const targetIso = targetDay.toISOString()

    const originalDue = target.dueDate
    const originalStart = target.startDate

    // 期間あり (startDate と dueDate 両方) の場合は dueDate を target にして、startDate を同じ delta だけスライド。
    let nextStart = originalStart
    let nextDue = targetIso
    if (originalStart && originalDue) {
      const originalDueDay = toStartOfDay(new Date(originalDue))
      const originalStartDay = toStartOfDay(new Date(originalStart))
      const deltaMs = targetDay.getTime() - originalDueDay.getTime()
      const shifted = new Date(originalStartDay.getTime() + deltaMs)
      nextStart = toStartOfDay(shifted).toISOString()
    }

    // 既に同じ位置なら何もしない
    if (
      originalDue &&
      toStartOfDay(new Date(originalDue)).toISOString() === targetIso &&
      nextStart === originalStart
    ) {
      return
    }

    setPersonalTasks((prev) =>
      prev.map((p) => (p.id === taskId ? { ...p, startDate: nextStart, dueDate: nextDue } : p))
    )
    try {
      const patch: { title: string; dueDate: string; startDate?: string | null } = {
        title: target.title,
        dueDate: nextDue
      }
      if (originalStart) patch.startDate = nextStart
      const res = await fetch(`${backendUrl()}/api/personal-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      setPersonalTasks((prev) =>
        prev.map((p) =>
          p.id === taskId
            ? { ...p, startDate: originalStart, dueDate: originalDue }
            : p
        )
      )
    }
  }

  const headerLabel = mode === 'week'
    ? (() => {
        const dates = getWeekDates(baseDate)
        return `${dates[0].getMonth() + 1}/${dates[0].getDate()} - ${dates[6].getMonth() + 1}/${dates[6].getDate()}`
      })()
    : `${baseDate.getFullYear()}年 ${baseDate.getMonth() + 1}月`

  const renderDayCell = (date: Date, isCurrentMonth: boolean = true): JSX.Element => {
    const key = toStartOfDay(date).toISOString()
    const rawItems = itemsByDate.get(key) ?? []
    // 帯表示が連続セルで同じ垂直位置に並ぶよう、個人タスクを先頭・ID 昇順で固定。
    // Backlog タスクなど他の item は personal の後に並ぶ。
    const dayItems = [...rawItems].sort((a, b) => {
      if (a.kind === 'personal' && b.kind !== 'personal') return -1
      if (a.kind !== 'personal' && b.kind === 'personal') return 1
      return a.id - b.id
    })
    const isToday = toStartOfDay(date).getTime() === today.getTime()
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const isDragging = draggingPersonalId !== null

    return (
      <div
        key={key}
        className={`border-r border-b border-gray-100 p-1 min-h-[80px] transition-colors ${
          !isCurrentMonth ? 'bg-gray-50' : isWeekend ? 'bg-gray-50/50' : ''
        } ${isDragging ? 'hover:bg-violet-50' : ''}`}
        onDragOver={
          isDragging
            ? (e): void => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }
            : undefined
        }
        onDrop={
          isDragging
            ? (e): void => {
                e.preventDefault()
                const id = Number(e.dataTransfer.getData('text/personal-task-id'))
                if (id) void movePersonalTaskTo(id, date)
                setDraggingPersonalId(null)
              }
            : undefined
        }
      >
        <div className={`text-xs mb-1 ${
          isToday ? 'bg-amber-400 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold' :
          !isCurrentMonth ? 'text-gray-300' :
          isWeekend ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {date.getDate()}
        </div>
        <div className="space-y-0.5">
          {dayItems.slice(0, 3).map((item) => {
            const clickable = item.kind === 'task'
            const draggable = item.kind === 'personal'
            // 帯表示の角丸: 開始/終了でだけ角丸、中間は両端を直線にして連続感を出す。
            const roundedClass =
              item.spanPosition === 'single'
                ? 'rounded'
                : item.spanPosition === 'start'
                  ? 'rounded-l'
                  : item.spanPosition === 'end'
                    ? 'rounded-r'
                    : ''
            // セル間で帯が繋がって見えるよう、セルの p-1 (4px) を負マージンで打ち消す。
            // start: 右に拡張、middle: 両端拡張、end: 左に拡張。
            const isContinuousRight =
              item.spanPosition === 'start' || item.spanPosition === 'middle'
            const isContinuousLeft =
              item.spanPosition === 'middle' || item.spanPosition === 'end'
            const paddingClass = item.spanPosition === 'middle' ? 'px-0' : 'px-1'
            return (
              <div
                key={`${item.kind}-${item.id}-${item.spanPosition}`}
                draggable={draggable}
                onDragStart={
                  draggable
                    ? (e): void => {
                        e.dataTransfer.setData('text/personal-task-id', String(item.id))
                        e.dataTransfer.effectAllowed = 'move'
                        setDraggingPersonalId(item.id)
                      }
                    : undefined
                }
                onDragEnd={draggable ? (): void => setDraggingPersonalId(null) : undefined}
                className={`text-[10px] ${paddingClass} py-0.5 ${roundedClass} truncate transition-opacity ${
                  clickable ? 'cursor-pointer hover:opacity-80' : ''
                } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${
                  draggingPersonalId === item.id ? 'opacity-40' : ''
                }`}
                style={{
                  backgroundColor: `${item.color}40`,
                  color: item.color,
                  // セル padding と境界 border (1px) を覆って隣のセルと帯を連結する。
                  marginLeft: isContinuousLeft ? '-5px' : undefined,
                  marginRight: isContinuousRight ? '-5px' : undefined
                }}
                onClick={
                  clickable ? () => navigate(`/tasks/${item.id}`) : undefined
                }
                title={
                  draggable
                    ? `${item.title} (ドラッグして期限変更)`
                    : item.title
                }
              >
                {item.badge} {item.title}
              </div>
            )
          })}
          {dayItems.length > 3 && (
            <div className="text-[10px] text-gray-400 px-1">+{dayItems.length - 3}件</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <button
            onClick={navigatePrev}
            className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
          >
            ←
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            今日
          </button>
          <button
            onClick={navigateNext}
            className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
          >
            →
          </button>
          <span className="text-sm font-semibold text-gray-700 ml-2">{headerLabel}</span>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode('week')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              mode === 'week' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            週
          </button>
          <button
            onClick={() => setMode('month')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              mode === 'month' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            月
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i} className="text-center text-xs text-gray-400 py-2 border-r border-gray-100">
            {label}
          </div>
        ))}
      </div>

      {/* Calendar body */}
      {mode === 'week' ? (
        <div className="grid grid-cols-7">
          {getWeekDates(baseDate).map((date) => renderDayCell(date))}
        </div>
      ) : (
        getMonthDates(baseDate.getFullYear(), baseDate.getMonth()).map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((date) => renderDayCell(date, date.getMonth() === baseDate.getMonth()))}
          </div>
        ))
      )}
    </div>
  )
}
