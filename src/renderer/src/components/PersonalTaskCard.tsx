import { Check, Link2, Pencil, Trash2 } from 'lucide-react'
import type { PersonalTask, Task } from '../types/Task'

interface PersonalTaskCardProps {
  task: PersonalTask
  parentBacklogTask?: Task | null
  onToggleComplete: (task: PersonalTask) => void
  onEdit: (task: PersonalTask) => void
  onDelete: (task: PersonalTask) => void
}

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null
  const date = new Date(dueDate)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const formatted = `${date.getMonth() + 1}/${date.getDate()}`
  if (diffDays < 0) return `${formatted} (期限切れ)`
  if (diffDays === 0) return `${formatted} (今日)`
  if (diffDays <= 3) return `${formatted} (残${diffDays}日)`
  return formatted
}

export default function PersonalTaskCard({
  task,
  parentBacklogTask,
  onToggleComplete,
  onEdit,
  onDelete
}: PersonalTaskCardProps): JSX.Element {
  const dueStr = formatDueDate(task.dueDate)
  const isOverdue =
    !task.isCompleted && task.dueDate && new Date(task.dueDate) < new Date()

  return (
    <div
      className={`group relative rounded-lg border p-4 transition-colors ${
        task.isCompleted
          ? 'border-gray-200 bg-gray-50 opacity-60'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleComplete(task)}
          aria-label={task.isCompleted ? '未完了に戻す' : '完了にする'}
          title={task.isCompleted ? '未完了に戻す' : '完了にする'}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
            task.isCompleted
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-gray-300 hover:border-emerald-500'
          }`}
        >
          {task.isCompleted && <Check size={14} />}
        </button>

        <div className="flex-1 min-w-0">
          <h3
            className={`text-sm font-semibold ${
              task.isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'
            }`}
          >
            {task.title}
          </h3>

          {task.description && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-2 whitespace-pre-wrap">
              {task.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {task.estimatedHours > 0 && <span>{task.estimatedHours}h</span>}
            {dueStr && (
              <span className={isOverdue ? 'font-medium text-red-500' : ''}>{dueStr}</span>
            )}
            {parentBacklogTask && (
              <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
                <Link2 size={10} />
                {parentBacklogTask.issueKey}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onEdit(task)}
            title="編集"
            aria-label="編集"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(task)}
            title="削除"
            aria-label="削除"
            className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
