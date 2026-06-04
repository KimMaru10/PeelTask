import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { PersonalTask, PersonalTaskInput, Space, Task } from '../types/Task'
import { usePersonalTasks } from '../hooks/usePersonalTasks'
import PersonalTaskCard from './PersonalTaskCard'
import PersonalTaskForm from './PersonalTaskForm'

interface PersonalTasksViewProps {
  backlogTasks: Task[]
  spaces: Space[]
}

export default function PersonalTasksView({
  backlogTasks,
  spaces
}: PersonalTasksViewProps): JSX.Element {
  const { tasks, loading, error, create, update, remove, toggleComplete } = usePersonalTasks()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PersonalTask | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const parentMap = useMemo(() => {
    const m = new Map<number, Task>()
    backlogTasks.forEach((t) => m.set(t.id, t))
    return m
  }, [backlogTasks])

  const visibleTasks = useMemo(
    () => (showCompleted ? tasks : tasks.filter((t) => !t.isCompleted)),
    [tasks, showCompleted]
  )

  const openCreate = (): void => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (task: PersonalTask): void => {
    setEditing(task)
    setFormOpen(true)
  }

  const handleSubmit = async (input: PersonalTaskInput): Promise<boolean> => {
    if (editing) {
      const result = await update(editing.id, input)
      return result !== null
    }
    const result = await create(input)
    return result !== null
  }

  const handleDelete = async (task: PersonalTask): Promise<void> => {
    if (!confirm(`「${task.title}」を削除しますか?`)) return
    await remove(task.id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {loading
            ? '読み込み中...'
            : `${visibleTasks.length} / ${tasks.length} 件${showCompleted ? ' (完了済み含む)' : ''}`}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded"
            />
            完了済みも表示
          </label>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            <Plus size={14} />
            新規作成
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {visibleTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-400">
          <p className="text-sm">
            {tasks.length === 0
              ? 'マイタスクがまだありません。「新規作成」から追加できます。'
              : '表示できるタスクがありません'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleTasks.map((task) => (
            <div key={task.id}>
              <PersonalTaskCard
                task={task}
                parentBacklogTask={
                  task.parentBacklogTaskId ? parentMap.get(task.parentBacklogTaskId) : null
                }
                onToggleComplete={toggleComplete}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      )}

      <PersonalTaskForm
        open={formOpen}
        initial={editing}
        backlogTasks={backlogTasks}
        spaces={spaces}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
