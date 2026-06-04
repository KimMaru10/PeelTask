import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import type { Space, Task } from '../types/Task'

interface BacklogTaskPickerProps {
  value: number | null
  tasks: Task[]
  spaces: Space[]
  onChange: (taskId: number | null) => void
}

interface SpaceGroup {
  space: Space
  projects: ProjectGroup[]
}

interface ProjectGroup {
  projectKey: string
  tasks: Task[]
}

function projectKeyOf(task: Task): string {
  return task.issueKey.split('-')[0] || task.issueKey
}

function buildTree(tasks: Task[], spaces: Space[]): SpaceGroup[] {
  // spaceId → projectKey → Task[]
  const grouped = new Map<number, Map<string, Task[]>>()
  for (const t of tasks) {
    const projectKey = projectKeyOf(t)
    if (!grouped.has(t.spaceId)) grouped.set(t.spaceId, new Map())
    const projects = grouped.get(t.spaceId)!
    if (!projects.has(projectKey)) projects.set(projectKey, [])
    projects.get(projectKey)!.push(t)
  }

  const result: SpaceGroup[] = []
  for (const space of spaces) {
    const projects = grouped.get(space.id)
    if (!projects || projects.size === 0) continue
    const projectGroups: ProjectGroup[] = []
    const projectKeys = Array.from(projects.keys()).sort()
    for (const pk of projectKeys) {
      const list = projects.get(pk)!
      // 元の tasks 配列を変えないようコピーしてからソートする。
      const sorted = [...list].sort((a, b) => a.issueKey.localeCompare(b.issueKey))
      projectGroups.push({ projectKey: pk, tasks: sorted })
    }
    result.push({ space, projects: projectGroups })
  }
  return result
}

function filterTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return tasks
    .filter(
      (t) =>
        t.issueKey.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        projectKeyOf(t).toLowerCase().includes(q)
    )
    .slice(0, 50)
}

export default function BacklogTaskPicker({
  value,
  tasks,
  spaces,
  onChange
}: BacklogTaskPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedSpaces, setExpandedSpaces] = useState<Set<number>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(() => tasks.find((t) => t.id === value) ?? null, [tasks, value])
  const tree = useMemo(() => buildTree(tasks, spaces), [tasks, spaces])
  const filtered = useMemo(() => filterTasks(tasks, query), [tasks, query])
  const spaceMap = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // popover が開いた瞬間だけ初期化したい (open true → 1回)。selected を依存に入れると
  // tasks の再 fetch で参照が変わるたびに副作用が走り、検索文字列が消えるなどの不具合が起きる。
  useEffect(() => {
    if (!open) return
    setQuery('')
    const cur = tasks.find((t) => t.id === value) ?? null
    if (cur) {
      setExpandedSpaces(new Set([cur.spaceId]))
      setExpandedProjects(new Set([`${cur.spaceId}:${projectKeyOf(cur)}`]))
    }
    requestAnimationFrame(() => inputRef.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleSpace = (spaceId: number): void => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev)
      if (next.has(spaceId)) next.delete(spaceId)
      else next.add(spaceId)
      return next
    })
  }

  const toggleProject = (spaceId: number, projectKey: string): void => {
    const key = `${spaceId}:${projectKey}`
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const pick = (taskId: number | null): void => {
    onChange(taskId)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:border-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? `${selected.issueKey} - ${selected.title}` : 'なし'}
        </span>
        <div className="flex items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                pick(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  pick(null)
                }
              }}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="選択解除"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={14} className="text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="課題キー・タイトル・プロジェクトで検索"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {query.trim() ? (
              filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-gray-400">
                  該当する課題がありません
                </div>
              ) : (
                <ul>
                  {filtered.map((task) => {
                    const space = spaceMap.get(task.spaceId)
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => pick(task.id)}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span
                            className="mt-1 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: space?.color ?? '#ccc' }}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-gray-500">
                              {task.issueKey}
                            </span>
                            <span className="ml-2 text-gray-800">{task.title}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : tree.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                Backlog 課題が見つかりません
              </div>
            ) : (
              <ul>
                {tree.map(({ space, projects }) => {
                  const isOpen = expandedSpaces.has(space.id)
                  const totalCount = projects.reduce((sum, p) => sum + p.tasks.length, 0)
                  return (
                    <li key={space.id} className="border-b border-gray-50 last:border-0">
                      <button
                        type="button"
                        onClick={() => toggleSpace(space.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        {isOpen ? (
                          <ChevronDown size={12} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={12} className="text-gray-400" />
                        )}
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: space.color }}
                        />
                        <span className="flex-1 truncate font-medium text-gray-700">
                          {space.displayName}
                        </span>
                        <span className="text-xs text-gray-400">{totalCount}</span>
                      </button>

                      {isOpen && (
                        <ul className="border-t border-gray-50 bg-gray-50/50">
                          {projects.map(({ projectKey, tasks: projTasks }) => {
                            const pKey = `${space.id}:${projectKey}`
                            const projOpen = expandedProjects.has(pKey)
                            return (
                              <li key={pKey}>
                                <button
                                  type="button"
                                  onClick={() => toggleProject(space.id, projectKey)}
                                  className="flex w-full items-center gap-2 pl-8 pr-3 py-1.5 text-left text-xs hover:bg-gray-100"
                                >
                                  {projOpen ? (
                                    <ChevronDown size={10} className="text-gray-400" />
                                  ) : (
                                    <ChevronRight size={10} className="text-gray-400" />
                                  )}
                                  <span className="flex-1 font-mono text-gray-600">
                                    {projectKey}
                                  </span>
                                  <span className="text-gray-400">{projTasks.length}</span>
                                </button>

                                {projOpen && (
                                  <ul>
                                    {projTasks.map((task) => (
                                      <li key={task.id}>
                                        <button
                                          type="button"
                                          onClick={() => pick(task.id)}
                                          className={`flex w-full items-start gap-2 pl-14 pr-3 py-1.5 text-left text-xs hover:bg-white ${
                                            task.id === value ? 'bg-brand/10' : ''
                                          }`}
                                        >
                                          <span className="font-mono text-gray-500 shrink-0">
                                            {task.issueKey}
                                          </span>
                                          <span className="truncate text-gray-700">
                                            {task.title}
                                          </span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
