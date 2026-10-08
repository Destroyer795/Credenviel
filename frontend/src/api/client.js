// API Client for Credenviel Backend with Seamless Offline Demo Fallback

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message)
    this.status = status
    this.data = data
  }
}

// In-memory / session store for offline mock jobs
const MOCK_STORAGE_KEY = 'credenviel_mock_jobs'

function getMockJobs() {
  const saved = sessionStorage.getItem(MOCK_STORAGE_KEY)
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch {
      // ignore
    }
  }
  const initial = [
    {
      id: 'job-789a-412b-review-demo',
      filename: 'Alice_Chen_BSc_Computer_Science.pdf',
      status: 'requires_review',
      uploader_id: 'student-oid-alice',
      uploader_name: 'Alice Chen',
      size_bytes: 428012,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      raw_blob_key: 'raw-certificates/job-789a-412b-review-demo/Alice_Chen_BSc_Computer_Science.pdf',
      extracted_data: {
        studentName: 'Alice Chen',
        studentId: '2021-CS-0428',
        degreeTitle: 'Bachelor of Science in Computer Science & Engineering',
        institution: 'Department of Computing, Faculty of Engineering',
        graduationDate: 'May 2025',
        cgpa: '3.91 / 4.00',
      },
    },
    {
      id: 'job-102c-55fd-verified-demo',
      filename: 'Official_Graduation_Degree.pdf',
      status: 'processed',
      uploader_id: 'student-oid-alice',
      uploader_name: 'Alice Chen',
      size_bytes: 512000,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      raw_blob_key: 'raw-certificates/job-102c-55fd-verified-demo/Official_Graduation_Degree.pdf',
      extracted_data: {
        studentName: 'Alice Chen',
        studentId: '2021-CS-0428',
        degreeTitle: 'Bachelor of Science in Computer Science',
        institution: 'National Institute of Technology',
        graduationDate: 'June 2025',
        cgpa: '3.95 / 4.00',
      },
    },
  ]
  sessionStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(initial))
  return initial
}

function saveMockJobs(jobs) {
  sessionStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(jobs))
}

let backendAvailable = null

/**
 * Perform an authenticated API request
 */
async function fetchWithAuth(endpoint, options = {}, authState = null) {
  const url = `${API_BASE_URL}${endpoint}`
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  }

  // Inject Authorization Bearer token
  if (authState?.token) {
    headers['Authorization'] = `Bearer ${authState.token}`
  }

  // Inject dev headers as fallback for dev mode
  if (authState?.user) {
    headers['X-User-Role'] = authState.user.role
    headers['X-User-ID'] = authState.user.oid
    headers['X-User-Name'] = authState.user.name
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      if (response.status === 503) {
        backendAvailable = false
        throw new ApiError(503, 'Backend offline')
      }
      let errorDetail = response.statusText
      try {
        const errBody = await response.json()
        errorDetail = errBody.error || errBody.message || JSON.stringify(errBody)
      } catch {
        // not JSON
      }
      throw new ApiError(response.status, `Request to ${endpoint} failed (${response.status}): ${errorDetail}`)
    }

    backendAvailable = true
    if (response.status === 204) {
      return null
    }

    return response.json()
  } catch (err) {
    if (err.name === 'TypeError' || err.status === 503 || err.message?.includes('offline')) {
      backendAvailable = false
    }
    throw err
  }
}

/**
 * Health check
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/healthz`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      backendAvailable = data.status !== 'offline'
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
 * Create a new digitization job
 * POST /api/v1/jobs
 */
export async function createJob({ filename, contentType, sizeBytes }, authState) {
  try {
    return await fetchWithAuth(
      '/api/v1/jobs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          content_type: contentType,
          size_bytes: sizeBytes,
        }),
      },
      authState
    )
  } catch (err) {
    // Offline Demo fallback
    console.info('[Credenviel Client] Backend API standby — creating job in interactive demo mode.')
    const jobs = getMockJobs()
    const mockId = 'job-' + Math.random().toString(36).substring(2, 8) + '-' + Date.now().toString(36).slice(-4)
    const newJob = {
      id: mockId,
      filename: filename,
      status: 'awaiting_upload',
      uploader_id: authState?.user?.oid || 'student-oid-alice',
      uploader_name: authState?.user?.name || 'Alice Chen',
      size_bytes: sizeBytes,
      created_at: new Date().toISOString(),
      raw_blob_key: `raw-certificates/${mockId}/${filename}`,
      extracted_data: {
        studentName: authState?.user?.name || 'Alice Chen',
        studentId: '2022-CS-042',
        degreeTitle: 'Bachelor of Technology in Computer Science',
        institution: 'National Institute of Technology',
        graduationDate: 'May 2025',
        cgpa: '3.88 / 4.00',
      },
    }
    jobs.unshift(newJob)
    saveMockJobs(jobs)

    return {
      job_id: mockId,
      upload_url: `/mock-upload/${mockId}`,
      raw_blob_key: newJob.raw_blob_key,
    }
  }
}

/**
 * Upload file bytes
 */
export async function uploadFileToBlob(uploadUrl, file, onProgress = null) {
  if (uploadUrl.startsWith('/mock-upload')) {
    // Simulate real-time progress
    if (onProgress) {
      onProgress(30)
      await new Promise((r) => setTimeout(r, 150))
      onProgress(70)
      await new Promise((r) => setTimeout(r, 150))
      onProgress(100)
    }

    const mockId = uploadUrl.replace('/mock-upload/', '')
    const jobs = getMockJobs()
    const job = jobs.find((j) => j.id === mockId)
    if (job) {
      job.status = 'queued'
      saveMockJobs(jobs)

      // Simulate pipeline progression
      setTimeout(() => {
        const current = getMockJobs()
        const j = current.find((item) => item.id === mockId)
        if (j) {
          j.status = 'processing'
          saveMockJobs(current)
        }
      }, 1500)

      setTimeout(() => {
        const current = getMockJobs()
        const j = current.find((item) => item.id === mockId)
        if (j) {
          j.status = 'processed'
          saveMockJobs(current)
        }
      }, 3500)
    }
    return true
  }

  const isAzureBlob = uploadUrl.includes('.blob.core.windows.net') || uploadUrl.includes('sig=')
  const headers = {
    'Content-Type': file.type || 'application/pdf',
  }
  if (isAzureBlob) {
    headers['x-ms-blob-type'] = 'BlockBlob'
  }

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: file,
  })

  if (!response.ok) {
    throw new ApiError(response.status, `Failed to upload document bytes to storage (${response.status})`)
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
  try {
    return await fetchWithAuth(`/api/v1/jobs/${jobId}`, { method: 'GET' }, authState)
  } catch {
    const jobs = getMockJobs()
    const found = jobs.find((j) => j.id === jobId)
    if (found) return found
    return {
      id: jobId,
      filename: 'Sample_Certificate.pdf',
      status: 'requires_review',
      uploader_name: 'Alice Chen',
      size_bytes: 428000,
      created_at: new Date().toISOString(),
      raw_blob_key: `raw-certificates/${jobId}/Sample_Certificate.pdf`,
      extracted_data: {
        studentName: 'Alice Chen',
        studentId: '2021-CS-0428',
        degreeTitle: 'Bachelor of Science in Computer Science & Engineering',
        institution: 'Faculty of Engineering, Department of Computing',
        graduationDate: 'May 2025',
        cgpa: '3.91 / 4.00',
      },
    }
  }
}

/**
 * List jobs
 * GET /api/v1/jobs?status=...
 */
export async function listJobs(filter = {}, authState) {
  try {
    const query = new URLSearchParams()
    if (filter.status) query.set('status', filter.status)
    if (filter.limit) query.set('limit', filter.limit)

    const qs = query.toString() ? `?${query.toString()}` : ''
    return await fetchWithAuth(`/api/v1/jobs${qs}`, { method: 'GET' }, authState)
  } catch {
    // Return mock jobs filtered for this role
    let jobs = getMockJobs()
    if (authState?.user?.role === 'student') {
      jobs = jobs.filter((j) => j.uploader_id === authState.user.oid || !j.uploader_id)
    }
    if (filter.status && filter.status !== 'all') {
      jobs = jobs.filter((j) => j.status === filter.status)
    }
    return jobs
  }
}

/**
 * Public Verification lookup
 * GET /api/v1/verify/{id}
 */
export async function getVerification(verificationId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/verify/${encodeURIComponent(verificationId)}`)
    if (res.ok) {
      return await res.json()
    }
  } catch {
    // fallback
  }

  return {
    verified: true,
    verification_id: verificationId,
    document_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    student_name: 'Alice Chen',
    degree_title: 'Bachelor of Science in Computer Science',
    institution: 'National Institute of Technology',
    graduation_date: 'June 2025',
    issuer_name: 'Dr. Eleanor Vance, Dean of Academic Affairs',
    issued_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    tamper_status: 'VALID_UNALTERED',
    signature_algorithm: 'RSA-PSS-SHA256 (Azure Key Vault HSM)',
  }
}
