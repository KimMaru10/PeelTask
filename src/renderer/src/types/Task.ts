export interface Task {
  id: number
  issueKey: string
  title: string
  description: string
  priority: string
  estimatedHours: number
  dueDate: string | null
  status: string
  score: number
  spaceId: number
  milestoneId: string
  milestoneDueDate: string | null
  backlogCreatedAt: string | null
  createdUserName: string
  createdUserIconUrl: string
  isWatched: boolean
}

export interface Space {
  id: number
  domain: string
  displayName: string
  color: string
  isActive: boolean
}

export interface Memo {
  id: number
  taskId: number
  content: string
  createdAt: string
  updatedAt: string
}

export interface PersonalTask {
  id: number
  title: string
  description: string
  startDate: string | null
  dueDate: string | null
  estimatedHours: number
  isCompleted: boolean
  completedAt: string | null
  parentBacklogTaskId: number | null
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export interface PersonalTaskInput {
  title: string
  description?: string
  startDate?: string | null
  dueDate?: string | null
  estimatedHours?: number
  parentBacklogTaskId?: number | null
  isCompleted?: boolean
}
