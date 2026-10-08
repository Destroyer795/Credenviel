package config

import (
	"os"
	"strconv"
)

// Config holds application configuration loaded from environment variables.
type Config struct {
	Host                string
	Port                string
	AppEnv              string
	AuthMode            string
	DatabaseURL         string
	BlobURL             string
	QueueURL            string
	SignalRURL          string
	KeyVaultURL         string
	InternalAPIKey      string
	MaxUploadBytes      int64
	PublicBaseURL       string
	LocalStorageRoot    string
	ConfidenceThreshold string
	StoreBackend        string
	StorageAccountName  string
	AzureClientID       string
}

// Load reads configuration using the provided environment lookup function.
func LoadWith(getenv func(string) string) *Config {
	maxUpload := int64(4194304) // 4MB default
	if val := getenv("MAX_UPLOAD_BYTES"); val != "" {
		if parsed, err := strconv.ParseInt(val, 10, 64); err == nil && parsed > 0 {
			maxUpload = parsed
		}
	}

	return &Config{
		Host:                getVal(getenv, "HOST", "127.0.0.1"),
		Port:                getVal(getenv, "PORT", "8080"),
		AppEnv:              getVal(getenv, "APP_ENV", "local"),
		AuthMode:            getVal(getenv, "AUTH_MODE", "dev"),
		DatabaseURL:         getVal(getenv, "DATABASE_URL", "postgres://credenviel:localdev@127.0.0.1:5433/credenviel?sslmode=disable"),
		BlobURL:             getVal(getenv, "BLOB_URL", "http://127.0.0.1:10000/devstoreaccount1"),
		QueueURL:            getVal(getenv, "QUEUE_URL", ""),
		SignalRURL:          getVal(getenv, "SIGNALR_URL", ""),
		KeyVaultURL:         getVal(getenv, "KEY_VAULT_URL", ""),
		InternalAPIKey:      getVal(getenv, "INTERNAL_API_KEY", ""),
		MaxUploadBytes:      maxUpload,
		PublicBaseURL:       getVal(getenv, "PUBLIC_BASE_URL", "http://127.0.0.1:8080"),
		LocalStorageRoot:    getVal(getenv, "LOCAL_STORAGE_ROOT", ".local-storage"),
		ConfidenceThreshold: getVal(getenv, "CONFIDENCE_THRESHOLD", "0.85"),
		StoreBackend:        getVal(getenv, "STORE_BACKEND", "local"),
		StorageAccountName:  getVal(getenv, "STORAGE_ACCOUNT_NAME", ""),
		AzureClientID:       getVal(getenv, "AZURE_CLIENT_ID", ""),
	}
}

// Load reads configuration from os.Getenv.
func Load() *Config {
	return LoadWith(os.Getenv)
}

func getVal(getenv func(string) string, key, fallback string) string {
	if val := getenv(key); val != "" {
		return val
	}
	return fallback
}
