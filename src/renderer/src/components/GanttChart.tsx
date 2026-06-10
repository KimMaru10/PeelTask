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
  startDate: Date | null
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
      // Backlog タスクは開始日を持たないので estimatedHours から逆算する形のまま。
      startDate: null,
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
      startDate: parseDate(p.startDate),
      dueDate: parseDate(p.dueDate),
      estimatedHours: p.estimatedHours,
      isCompleted: p.isCompleted
    }))

  return [...taskRows, ...personalRows]
}

type DragMode = 'move' | 'start' | 'end'

interface DragState {
  personalTaskId: number
  mode: DragMode
  startClientX: number
  dxPx: number
  originalStartDate: string | null
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
    if (daysDelta === 0) return
    const targetTask = personalTasks.find((p) => p.id === state.personalTaskId)
    if (!targetTask) return

    const shiftIso = (iso: string | null): string | null => {
      if (!iso) return null
      const d = new Date(iso)
      if (isNaN(d.getTime())) return iso
      d.setDate(d.getDate() + daysDelta)
      return toStartOfDay(d).toISOString()
    }

    // モードに応じて変更するフィールドを決め、不正な順序になる更新は捨てる。
    let nextStart = targetTask.startDate
    let nextDue = targetTask.dueDate
    const patch: { startDate?: string | null; dueDate?: string | null; title: string } = {
      title: targetTask.title
    }
    if (state.mode === 'move') {
      nextStart = shiftIso(state.originalStartDate)
      nextDue = shiftIso(state.originalDueDate)
      patch.startDate = nextStart
      patch.dueDate = nextDue
    } else if (state.mode === 'start') {
      nextStart = shiftIso(state.originalStartDate)
      // dueDate を超えないようクランプ。
      if (nextStart && nextDue && nextStart > nextDue) nextStart = nextDue
      patch.startDate = nextStart
    } else if (state.mode === 'end') {
      nextDue = shiftIso(state.originalDueDate)
      // startDate より前にならないようクランプ。
      if (nextStart && nextDue && nextDue < nextStart) nextDue = nextStart
      patch.dueDate = nextDue
    }

    // 変化が無ければ何もしない (クランプ等で元値と同じになるケース)
    if (
      nextStart === targetTask.startDate &&
      nextDue === targetTask.dueDate
    ) {
      return
    }

    // 楽観的更新
    setPersonalTasks((prev) =>
      prev.map((p) =>
        p.id === state.personalTaskId
          ? { ...p, startDate: nextStart, dueDate: nextDue }
          : p
      )
    )
    try {
      const res = await fetch(
        `${backendUrl()}/api/personal-tasks/${state.personalTaskId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        }
      )
      if (!res.ok) throw new Error('failed')
    } catch {
      setPersonalTasks((prev) =>
        prev.map((p) =>
          p.id === state.personalTaskId
            ? {
                ...p,
                startDate: state.originalStartDate,
                dueDate: state.originalDueDate
              }
            : p
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
                if (row.kind === 'personal' && row.startDate) {
                  // 開始日 + 期限の両方が設定されているなら範囲そのままで描画。
                  const startDateNorm = toStartOfDay(row.startDate)
                  const startCol = Math.round(
                    (startDateNorm.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
                  )
                  // 終端 col は dueDate の翌日 (含まれる日全体を表示するため +1)
                  const endCol = daysUntilDue + 1
                  barStart = Math.max(startCol * DAY_WIDTH, 0)
                  barWidth = Math.min((endCol - startCol) * DAY_WIDTH, totalWidth - barStart)
                } else {
                  // 開始日が無い場合は所要時間から逆算 (旧挙動)
                  const estimatedDays = Math.max(
                    Math.ceil(row.estimatedHours / HOURS_PER_DAY),
                    1
                  )
                  barStart = Math.max((daysUntilDue - estimatedDays) * DAY_WIDTH, 0)
                  barWidth = Math.min(estimatedDays * DAY_WIDTH, totalWidth - barStart)
                }
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
                      const snapDx = isDragging
                        ? Math.round(drag.dxPx / DAY_WIDTH) * DAY_WIDTH
                        : 0
                      const draggable = row.kind === 'personal'

                      // モード別の left / width 描画値を計算する。
                      // - move: 左右まるごとシフト
                      // - start: 左端のみ動かす → 左端 += snap、右端は固定 → width 縮む
                      // - end: 右端のみ動かす → 左端は固定、width += snap
                      let drawLeft = barStart
                      let drawWidth = barWidth
                      if (isDragging) {
                        if (drag.mode === 'move') {
                          drawLeft = barStart + snapDx
                        } else if (drag.mode === 'start') {
                          // 左ハンドルを右へ引きすぎても右端を超えないよう最低 1 日幅を確保。
                          // 過剰に引いた場合は drawLeft 側も対応して詰める。
                          const cappedSnap = Math.min(snapDx, barWidth - DAY_WIDTH)
                          drawLeft = barStart + cappedSnap
                          drawWidth = barWidth - cappedSnap
                        } else if (drag.mode === 'end') {
                          // 右ハンドルを左へ引きすぎても左端を超えないよう最低 1 日幅を確保。
                          drawWidth = Math.max(barWidth + snapDx, DAY_WIDTH)
                        }
                      }

                      const startDragHandler =
                        (mode: DragMode) =>
                        (e: React.MouseEvent): void => {
                          e.stopPropagation()
                          const pt = personalTasks.find((p) => p.id === row.id)
                          updateDrag({
                            personalTaskId: row.id,
                            mode,
                            startClientX: e.clientX,
                            dxPx: 0,
                            originalStartDate: pt?.startDate ?? null,
                            originalDueDate: pt?.dueDate ?? null
                          })
                        }

                      const hasRangeHandles = draggable && row.startDate !== null

                      return (
                        <div
                          className="absolute top-1.5 rounded-md flex items-center overflow-hidden select-none"
                          style={{
                            left: `${drawLeft}px`,
                            width: `${Math.max(drawWidth, 20)}px`,
                            height: `${ROW_HEIGHT - 12}px`,
                            backgroundColor: row.color,
                            opacity: isDragging ? 1 : row.opacity,
                            boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.2)' : undefined
                          }}
                          title={draggable ? 'ドラッグして期間を調整' : undefined}
                        >
                          {/* 左端ハンドル: 開始日のみシフト (startDate が無い課題はハンドルなし、本体ドラッグで期限のみ動く) */}
                          {hasRangeHandles && (
                            <div
                              onMouseDown={startDragHandler('start')}
                              className="h-full w-2 cursor-ew-resize shrink-0 bg-white/20"
                              title="開始日を変更"
                            />
                          )}
                          {/* 中央: 本体ドラッグ (move) */}
                          <div
                            onMouseDown={draggable ? startDragHandler('move') : undefined}
                            className={`flex-1 h-full flex items-center px-2 ${
                              draggable ? 'cursor-grab active:cursor-grabbing' : ''
                            }`}
                          >
                            <span className="text-[10px] text-white font-medium truncate drop-shadow-sm">
                              {row.estimatedHours > 0 ? `${row.estimatedHours}h` : ''}
                            </span>
                          </div>
                          {/* 右端ハンドル: 期限のみシフト */}
                          {draggable && (
                            <div
                              onMouseDown={startDragHandler('end')}
                              className="h-full w-2 cursor-ew-resize shrink-0 bg-white/20"
                              title="期限を変更"
                            />
                          )}
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
