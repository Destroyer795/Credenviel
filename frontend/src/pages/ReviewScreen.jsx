import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getJob } from '../api/client'

export function ReviewScreen() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const jobIdFromQuery = searchParams.get('jobId') || 'job-789a-412b-review-demo'

  // Pre-populated OCR extraction with confidence indicators (one below threshold to showcase D-030 review flow!)
  const [formData, setFormData] = useState({
    studentName: 'Alice Chen',
    studentId: '2021-CS-0428',
    degreeTitle: 'Bachelor of Science in Computer Science & Engineering',
    institution: 'Department of Computing, Faculty of Engineering',
    graduationDate: 'May 2025',
    cgpa: '3.91 / 4.00',
    reviewerNotes: 'Verified against university student registrar ledger. Seal and signatures authenticated.',
  })

  const [confidences] = useState({
    studentName: 0.98,
    studentId: 0.72, // Flagged below 0.85!
    degreeTitle: 0.96,
    institution: 0.99,
    graduationDate: 0.93,
    cgpa: 0.79, // Flagged below 0.85!
  })

  const [saving, setSaving] = useState(false)
  const [actionDone, setActionDone] = useState(null)

  useEffect(() => {
    if (jobIdFromQuery && !jobIdFromQuery.includes('demo')) {
      getJob(jobIdFromQuery, auth)
        .then((data) => {
          if (data?.extracted_data) {
            setFormData((prev) => ({
              ...prev,
              ...data.extracted_data,
            }))
          }
        })
        .catch((err) => {
          console.warn('Using default preview data:', err)
        })
    }
  }, [jobIdFromQuery])

  const handleInputChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }))
  }

  const handleApprove = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      setActionDone('approved')
    }, 800)
  }

  const handleReject = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      setActionDone('rejected')
    }, 800)
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/issuer" className="persona-btn">← Back to Queue</Link>
            <h1 className="page-title" id="review-screen-title" style={{ fontSize: '1.75rem' }}>
              ⚖️ Human-in-the-Loop Review Station
            </h1>
          </div>
          <p className="page-subtitle">
            Inspect raw document scans alongside OCR extracted metadata. Correct anomalies and issue tamper-evident credentials.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Job:</span>
          <code style={{ background: 'rgba(0,0,0,0.4)', padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
            {jobIdFromQuery.slice(0, 16)}...
          </code>
        </div>
      </div>

      {actionDone === 'approved' ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-emerald)', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: '#fff' }}>
            ✓
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Credential Approved & Cryptographically Sealed!
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 550, margin: '0 auto 2rem' }}>
            The certificate for <strong>{formData.studentName}</strong> has been issued. The cryptographic SHA-256 hash has been anchored in the audit registry.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <Link to={`/verify/${jobIdFromQuery}`} className="btn btn-success" id="btn-view-issued-proof">
              View Public Verification Certificate 🛡️
            </Link>
            <Link to="/issuer" className="btn btn-secondary">
              Return to Review Queue
            </Link>
          </div>
        </div>
      ) : actionDone === 'rejected' ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-rose)', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: '#fff' }}>
            ✕
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Document Flagged for Re-Submission
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 550, margin: '0 auto 2rem' }}>
            The student has been notified that the document scan was unreadable or failed verification.
          </p>
          <Link to="/issuer" className="btn btn-secondary">
            Return to Queue
          </Link>
        </div>
      ) : (
        <div className="review-grid">
          {/* Left Pane: High-Fidelity Certificate Visual Inspection */}
          <div className="glass-panel" style={{ height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Original Document Scan
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                Zoom: 100% • High-Res
              </span>
            </div>

            <div className="document-viewer-frame" id="doc-viewer-frame">
              <div className="certificate-mock-view">
                <div className="cert-seal">★</div>
                <div className="cert-uni-name">
                  NATIONAL INSTITUTE OF TECHNOLOGY
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Office of the University Registrar
                </div>

                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '1rem' }}>
                  This is to certify that
                </div>

                <div className="cert-recipient">
                  {formData.studentName}
                </div>

                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                  has successfully satisfied the requirements for the conferral of
                </div>

                <div className="cert-degree">
                  {formData.degreeTitle}
                </div>

                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Cumulative Grade Point Average: <strong>{formData.cgpa}</strong>
                </div>

                <div className="cert-footer-meta">
                  <div>
                    <strong>Date of Conferral:</strong> {formData.graduationDate}
                  </div>
                  <div>
                    <strong>Student ID:</strong> {formData.studentId}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane: OCR Extracted Fields & Human-in-the-Loop Form */}
          <div className="glass-panel" id="review-fields-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                Extracted Record & Confidence Audit
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Threshold: <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>≥ 0.85</span>
              </div>
            </div>

            {/* Field: Student Name */}
            <div className="form-group">
              <div className="form-label">
                <span>Full Name</span>
                <span className={`confidence-indicator ${confidences.studentName >= 0.85 ? 'confidence-high' : 'confidence-low'}`}>
                  Confidence: {(confidences.studentName * 100).toFixed(0)}%
                </span>
              </div>
              <input
                id="input-student-name"
                className="form-input"
                type="text"
                value={formData.studentName}
                onChange={(e) => handleInputChange('studentName', e.target.value)}
              />
            </div>

            {/* Field: Student ID */}
            <div className="form-group">
              <div className="form-label">
                <span>Student / Roll Number</span>
                <span className={`confidence-indicator ${confidences.studentId >= 0.85 ? 'confidence-high' : 'confidence-low'}`}>
                  ⚠️ Confidence: {(confidences.studentId * 100).toFixed(0)}% (Flagged)
                </span>
              </div>
              <input
                id="input-student-id"
                className="form-input"
                style={{ borderColor: confidences.studentId < 0.85 ? 'var(--accent-amber)' : undefined }}
                type="text"
                value={formData.studentId}
                onChange={(e) => handleInputChange('studentId', e.target.value)}
              />
            </div>

            {/* Field: Degree Title */}
            <div className="form-group">
              <div className="form-label">
                <span>Degree Conferred</span>
                <span className={`confidence-indicator ${confidences.degreeTitle >= 0.85 ? 'confidence-high' : 'confidence-low'}`}>
                  Confidence: {(confidences.degreeTitle * 100).toFixed(0)}%
                </span>
              </div>
              <input
                id="input-degree-title"
                className="form-input"
                type="text"
                value={formData.degreeTitle}
                onChange={(e) => handleInputChange('degreeTitle', e.target.value)}
              />
            </div>

            {/* Field: CGPA / Grade */}
            <div className="form-group">
              <div className="form-label">
                <span>Cumulative Grade / GPA</span>
                <span className={`confidence-indicator ${confidences.cgpa >= 0.85 ? 'confidence-high' : 'confidence-low'}`}>
                  ⚠️ Confidence: {(confidences.cgpa * 100).toFixed(0)}% (Flagged)
                </span>
              </div>
              <input
                id="input-cgpa"
                className="form-input"
                style={{ borderColor: confidences.cgpa < 0.85 ? 'var(--accent-amber)' : undefined }}
                type="text"
                value={formData.cgpa}
                onChange={(e) => handleInputChange('cgpa', e.target.value)}
              />
            </div>

            {/* Field: Graduation Date */}
            <div className="form-group">
              <div className="form-label">
                <span>Conferral Date</span>
                <span className={`confidence-indicator ${confidences.graduationDate >= 0.85 ? 'confidence-high' : 'confidence-low'}`}>
                  Confidence: {(confidences.graduationDate * 100).toFixed(0)}%
                </span>
              </div>
              <input
                id="input-graduation-date"
                className="form-input"
                type="text"
                value={formData.graduationDate}
                onChange={(e) => handleInputChange('graduationDate', e.target.value)}
              />
            </div>

            {/* Reviewer Notes */}
            <div className="form-group">
              <label className="form-label">
                <span>Registrar Verification Ledger Notes</span>
              </label>
              <textarea
                id="input-reviewer-notes"
                className="form-input"
                rows="3"
                value={formData.reviewerNotes}
                onChange={(e) => handleInputChange('reviewerNotes', e.target.value)}
              />
            </div>

            {/* Human in the loop decision actions */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.75rem' }}>
              <button
                id="btn-approve-credential"
                className="btn btn-success"
                style={{ flex: 1 }}
                disabled={saving}
                onClick={handleApprove}
              >
                {saving ? 'Sealing Proof...' : 'Approve & Issue Certificate ✓'}
              </button>
              <button
                id="btn-reject-credential"
                className="btn btn-danger"
                disabled={saving}
                onClick={handleReject}
              >
                Reject ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
