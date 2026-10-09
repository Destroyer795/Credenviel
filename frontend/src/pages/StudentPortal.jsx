import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createJob, uploadFileToBlob, listJobs, getJob } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import { QRCode } from '../components/QRCode'
import {
  IconGraduationCap,
  IconCloudUpload,
  IconRefresh,
  IconEye,
  IconShield,
  IconCheckCircle,
  IconX,
  IconCopy,
  IconCheck,
} from '../components/Icons'

export function StudentPortal() {
  const auth = useAuth()
  const fileInputRef = useRef(null)

  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadMessage, setUploadMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [copied, setCopied] = useState(false)

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
      setUploadMessage(`Success: Job ${jobRes.job_id.slice(0, 8)}... created and dispatched to processing queue.`)
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
          <IconGraduationCap size={28} color="var(--ice-blue)" />
          <span>Student Certificate Portal</span>
        </h1>
        <p className="page-subtitle">
          Submit your academic certificates for automated OCR digitization, integrity checks, and tamper-evident sealing.
        </p>
      </div>

      {/* Verified Academic Credential & QR Code Showcase */}
      {(() => {
        const verifiedJob = jobs.find((j) => j.status === 'processed') || {
          id: 'job-102c-55fd-verified-demo',
          filename: 'Official_Graduation_Degree.pdf',
          status: 'processed',
        }

        return (
          <div
            className="glass-panel"
            style={{
              marginBottom: '2rem',
              background: '#FFFFFF',
              border: '1px solid #BFE3F2',
              padding: '1.5rem 1.75rem',
              boxShadow: '0 2px 10px rgba(37, 43, 50, 0.05)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                <QRCode
                  value={`${window.location.origin}/verify/${verifiedJob.id}`}
                  size={88}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.25rem' }}>
                    <IconCheckCircle size={15} color="var(--status-emerald)" />
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--status-emerald-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Issuer Verified Academic Credential
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
                    Bachelor of Science in Computer Science & Engineering
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)' }}>
                    Candidate: <strong>{auth.user?.name || 'Alice Chen'}</strong> • Roll No: <strong>2021-CS-0428</strong> • CGPA: <strong>3.91</strong>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--slate-blue-light)', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                    Public Verification ID: {verifiedJob.id}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '0.65rem' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  This is your official university verification record. Share your Public Verification Link or QR code with employers, embassies, and academic institutions.
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <Link
                    to={`/verify/${verifiedJob.id}`}
                    className="btn btn-primary"
                    style={{ fontSize: '0.82rem', padding: '0.45rem 0.95rem' }}
                  >
                    <IconShield size={14} />
                    <span>View Public Certificate</span>
                  </Link>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.82rem', padding: '0.45rem 0.95rem' }}
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/verify/${verifiedJob.id}`)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                  >
                    {copied ? (
                      <>
                        <IconCheck size={14} color="var(--status-emerald)" />
                        <span>Link Copied</span>
                      </>
                    ) : (
                      <>
                        <IconCopy size={14} />
                        <span>Copy Verification Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2rem', alignItems: 'start' }}>
        {/* Upload Card */}
        <div className="glass-panel" id="upload-panel">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
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
                <IconCloudUpload size={26} color="var(--slate-blue)" />
              </div>

              {selectedFile ? (
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--soft-blue-dark)', fontSize: '1rem', wordBreak: 'break-all' }}>
                    {selectedFile.name}
                  </div>
                  <div style={{ color: 'var(--text-sub)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB • Click to change file
                  </div>
                </div>
              ) : (
                <div>
                  <div className="dropzone-title">Click to browse or drop file here</div>
                  <div className="dropzone-desc">Document bytes upload directly to Azure Storage via SAS</div>
                </div>
              )}
            </div>

            {errorMessage && (
              <div id="upload-error-msg" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 8, background: 'var(--status-rose-tint)', border: '1px solid rgba(201, 59, 78, 0.3)', color: 'var(--status-rose-text)', fontSize: '0.85rem' }}>
                {errorMessage}
              </div>
            )}

            {uploadMessage && (
              <div id="upload-status-msg" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 8, background: 'var(--ice-blue-tint)', border: '1px solid var(--border-ice)', color: 'var(--soft-blue-dark)', fontSize: '0.85rem' }}>
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
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--ice-blue)', transition: 'width 0.2s' }} />
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>My Digitization Jobs</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Status synchronization from Azure Service Bus & Worker
              </p>
            </div>
            <button
              id="btn-refresh-jobs"
              className="persona-btn"
              onClick={fetchJobs}
            >
              <IconRefresh size={14} />
              <span>Refresh</span>
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
                      No certificates uploaded yet. Use the upload box to submit your first document.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} id={`job-row-${job.id}`}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{job.filename || 'Certificate'}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--slate-blue-light)' }}>
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
                          <IconEye size={13} />
                          <span>Details</span>
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
            <div className="glass-panel" style={{ marginTop: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-ice)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Job Telemetry: {selectedJobDetails.id}
                </h3>
                <button
                  className="persona-btn"
                  onClick={() => setSelectedJobDetails(null)}
                >
                  <IconX size={14} />
                  <span>Close</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--slate-blue)', textTransform: 'uppercase', fontWeight: 700 }}>Status</div>
                  <div style={{ marginTop: '0.25rem' }}><StatusBadge status={selectedJobDetails.status} /></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--slate-blue)', textTransform: 'uppercase', fontWeight: 700 }}>Blob Storage Key</div>
                  <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', marginTop: '0.25rem', color: 'var(--soft-blue-dark)' }}>
                    {selectedJobDetails.raw_blob_key || 'raw-certificates/' + selectedJobDetails.id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--slate-blue)', textTransform: 'uppercase', fontWeight: 700 }}>File Details</div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: 'var(--text-main)' }}>
                    {selectedJobDetails.filename} ({(selectedJobDetails.size_bytes / 1024).toFixed(1)} KB)
                  </div>
                </div>
              </div>

              {selectedJobDetails.status === 'processed' && (
                <div style={{ background: 'var(--status-emerald-tint)', border: '1px solid rgba(22, 128, 84, 0.3)', borderRadius: 10, padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <QRCode
                      value={`${window.location.origin}/verify/${selectedJobDetails.id}`}
                      size={64}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--status-emerald-text)', fontSize: '0.95rem' }}>
                        Credential Digitized & Verified
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>
                        Tamper-evident canonical SHA-256 seal published.
                      </div>
                    </div>
                  </div>
                  <Link to={`/verify/${selectedJobDetails.id}`} className="btn btn-success" style={{ fontSize: '0.82rem', padding: '0.45rem 0.95rem' }}>
                    <IconShield size={14} />
                    <span>View Public Proof & Certificate</span>
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
