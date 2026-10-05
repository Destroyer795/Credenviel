package jobs

import (
	"regexp"
	"testing"
)

// UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y is [8, 9, a, b]
var uuidV4Regex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func TestUUIDv4_Bits(t *testing.T) {
	for i := 0; i < 100; i++ {
		u, err := NewUUIDv4()
		if err != nil {
			t.Fatalf("failed to generate UUID: %v", err)
		}

		if len(u) != 36 {
			t.Fatalf("expected length 36, got %d (%s)", len(u), u)
		}

		if !uuidV4Regex.MatchString(u) {
			t.Fatalf("UUID %q does not match RFC 4122 v4 pattern (version 4, variant 10xxxxxx)", u)
		}
	}
}
