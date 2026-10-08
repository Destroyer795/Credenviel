package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeUserStore struct {
	users map[string]User
}

func (f *fakeUserStore) UpsertUser(ctx context.Context, ident Identity) (User, error) {
	u := User{
		ID:      "user-id-" + ident.EntraID,
		EntraID: ident.EntraID,
		Role:    ident.Role,
		Name:    ident.Name,
	}
	f.users[ident.EntraID] = u
	return u, nil
}

func TestAuth_MissingHeaders(t *testing.T) {
	store := &fakeUserStore{users: make(map[string]User)}
	middleware := Middleware(DevHeaderSource{}, store)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Missing all headers
	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}

	// Missing role
	req = httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("X-Dev-User", "user-123")
	req.Header.Set("X-Dev-Name", "John Doe")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestAuth_InvalidRole(t *testing.T) {
	store := &fakeUserStore{users: make(map[string]User)}
	middleware := Middleware(DevHeaderSource{}, store)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("X-Dev-User", "user-123")
	req.Header.Set("X-Dev-Role", "admin") // invalid; only issuer or student
	req.Header.Set("X-Dev-Name", "John Doe")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestAuth_Success(t *testing.T) {
	store := &fakeUserStore{users: make(map[string]User)}
	middleware := Middleware(DevHeaderSource{}, store)

	var capturedUser User
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := FromContext(r.Context())
		if !ok {
			t.Fatalf("expected user in context")
		}
		capturedUser = u
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("X-Dev-User", "entra-student-1")
	req.Header.Set("X-Dev-Role", "student")
	req.Header.Set("X-Dev-Name", "Jane Student")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	if capturedUser.Role != "student" || capturedUser.EntraID != "entra-student-1" {
		t.Errorf("unexpected user in context: %+v", capturedUser)
	}
}

func TestAuth_DefaultName(t *testing.T) {
	store := &fakeUserStore{users: make(map[string]User)}
	middleware := Middleware(DevHeaderSource{}, store)

	var capturedUser User
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := FromContext(r.Context())
		if !ok {
			t.Fatalf("expected user in context")
		}
		capturedUser = u
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("X-Dev-User", "entra-student-2")
	req.Header.Set("X-Dev-Role", "student")
	// X-Dev-Name omitted

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	if capturedUser.Name != "entra-student-2" {
		t.Errorf("expected name to default to entraID, got %s", capturedUser.Name)
	}
}
