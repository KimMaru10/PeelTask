package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/KimMaru10/Backnote/backend/internal/model"
	"github.com/labstack/echo/v4"
)

func TestPersonalTaskCreate_Success(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	body := `{"title":"設計をまとめる","description":"叩き台を作る","estimatedHours":2}`
	req := httptest.NewRequest(http.MethodPost, "/api/personal-tasks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var task model.PersonalTask
	if err := json.Unmarshal(rec.Body.Bytes(), &task); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if task.Title != "設計をまとめる" {
		t.Errorf("title: got %q", task.Title)
	}
	if task.IsCompleted {
		t.Errorf("expected not completed by default")
	}
}

func TestPersonalTaskCreate_TitleRequired(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	body := `{"title":"   "}`
	req := httptest.NewRequest(http.MethodPost, "/api/personal-tasks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestPersonalTaskCreate_ParentNotFound(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	body := `{"title":"sub","parentBacklogTaskId":999}`
	req := httptest.NewRequest(http.MethodPost, "/api/personal-tasks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestPersonalTaskList_Filter(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	db.Create(&model.PersonalTask{Title: "todo-1"})
	db.Create(&model.PersonalTask{Title: "done-1", IsCompleted: true})

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/personal-tasks?completed=false", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.List(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var tasks []model.PersonalTask
	if err := json.Unmarshal(rec.Body.Bytes(), &tasks); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(tasks) != 1 || tasks[0].Title != "todo-1" {
		t.Errorf("expected only incomplete task, got %+v", tasks)
	}
}

func TestPersonalTaskUpdate_MarkCompletedSetsTimestamp(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	db.Create(&model.PersonalTask{Title: "todo"})

	e := echo.New()
	body := `{"isCompleted":true}`
	req := httptest.NewRequest(http.MethodPatch, "/api/personal-tasks/1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("1")

	if err := h.Update(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var task model.PersonalTask
	if err := db.First(&task, 1).Error; err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if !task.IsCompleted || task.CompletedAt == nil {
		t.Errorf("expected completed with timestamp, got %+v", task)
	}
}

func TestPersonalTaskUpdate_NotFound(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	body := `{"title":"x"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/personal-tasks/999", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("999")

	if err := h.Update(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestPersonalTaskUpdate_InvalidID(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	req := httptest.NewRequest(http.MethodPatch, "/api/personal-tasks/abc", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("abc")

	if err := h.Update(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestPersonalTaskDelete_Success(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	db.Create(&model.PersonalTask{Title: "todo"})

	e := echo.New()
	req := httptest.NewRequest(http.MethodDelete, "/api/personal-tasks/1", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("1")

	if err := h.Delete(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var count int64
	db.Model(&model.PersonalTask{}).Count(&count)
	if count != 0 {
		t.Errorf("expected 0 tasks, got %d", count)
	}
}

func TestPersonalTaskCreate_NegativeHoursRejected(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	body := `{"title":"x","estimatedHours":-1}`
	req := httptest.NewRequest(http.MethodPost, "/api/personal-tasks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestPersonalTaskCreate_InvalidDueDateRejected(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	body := `{"title":"x","dueDate":"not-a-date"}`
	req := httptest.NewRequest(http.MethodPost, "/api/personal-tasks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestPersonalTaskUpdate_ClearParentWithZero(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	parentID := uint(7)
	db.Create(&model.PersonalTask{Title: "with parent", ParentBacklogTaskID: &parentID})

	e := echo.New()
	body := `{"parentBacklogTaskId":0}`
	req := httptest.NewRequest(http.MethodPatch, "/api/personal-tasks/1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("1")

	if err := h.Update(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var task model.PersonalTask
	if err := db.First(&task, 1).Error; err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if task.ParentBacklogTaskID != nil {
		t.Errorf("expected parent cleared, got %v", *task.ParentBacklogTaskID)
	}
}

func TestPersonalTaskList_CompletedFilter(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	db.Create(&model.PersonalTask{Title: "todo"})
	db.Create(&model.PersonalTask{Title: "done", IsCompleted: true})

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/personal-tasks?completed=true", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.List(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}

	var tasks []model.PersonalTask
	if err := json.Unmarshal(rec.Body.Bytes(), &tasks); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(tasks) != 1 || tasks[0].Title != "done" {
		t.Errorf("expected only completed task, got %+v", tasks)
	}
}

func TestPersonalTaskDelete_NotFound(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	req := httptest.NewRequest(http.MethodDelete, "/api/personal-tasks/999", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("999")

	if err := h.Delete(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestPersonalTaskCreate_WithStartAndDueDate(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	body := `{"title":"range","startDate":"2026-06-10","dueDate":"2026-06-15"}`
	req := httptest.NewRequest(http.MethodPost, "/api/personal-tasks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var task model.PersonalTask
	if err := json.Unmarshal(rec.Body.Bytes(), &task); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if task.StartDate == nil {
		t.Errorf("expected startDate set, got nil")
	}
	if task.DueDate == nil {
		t.Errorf("expected dueDate set, got nil")
	}
}

func TestPersonalTaskCreate_StartAfterDueRejected(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	e := echo.New()
	body := `{"title":"bad","startDate":"2026-06-20","dueDate":"2026-06-15"}`
	req := httptest.NewRequest(http.MethodPost, "/api/personal-tasks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.Create(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestPersonalTaskUpdate_ClearStartDate(t *testing.T) {
	db := setupTestDB(t)
	h := NewPersonalTaskHandler(db, nil)

	start := time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC)
	db.Create(&model.PersonalTask{Title: "with start", StartDate: &start})

	e := echo.New()
	body := `{"startDate":""}`
	req := httptest.NewRequest(http.MethodPatch, "/api/personal-tasks/1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("1")

	if err := h.Update(c); err != nil {
		t.Fatalf("handler error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var task model.PersonalTask
	if err := db.First(&task, 1).Error; err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if task.StartDate != nil {
		t.Errorf("expected startDate cleared, got %v", *task.StartDate)
	}
}
