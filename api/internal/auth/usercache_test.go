package auth

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type countingStore struct {
	calls atomic.Int32
	fail  atomic.Bool
}

func (s *countingStore) UpsertUser(ctx context.Context, ident Identity) (User, error) {
	s.calls.Add(1)
	if s.fail.Load() {
		return User{}, errors.New("db down")
	}
	return User{ID: "id-" + ident.ExternalID, ExternalID: ident.ExternalID, Role: ident.Role, Name: ident.Name}, nil
}

func TestCachedUserStore_SkipsWritesForUnchangedIdentity(t *testing.T) {
	inner := &countingStore{}
	c := NewCachedUserStore(inner, time.Minute, 100)
	ident := Identity{ExternalID: "u1", Role: "student", Name: "Alice"}
	for i := 0; i < 50; i++ {
		u, err := c.UpsertUser(context.Background(), ident)
		if err != nil || u.ID != "id-u1" {
			t.Fatalf("unexpected result: %+v %v", u, err)
		}
	}
	if n := inner.calls.Load(); n != 1 {
		t.Errorf("expected 1 database write, got %d", n)
	}
}

func TestCachedUserStore_ChangedRoleOrNameWritesImmediately(t *testing.T) {
	inner := &countingStore{}
	c := NewCachedUserStore(inner, time.Minute, 100)
	ctx := context.Background()
	c.UpsertUser(ctx, Identity{ExternalID: "u1", Role: "student", Name: "Alice"})
	promoted, _ := c.UpsertUser(ctx, Identity{ExternalID: "u1", Role: "issuer", Name: "Alice"})
	renamed, _ := c.UpsertUser(ctx, Identity{ExternalID: "u1", Role: "issuer", Name: "Alice Chen"})
	if inner.calls.Load() != 3 {
		t.Errorf("role/name changes must reach the database, got %d writes", inner.calls.Load())
	}
	if promoted.Role != "issuer" || renamed.Name != "Alice Chen" {
		t.Errorf("stale data returned: %+v %+v", promoted, renamed)
	}
}

func TestCachedUserStore_ExpiresAndDoesNotCacheErrors(t *testing.T) {
	inner := &countingStore{}
	c := NewCachedUserStore(inner, time.Minute, 100)
	clock := time.Now()
	c.now = func() time.Time { return clock }
	ident := Identity{ExternalID: "u1", Role: "student", Name: "Alice"}
	ctx := context.Background()

	inner.fail.Store(true)
	if _, err := c.UpsertUser(ctx, ident); err == nil {
		t.Fatal("expected error")
	}
	inner.fail.Store(false)
	c.UpsertUser(ctx, ident) // retried, not served from a cached failure
	c.UpsertUser(ctx, ident) // cached
	if inner.calls.Load() != 2 {
		t.Fatalf("expected 2 calls (failure + success), got %d", inner.calls.Load())
	}
	clock = clock.Add(2 * time.Minute)
	c.UpsertUser(ctx, ident) // expired
	if inner.calls.Load() != 3 {
		t.Errorf("expected re-sync after TTL, got %d calls", inner.calls.Load())
	}
}

func TestCachedUserStore_BoundedAndRaceFree(t *testing.T) {
	inner := &countingStore{}
	c := NewCachedUserStore(inner, time.Minute, 50)
	var wg sync.WaitGroup
	for g := 0; g < 20; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 500; i++ {
				uid := string(rune('a'+g)) + string(rune('a'+i%26)) + string(rune('a'+(i/26)%26))
				if _, err := c.UpsertUser(context.Background(), Identity{ExternalID: uid, Role: "student", Name: uid}); err != nil {
					t.Error(err)
				}
			}
		}(g)
	}
	wg.Wait()
	c.mu.Lock()
	size := len(c.entries)
	c.mu.Unlock()
	if size > 50 {
		t.Errorf("cache exceeded its bound: %d entries", size)
	}
}
