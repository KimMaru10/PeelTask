package service

import (
	"sort"
	"time"

	"github.com/KimMaru10/Backnote/backend/internal/model"
)

const (
	DefaultDailyWorkHours = 8.0
	defaultTaskHours      = 1.0
)

// scheduleItem は Backlog タスクと個人タスクを同一スケジュール上で扱うための統合表現。
// Task / PersonalTask のいずれかが必ず非 nil で、もう一方は nil。
type scheduleItem struct {
	Hours        float64
	Score        float64
	Task         *model.Task
	PersonalTask *model.PersonalTask
}

// CalcPersonalScore は個人タスク用の簡易スコアを返す。
// Backlog にしかない優先度・マイルストーン・滞留度が無いため、
// 期限の切迫度と工数ペナルティだけで構成する。
func CalcPersonalScore(pt model.PersonalTask, now time.Time) float64 {
	deadline := CalcDeadlineUrgency(pt.DueDate, now)
	effort := CalcEffortPenalty(pt.EstimatedHours)
	// Backlog 課題と並べたときに「中」優先扱いになるよう priority 相当を 0.6 で埋める。
	return deadline*weightDeadline +
		0.6*weightPriority +
		effort*weightEffort
}

// GenerateSchedule は Backlog タスクと個人タスクを統合して日次スケジュールを生成する。
// 期限の近さ・優先度・工数等のスコアでソートし、1 日 DefaultDailyWorkHours を上限に詰めていく。
func GenerateSchedule(tasks []model.Task, personalTasks []model.PersonalTask, startDate time.Time) ([]model.Schedule, error) {
	items := buildScheduleItems(tasks, personalTasks, startDate)

	sort.Slice(items, func(i, j int) bool {
		return items[i].Score > items[j].Score
	})

	var schedules []model.Schedule
	currentDate := toStartOfDay(startDate)
	var currentSchedule *model.Schedule
	orderIndex := 0

	for _, item := range items {
		hours := item.Hours

		for hours > 0 {
			if currentSchedule == nil || currentSchedule.AllocatedHours >= DefaultDailyWorkHours {
				if currentSchedule != nil {
					schedules = append(schedules, *currentSchedule)
				}
				currentSchedule = &model.Schedule{
					Date:           currentDate,
					TotalHours:     DefaultDailyWorkHours,
					AllocatedHours: 0,
				}
				orderIndex = 0
				currentDate = currentDate.AddDate(0, 0, 1)
			}

			available := DefaultDailyWorkHours - currentSchedule.AllocatedHours
			allocate := hours
			if allocate > available {
				allocate = available
			}

			slotStart := currentSchedule.Date.Add(
				time.Duration(currentSchedule.AllocatedHours * float64(time.Hour)),
			)
			slotEnd := slotStart.Add(
				time.Duration(allocate * float64(time.Hour)),
			)

			slot := model.ScheduleSlot{
				StartAt:    slotStart,
				EndAt:      slotEnd,
				OrderIndex: orderIndex,
			}
			if item.Task != nil {
				slot.TaskID = item.Task.ID
				slot.Task = item.Task
			} else if item.PersonalTask != nil {
				slot.PersonalTaskID = item.PersonalTask.ID
				slot.PersonalTask = item.PersonalTask
			}

			currentSchedule.Slots = append(currentSchedule.Slots, slot)
			currentSchedule.AllocatedHours += allocate
			orderIndex++
			hours -= allocate
		}
	}

	if currentSchedule != nil {
		schedules = append(schedules, *currentSchedule)
	}

	return schedules, nil
}

func buildScheduleItems(tasks []model.Task, personalTasks []model.PersonalTask, now time.Time) []scheduleItem {
	items := make([]scheduleItem, 0, len(tasks)+len(personalTasks))

	scored := ScoreAllTasks(tasks, now)
	for i := range scored {
		hours := scored[i].EstimatedHours
		if hours <= 0 {
			hours = defaultTaskHours
		}
		t := scored[i]
		items = append(items, scheduleItem{
			Hours: hours,
			Score: t.Score,
			Task:  &t,
		})
	}

	for i := range personalTasks {
		if personalTasks[i].IsCompleted {
			continue
		}
		hours := personalTasks[i].EstimatedHours
		if hours <= 0 {
			hours = defaultTaskHours
		}
		pt := personalTasks[i]
		items = append(items, scheduleItem{
			Hours:        hours,
			Score:        CalcPersonalScore(pt, now),
			PersonalTask: &pt,
		})
	}

	return items
}

func toStartOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
