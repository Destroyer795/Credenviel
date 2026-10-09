// API Client for Credenviel Backend (Production Azure Pipeline)

const CLOUD_API_URL = 'https://ca-api-n2ivlk5gk235i.blackhill-c3a2b095.eastasia.azurecontainerapps.io'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || CLOUD_API_URL

export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message)
    this.status = status
    this.data = data
  }
}

let backendAvailable = true

/**
 * Perform an authenticated API request against the Azure Go API backend
 */
async function fetchWithAuth(endpoint, options = {}, authState = null) {
  const url = `${API_BASE_URL}${endpoint}`
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  }

  // Inject Authorization Bearer token (Entra ID or signed token)
  if (authState?.token) {
    headers['Authorization'] = `Bearer ${authState.token}`
  }

  // Inject context identity headers
  if (authState?.user) {
    const backendRole = authState.user.role === 'admin' ? 'issuer' : authState.user.role
    headers['X-Dev-Role'] = backendRole
    headers['X-Dev-User'] = authState.user.oid
    headers['X-Dev-Name'] = authState.user.name
    headers['X-User-Role'] = backendRole
    headers['X-User-ID'] = authState.user.oid
    headers['X-User-Name'] = authState.user.name
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      let errorDetail = response.statusText
      try {
        const errBody = await response.json()
        errorDetail = errBody.message || errBody.error || JSON.stringify(errBody)
      } catch {
        // Not JSON
      }
      throw new ApiError(response.status, `Request to ${endpoint} failed (${response.status}): ${errorDetail}`)
    }

    backendAvailable = true
    if (response.status === 204) {
      return null
    }

    return response.json()
  } catch (err) {
    if (err.name === 'TypeError' || err.status === 503 || err.message?.includes('Failed to fetch')) {
      backendAvailable = false
    }
    throw err
  }
}

/**
 * Health check endpoint
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/healthz`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      backendAvailable = data.status === 'ok'
      return backendAvailable
    }
    backendAvailable = false
    return false
  } catch {
    backendAvailable = false
    return false
  }
}

/**
 * Infer standard MIME type from filename extension
 */
export function inferContentType(filename, providedType = '') {
  const ext = (filename || '').split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    default:
      return providedType || 'application/pdf'
  }
}

/**
 * Create a new digitization job
 * POST /api/v1/jobs
 * Returns job ID, blob storage key, and temporary user-delegation SAS upload URL
 */
export async function createJob({ filename, contentType, sizeBytes }, authState) {
  const resolvedContentType = inferContentType(filename, contentType)

  const res = await fetchWithAuth(
    '/api/v1/jobs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        content_type: resolvedContentType,
        size_bytes: sizeBytes,
      }),
    },
    authState
  )

  return {
    job_id: res.job_id,
    upload_url: res.upload?.url || res.upload_url,
    raw_blob_key: res.blob_key || res.raw_blob_key,
    upload_headers: res.upload?.headers || {},
    status: res.status || 'awaiting_upload',
  }
}

/**
 * Direct file upload to Azure Blob Storage via signed user-delegation SAS URL
 */
export async function uploadFileToBlob(uploadUrl, file, onProgress = null, extraHeaders = {}) {
  if (!uploadUrl) {
    throw new ApiError(400, 'Invalid upload URL received from backend')
  }

  const isAzureBlob = uploadUrl.includes('.blob.core.windows.net') || uploadUrl.includes('sig=')
  const resolvedContentType = inferContentType(file.name, file.type)
  const headers = {
    'Content-Type': resolvedContentType,
    ...(extraHeaders || {}),
  }

  if (isAzureBlob) {
    headers['x-ms-blob-type'] = 'BlockBlob'
  }

  if (onProgress) {
    onProgress(20)
  }

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: file,
  })

  if (!response.ok) {
    throw new ApiError(response.status, `Failed to upload document bytes to storage (${response.status}): ${response.statusText}`)
  }

  if (onProgress) {
    onProgress(100)
  }

  return true
}

/**
 * Get job details
 * GET /api/v1/jobs/{id}
 */
export async function getJob(jobId, authState) {
  return await fetchWithAuth(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' }, authState)
}

/**
 * List jobs
 * GET /api/v1/jobs?status=...
 */
export async function listJobs(filter = {}, authState) {
  const query = new URLSearchParams()
  if (filter.status && filter.status !== 'all') query.set('status', filter.status)
  if (filter.limit) query.set('limit', filter.limit)

  const qs = query.toString() ? `?${query.toString()}` : ''
  return await fetchWithAuth(`/api/v1/jobs${qs}`, { method: 'GET' }, authState)
}

/**
 * Public Verification lookup
 * GET /api/v1/verify/{id}
 */
export async function getVerification(verificationId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/verify/${encodeURIComponent(verificationId)}`)
  if (!res.ok) {
    if (res.status === 429) {
      throw new ApiError(429, 'Rate limit exceeded: maximum 30 requests per minute from this IP address.')
    }
    if (res.status === 404) {
      throw new ApiError(404, 'No verified credential found matching this Public Verification ID.')
    }
    throw new ApiError(res.status, `Verification lookup failed (${res.status})`)
  }
  return await res.json()
}

/**
 * Negotiate SignalR connection credentials
 * POST /api/v1/signalr/negotiate
 */
export async function negotiateSignalR(authState) {
  try {
    return await fetchWithAuth('/api/v1/signalr/negotiate', { method: 'POST' }, authState)
  } catch (err) {
    console.warn('SignalR negotiation not active, relying on HTTP polling interval:', err)
    return null
  }
}

/**
 * Fetch review station details (job metadata, record, temporary 15-minute read SAS URL)
 * GET /api/v1/review/{jobId}
 */
export async function getReviewDetails(jobId, authState) {
  return await fetchWithAuth(`/api/v1/review/${encodeURIComponent(jobId)}`, { method: 'GET' }, authState)
}

/**
 * Resolve/confirm review with corrected fields and audit notes
 * POST /api/v1/review/{jobId}/resolve
 */
export async function resolveReview(jobId, payload, authState) {
  return await fetchWithAuth(
    `/api/v1/review/${encodeURIComponent(jobId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    authState
  )
}

/**
 * Reject submission (e.g. illegible scan, fraudulent seal)
 * POST /api/v1/review/{jobId}/reject
 */
export async function rejectReview(jobId, reason, authState) {
  return await fetchWithAuth(
    `/api/v1/review/${encodeURIComponent(jobId)}/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejection_reason: reason }),
    },
    authState
  )
}

/**
 * List all jobs in review queue
 * GET /api/v1/review
 */
export async function listReviewQueue(authState) {
  return await fetchWithAuth('/api/v1/review', { method: 'GET' }, authState)
}
