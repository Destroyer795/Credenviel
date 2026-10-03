package jobs

import (
	"errors"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	disallowedCharsRegex = regexp.MustCompile(`[^A-Za-z0-9._-]`)
	repeatedUnderscores  = regexp.MustCompile(`_+`)
)

var allowedExtensions = map[string]string{
	"pdf":  "application/pdf",
	"png":  "image/png",
	"jpg":  "image/jpeg",
	"jpeg": "image/jpeg",
}

// SanitizeAndValidate validates the upload filename, content type, and size.
// Returns the sanitized basename.
func SanitizeAndValidate(rawFilename, contentType string, sizeBytes, maxUploadBytes int64) (string, error) {
	if rawFilename == "" {
		return "", errors.New("filename is required")
	}
	if contentType == "" {
		return "", errors.New("content_type is required")
	}
	if sizeBytes <= 0 {
		return "", errors.New("size_bytes must be greater than 0")
	}
	if sizeBytes > maxUploadBytes {
		return "", errors.New("size_bytes exceeds maximum upload limit")
	}

	// 1. Basename after splitting on / and \
	clean := strings.ReplaceAll(rawFilename, "\\", "/")
	base := filepath.Base(clean)
	if base == "." || base == "/" || base == "" {
		return "", errors.New("invalid filename")
	}

	// 2. Replace characters outside [A-Za-z0-9._-] with _
	sanitized := disallowedCharsRegex.ReplaceAllString(base, "_")

	// 3. Collapse repeated underscores
	sanitized = repeatedUnderscores.ReplaceAllString(sanitized, "_")

	// 4. Strip leading dots
	sanitized = strings.TrimLeft(sanitized, ".")
	if sanitized == "" {
		return "", errors.New("filename cannot be empty after stripping leading dots")
	}

	// 5. Extract extension and validate
	dotIdx := strings.LastIndex(sanitized, ".")
	if dotIdx == -1 || dotIdx == len(sanitized)-1 {
		return "", errors.New("unsupported file extension: must be .pdf, .png, .jpg, or .jpeg")
	}

	ext := strings.ToLower(sanitized[dotIdx+1:])
	expectedContentType, ok := allowedExtensions[ext]
	if !ok {
		return "", errors.New("unsupported file extension: must be .pdf, .png, .jpg, or .jpeg")
	}

	// Validate content type matches
	normContentType := strings.ToLower(strings.TrimSpace(contentType))
	// Allow content-type with parameters like charset
	if idx := strings.Index(normContentType, ";"); idx != -1 {
		normContentType = strings.TrimSpace(normContentType[:idx])
	}
	if normContentType != expectedContentType {
		return "", errors.New("content_type does not match file extension")
	}

	// 6. Cap at 100 characters keeping the extension
	fullExt := "." + ext
	namePart := sanitized[:dotIdx]
	if len(sanitized) > 100 {
		maxNameLen := 100 - len(fullExt)
		if maxNameLen > len(namePart) {
			maxNameLen = len(namePart)
		}
		sanitized = namePart[:maxNameLen] + fullExt
	}

	return sanitized, nil
}
