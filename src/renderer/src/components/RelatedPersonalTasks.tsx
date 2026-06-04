import { useEffect, useState } from 'react'
import { Plus, Check, Trash2, Pencil } from 'lucide-react'
import type { PersonalTask, PersonalTaskInput } from '../types/Task'
import PersonalTaskForm from './PersonalTaskForm'

interface RelatedPersonalTasksProps {
  parentTaskId: number
}

function backendUrl(): string {
  return window.api?.getBackendUrl?.() ?? 'http://localhost:8080'
}

// Backlog 課題の詳細ページに表示する「関連する個人タスク」セクション。
// この親 Backlog 課題に紐付いている個人タスクだけを表示・追加・編集・完了切替・削除する。
export default function RelatedPersonalTasks({
  parentTaskId
}: RelatedPersonalTasksProps): JSX.Element {
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PersonalTask | null>(null)

  const reload = async (): Promise<void> => {
    try {
      const res = await fetch(
        `${backendUrl()}/api/personal-tasks?parentTaskId=${parentTaskId}`
      )
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as PersonalTask[]
      setTasks(Array.isArray(data) ? data : [])
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentTaskId])

  const toggleComplete = async (task: PersonalTask): Promise<void> => {
    const next = !task.isCompleted
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, isCompleted: next, completedAt: next ? new Date().toISOString() : null }
          : t
      )
    )
    try {
      const res = await fetch(`${backendUrl()}/api/personal-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: task.title, isCompleted: next })
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
    }
  }

  const handleDelete = async (task: PersonalTask): Promise<void> => {
    if (!confirm(`「${task.title}」を削除しますか?`)) return
    try {
      const res = await fetch(`${backendUrl()}/api/personal-tasks/${task.id}`, {
        method: 'DELETE'
      })
      if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch {
      // 失敗時は何もしない
    }
  }

  // 詳細画面からの作成では parent_backlog_task_id は固定で親に紐付ける。
  const handleSubmit = async (input: PersonalTaskInput): Promise<boolean> => {
    const body: PersonalTaskInput = { ...input, parentBacklogTaskId: parentTaskId }
    try {
      if (editing) {
        const res = await fetch(`${backendUrl()}/api/personal-tasks/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!res.ok) return false
        const updated = (await res.json()) as PersonalTask
        setTasks((prev) => prev.map((t) => (t.id === editing.id ? updated : t)))
      } else {
        const res = await fetch(`${backendUrl()}/api/personal-tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!res.ok) return false
        const created = (await res.json()) as PersonalTask
        setTasks((prev) => [created, ...prev])
      }
      return true
    } catch {
      return false
    }
  }

  const visible = tasks
  const remaining = visible.filter((t) => !t.isCompleted).length

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          関連する個人タスク
          <span className="normal-case tracking-normal text-gray-300 ml-2">
            — 残り {remaining} / {visible.length} 件
          </span>
        </h3>
        <button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          className="flex items-center gap-1 rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700"
        >
          <Plus size={12} />
          追加
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">読み込み中...</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-400">
          紐付いた個人タスクはまだありません。「追加」から作成できます。
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((task) => (
            <li
              key={task.id}
              className={`group flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2 ${
                task.isCompleted ? 'opacity-60' : ''
              }`}
            >
              <button
                onClick={() => toggleComplete(task)}
                aria-label={task.isCompleted ? '未完了に戻す' : '完了にする'}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  task.isCompleted
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-gray-300 hover:border-emerald-500'
                }`}
              >
                {task.isCompleted && <Check size={10} />}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm ${
                    task.isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'
                  }`}
                >
                  {task.title}
                </p>
                {(task.dueDate || task.estimatedHours > 0) && (
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {task.estimatedHours > 0 && <span>{task.estimatedHours}h</span>}
                    {task.estimatedHours > 0 && task.dueDate && <span> · </span>}
                    {task.dueDate && (
                      <span>
                        {new Date(task.dueDate).getMonth() + 1}/
                        {new Date(task.dueDate).getDate()}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => {
                    setEditing(task)
                    setFormOpen(true)
                  }}
                  aria-label="編集"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => handleDelete(task)}
                  aria-label="削除"
                  className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PersonalTaskForm
        open={formOpen}
        initial={editing}
        backlogTasks={[]}
        spaces={[]}
        hideParentPicker
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
