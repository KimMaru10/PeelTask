package model

import "time"

// PersonalTask は Backlog と独立した個人タスク。
// Backlog 課題を遂行するためのサブタスクや、Backlog にない作業をローカル管理する。
// ParentBacklogTaskID で Backlog の Task と任意で紐付けできる。
type PersonalTask struct {
	ID                  uint       `gorm:"primaryKey" json:"id"`
	Title               string     `gorm:"not null" json:"title"`
	Description         string     `json:"description"`
	StartDate           *time.Time `json:"startDate"`
	DueDate             *time.Time `json:"dueDate"`
	EstimatedHours      float64    `gorm:"default:0" json:"estimatedHours"`
	IsCompleted         bool       `gorm:"default:false;index" json:"isCompleted"`
	CompletedAt         *time.Time `json:"completedAt"`
	ParentBacklogTaskID *uint      `gorm:"index" json:"parentBacklogTaskId"`
	OrderIndex          int        `gorm:"default:0" json:"orderIndex"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
}
