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

// ValidateTestDBTarget checks that both the database name and host are strictly local.
// It refuses execution against any database not named "credenviel_test" and any host not on localhost.
func ValidateTestDBTarget(dbName, host string) error {
	if err := ValidateTestDBName(dbName); err != nil {
		return err
	}
	trimmedHost := strings.ToLower(strings.TrimSpace(host))
	if trimmedHost == "" {
		trimmedHost = "localhost"
	}
	if trimmedHost != "localhost" && trimmedHost != "127.0.0.1" && trimmedHost != "::1" {
		return fmt.Errorf("SAFETY VIOLATION: refusing to run tests against remote database host '%s'; only localhost is permitted", trimmedHost)
	}
	return nil
}

