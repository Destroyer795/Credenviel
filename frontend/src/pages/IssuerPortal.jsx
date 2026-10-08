import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { listJobs } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'

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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" id="issuer-portal-title">
            🏛️ Issuer & Registrar Dashboard
          </h1>
          <p className="page-subtitle">
            Manage academic credential digitization, audit OCR confidence levels, and resolve human-in-the-loop review queues.
          </p>
        </div>

        <Link to="/issuer/review" className="btn btn-primary" id="btn-quick-review">
          Open Review Station ⚖️
        </Link>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <div className="glass-panel" id="metric-total">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
            Total Submissions
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Across all enrolled departments
          </div>
        </div>

        <div className="glass-panel" id="metric-review" style={{ borderColor: reviewCount > 0 ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-subtle)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-amber)', textTransform: 'uppercase', fontWeight: 700 }}>
            Requires Review ⚠️
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--accent-amber)' }}>
            {reviewCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Confidence below 0.85 threshold
          </div>
        </div>

        <div className="glass-panel" id="metric-processed">
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', textTransform: 'uppercase', fontWeight: 700 }}>
            Digitized & Issued ✓
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--accent-emerald)' }}>
            {processedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Sealed with cryptographic proofs
          </div>
        </div>

        <div className="glass-panel" id="metric-processing">
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', fontWeight: 700 }}>
            In Active Pipeline
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--accent-cyan)' }}>
            {processingCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            In Service Bus / Container App
          </div>
        </div>
      </div>

      {/* Review Queue Table */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Credential Queue</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Registrar review and audit management
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['all', 'requires_review', 'processed', 'processing'].map((statusKey) => (
              <button
                key={statusKey}
                id={`filter-${statusKey}`}
                className={`persona-btn ${filterStatus === statusKey ? 'active' : ''}`}
                style={filterStatus === statusKey ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}}
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
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {job.id}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{job.uploader_name || 'Enrolled Student'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{job.uploader_id || 'ID-verified'}</div>
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
                        {job.status === 'requires_review' || job.status === 'needs_review' ? 'Review & Approve ⚠️' : 'Inspect'}
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
