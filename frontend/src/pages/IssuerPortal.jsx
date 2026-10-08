import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { listJobs } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import {
  IconBuilding,
  IconScale,
  IconAlertTriangle,
  IconCheckCircle,
  IconActivity,
  IconEye,
} from '../components/Icons'

export function IssuerPortal() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [jobs, setJobs] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [loading, setLoading] = useState(true)

  const fetchJobs = async () => {
    try {
      const data = await listJobs({}, auth)
      if (Array.isArray(data)) {
        setJobs(data)
      }
    } catch (err) {
      console.warn('Failed to fetch issuer jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [auth.user])

  const filteredJobs = jobs.filter((j) => {
    if (filterStatus === 'all') return true
    if (filterStatus === 'requires_review' || filterStatus === 'needs_review') {
      return j.status === 'requires_review' || j.status === 'needs_review'
    }
    return j.status === filterStatus
  })

  const totalCount = jobs.length
  const reviewCount = jobs.filter((j) => j.status === 'requires_review' || j.status === 'needs_review').length
  const processedCount = jobs.filter((j) => j.status === 'processed').length
  const processingCount = jobs.filter((j) => j.status === 'processing' || j.status === 'queued').length

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
        <div>
          <h1 className="page-title" id="issuer-portal-title">
            <IconBuilding size={28} color="var(--ice-blue)" />
            <span>Issuer & Registrar Dashboard</span>
          </h1>
          <p className="page-subtitle">
            Manage academic credential digitization, audit OCR confidence levels, and resolve human-in-the-loop review queues.
          </p>
        </div>

        <Link to="/issuer/review" className="btn btn-primary" id="btn-quick-review">
          <IconScale size={16} />
          <span>Open Review Station</span>
        </Link>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <div className="glass-panel" id="metric-total">
          <div style={{ fontSize: '0.74rem', color: 'var(--slate-blue)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
            Total Submissions
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.25rem' }}>
            Across all enrolled departments
          </div>
        </div>

        <div className="glass-panel" id="metric-review" style={{ borderColor: reviewCount > 0 ? 'rgba(217, 119, 6, 0.4)' : 'var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--status-amber-text)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Requires Review
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
              Digitized & Issued
            </span>
            <IconCheckCircle size={15} color="var(--status-emerald)" />
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--status-emerald-text)', fontFamily: 'var(--font-mono)' }}>
            {processedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.25rem' }}>
            Sealed with cryptographic proofs
          </div>
        </div>

        <div className="glass-panel" id="metric-processing">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--soft-blue-dark)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              In Active Pipeline
            </span>
            <IconActivity size={15} color="var(--soft-blue)" />
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--soft-blue-dark)', fontFamily: 'var(--font-mono)' }}>
            {processingCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.25rem' }}>
            In Service Bus / Container App
          </div>
        </div>
      </div>

      {/* Review Queue Table */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Credential Registry</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Registrar review and audit management
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['all', 'requires_review', 'processed', 'processing'].map((statusKey) => (
              <button
                key={statusKey}
                id={`filter-${statusKey}`}
                className={`persona-btn ${filterStatus === statusKey ? 'active' : ''}`}
                style={filterStatus === statusKey ? { background: 'var(--ice-blue-deep)', color: '#fff', borderColor: 'var(--ice-blue)' } : {}}
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
                <th>Uploader / Student</th>
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
                    No jobs matching current filter.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id} id={`issuer-job-${job.id}`}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{job.filename || 'Academic Document'}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--slate-blue-light)' }}>
                        {job.id}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{job.uploader_name || 'Enrolled Student'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--slate-blue-light)' }}>{job.uploader_id || 'ID-verified'}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {job.created_at ? new Date(job.created_at).toLocaleDateString() : 'Recent'}
                    </td>
                    <td>
                      <button
                        id={`btn-review-${job.id}`}
                        className={`btn ${job.status === 'requires_review' || job.status === 'needs_review' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                        onClick={() => navigate(`/issuer/review?jobId=${job.id}`)}
                      >
                        {job.status === 'requires_review' || job.status === 'needs_review' ? (
                          <>
                            <IconScale size={13} />
                            <span>Review & Approve</span>
                          </>
                        ) : (
                          <>
                            <IconEye size={13} />
                            <span>Inspect</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
