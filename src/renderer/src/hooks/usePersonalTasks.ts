import { useCallback, useEffect, useState } from 'react'
import type { PersonalTask, PersonalTaskInput } from '../types/Task'

function backendUrl(): string {
  return window.api?.getBackendUrl?.() ?? 'http://localhost:8080'
}

interface UsePersonalTasksResult {
  tasks: PersonalTask[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  create: (input: PersonalTaskInput) => Promise<PersonalTask | null>
  update: (id: number, input: PersonalTaskInput) => Promise<PersonalTask | null>
  remove: (id: number) => Promise<boolean>
  toggleComplete: (task: PersonalTask) => Promise<void>
}

export function usePersonalTasks(): UsePersonalTasksResult {
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${backendUrl()}/api/personal-tasks`)
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as PersonalTask[]
      setTasks(Array.isArray(data) ? data : [])
      setError(null)
    } catch {
      setError('マイタスクの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(
    async (input: PersonalTaskInput): Promise<PersonalTask | null> => {
      try {
        const res = await fetch(`${backendUrl()}/api/personal-tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        })
        if (!res.ok) return null
        const created = (await res.json()) as PersonalTask
        setTasks((prev) => [created, ...prev])
        return created
      } catch {
        return null
      }
    },
    []
  )

  const update = useCallback(
    async (id: number, input: PersonalTaskInput): Promise<PersonalTask | null> => {
      try {
        const res = await fetch(`${backendUrl()}/api/personal-tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        })
        if (!res.ok) return null
        const updated = (await res.json()) as PersonalTask
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)))
        return updated
      } catch {
        return null
      }
    },
    []
  )

  const remove = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`${backendUrl()}/api/personal-tasks/${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) return false
      setTasks((prev) => prev.filter((t) => t.id !== id))
      return true
    } catch {
      return false
    }
  }, [])

  const toggleComplete = useCallback(
    async (task: PersonalTask): Promise<void> => {
      const next = !task.isCompleted
      // 楽観的更新
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                isCompleted: next,
                completedAt: next ? new Date().toISOString() : null
              }
            : t
        )
      )
      const result = await update(task.id, { title: task.title, isCompleted: next })
      if (!result) {
        // 失敗時ロールバック
        setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
      }
    },
    [update]
  )

  return { tasks, loading, error, reload, create, update, remove, toggleComplete }
}
