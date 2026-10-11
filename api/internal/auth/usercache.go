package auth

import (
	"context"
	"sync"
	"time"
)

// CachedUserStore wraps a UserStore and skips the database upsert when the exact same
// identity (UID, role and name) was synced recently. Every authenticated request provisions
// the caller just-in-time; without this each request costs a write even when nothing changed.
//
// A changed role or name is a different cache key, so it always reaches the database
// immediately. The cache only bounds how often an unchanged identity is re-written.
type CachedUserStore struct {
	inner UserStore
	ttl   time.Duration
	max   int
	now   func() time.Time

	mu      sync.Mutex
	entries map[Identity]cachedUser
}

type cachedUser struct {
	user    User
	expires time.Time
}

// NewCachedUserStore caches up to maxEntries identities for ttl each.
func NewCachedUserStore(inner UserStore, ttl time.Duration, maxEntries int) *CachedUserStore {
	return &CachedUserStore{
		inner:   inner,
		ttl:     ttl,
		max:     maxEntries,
		now:     time.Now,
		entries: make(map[Identity]cachedUser),
	}
}

// UpsertUser returns the cached user for an unchanged identity, otherwise upserts via the inner store.
func (c *CachedUserStore) UpsertUser(ctx context.Context, ident Identity) (User, error) {
	now := c.now()

	c.mu.Lock()
	if e, ok := c.entries[ident]; ok && now.Before(e.expires) {
		c.mu.Unlock()
		return e.user, nil
	}
	c.mu.Unlock()

	user, err := c.inner.UpsertUser(ctx, ident)
	if err != nil {
		return User{}, err // failures are never cached
	}

	c.mu.Lock()
	if len(c.entries) >= c.max {
		// Bounded memory: drop everything rather than track recency. Entries simply re-sync.
		c.entries = make(map[Identity]cachedUser, c.max)
	}
	c.entries[ident] = cachedUser{user: user, expires: now.Add(c.ttl)}
	c.mu.Unlock()
	return user, nil
}
