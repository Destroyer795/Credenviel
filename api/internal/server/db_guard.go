package server

import (
	"fmt"
	"strings"
)

// PermittedTestDB is the only database permitted for automated testing.
const PermittedTestDB = "credenviel_test"

// ValidateTestDBName checks that a database name strictly matches the permitted test database.
// It refuses execution against "credenviel", "postgres", empty strings, or any other database.
func ValidateTestDBName(dbName string) error {
	trimmed := strings.TrimSpace(dbName)
	if trimmed == "" {
		return fmt.Errorf("SAFETY VIOLATION: database name cannot be empty")
	}
	if trimmed != PermittedTestDB {
		return fmt.Errorf("SAFETY VIOLATION: refusing to run tests against database '%s'; only '%s' is permitted", trimmed, PermittedTestDB)
	}
	return nil
}
