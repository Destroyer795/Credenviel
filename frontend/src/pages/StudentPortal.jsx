import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createJob, uploadFileToBlob, listJobs, getJob } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'

export function StudentPortal() {
  const auth = useAuth()
  const fileInputRef = useRef(null)

  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadMessage, setUploadMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [selectedJobDetails, setSelectedJobDetails] = useState(null)

  // Fetch jobs for this student
  const fetchJobs = async () => {
    try {
      const data = await listJobs({}, auth)
      if (Array.isArray(data)) {
        setJobs(data)
      }
    } catch (err) {
      console.warn('Failed to fetch jobs:', err)
    } finally {
      setLoadingJobs(false)
    }
  }

  // Initial load + polling every 3 seconds
  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 3000)
    return () => clearInterval(interval)
  }, [auth.user])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        setErrorMessage('File size exceeds maximum allowed 4 MB limit.')
        return
      }
      setErrorMessage('')
      setSelectedFile(file)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        setErrorMessage('File size exceeds maximum allowed 4 MB limit.')
        return
      }
      setErrorMessage('')
      setSelectedFile(file)
    }
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile) return

    setUploading(true)
    setUploadProgress(10)
    setUploadMessage('Requesting secure Blob Storage SAS upload token...')
    setErrorMessage('')

    try {
      // 1. POST /api/v1/jobs to request job and SAS upload URL
      const jobRes = await createJob(
        {
          filename: selectedFile.name,
          contentType: selectedFile.type || 'application/pdf',
          sizeBytes: selectedFile.size,
        },
        auth
      )

      setUploadProgress(40)
      setUploadMessage('Streaming file directly to Azure Blob Storage...')

      // 2. PUT bytes directly to Blob SAS URL
      await uploadFileToBlob(jobRes.upload_url, selectedFile, (p) => {
        setUploadProgress(p)
      })

      setUploadProgress(100)
      setUploadMessage(`Success! Job ${jobRes.job_id.slice(0, 8)}... created and dispatched to processing queue.`)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

      // Refresh jobs list immediately
      setTimeout(fetchJobs, 500)
    } catch (err) {
      console.error('Upload failed:', err)
      setErrorMessage(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const inspectJob = async (jobId) => {
    try {
      const details = await getJob(jobId, auth)
      setSelectedJobDetails(details)
    } catch (err) {
      alert(`Could not load job details: ${err.message}`)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title" id="student-portal-title">
          🎓 Student Certificate Portal
        </h1>
        <p className="page-subtitle">
          Submit your academic certificates for automated OCR digitization, integrity checks, and tamper-evident sealing.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Upload Card */}
        <div className="glass-panel" id="upload-panel">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Upload Certificate
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Supported formats: PDF, PNG, JPG (Max 4 MB)
          </p>

          <form onSubmit={handleUploadSubmit}>
            <div
              className={`dropzone ${isDragging ? 'drag-active' : ''}`}
              id="file-dropzone"
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={handleFileChange}
                id="file-input-element"
              />
              <div className="dropzone-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>

              {selectedFile ? (
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '1rem', wordBreak: 'break-all' }}>
                    {selectedFile.name}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB • Click to change file
                  </div>
                </div>
              ) : (
                <div>
                  <div className="dropzone-title">Click to browse or drop file here</div>
                  <div className="dropzone-desc">Document bytes upload directly to Azure Storage</div>
                </div>
              )}
            </div>

            {errorMessage && (
              <div id="upload-error-msg" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 8, background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fda4af', fontSize: '0.85rem' }}>
                {errorMessage}
              </div>
            )}

            {uploadMessage && (
              <div id="upload-status-msg" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 8, background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#7dd3fc', fontSize: '0.85rem' }}>
                {uploadMessage}
              </div>
            )}

            {uploading && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  <span>Uploading to Azure...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--accent-cyan)', transition: 'width 0.2s' }} />
                </div>
              </div>
            )}

            <button
              type="submit"
              id="btn-submit-upload"
              className="btn btn-primary"
              disabled={!selectedFile || uploading}
              style={{ width: '100%', marginTop: '1.25rem' }}
            >
              {uploading ? 'Processing Direct Upload...' : 'Upload & Start Pipeline'}
            </button>
          </form>
        </div>

        {/* Live Tracker Table */}
        <div className="glass-panel" id="tracker-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>My Digitization Jobs</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Auto-refreshing status from Azure Service Bus & Worker pipeline
              </p>
            </div>
            <button
              id="btn-refresh-jobs"
              className="persona-btn"
              onClick={fetchJobs}
            >
              🔄 Refresh Now
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table" id="jobs-table">
              <thead>
                <tr>
                  <th>Job ID / File</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingJobs && jobs.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      Loading submissions...
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No certificates uploaded yet. Use the upload box on the left to submit your first document!
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} id={`job-row-${job.id}`}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{job.filename || 'Certificate'}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {job.id}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {job.created_at ? new Date(job.created_at).toLocaleTimeString() : 'Just now'}
                      </td>
                      <td>
                        <button
                          id={`btn-view-${job.id}`}
                          className="persona-btn"
                          onClick={() => inspectJob(job.id)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Detailed Job Drawer */}
          {selectedJobDetails && (
            <div className="glass-panel" style={{ marginTop: '1.5rem', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--border-highlight)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  Job Telemetry: {selectedJobDetails.id}
                </h3>
                <button
                  className="persona-btn"
                  onClick={() => setSelectedJobDetails(null)}
                >
                  ✕ Close
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Status</div>
                  <div style={{ marginTop: '0.25rem' }}><StatusBadge status={selectedJobDetails.status} /></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Raw Blob Storage Key</div>
                  <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginTop: '0.25rem', color: 'var(--accent-cyan)' }}>
                    {selectedJobDetails.raw_blob_key || 'raw-certificates/' + selectedJobDetails.id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>File Details</div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    {selectedJobDetails.filename} ({(selectedJobDetails.size_bytes / 1024).toFixed(1)} KB)
                  </div>
                </div>
              </div>

              {selectedJobDetails.status === 'processed' && (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8, padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>✓ Credential Digitized & Verified</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cryptographic proof has been published.</div>
                  </div>
                  <Link to={`/verify/${selectedJobDetails.id}`} className="btn btn-success" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                    View Public Proof 🛡️
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
