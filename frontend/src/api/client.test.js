import test from 'node:test'
import assert from 'node:assert/strict'

import { isSasUrlExpired, shouldRefreshUploadToken } from './client.js'

test('isSasUrlExpired returns true when SAS expiry is in the past', () => {
  const expiredUrl = 'https://example.blob.core.windows.net/raw-uploads/abc/file.png?se=2020-01-01T00:00:00Z&sig=test'
  assert.equal(isSasUrlExpired(expiredUrl), true)
})

test('isSasUrlExpired returns false when SAS expiry is still valid', () => {
  const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const validUrl = `https://example.blob.core.windows.net/raw-uploads/abc/file.png?se=${encodeURIComponent(futureDate)}&sig=test`
  assert.equal(isSasUrlExpired(validUrl), false)
})

test('shouldRefreshUploadToken retries browser fetch failures', () => {
  const validUrl = 'https://example.blob.core.windows.net/raw/file.png?se=2099-01-01T00%3A00%3A00Z'
  assert.equal(shouldRefreshUploadToken(new TypeError('Failed to fetch'), validUrl), true)
})
