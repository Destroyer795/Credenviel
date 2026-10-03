package config

import "os"

// Config holds application configuration loaded from environment variables.
type Config struct {
	Port        string
	DatabaseURL string
	BlobURL     string
	QueueURL    string
	SignalRURL  string
	KeyVaultURL string
	// AuthBypass disables JWT checking for local development.
	AuthBypass bool
	// ConfidenceThreshold is the minimum confidence score before flagging needs_review.
	ConfidenceThreshold string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		Port:                getEnv("PORT", "8080"),
		DatabaseURL:         getEnv("DATABASE_URL", ""),
		BlobURL:             getEnv("BLOB_URL", ""),
		QueueURL:            getEnv("QUEUE_URL", ""),
		SignalRURL:          getEnv("SIGNALR_URL", ""),
		KeyVaultURL:         getEnv("KEY_VAULT_URL", ""),
		AuthBypass:          getEnv("AUTH_BYPASS", "false") == "true",
		ConfidenceThreshold: getEnv("CONFIDENCE_THRESHOLD", "0.85"),
	}
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}
