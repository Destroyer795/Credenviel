package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
)

type contextKey struct{}

var userContextKey = contextKey{}

// User represents an authenticated and provisioned user in the system.
type User struct {
	ID         string `json:"id"`
	ExternalID string `json:"external_id"` // Firebase UID (stored in the users.entra_id column)
	Role       string `json:"role"`        // "issuer" or "student"
	Name       string `json:"name"`
}

// Identity holds claims extracted by an IdentitySource.
type Identity struct {
	ExternalID string
	Role       string
	Name       string
}

// IdentitySource extracts caller identity from an HTTP request.
type IdentitySource interface {
	Identify(r *http.Request) (Identity, error)
}

// UserStore defines storage operations for users.
type UserStore interface {
	UpsertUser(ctx context.Context, ident Identity) (User, error)
}

// IdentityFunc adapts a function to the IdentitySource interface.
type IdentityFunc func(r *http.Request) (Identity, error)

func (f IdentityFunc) Identify(r *http.Request) (Identity, error) { return f(r) }

// DevHeaderSource extracts dev authentication headers.
type DevHeaderSource struct{}

func (d DevHeaderSource) Identify(r *http.Request) (Identity, error) {
	externalID := strings.TrimSpace(r.Header.Get("X-Dev-User"))
	role := strings.TrimSpace(r.Header.Get("X-Dev-Role"))
	name := strings.TrimSpace(r.Header.Get("X-Dev-Name"))

	if externalID == "" || role == "" {
		return Identity{}, errors.New("missing required dev auth headers (X-Dev-User, X-Dev-Role)")
	}

	if name == "" {
		name = externalID
	}

	if role != "issuer" && role != "student" {
		return Identity{}, errors.New("invalid X-Dev-Role: must be 'issuer' or 'student'")
	}

	return Identity{
		ExternalID: externalID,
		Role:       role,
		Name:       name,
	}, nil
}

// Middleware creates an HTTP middleware that extracts identity and provisions the user JIT.
func Middleware(src IdentitySource, users UserStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ident, err := src.Identify(r)
			if err != nil {
				http.Error(w, `{"error":"unauthorized","message":"`+err.Error()+`"}`, http.StatusUnauthorized)
				return
			}

			user, err := users.UpsertUser(r.Context(), ident)
			if err != nil {
				http.Error(w, `{"error":"internal_server_error","message":"failed to provision user"}`, http.StatusInternalServerError)
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// WithUser adds a User to context.
func WithUser(ctx context.Context, u User) context.Context {
	return context.WithValue(ctx, userContextKey, u)
}

// FromContext retrieves the authenticated User from context.
func FromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userContextKey).(User)
	return u, ok
}
