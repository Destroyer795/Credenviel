package normalizer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"sort"
	"strings"
	"time"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
)

var (
	// Matches any Unicode whitespace (equivalent to Python's \s+ in re module)
	whitespaceRegex = regexp.MustCompile(`[\s\p{Z}]+`)
	dateRegex       = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	lowerCaser      = cases.Lower(language.Und)
)

// MarksRow represents a single subject grade row in marks_json.
type MarksRow struct {
	SubjectCode   *string `json:"subject_code"`
	SubjectName   *string `json:"subject_name"`
	MarksObtained *string `json:"marks_obtained"`
	MaxMarks      *string `json:"max_marks"`
	Grade         *string `json:"grade"`
}

// CanonicalFields represents the normalized 7 core fields in exact canonical order.
type CanonicalFields struct {
	Name           *string    `json:"name"`
	RollNumber     *string    `json:"roll_number"`
	RegisterNumber *string    `json:"register_number"`
	Degree         *string    `json:"degree"`
	MarksJSON      []MarksRow `json:"marks_json"`
	CGPA           *string    `json:"cgpa"`
	IssueDate      *string    `json:"issue_date"`
}

// NormalizeString applies NFC -> collapse whitespace -> trim -> lower -> NFC.
// Empty or whitespace-only strings return nil.
func NormalizeString(val any) *string {
	if val == nil {
		return nil
	}
	var s string
	switch v := val.(type) {
	case *string:
		if v == nil {
			return nil
		}
		s = *v
	case string:
		s = v
	case fmt.Stringer:
		s = v.String()
	default:
		s = fmt.Sprintf("%v", v)
	}

	nfc := norm.NFC.String(s)
	collapsed := whitespaceRegex.ReplaceAllString(nfc, " ")
	trimmed := strings.TrimSpace(collapsed)
	lowered := lowerCaser.String(trimmed)
	res := norm.NFC.String(lowered)
	if res == "" {
		return nil
	}
	return &res
}

// NormalizeNumeric normalizes numeric fields (cgpa, marks_obtained, max_marks).
// Trims trailing zeroes, preserves plain decimal format. Non-numeric strings fall back to NormalizeString.
func NormalizeNumeric(val any) *string {
	if val == nil {
		return nil
	}
	var raw string
	switch v := val.(type) {
	case *string:
		if v == nil {
			return nil
		}
		raw = strings.TrimSpace(*v)
	case string:
		raw = strings.TrimSpace(v)
	case float64:
		raw = fmt.Sprintf("%v", v)
	case int, int64, int32:
		raw = fmt.Sprintf("%d", v)
	default:
		raw = strings.TrimSpace(fmt.Sprintf("%v", v))
	}

	if raw == "" {
		return nil
	}

	// Try parsing as big.Rat / decimal
	rat := new(big.Rat)
	if _, ok := rat.SetString(raw); ok {
		// Float string formatting without scientific notation
		prec := 12
		fStr := rat.FloatString(prec)
		if strings.Contains(fStr, ".") {
			fStr = strings.TrimRight(fStr, "0")
			fStr = strings.TrimRight(fStr, ".")
		}
		if fStr == "" || fStr == "-0" || fStr == "0" {
			zero := "0"
			return &zero
		}
		return &fStr
	}

	// Non-numeric string fallback
	return NormalizeString(raw)
}

// NormalizeDate standardizes dates to YYYY-MM-DD.
func NormalizeDate(val any) (*string, error) {
	if val == nil {
		return nil, nil
	}
	var s string
	switch v := val.(type) {
	case *string:
		if v == nil {
			return nil, nil
		}
		s = strings.TrimSpace(*v)
	case time.Time:
		res := v.Format("2006-01-02")
		return &res, nil
	case string:
		s = strings.TrimSpace(v)
	default:
		s = strings.TrimSpace(fmt.Sprintf("%v", v))
	}

	if s == "" {
		return nil, nil
	}

	if !dateRegex.MatchString(s) {
		return nil, fmt.Errorf("invalid date format %q: expected YYYY-MM-DD", s)
	}

	if _, err := time.Parse("2006-01-02", s); err != nil {
		return nil, fmt.Errorf("invalid calendar date %q: %w", s, err)
	}

	return &s, nil
}

// NormalizeMarksRow normalizes an individual row in the marks table.
func NormalizeMarksRow(row map[string]any) MarksRow {
	return MarksRow{
		SubjectCode:   NormalizeString(row["subject_code"]),
		SubjectName:   NormalizeString(row["subject_name"]),
		MarksObtained: NormalizeNumeric(row["marks_obtained"]),
		MaxMarks:      NormalizeNumeric(row["max_marks"]),
		Grade:         NormalizeString(row["grade"]),
	}
}

// CanonicalRowJSON renders the deterministic row JSON for tie-breaking during marks sort.
func CanonicalRowJSON(r MarksRow) string {
	b, _ := json.Marshal(r)
	return string(b)
}

// NormalizeMarks normalizes and sorts the marks array alphabetically by subject_code (null first).
func NormalizeMarks(val any) ([]MarksRow, error) {
	if val == nil {
		return nil, nil
	}

	var rawRows []map[string]any
	switch v := val.(type) {
	case []map[string]any:
		rawRows = v
	case []any:
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				rawRows = append(rawRows, m)
			}
		}
	case string:
		s := strings.TrimSpace(v)
		if s == "" {
			return nil, nil
		}
		if err := json.Unmarshal([]byte(s), &rawRows); err != nil {
			return nil, fmt.Errorf("invalid marks JSON: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported marks type %T", val)
	}

	rows := make([]MarksRow, len(rawRows))
	for i, r := range rawRows {
		rows[i] = NormalizeMarksRow(r)
	}

	// Sort rows by normalized subject_code (null first), ties broken by canonical row JSON string
	sort.SliceStable(rows, func(i, j int) bool {
		c1 := rows[i].SubjectCode
		c2 := rows[j].SubjectCode

		if c1 == nil && c2 == nil {
			return CanonicalRowJSON(rows[i]) < CanonicalRowJSON(rows[j])
		}
		if c1 == nil {
			return true
		}
		if c2 == nil {
			return false
		}
		if *c1 != *c2 {
			return *c1 < *c2
		}
		return CanonicalRowJSON(rows[i]) < CanonicalRowJSON(rows[j])
	})

	return rows, nil
}

// CanonicalizeFields normalizes all 7 canonical fields into CanonicalFields.
func CanonicalizeFields(raw map[string]any) (CanonicalFields, error) {
	marksVal := raw["marks_json"]
	if marksVal == nil {
		marksVal = raw["marks"]
	}
	marks, err := NormalizeMarks(marksVal)
	if err != nil {
		return CanonicalFields{}, err
	}

	date, err := NormalizeDate(raw["issue_date"])
	if err != nil {
		return CanonicalFields{}, err
	}

	return CanonicalFields{
		Name:           NormalizeString(raw["name"]),
		RollNumber:     NormalizeString(raw["roll_number"]),
		RegisterNumber: NormalizeString(raw["register_number"]),
		Degree:         NormalizeString(raw["degree"]),
		MarksJSON:      marks,
		CGPA:           NormalizeNumeric(raw["cgpa"]),
		IssueDate:      date,
	}, nil
}

// ToCanonicalJSON produces compact UTF-8 JSON with fixed key order.
func ToCanonicalJSON(raw map[string]any) (string, error) {
	cf, err := CanonicalizeFields(raw)
	if err != nil {
		return "", err
	}
	b, err := json.Marshal(cf)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ComputeFieldsHash returns the SHA-256 hex digest of the canonicalized fields.
func ComputeFieldsHash(raw map[string]any) (string, error) {
	canonicalJSON, err := ToCanonicalJSON(raw)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256([]byte(canonicalJSON))
	return hex.EncodeToString(h[:]), nil
}
