package server

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// RateLimiter tracks request timestamps per client IP within a rolling time window.
type RateLimiter struct {
	mu      sync.Mutex
	limits  map[string][]time.Time
	maxReqs int
	window  time.Duration
}

// NewRateLimiter creates a new sliding window IP rate limiter.
func NewRateLimiter(maxReqs int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		limits:  make(map[string][]time.Time),
		maxReqs: maxReqs,
		window:  window,
	}
}

// Allow reports whether a request from ip is permitted within the rate limit.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	timestamps := rl.limits[ip]
	valid := timestamps[:0]
	for _, t := range timestamps {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.maxReqs {
		rl.limits[ip] = valid
		return false
	}

	valid = append(valid, now)
	rl.limits[ip] = valid
	return true
}

// Reset clears all recorded request counts (useful for testing).
func (rl *RateLimiter) Reset() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.limits = make(map[string][]time.Time)
}

// ExtractIP extracts the client IP address from proxy headers or remote address.
func (rl *RateLimiter) ExtractIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
		ip := strings.TrimSpace(xrip)
		if ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

// Wrap returns an http.Handler that enforces the rate limit before calling next.
func (rl *RateLimiter) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := rl.ExtractIP(r)
		if !rl.Allow(ip) {
			w.Header().Set("Retry-After", "60")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"rate_limited","message":"rate limit exceeded: maximum 30 requests per minute"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
