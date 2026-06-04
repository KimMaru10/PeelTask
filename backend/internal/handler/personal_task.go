package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/KimMaru10/Backnote/backend/internal/model"
	"github.com/KimMaru10/Backnote/backend/internal/store"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

const maxPersonalTaskTitleLen = 200
const maxPersonalTaskDescLen = 2000

type PersonalTaskHandler struct {
	db     *gorm.DB
	writer *store.DBWriter
}

func NewPersonalTaskHandler(db *gorm.DB, writer *store.DBWriter) *PersonalTaskHandler {
	return &PersonalTaskHandler{db: db, writer: writer}
}

func (h *PersonalTaskHandler) write(fn store.WriteFunc) error {
	if h.writer != nil {
		return h.writer.Do(fn)
	}
	return h.db.Transaction(fn)
}

type personalTaskRequest struct {
	Title               *string  `json:"title"`
	Description         *string  `json:"description"`
	DueDate             *string  `json:"dueDate"`
	EstimatedHours      *float64 `json:"estimatedHours"`
	ParentBacklogTaskID *uint    `json:"parentBacklogTaskId"`
	IsCompleted         *bool    `json:"isCompleted"`
	OrderIndex          *int     `json:"orderIndex"`
}

// List は個人タスクを一覧で返す。クエリパラメータ:
//   - completed=true|false: 完了状態でフィルタ。未指定は両方返す。
//   - parentTaskId=<id>: 親 Backlog 課題ID でフィルタ。
func (h *PersonalTaskHandler) List(c echo.Context) error {
	query := h.db.Model(&model.PersonalTask{}).Order("order_index ASC, created_at DESC")

	if completed := c.QueryParam("completed"); completed != "" {
		query = query.Where("is_completed = ?", completed == "true")
	}

	if parentIDStr := c.QueryParam("parentTaskId"); parentIDStr != "" {
		parentID, err := strconv.ParseUint(parentIDStr, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid parentTaskId"})
		}
		query = query.Where("parent_backlog_task_id = ?", parentID)
	}

	var tasks []model.PersonalTask
	if err := query.Find(&tasks).Error; err != nil {
		log.Printf("error: failed to list personal tasks: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch personal tasks"})
	}
	return c.JSON(http.StatusOK, tasks)
}

func (h *PersonalTaskHandler) Create(c echo.Context) error {
	var req personalTaskRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	title := ""
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
	}
	if title == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title is required"})
	}
	if len(title) > maxPersonalTaskTitleLen {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title is too long"})
	}

	task := model.PersonalTask{Title: title}

	if err := applyPersonalTaskUpdates(&task, req, true); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	if task.ParentBacklogTaskID != nil {
		if err := h.assertBacklogTaskExists(*task.ParentBacklogTaskID); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
	}

	if err := h.write(func(tx *gorm.DB) error {
		return tx.Create(&task).Error
	}); err != nil {
		store.LogSQLiteError(err, "personalTask.Create")
		log.Printf("error: failed to create personal task: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create personal task"})
	}
	return c.JSON(http.StatusCreated, task)
}

func (h *PersonalTaskHandler) Update(c echo.Context) error {
	id, err := parsePersonalTaskID(c)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	var req personalTaskRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	var task model.PersonalTask
	if err := h.db.First(&task, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "personal task not found"})
		}
		log.Printf("error: failed to fetch personal task %d: %v", id, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch personal task"})
	}

	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "title is required"})
		}
		if len(title) > maxPersonalTaskTitleLen {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "title is too long"})
		}
		task.Title = title
	}

	if err := applyPersonalTaskUpdates(&task, req, false); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	// 0 はクリア操作なのでチェック不要。0 以外の ID が来たときのみ親 Backlog 課題の存在を検証する。
	if req.ParentBacklogTaskID != nil && *req.ParentBacklogTaskID != 0 {
		if err := h.assertBacklogTaskExists(*req.ParentBacklogTaskID); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}
	}

	if err := h.write(func(tx *gorm.DB) error {
		return tx.Save(&task).Error
	}); err != nil {
		store.LogSQLiteError(err, "personalTask.Update")
		log.Printf("error: failed to update personal task %d: %v", id, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update personal task"})
	}
	return c.JSON(http.StatusOK, task)
}

func (h *PersonalTaskHandler) Delete(c echo.Context) error {
	id, err := parsePersonalTaskID(c)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	var rowsAffected int64
	err = h.write(func(tx *gorm.DB) error {
		result := tx.Delete(&model.PersonalTask{}, id)
		if result.Error != nil {
			return result.Error
		}
		rowsAffected = result.RowsAffected
		return nil
	})
	if err != nil {
		store.LogSQLiteError(err, "personalTask.Delete")
		log.Printf("error: failed to delete personal task %d: %v", id, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete personal task"})
	}
	if rowsAffected == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "personal task not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func parsePersonalTaskID(c echo.Context) (uint64, error) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}

// applyPersonalTaskUpdates は request 内の non-nil フィールドのみを task に反映する。
// is_completed は新規作成時は無条件に completed_at を同期、更新時は値が変化した場合のみ同期する。
func applyPersonalTaskUpdates(task *model.PersonalTask, req personalTaskRequest, isCreate bool) error {
	if req.Description != nil {
		desc := strings.TrimSpace(*req.Description)
		if len(desc) > maxPersonalTaskDescLen {
			return errors.New("description is too long")
		}
		task.Description = desc
	}

	if req.DueDate != nil {
		if *req.DueDate == "" {
			task.DueDate = nil
		} else {
			parsed, err := time.Parse(time.RFC3339, *req.DueDate)
			if err != nil {
				// 日付のみ "YYYY-MM-DD" もフォールバックで受ける。
				parsed, err = time.Parse("2006-01-02", *req.DueDate)
				if err != nil {
					return errors.New("invalid dueDate format")
				}
			}
			task.DueDate = &parsed
		}
	}

	if req.EstimatedHours != nil {
		if *req.EstimatedHours < 0 {
			return errors.New("estimatedHours must be non-negative")
		}
		task.EstimatedHours = *req.EstimatedHours
	}

	if req.ParentBacklogTaskID != nil {
		if *req.ParentBacklogTaskID == 0 {
			task.ParentBacklogTaskID = nil
		} else {
			id := *req.ParentBacklogTaskID
			task.ParentBacklogTaskID = &id
		}
	}

	if req.OrderIndex != nil {
		task.OrderIndex = *req.OrderIndex
	}

	if req.IsCompleted != nil {
		// 完了フラグが変わったら CompletedAt も追従させる。
		// 既存値と同じ場合は CompletedAt を保持する（再設定で時刻が更新されないように）。
		next := *req.IsCompleted
		if isCreate || next != task.IsCompleted {
			task.IsCompleted = next
			if next {
				now := time.Now()
				task.CompletedAt = &now
			} else {
				task.CompletedAt = nil
			}
		}
	}

	return nil
}

func (h *PersonalTaskHandler) assertBacklogTaskExists(taskID uint) error {
	var count int64
	if err := h.db.Model(&model.Task{}).Where("id = ?", taskID).Count(&count).Error; err != nil {
		return errors.New("failed to validate parent task")
	}
	if count == 0 {
		return errors.New("parent backlog task not found")
	}
	return nil
}
