package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/KimMaru10/Backnote/backend/internal/model"
	"github.com/KimMaru10/Backnote/backend/internal/store"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type TaskHandler struct {
	db     *gorm.DB
	writer *store.DBWriter
}

func NewTaskHandler(db *gorm.DB, writer *store.DBWriter) *TaskHandler {
	return &TaskHandler{db: db, writer: writer}
}

func (h *TaskHandler) write(fn store.WriteFunc) error {
	if h.writer != nil {
		return h.writer.Do(fn)
	}
	return h.db.Transaction(fn)
}

func (h *TaskHandler) GetTask(c echo.Context) error {
	id := c.Param("id")
	var task model.Task
	if err := h.db.First(&task, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "task not found"})
		}
		log.Printf("error: failed to fetch task %s: %v", id, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch task"})
	}
	return c.JSON(http.StatusOK, task)
}

func (h *TaskHandler) GetMemos(c echo.Context) error {
	taskID := c.Param("id")
	var memos []model.Memo
	if err := h.db.Where("task_id = ?", taskID).Order("created_at DESC").Find(&memos).Error; err != nil {
		log.Printf("error: failed to fetch memos for task %s: %v", taskID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to fetch memos"})
	}
	return c.JSON(http.StatusOK, memos)
}

func (h *TaskHandler) AddMemo(c echo.Context) error {
	taskID := c.Param("id")

	var task model.Task
	if err := h.db.First(&task, taskID).Error; err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "task not found"})
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	const maxMemoLength = 2000
	trimmed := strings.TrimSpace(req.Content)
	if trimmed == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "content is required"})
	}
	if len(trimmed) > maxMemoLength {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "content is too long (max 2000 chars)"})
	}
	req.Content = trimmed

	memo := model.Memo{
		TaskID:  task.ID,
		Content: req.Content,
	}
	if err := h.write(func(tx *gorm.DB) error {
		return tx.Create(&memo).Error
	}); err != nil {
		store.LogSQLiteError(err, "task.AddMemo")
		log.Printf("error: failed to create memo for task %s: %v", taskID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create memo"})
	}

	return c.JSON(http.StatusCreated, memo)
}

// AddWatch はタスクをウォッチ対象に追加する。
func (h *TaskHandler) AddWatch(c echo.Context) error {
	return h.setWatch(c, true)
}

// RemoveWatch はタスクをウォッチ対象から外す。
func (h *TaskHandler) RemoveWatch(c echo.Context) error {
	return h.setWatch(c, false)
}

// setWatch はタスクの is_watched フラグを更新する共通処理。AddWatch / RemoveWatch から委譲される。
func (h *TaskHandler) setWatch(c echo.Context, watched bool) error {
	taskIDStr := c.Param("id")
	taskID, parseErr := strconv.ParseUint(taskIDStr, 10, 64)
	if parseErr != nil || taskID == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid task id"})
	}
	var rowsAffected int64
	err := h.write(func(tx *gorm.DB) error {
		result := tx.Model(&model.Task{}).Where("id = ?", taskID).Update("is_watched", watched)
		if result.Error != nil {
			return result.Error
		}
		rowsAffected = result.RowsAffected
		return nil
	})
	if err != nil {
		store.LogSQLiteError(err, "task.setWatch")
		log.Printf("error: failed to set watch for task %d: %v", taskID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update watch"})
	}
	if rowsAffected == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "task not found"})
	}
	return c.JSON(http.StatusOK, map[string]bool{"isWatched": watched})
}

func (h *TaskHandler) DeleteMemo(c echo.Context) error {
	memoID := c.Param("memoId")
	var rowsAffected int64
	err := h.write(func(tx *gorm.DB) error {
		result := tx.Delete(&model.Memo{}, memoID)
		if result.Error != nil {
			return result.Error
		}
		rowsAffected = result.RowsAffected
		return nil
	})
	if err != nil {
		store.LogSQLiteError(err, "task.DeleteMemo")
		log.Printf("error: failed to delete memo %s: %v", memoID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to delete memo"})
	}
	if rowsAffected == 0 {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "memo not found"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}
