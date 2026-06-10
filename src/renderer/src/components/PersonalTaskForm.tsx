import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PersonalTask, PersonalTaskInput, Space, Task } from '../types/Task'
import BacklogTaskPicker from './BacklogTaskPicker'

interface PersonalTaskFormProps {
  open: boolean
  initial?: PersonalTask | null
  backlogTasks: Task[]
  spaces: Space[]
  // 親 Backlog 課題が文脈上自明な場合 (例: Backlog 課題詳細ページから開く) は
  // 親ピッカー UI を隠す。送信値の差し替えは呼び出し側で行う。
  hideParentPicker?: boolean
  onClose: () => void
  onSubmit: (input: PersonalTaskInput) => Promise<boolean>
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function PersonalTaskForm({
  open,
  initial,
  backlogTasks,
  spaces,
  hideParentPicker = false,
  onClose,
  onSubmit
}: PersonalTaskFormProps): JSX.Element | null {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(initial?.title ?? '')
    setDescription(initial?.description ?? '')
    setStartDate(toDateInputValue(initial?.startDate ?? null))
    setDueDate(toDateInputValue(initial?.dueDate ?? null))
    setEstimatedHours(
      initial?.estimatedHours && initial.estimatedHours > 0 ? String(initial.estimatedHours) : ''
    )
    setParentId(initial?.parentBacklogTaskId ?? null)
    setError(null)
  }, [open, initial])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) {
      setError('タイトルは必須です')
      return
    }
    setSubmitting(true)
    setError(null)
    const parsedHours = Number(estimatedHours)
    if (estimatedHours !== '' && (isNaN(parsedHours) || parsedHours < 0)) {
      setError('所要時間は 0 以上の数値を入力してください')
      setSubmitting(false)
      return
    }
    if (startDate && dueDate && startDate > dueDate) {
      setError('開始日は期限より後にできません')
      setSubmitting(false)
      return
    }
    const input: PersonalTaskInput = {
      title: title.trim(),
      description: description.trim(),
      startDate: startDate || null,
      dueDate: dueDate || null,
      estimatedHours: estimatedHours === '' ? 0 : parsedHours,
      parentBacklogTaskId: parentId
    }
    const ok = await onSubmit(input)
    setSubmitting(false)
    if (ok) {
      onClose()
    } else {
      setError('保存に失敗しました')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            {initial ? 'マイタスクを編集' : '新しいマイタスク'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">タイトル *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">開始日</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">期限</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">所要時間 (h)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>

          {!hideParentPicker && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                関連する Backlog 課題 (任意)
              </label>
              <BacklogTaskPicker
                value={parentId}
                tasks={backlogTasks}
                spaces={spaces}
                onChange={setParentId}
              />
            </div>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
