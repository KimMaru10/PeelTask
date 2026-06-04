package service

import (
	"testing"
	"time"

	"github.com/KimMaru10/Backnote/backend/internal/model"
)

func TestGenerateSchedule_EmptyTasks(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	schedules, err := GenerateSchedule([]model.Task{}, nil, start)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(schedules) != 0 {
		t.Errorf("expected 0 schedules, got %d", len(schedules))
	}
}

func TestGenerateSchedule_SingleTaskFitsInOneDay(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	tasks := []model.Task{
		{ID: 1, IssueKey: "T-1", Priority: "高", EstimatedHours: 4.0, DueDate: timePtr(start.AddDate(0, 0, 3))},
	}

	schedules, err := GenerateSchedule(tasks, nil, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(schedules) != 1 {
		t.Fatalf("expected 1 schedule, got %d", len(schedules))
	}

	if len(schedules[0].Slots) != 1 {
		t.Errorf("expected 1 slot, got %d", len(schedules[0].Slots))
	}

	if schedules[0].AllocatedHours != 4.0 {
		t.Errorf("expected 4.0 allocated hours, got %v", schedules[0].AllocatedHours)
	}
}

func TestGenerateSchedule_TaskOverflowsToNextDay(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	tasks := []model.Task{
		{ID: 1, IssueKey: "T-1", Priority: "高", EstimatedHours: 12.0, DueDate: timePtr(start.AddDate(0, 0, 3))},
	}

	schedules, err := GenerateSchedule(tasks, nil, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(schedules) != 2 {
		t.Fatalf("expected 2 schedules (overflow), got %d", len(schedules))
	}

	if schedules[0].AllocatedHours != 8.0 {
		t.Errorf("day 1: expected 8.0h, got %v", schedules[0].AllocatedHours)
	}
	if schedules[1].AllocatedHours != 4.0 {
		t.Errorf("day 2: expected 4.0h, got %v", schedules[1].AllocatedHours)
	}
}

func TestGenerateSchedule_MultipleTasks(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	tasks := []model.Task{
		{ID: 1, IssueKey: "T-1", Priority: "高", EstimatedHours: 3.0, DueDate: timePtr(start.AddDate(0, 0, 1))},
		{ID: 2, IssueKey: "T-2", Priority: "中", EstimatedHours: 4.0, DueDate: timePtr(start.AddDate(0, 0, 5))},
		{ID: 3, IssueKey: "T-3", Priority: "低", EstimatedHours: 2.0},
	}

	schedules, err := GenerateSchedule(tasks, nil, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 合計9h → 1日8hなので2日に分かれる
	if len(schedules) != 2 {
		t.Fatalf("expected 2 schedules, got %d", len(schedules))
	}

	// 1日目は8h割り当て
	if schedules[0].AllocatedHours != 8.0 {
		t.Errorf("day 1: expected 8.0h, got %v", schedules[0].AllocatedHours)
	}

	// 2日目は残り1h
	if schedules[1].AllocatedHours != 1.0 {
		t.Errorf("day 2: expected 1.0h, got %v", schedules[1].AllocatedHours)
	}
}

func TestGenerateSchedule_ScoreOrdering(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	tasks := []model.Task{
		{ID: 1, IssueKey: "LOW", Priority: "低", EstimatedHours: 2.0},
		{ID: 2, IssueKey: "HIGH", Priority: "高", EstimatedHours: 2.0, DueDate: timePtr(start.AddDate(0, 0, 1))},
	}

	schedules, err := GenerateSchedule(tasks, nil, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 最初のスロットは高スコアのタスク（HIGH）であること
	firstSlot := schedules[0].Slots[0]
	if firstSlot.Task.IssueKey != "HIGH" {
		t.Errorf("expected first slot to be HIGH, got %s", firstSlot.Task.IssueKey)
	}
}

func TestGenerateSchedule_ZeroEstimatedHours(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	tasks := []model.Task{
		{ID: 1, IssueKey: "T-1", Priority: "中", EstimatedHours: 0},
	}

	schedules, err := GenerateSchedule(tasks, nil, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(schedules) != 1 {
		t.Fatalf("expected 1 schedule, got %d", len(schedules))
	}

	// 0h → デフォルト1hとして扱う
	if schedules[0].AllocatedHours != 1.0 {
		t.Errorf("expected 1.0h (default), got %v", schedules[0].AllocatedHours)
	}
}

func TestGenerateSchedule_SlotTimeRange(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	tasks := []model.Task{
		{ID: 1, IssueKey: "T-1", Priority: "高", EstimatedHours: 3.0, DueDate: timePtr(start.AddDate(0, 0, 1))},
		{ID: 2, IssueKey: "T-2", Priority: "中", EstimatedHours: 2.0, DueDate: timePtr(start.AddDate(0, 0, 5))},
	}

	schedules, err := GenerateSchedule(tasks, nil, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	slot1 := schedules[0].Slots[0]
	slot2 := schedules[0].Slots[1]

	// slot1 の終了時刻 == slot2 の開始時刻
	if !slot1.EndAt.Equal(slot2.StartAt) {
		t.Errorf("slot1 end (%v) should equal slot2 start (%v)", slot1.EndAt, slot2.StartAt)
	}

	// slot1: 0:00-3:00、slot2: 3:00-5:00
	expectedSlot1Duration := 3 * time.Hour
	if slot1.EndAt.Sub(slot1.StartAt) != expectedSlot1Duration {
		t.Errorf("slot1 duration: expected %v, got %v", expectedSlot1Duration, slot1.EndAt.Sub(slot1.StartAt))
	}
}

func TestGenerateSchedule_IncludesPersonalTasks(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	personalTasks := []model.PersonalTask{
		{ID: 10, Title: "個人タスク", EstimatedHours: 2.0, DueDate: timePtr(start.AddDate(0, 0, 2))},
	}

	schedules, err := GenerateSchedule(nil, personalTasks, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(schedules) != 1 {
		t.Fatalf("expected 1 schedule, got %d", len(schedules))
	}
	slot := schedules[0].Slots[0]
	if slot.PersonalTaskID != 10 {
		t.Errorf("expected PersonalTaskID=10, got %d", slot.PersonalTaskID)
	}
	if slot.TaskID != 0 {
		t.Errorf("expected TaskID=0 for personal slot, got %d", slot.TaskID)
	}
	if !slot.IsPersonal() {
		t.Errorf("expected IsPersonal()=true")
	}
}

func TestGenerateSchedule_SkipsCompletedPersonalTasks(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	personalTasks := []model.PersonalTask{
		{ID: 10, Title: "完了済み", EstimatedHours: 2.0, IsCompleted: true},
		{ID: 11, Title: "未完了", EstimatedHours: 2.0, DueDate: timePtr(start.AddDate(0, 0, 1))},
	}

	schedules, err := GenerateSchedule(nil, personalTasks, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, sch := range schedules {
		for _, slot := range sch.Slots {
			if slot.PersonalTaskID == 10 {
				t.Errorf("completed personal task should not be scheduled")
			}
		}
	}
}

func TestGenerateSchedule_MixesBacklogAndPersonal(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	tasks := []model.Task{
		{ID: 1, IssueKey: "T-1", Priority: "高", EstimatedHours: 3.0, DueDate: timePtr(start.AddDate(0, 0, 1))},
	}
	personalTasks := []model.PersonalTask{
		{ID: 10, Title: "Pエッセンシャル", EstimatedHours: 2.0, DueDate: timePtr(start.AddDate(0, 0, 1))},
	}

	schedules, err := GenerateSchedule(tasks, personalTasks, start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	totalSlots := 0
	for _, sch := range schedules {
		totalSlots += len(sch.Slots)
	}
	if totalSlots != 2 {
		t.Errorf("expected 2 slots (1 backlog + 1 personal), got %d", totalSlots)
	}
}
