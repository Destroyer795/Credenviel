package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Destroyer795/Credenviel/api/internal/config"
	"github.com/Destroyer795/Credenviel/api/internal/db"
	"github.com/Destroyer795/Credenviel/api/internal/server"
	"github.com/Destroyer795/Credenviel/api/internal/storage"
)

// run validates configuration, initializes dependencies, and runs the HTTP server.
// It returns an error without binding a port if validation fails.
func run(ctx context.Context, getenv func(string) string) error {
	cfg := config.LoadWith(getenv)

	// Validation checks before binding any port:
	if cfg.InternalAPIKey == "" {
		return errors.New("INTERNAL_API_KEY must not be empty")
	}

	if cfg.AuthMode == "dev" {
		if cfg.AppEnv != "local" {
			return fmt.Errorf("AUTH_MODE=dev is only allowed when APP_ENV=local (got APP_ENV=%s)", cfg.AppEnv)
		}
	} else {
		return fmt.Errorf("unsupported AUTH_MODE=%q (only 'dev' is supported in Phase 1)", cfg.AuthMode)
	}

	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("database connection failed: %w", err)
	}
	defer database.Close()

	localStore, err := storage.NewLocalFS(cfg.LocalStorageRoot)
	if err != nil {
		return fmt.Errorf("storage initialization failed: %w", err)
	}

	signer := storage.NewLocalSigner(cfg.PublicBaseURL)

	srv := server.NewServer(cfg, database, database, localStore, signer)

	addr := net.JoinHostPort(cfg.Host, cfg.Port)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: srv.Handler(),
	}

	serverErr := make(chan error, 1)
	go func() {
		log.Printf("API server starting on http://%s", addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdownCtx)
	}
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := run(ctx, os.Getenv); err != nil {
		log.Fatalf("server terminated with error: %v", err)
	}
}
