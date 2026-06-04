package model

import "time"

type Schedule struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	Date           time.Time      `gorm:"uniqueIndex;not null" json:"date"`
	TotalHours     float64        `gorm:"default:8.0" json:"totalHours"`
	AllocatedHours float64        `gorm:"default:0" json:"allocatedHours"`
	CreatedAt      time.Time      `json:"createdAt"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	Slots          []ScheduleSlot `gorm:"foreignKey:ScheduleID" json:"slots,omitempty"`
}

// ScheduleSlot は 1 つの作業時間枠を表す。
// TaskID または PersonalTaskID のどちらか一方が必ず非ゼロ (XOR)。
// 同期生成や API 側で「どちらの種別か」を判別して扱う。
type ScheduleSlot struct {
	ID             uint          `gorm:"primaryKey" json:"id"`
	ScheduleID     uint          `gorm:"index;not null" json:"scheduleId"`
	TaskID         uint          `gorm:"index;default:0" json:"taskId"`
	PersonalTaskID uint          `gorm:"index;default:0" json:"personalTaskId"`
	StartAt        time.Time     `json:"startAt"`
	EndAt          time.Time     `json:"endAt"`
	OrderIndex     int           `gorm:"default:0" json:"orderIndex"`
	CreatedAt      time.Time     `json:"createdAt"`
	UpdatedAt      time.Time     `json:"updatedAt"`
	Task           *Task         `gorm:"foreignKey:TaskID" json:"task,omitempty"`
	PersonalTask   *PersonalTask `gorm:"foreignKey:PersonalTaskID" json:"personalTask,omitempty"`
}

// IsPersonal は個人タスクのスロットか判定する。
func (s *ScheduleSlot) IsPersonal() bool {
	return s.PersonalTaskID != 0
}
