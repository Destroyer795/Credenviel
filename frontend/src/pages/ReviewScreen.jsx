import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getReviewDetails, resolveReview, rejectReview, listReviewQueue } from '../api/client'
import {
  IconScale,
  IconCheckCircle,
  IconShield,
  IconXCircle,
  IconFileText,
  IconGraduationCap,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconExternalLink,
} from '../components/Icons'

export function ReviewScreen() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const requestedJobId = searchParams.get('jobId')
  const [queue, setQueue] = useState([])
  const [currentJobId, setCurrentJobId] = useState(requestedJobId || '')
  const [jobMeta, setJobMeta] = useState(null)
  const [readSasUrl, setReadSasUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionDone, setActionDone] = useState(null)
  const [resolvedResult, setResolvedResult] = useState(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('Illegible or corrupted document scan')
  const [activeViewerTab, setActiveViewerTab] = useState('scan')

  // Form data for extracted record
  const [formData, setFormData] = useState({
    name: 'Alice Chen',
    roll_number: '2021-CS-0428',
    register_number: 'REG-987654',
    degree: 'Bachelor of Science in Computer Science & Engineering',
    cgpa: '3.91',
    issue_date: '2025-05-15',
    marks: [
      { code: 'CS101', name: 'Intro to Programming', credits: '4', grade: 'A+', grade_points: '10' },
      { code: 'CS201', name: 'Data Structures', credits: '4', grade: 'A', grade_points: '9' },
      { code: 'CS301', name: 'Computer Networks', credits: '3', grade: 'B+', grade_points: '7' },
    ],
    reviewerNotes: 'Verified against university registrar ledger. Seal and signatures authenticated.',
  })

  // Confidence indicators per field
  const [confidences, setConfidences] = useState({
    threshold: 0.85,
    fields: {
      name: 0.98,
      roll_number: 0.72, // Flagged below 0.85
      register_number: 0.95,
      degree: 0.96,
      cgpa: 0.79, // Flagged below 0.85
      issue_date: 0.93,
    },
    marks: {},
  })

  // Load review queue on mount
  useEffect(() => {
    listReviewQueue(auth)
      .then((q) => {
        if (Array.isArray(q)) {
          setQueue(q)
          if (!requestedJobId && q.length > 0) {
            setCurrentJobId(q[0].id)
            setSearchParams({ jobId: q[0].id })
          }
        }
      })
      .catch((err) => console.warn('Failed to list review queue:', err))
  }, [auth])

  // Fetch job & record details when currentJobId changes
  useEffect(() => {
    const targetId = requestedJobId || currentJobId || 'job-789a-412b-review-demo'
    setCurrentJobId(targetId)
    setLoading(true)

    getReviewDetails(targetId, auth)
      .then((data) => {
        if (data?.job) {
          setJobMeta(data.job)
        }
        if (data?.read_sas_url) {
          setReadSasUrl(data.read_sas_url)
          setActiveViewerTab('scan')
        } else {
          setActiveViewerTab('mock')
        }

        if (data?.record) {
          const rec = data.record
          setFormData({
            name: rec.name || '',
            roll_number: rec.roll_number || '',
            register_number: rec.register_number || '',
            degree: rec.degree || '',
            cgpa: rec.cgpa || '',
            issue_date: rec.issue_date || '',
            marks: Array.isArray(rec.marks_json) ? rec.marks_json : [],
            reviewerNotes: 'Verified against university registrar ledger. Signatures authenticated.',
          })

          if (rec.confidence_json?.fields) {
            setConfidences({
              threshold: 0.85,
              fields: rec.confidence_json.fields,
              marks: rec.confidence_json.marks || {},
            })
          }
        }
      })
      .catch((err) => {
        console.warn('Review details fetch notice:', err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [currentJobId, requestedJobId, auth])

  const handleInputChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }))
  }

  const handleMarksChange = (idx, col, val) => {
    setFormData((prev) => {
      const updatedMarks = [...prev.marks]
      updatedMarks[idx] = { ...updatedMarks[idx], [col]: val }
      return { ...prev, marks: updatedMarks }
    })
  }

  const handleAddMarkRow = () => {
    setFormData((prev) => ({
      ...prev,
      marks: [...prev.marks, { code: '', name: '', credits: '', grade: '', grade_points: '' }],
    }))
  }

  const handleRemoveMarkRow = (idx) => {
    setFormData((prev) => ({
      ...prev,
      marks: prev.marks.filter((_, i) => i !== idx),
    }))
  }

  const handleJobSelect = (jobId) => {
    setCurrentJobId(jobId)
    setSearchParams({ jobId })
    setActionDone(null)
  }

  const handleApprove = async () => {
    setSaving(true)
    try {
      const payload = {
        name: formData.name,
        roll_number: formData.roll_number,
        register_number: formData.register_number,
        degree: formData.degree,
        cgpa: formData.cgpa,
        issue_date: formData.issue_date,
        marks_json: formData.marks,
        reviewer_notes: formData.reviewerNotes,
      }

      const res = await resolveReview(currentJobId, payload, auth)
      setResolvedResult(res)
      setActionDone('approved')
    } catch (err) {
      console.error('Failed to approve review:', err)
      alert(`Approval failed: ${err.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmReject = async () => {
    setSaving(true)
    try {
      await rejectReview(currentJobId, rejectionReason, auth)
      setShowRejectModal(false)
      setActionDone('rejected')
    } catch (err) {
      console.error('Failed to reject review:', err)
      alert(`Rejection failed: ${err.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-container">
      {/* Header with Navigation and Queue Selector */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/issuer" className="persona-btn">&larr; Back to Queue</Link>
            <h1 className="page-title" id="review-screen-title" style={{ fontSize: '1.75rem' }}>
              <IconScale size={24} color="var(--ice-blue)" />
              <span>Human-in-the-Loop Review Station</span>
            </h1>
          </div>
          <p className="page-subtitle">
            Inspect raw document scans alongside OCR extracted metadata. Correct anomalies and issue tamper-evident credentials.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {queue.length > 1 && (
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              value={currentJobId}
              onChange={(e) => handleJobSelect(e.target.value)}
            >
              {queue.map((item) => (
                <option key={item.id} value={item.id}>
                  Job: {item.id.slice(0, 12)}... ({item.filename || 'Scan'})
                </option>
              ))}
            </select>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Job:</span>
            <code style={{ background: 'rgba(0,0,0,0.4)', padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.8rem', color: 'var(--ice-blue-light)' }}>
              {currentJobId ? `${currentJobId.slice(0, 16)}...` : 'demo-review'}
            </code>
          </div>
        </div>
      </div>

      {/* Post-Action Confirmation States */}
      {actionDone === 'approved' ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--status-emerald)', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }}>
            <IconCheck size={32} />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Credential Approved & Cryptographically Sealed
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 600, margin: '0 auto 1.5rem' }}>
            The certificate for <strong>{formData.name}</strong> has been verified. The canonical SHA-256 hash has been recomputed and anchored in the audit registry.
          </p>

          {resolvedResult?.fields_hash && (
            <div style={{ maxWidth: 560, margin: '0 auto 2rem', textAlign: 'left' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--slate-blue-light)', marginBottom: '0.25rem', textTransform: 'uppercase', fontWeight: 700 }}>
                Recomputed Canonical Fields Hash:
              </div>
              <div className="mono-hash">{resolvedResult.fields_hash}</div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link to={`/verify/${currentJobId}`} className="btn btn-success" id="btn-view-issued-proof">
              <IconShield size={16} />
              <span>View Public Verification Certificate</span>
            </Link>
            <Link to="/issuer" className="btn btn-secondary">
              Return to Review Queue
            </Link>
          </div>
        </div>
      ) : actionDone === 'rejected' ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--status-rose)', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 0 20px rgba(244, 63, 94, 0.4)' }}>
            <IconX size={32} />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Document Submission Rejected
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 550, margin: '0 auto 1rem' }}>
            The document status was transitioned to <strong>Failed</strong> and the student has been notified to re-submit an official readable certificate.
          </p>
          <div style={{ maxWidth: 500, margin: '0 auto 2rem', background: 'var(--status-rose-tint)', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid rgba(244,63,94,0.3)', fontSize: '0.85rem', color: '#fda4af' }}>
            Reason: {rejectionReason}
          </div>
          <Link to="/issuer" className="btn btn-secondary">
            Return to Review Queue
          </Link>
        </div>
      ) : (
        <div className="review-grid">
          {/* Left Pane: High-Fidelity Document Visual Inspection */}
          <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className={`persona-btn ${activeViewerTab === 'scan' ? 'active' : ''}`}
                  style={activeViewerTab === 'scan' ? { background: 'var(--ice-blue-deep)', color: '#fff', borderColor: 'var(--ice-blue)' } : {}}
                  onClick={() => setActiveViewerTab('scan')}
                >
                  <IconFileText size={14} />
                  <span>Document Scan</span>
                </button>
                <button
                  type="button"
                  className={`persona-btn ${activeViewerTab === 'mock' ? 'active' : ''}`}
                  style={activeViewerTab === 'mock' ? { background: 'var(--ice-blue-deep)', color: '#fff', borderColor: 'var(--ice-blue)' } : {}}
                  onClick={() => setActiveViewerTab('mock')}
                >
                  <IconGraduationCap size={14} />
                  <span>Extracted Preview</span>
                </button>
              </div>

              {readSasUrl && (
                <a
                  href={readSasUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', color: 'var(--ice-blue-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <span>Open Scan in Tab</span>
                  <IconExternalLink size={12} />
                </a>
              )}
            </div>

            <div className="document-viewer-frame" id="doc-viewer-frame" style={{ flex: 1, padding: activeViewerTab === 'scan' && readSasUrl ? 0 : '1.5rem' }}>
              {activeViewerTab === 'scan' && readSasUrl ? (
                <iframe
                  src={readSasUrl}
                  title="Original Certificate Document"
                  style={{ width: '100%', height: '620px', border: 'none', borderRadius: 8, background: '#fff' }}
                />
              ) : (
                <div className="certificate-mock-view">
                  <div className="cert-seal">
                    <IconShield size={24} color="#ffffff" />
                  </div>
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
                    {formData.name || 'Candidate Name'}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                    has successfully satisfied the requirements for the conferral of
                  </div>

                  <div className="cert-degree">
                    {formData.degree || 'Degree Program'}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
                    Cumulative Grade Point Average: <strong>{formData.cgpa || 'N/A'}</strong>
                  </div>

                  {formData.marks && formData.marks.length > 0 && (
                    <div style={{ textAlign: 'left', margin: '0.75rem 0', fontSize: '0.7rem', color: '#475569' }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.2rem', color: '#334155' }}>Enrolled Courses & Credits:</div>
                      {formData.marks.slice(0, 3).map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #e2e8f0', padding: '0.15rem 0' }}>
                          <span>{m.code || `Course ${i + 1}`}: {m.name}</span>
                          <strong>Grade: {m.grade}</strong>
                        </div>
                      ))}
                      {formData.marks.length > 3 && (
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.2rem' }}>
                          + {formData.marks.length - 3} more course entries
                        </div>
                      )}
                    </div>
                  )}

                  <div className="cert-footer-meta">
                    <div>
                      <strong>Date:</strong> {formData.issue_date || 'N/A'}
                    </div>
                    <div>
                      <strong>Roll No:</strong> {formData.roll_number || 'N/A'}
                    </div>
                    <div>
                      <strong>Reg No:</strong> {formData.register_number || 'N/A'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {jobMeta?.blob_key && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--slate-blue-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Source Blob: <code>{jobMeta.blob_key}</code>
              </div>
            )}
          </div>

          {/* Right Pane: OCR Extracted Fields & Human-in-the-Loop Form */}
          <div className="glass-panel" id="review-fields-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Extracted Record & Confidence Audit
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Fields with confidence below 0.85 are highlighted in amber.
                </p>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Threshold: <span style={{ color: '#6ee7b7', fontWeight: 700 }}>&ge; {(confidences.threshold * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Field: Full Name */}
            <div className="form-group">
              <div className="form-label">
                <span>Student Full Name</span>
                <span className={`confidence-indicator ${(confidences.fields?.name ?? 1) >= confidences.threshold ? 'confidence-high' : 'confidence-low'}`}>
                  {(confidences.fields?.name ?? 1) < confidences.threshold && <IconAlertTriangle size={12} color="var(--status-amber)" />}
                  <span>Confidence: {((confidences.fields?.name ?? 1) * 100).toFixed(0)}%</span>
                </span>
              </div>
              <input
                id="input-student-name"
                className={`form-input ${(confidences.fields?.name ?? 1) < confidences.threshold ? 'input-flagged' : ''}`}
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>

            {/* Two-column layout for Roll & Register Number */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {/* Field: Roll Number */}
              <div className="form-group">
                <div className="form-label">
                  <span>Roll Number</span>
                  <span className={`confidence-indicator ${(confidences.fields?.roll_number ?? 1) >= confidences.threshold ? 'confidence-high' : 'confidence-low'}`}>
                    {(confidences.fields?.roll_number ?? 1) < confidences.threshold && <IconAlertTriangle size={12} color="var(--status-amber)" />}
                    <span>{((confidences.fields?.roll_number ?? 1) * 100).toFixed(0)}%</span>
                  </span>
                </div>
                <input
                  id="input-student-id"
                  className={`form-input ${(confidences.fields?.roll_number ?? 1) < confidences.threshold ? 'input-flagged' : ''}`}
                  type="text"
                  value={formData.roll_number}
                  onChange={(e) => handleInputChange('roll_number', e.target.value)}
                />
              </div>

              {/* Field: Register Number */}
              <div className="form-group">
                <div className="form-label">
                  <span>Register Number</span>
                  <span className={`confidence-indicator ${(confidences.fields?.register_number ?? 1) >= confidences.threshold ? 'confidence-high' : 'confidence-low'}`}>
                    {(confidences.fields?.register_number ?? 1) < confidences.threshold && <IconAlertTriangle size={12} color="var(--status-amber)" />}
                    <span>{((confidences.fields?.register_number ?? 1) * 100).toFixed(0)}%</span>
                  </span>
                </div>
                <input
                  id="input-register-number"
                  className={`form-input ${(confidences.fields?.register_number ?? 1) < confidences.threshold ? 'input-flagged' : ''}`}
                  type="text"
                  value={formData.register_number}
                  onChange={(e) => handleInputChange('register_number', e.target.value)}
                />
              </div>
            </div>

            {/* Field: Degree Title */}
            <div className="form-group">
              <div className="form-label">
                <span>Degree Conferred</span>
                <span className={`confidence-indicator ${(confidences.fields?.degree ?? 1) >= confidences.threshold ? 'confidence-high' : 'confidence-low'}`}>
                  {(confidences.fields?.degree ?? 1) < confidences.threshold && <IconAlertTriangle size={12} color="var(--status-amber)" />}
                  <span>Confidence: {((confidences.fields?.degree ?? 1) * 100).toFixed(0)}%</span>
                </span>
              </div>
              <input
                id="input-degree-title"
                className={`form-input ${(confidences.fields?.degree ?? 1) < confidences.threshold ? 'input-flagged' : ''}`}
                type="text"
                value={formData.degree}
                onChange={(e) => handleInputChange('degree', e.target.value)}
              />
            </div>

            {/* Two-column layout for CGPA & Issue Date */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {/* Field: CGPA / Grade */}
              <div className="form-group">
                <div className="form-label">
                  <span>CGPA / Grade</span>
                  <span className={`confidence-indicator ${(confidences.fields?.cgpa ?? 1) >= confidences.threshold ? 'confidence-high' : 'confidence-low'}`}>
                    {(confidences.fields?.cgpa ?? 1) < confidences.threshold && <IconAlertTriangle size={12} color="var(--status-amber)" />}
                    <span>Confidence: {((confidences.fields?.cgpa ?? 1) * 100).toFixed(0)}%</span>
                  </span>
                </div>
                <input
                  id="input-cgpa"
                  className={`form-input ${(confidences.fields?.cgpa ?? 1) < confidences.threshold ? 'input-flagged' : ''}`}
                  type="text"
                  value={formData.cgpa}
                  onChange={(e) => handleInputChange('cgpa', e.target.value)}
                />
              </div>

              {/* Field: Conferral / Issue Date */}
              <div className="form-group">
                <div className="form-label">
                  <span>Conferral Date (ISO)</span>
                  <span className={`confidence-indicator ${(confidences.fields?.issue_date ?? 1) >= confidences.threshold ? 'confidence-high' : 'confidence-low'}`}>
                    {(confidences.fields?.issue_date ?? 1) < confidences.threshold && <IconAlertTriangle size={12} color="var(--status-amber)" />}
                    <span>Confidence: {((confidences.fields?.issue_date ?? 1) * 100).toFixed(0)}%</span>
                  </span>
                </div>
                <input
                  id="input-graduation-date"
                  className={`form-input ${(confidences.fields?.issue_date ?? 1) < confidences.threshold ? 'input-flagged' : ''}`}
                  type="text"
                  placeholder="YYYY-MM-DD"
                  value={formData.issue_date}
                  onChange={(e) => handleInputChange('issue_date', e.target.value)}
                />
              </div>
            </div>

            {/* Tabular Marks Section */}
            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  <span>Tabular Transcript Marks ({formData.marks.length} courses)</span>
                </label>
                <button
                  type="button"
                  className="persona-btn"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                  onClick={handleAddMarkRow}
                >
                  + Add Course
                </button>
              </div>

              {formData.marks.length > 0 && (
                <div style={{ overflowX: 'auto', maxHeight: '180px', overflowY: 'auto' }}>
                  <table className="marks-editor-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Course Title</th>
                        <th style={{ width: '60px' }}>Credits</th>
                        <th style={{ width: '60px' }}>Grade</th>
                        <th style={{ width: '60px' }}>Points</th>
                        <th style={{ width: '30px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.marks.map((m, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              className="marks-cell-input"
                              value={m.code || ''}
                              placeholder="CS101"
                              onChange={(e) => handleMarksChange(idx, 'code', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="marks-cell-input"
                              value={m.name || ''}
                              placeholder="Course Name"
                              onChange={(e) => handleMarksChange(idx, 'name', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="marks-cell-input"
                              value={m.credits || ''}
                              placeholder="4"
                              onChange={(e) => handleMarksChange(idx, 'credits', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="marks-cell-input"
                              value={m.grade || ''}
                              placeholder="A"
                              onChange={(e) => handleMarksChange(idx, 'grade', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="marks-cell-input"
                              value={m.grade_points || ''}
                              placeholder="9"
                              onChange={(e) => handleMarksChange(idx, 'grade_points', e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleRemoveMarkRow(idx)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--status-rose)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                            >
                              <IconX size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Reviewer Notes */}
            <div className="form-group">
              <label className="form-label">
                <span>Registrar Verification Ledger Notes</span>
              </label>
              <textarea
                id="input-reviewer-notes"
                className="form-input"
                rows="2"
                value={formData.reviewerNotes}
                onChange={(e) => handleInputChange('reviewerNotes', e.target.value)}
              />
            </div>

            {/* Human in the loop decision actions */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
              <button
                id="btn-approve-credential"
                className="btn btn-success"
                style={{ flex: 1 }}
                disabled={saving || loading}
                onClick={handleApprove}
              >
                <IconCheck size={16} />
                <span>{saving ? 'Sealing & Anchoring Proof...' : 'Approve & Issue Certificate'}</span>
              </button>
              <button
                id="btn-reject-credential"
                className="btn btn-danger"
                disabled={saving || loading}
                onClick={() => setShowRejectModal(true)}
              >
                <IconX size={16} />
                <span>Reject</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: '#fda4af' }}>
              Reject Credential Submission
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Please specify the audit reason for rejecting this document scan. The job will be transitioned to <code>failed</code> status.
            </p>

            <div className="form-group">
              <label className="form-label">
                <span>Select Audit Reason:</span>
              </label>
              <select
                className="form-input"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              >
                <option value="Illegible or corrupted document scan">Illegible or corrupted document scan</option>
                <option value="Institutional seal or signature unverified">Institutional seal or signature unverified</option>
                <option value="Student details do not match university registrar ledger">Student details do not match registrar ledger</option>
                <option value="Discrepancy in course grades or cumulative GPA">Discrepancy in course grades or cumulative GPA</option>
                <option value="Suspected fraudulent alteration">Suspected fraudulent alteration</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Custom / Additional Notes:</span>
              </label>
              <input
                className="form-input"
                placeholder="Optional detailed reason..."
                onChange={(e) => {
                  if (e.target.value) setRejectionReason(e.target.value)
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowRejectModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                id="btn-confirm-reject"
                disabled={saving}
                onClick={handleConfirmReject}
              >
                {saving ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
