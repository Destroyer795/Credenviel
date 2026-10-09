import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { listJobs, createJob, uploadFileToBlob, getJobPublicIdMapping } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import {
  IconBuilding,
  IconScale,
  IconAlertTriangle,
  IconCheckCircle,
  IconActivity,
  IconEye,
  IconCloudUpload,
  IconShield,
  IconCheck,
  IconRefresh,
} from '../components/Icons'

export function IssuerPortal() {
  const auth = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [jobs, setJobs] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [loading, setLoading] = useState(true)

  // Ingest Batch Upload state
  const [selectedFiles, setSelectedFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadErrors, setUploadErrors] = useState([])

  const fetchJobs = async () => {
    try {
      const data = await listJobs({}, auth)
      if (Array.isArray(data)) {
        const enriched = data.map((j) => ({
          ...j,
          filename: j.filename || (j.blob_key ? j.blob_key.split('/').pop() : 'Academic Document'),
        }))
        setJobs(enriched)
      }
    } catch (err) {
      console.warn('Failed to fetch issuer jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 4000)
    return () => clearInterval(interval)
  }, [auth.user])

  const handleFilesSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files])
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files])
    }
  }

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleBatchUpload = async () => {
    if (selectedFiles.length === 0) return
    setUploading(true)
    setUploadErrors([])

    let successCount = 0

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      setUploadStatus(`Ingesting file ${i + 1} of ${selectedFiles.length}: ${file.name}...`)

      try {
        // 1. Create job with issuer token (uploader_is_issuer = true)
        const jobRes = await createJob(
          {
            filename: file.name,
            contentType: file.type || 'application/pdf',
            sizeBytes: file.size,
          },
          auth
        )

        // 2. Upload file to SAS URL
        if (jobRes.upload_url) {
          await uploadFileToBlob(jobRes.upload_url, file)
        }

        successCount++
      } catch (err) {
        console.error(`Failed to ingest ${file.name}:`, err)
        setUploadErrors((prev) => [...prev, `${file.name}: ${err.message || 'Upload failed'}`])
      }
    }

    setUploadStatus(`Successfully ingested ${successCount} of ${selectedFiles.length} certificates.`)
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(false)
    fetchJobs()
  }

  const filteredJobs = jobs.filter((j) => {
    if (filterStatus === 'all') return true
    if (filterStatus === 'requires_review' || filterStatus === 'needs_review') {
      return j.status === 'requires_review' || j.status === 'needs_review'
    }
    if (filterStatus === 'processing') {
      return j.status === 'processing' || j.status === 'queued' || j.status === 'awaiting_upload'
    }
    return j.status === filterStatus
  })

  const totalCount = jobs.length
  const reviewCount = jobs.filter((j) => j.status === 'requires_review' || j.status === 'needs_review').length
  const processedCount = jobs.filter((j) => j.status === 'processed').length
  const processingCount = jobs.filter((j) => j.status === 'processing' || j.status === 'queued' || j.status === 'awaiting_upload').length

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
        <div>
          <h1 className="page-title" id="issuer-portal-title">
            <IconBuilding size={28} color="var(--ice-blue)" />
            <span>University Exam Cell Dashboard</span>
          </h1>
          <p className="page-subtitle">
            Bulk-upload and digitize archival degree records, audit OCR field confidence, and resolve the human-in-the-loop review station.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchJobs}
            title="Refresh jobs table"
          >
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
          <Link to="/issuer/review" className="btn btn-primary" id="btn-quick-review">
            <IconScale size={16} />
            <span>Review Station ({reviewCount})</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="glass-panel" id="metric-total">
          <div style={{ fontSize: '0.74rem', color: 'var(--slate-blue)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
            Total Registered
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.25rem' }}>
            Archived & incoming degrees
          </div>
        </div>

        <div className="glass-panel" id="metric-review" style={{ borderColor: reviewCount > 0 ? 'rgba(217, 119, 6, 0.4)' : 'var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--status-amber-text)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Pending Review
            </span>
            {reviewCount > 0 && <IconAlertTriangle size={15} color="var(--status-amber)" />}
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--status-amber-text)', fontFamily: 'var(--font-mono)' }}>
            {reviewCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.25rem' }}>
            Confidence below 0.85 threshold
          </div>
        </div>

        <div className="glass-panel" id="metric-processed">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--status-emerald-text)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Issuer Verified & Issued
            </span>
            <IconCheckCircle size={15} color="var(--status-emerald)" />
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--status-emerald-text)', fontFamily: 'var(--font-mono)' }}>
            {processedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.25rem' }}>
            Sealed with canonical SHA-256
          </div>
        </div>

        <div className="glass-panel" id="metric-processing">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--soft-blue-dark)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              OCR Ingest Pipeline
            </span>
            <IconActivity size={15} color="var(--soft-blue)" />
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--soft-blue-dark)', fontFamily: 'var(--font-mono)' }}>
            {processingCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.25rem' }}>
            Active processing queue
          </div>
        </div>
      </div>

      {/* Scenario A: Exam Cell Archival Ingest Dropzone */}
      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.18rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Historical Certificate & Scan Ingest (Primary Workflow)
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              Upload individual or batch archival scans. Because you are authenticated as the Exam Cell issuer, documents with confidence &ge; 0.85 are automatically marked <strong>issuer-verified</strong>.
            </p>
          </div>
          <span style={{ fontSize: '0.75rem', background: 'var(--bg-frost)', padding: '0.3rem 0.65rem', borderRadius: 6, color: 'var(--slate-blue-dark)', fontWeight: 600 }}>
            Role: Issuer (Auto-Verify Enabled)
          </span>
        </div>

        <div
          className={`dropzone-container ${isDragging ? 'drag-over' : ''}`}
          style={{
            border: isDragging ? '2px dashed var(--ice-blue)' : '2px dashed #CBD5E1',
            borderRadius: 10,
            padding: '2rem 1.5rem',
            textAlign: 'center',
            background: isDragging ? 'rgba(191, 227, 242, 0.12)' : '#FAF9F6',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            style={{ display: 'none' }}
            onChange={handleFilesSelect}
          />
          <IconCloudUpload size={36} color="var(--slate-blue)" />
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.5rem' }}>
            Click to browse or drop certificate scans here (Batch Ingest)
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Supports PDF, PNG, JPG scans up to 4 MB per document
          </div>
        </div>

        {/* Selected Files Queue */}
        {selectedFiles.length > 0 && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {selectedFiles.length} file(s) staged for ingest
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                onClick={() => setSelectedFiles([])}
              >
                Clear All
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '140px', overflowY: 'auto' }}>
              {selectedFiles.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: 6,
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.78rem',
                  }}
                >
                  <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    ({(f.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    type="button"
                    style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.85rem' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveFile(i)
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploading}
                onClick={handleBatchUpload}
                style={{ padding: '0.55rem 1.35rem' }}
              >
                <IconCloudUpload size={16} />
                <span>{uploading ? 'Ingesting Scans...' : `Ingest Batch (${selectedFiles.length} Scans)`}</span>
              </button>
              {uploadStatus && (
                <span style={{ fontSize: '0.82rem', color: 'var(--text-sub)' }}>
                  {uploadStatus}
                </span>
              )}
            </div>
          </div>
        )}

        {uploadErrors.length > 0 && (
          <div style={{ marginTop: '0.75rem', background: 'var(--status-rose-tint)', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.78rem', color: '#FDA4AF' }}>
            {uploadErrors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
      </div>

      {/* Review Queue & Registry Table */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>Credential Registry & Queue</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Official registry of digitized academic credentials and pending review items
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {['all', 'requires_review', 'processed', 'processing'].map((statusKey) => (
              <button
                key={statusKey}
                id={`filter-${statusKey}`}
                className={`btn ${filterStatus === statusKey ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}
                onClick={() => setFilterStatus(statusKey)}
              >
                {statusKey.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="data-table-container">
          <table className="data-table" id="issuer-jobs-table">
            <thead>
              <tr>
                <th>Job ID / Document</th>
                <th>Status</th>
                <th>Authority / Uploader</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    Loading credential registry...
                  </td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No jobs matching current filter. Use the upload box above to ingest records.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const needsReview = job.status === 'requires_review' || job.status === 'needs_review'
                  const isProcessed = job.status === 'processed'

                  return (
                    <tr key={job.id} id={`issuer-job-${job.id}`}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{job.filename || 'Academic Document'}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--slate-blue-light)' }}>
                          {job.id}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td>
                        <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                          {job.uploader_is_issuer ? (
                            <span style={{ color: 'var(--status-emerald-text)', fontWeight: 600 }}>
                              Exam Cell (Verified)
                            </span>
                          ) : (
                            job.uploader_name || 'Student Submission'
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--slate-blue-light)' }}>
                          {job.uploader_id || 'ID-verified'}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {job.created_at ? new Date(job.created_at).toLocaleDateString() : 'Recent'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {needsReview ? (
                            <button
                              id={`btn-review-${job.id}`}
                              className="btn btn-primary"
                              style={{ fontSize: '0.78rem', padding: '0.32rem 0.7rem' }}
                              onClick={() => navigate(`/issuer/review?jobId=${job.id}`)}
                            >
                              <IconScale size={13} />
                              <span>Review & Approve</span>
                            </button>
                          ) : isProcessed ? (
                            <Link
                              to={`/verify/${getJobPublicIdMapping(job.id) || job.id}`}
                              className="btn btn-success"
                              style={{ fontSize: '0.78rem', padding: '0.32rem 0.7rem' }}
                            >
                              <IconShield size={13} />
                              <span>View Proof & QR</span>
                            </Link>
                          ) : job.status === 'awaiting_upload' ? (
                            <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic', padding: '0.32rem 0.5rem' }}>
                              Upload Pending
                            </span>
                          ) : (
                            <button
                              id={`btn-inspect-${job.id}`}
                              className="btn btn-secondary"
                              style={{ fontSize: '0.78rem', padding: '0.32rem 0.7rem' }}
                              onClick={() => navigate(`/issuer/review?jobId=${job.id}`)}
                            >
                              <IconEye size={13} />
                              <span>{job.status === 'failed' ? 'View Failure' : 'Inspect Status'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
