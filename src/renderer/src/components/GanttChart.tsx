import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import type { PersonalTask, Space, Task } from '../types/Task'

const DAYS_TO_SHOW = 14
const DAY_WIDTH = 80
const ROW_HEIGHT = 36
const HOURS_PER_DAY = 8
const PERSONAL_TASK_COLOR = '#7C3AED' // violet-600

interface GanttChartProps {
  tasks: Task[]
  spaces: Space[]
}

interface GanttRow {
  key: string
  kind: 'task' | 'personal'
  id: number
  label: string
  badge: string | null
  color: string
  opacity: number
  dueDate: Date | null
  estimatedHours: number
  isCompleted: boolean
}

function backendUrl(): string {
  return window.api?.getBackendUrl?.() ?? 'http://localhost:8080'
}

function toStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDay(date: Date): string {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${date.getMonth() + 1}/${date.getDate()} (${weekdays[date.getDay()]})`
}

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

function getSpaceColor(spaceId: number, spaces: Space[]): string {
  const space = spaces.find((s) => s.id === spaceId)
  return space?.color ?? '#FAC775'
}

function getPriorityOpacity(priority: string): number {
  switch (priority) {
    case '高':
      return 1.0
    case '中':
      return 0.7
    case '低':
      return 0.5
    default:
      return 0.7
  }
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  return date
}

function buildRows(
  tasks: Task[],
  personalTasks: PersonalTask[],
  spaces: Space[]
): GanttRow[] {
  const taskRows: GanttRow[] = [...tasks]
    .sort((a, b) => b.score - a.score)
    .map((t) => ({
      key: `t-${t.id}`,
      kind: 'task' as const,
      id: t.id,
      label: t.title,
      badge: t.issueKey,
      color: getSpaceColor(t.spaceId, spaces),
      opacity: getPriorityOpacity(t.priority),
      dueDate: parseDate(t.dueDate),
      estimatedHours: t.estimatedHours,
      isCompleted: false
    }))

  // 個人タスクは期限の近い順、期限なしは末尾にまとめる。
  const personalRows: GanttRow[] = [...personalTasks]
    .filter((p) => !p.isCompleted)
    .sort((a, b) => {
      const da = parseDate(a.dueDate)
      const db = parseDate(b.dueDate)
      if (da && db) return da.getTime() - db.getTime()
      if (da && !db) return -1
      if (!da && db) return 1
      return 0
    })
    .map((p) => ({
      key: `p-${p.id}`,
      kind: 'personal' as const,
      id: p.id,
      label: p.title,
      badge: null,
      color: PERSONAL_TASK_COLOR,
      opacity: 0.85,
      dueDate: parseDate(p.dueDate),
      estimatedHours: p.estimatedHours,
      isCompleted: p.isCompleted
    }))

  return [...taskRows, ...personalRows]
}

interface DragState {
  personalTaskId: number
  startClientX: number
  dxPx: number
  originalDueDate: string | null
}

export default function GanttChart({ tasks, spaces }: GanttChartProps): JSX.Element {
  const navigate = useNavigate()
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([])
  // ドラッグ状態は state + ref の二重管理:
  // - state は UI 反映用 (mousemove で再レンダリングして translate を更新)
  // - ref は useEffect 内のリスナーで「常に最新の startClientX」を取り出すため
  //   (closure の stale 値参照問題を避ける)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const updateDrag = (val: DragState | null): void => {
    dragRef.current = val
    setDrag(val)
  }

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const res = await fetch(`${backendUrl()}/api/personal-tasks?completed=false`)
        if (!res.ok) return
        const data = (await res.json()) as PersonalTask[]
        if (!cancelled) setPersonalTasks(Array.isArray(data) ? data : [])
      } catch {
        // ガント表示の補助情報なので失敗しても致命的でない
      }
    })()
    return (): void => {
      cancelled = true
    }
  }, [])

  // ドラッグ中は window で mousemove/mouseup を拾う。
  // バー自身が小さく動くため、要素を外れてもドラッグが切れないようにする。
  // closure stale を避けるため、リスナーは dragRef.current を参照する。
  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent): void => {
      const cur = dragRef.current
      if (!cur) return
      updateDrag({ ...cur, dxPx: e.clientX - cur.startClientX })
    }
    const onUp = (e: MouseEvent): void => {
      const cur = dragRef.current
      if (!cur) return
      const finalDx = e.clientX - cur.startClientX
      const daysDelta = Math.round(finalDx / DAY_WIDTH)
      finishDragPersonalTask(cur, daysDelta)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag?.personalTaskId])

  const finishDragPersonalTask = async (state: DragState, daysDelta: number): Promise<void> => {
    updateDrag(null)
    if (daysDelta === 0 || !state.originalDueDate) return
    const original = new Date(state.originalDueDate)
    if (isNaN(original.getTime())) return
    const next = new Date(original)
    next.setDate(next.getDate() + daysDelta)
    const nextIso = toStartOfDay(next).toISOString()
    const targetTask = personalTasks.find((p) => p.id === state.personalTaskId)
    if (!targetTask) return

    // 楽観的更新
    setPersonalTasks((prev) =>
      prev.map((p) => (p.id === state.personalTaskId ? { ...p, dueDate: nextIso } : p))
    )
    try {
      const res = await fetch(
        `${backendUrl()}/api/personal-tasks/${state.personalTaskId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: targetTask.title, dueDate: nextIso })
        }
      )
      if (!res.ok) throw new Error('failed')
    } catch {
      setPersonalTasks((prev) =>
        prev.map((p) =>
          p.id === state.personalTaskId ? { ...p, dueDate: state.originalDueDate } : p
        )
      )
    }
  }

  const today = useMemo(() => toStartOfDay(new Date()), [])

  const { dates, startDate } = useMemo(() => {
    const dateList: Date[] = []
    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      dateList.push(d)
    }
    return { dates: dateList, startDate: today }
  }, [today])

  const rows = useMemo(() => buildRows(tasks, personalTasks, spaces), [tasks, personalTasks, spaces])

  const totalWidth = DAYS_TO_SHOW * DAY_WIDTH

  const handleRowClick = (row: GanttRow): void => {
    if (row.kind === 'task') navigate(`/tasks/${row.id}`)
    // 個人タスクは詳細ページがないのでクリック無視 (ホバーで詳細は補助情報のみ)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-1">タスクがありません</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${240 + totalWidth}px` }}>
            {/* Header */}
            <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="w-60 shrink-0 px-3 py-2 border-r border-gray-200 bg-gray-50">
                <span className="text-xs font-medium text-gray-500">タスク</span>
              </div>
              <div className="flex">
                {dates.map((date, i) => {
                  const isTodayCol = toStartOfDay(date).getTime() === today.getTime()
                  return (
                    <div
                      key={i}
                      className={`text-center border-r border-gray-100 py-2 ${
                        isTodayCol ? 'bg-amber-50' : isWeekend(date) ? 'bg-gray-50' : ''
                      }`}
                      style={{ width: `${DAY_WIDTH}px` }}
                    >
                      <div
                        className={`text-[10px] ${isTodayCol ? 'text-amber-600 font-bold' : 'text-gray-400'}`}
                      >
                        {formatDay(date)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Rows */}
            {rows.map((row) => {
              const isOverdue = row.dueDate !== null && row.dueDate < new Date()

              let barStart = 0
              let barWidth = DAY_WIDTH
              if (row.dueDate) {
                const dueDateNorm = toStartOfDay(row.dueDate)
                const daysUntilDue = Math.round(
                  (dueDateNorm.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
                )
                const estimatedDays = Math.max(
                  Math.ceil(row.estimatedHours / HOURS_PER_DAY),
                  1
                )
                barStart = Math.max((daysUntilDue - estimatedDays) * DAY_WIDTH, 0)
                barWidth = Math.min(estimatedDays * DAY_WIDTH, totalWidth - barStart)
              }

              return (
                <div
                  key={row.key}
                  className={`flex border-b border-gray-100 transition-colors ${
                    row.kind === 'task' ? 'cursor-pointer hover:bg-gray-50' : 'hover:bg-violet-50/30'
                  }`}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onClick={() => handleRowClick(row)}
                >
                  <div className="w-60 shrink-0 px-3 flex items-center gap-2 border-r border-gray-200 overflow-hidden">
                    {row.kind === 'personal' ? (
                      <ClipboardList size={12} className="text-violet-500 shrink-0" />
                    ) : (
                      <span className="text-[10px] text-gray-400 font-mono shrink-0">
                        {row.badge}
                      </span>
                    )}
                    <span
                      className={`text-xs truncate ${isOverdue ? 'text-red-500' : 'text-gray-700'}`}
                    >
                      {row.label}
                    </span>
                  </div>

                  <div className="relative flex-1" style={{ minWidth: `${totalWidth}px` }}>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                      style={{ left: `${DAY_WIDTH / 2}px` }}
                    />
                    {(() => {
                      const isDragging = drag?.personalTaskId === row.id
                      // ドラッグ中はピクセル単位で追随、最終的に日境界へスナップ。
                      const dxPx = isDragging
                        ? Math.round(drag.dxPx / DAY_WIDTH) * DAY_WIDTH
                        : 0
                      const draggable = row.kind === 'personal'
                      return (
                        <div
                          className={`absolute top-1.5 rounded-md flex items-center px-2 overflow-hidden select-none ${
                            draggable ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                          style={{
                            left: `${barStart + dxPx}px`,
                            width: `${Math.max(barWidth, 20)}px`,
                            height: `${ROW_HEIGHT - 12}px`,
                            backgroundColor: row.color,
                            opacity: isDragging ? 1 : row.opacity,
                            boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.2)' : undefined
                          }}
                          onMouseDown={
                            draggable
                              ? (e): void => {
                                  e.stopPropagation()
                                  updateDrag({
                                    personalTaskId: row.id,
                                    startClientX: e.clientX,
                                    dxPx: 0,
                                    originalDueDate:
                                      personalTasks.find((p) => p.id === row.id)?.dueDate ?? null
                                  })
                                }
                              : undefined
                          }
                          title={draggable ? 'ドラッグして期限を変更' : undefined}
                        >
                          <span className="text-[10px] text-white font-medium truncate drop-shadow-sm">
                            {row.estimatedHours > 0 ? `${row.estimatedHours}h` : ''}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
