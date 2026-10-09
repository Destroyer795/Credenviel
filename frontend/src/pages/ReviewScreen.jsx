import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getReviewDetails, resolveReview, rejectReview, listReviewQueue, saveJobPublicIdMapping } from '../api/client'
import { QRCode } from '../components/QRCode'
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
  IconSearch,
  IconRefresh,
  IconUpload,
} from '../components/Icons'

/**
 * Document Type display names
 */
const DOCUMENT_TYPE_LABELS = {
  grade_sheet: 'Semester Grade Sheet / Transcript',
  degree_certificate: 'Degree Certificate / Diploma',
  transfer_certificate: 'Transfer Certificate (TC)',
  bonafide_certificate: 'Bonafide Certificate',
  conduct_certificate: 'Conduct & Character Certificate',
  custom: 'Other Student Document',
}

/**
 * Realistic Physical Document Scan Viewer
 * Adapts to Grade Sheets, Degree Diplomas, Transfer Certificates, and Bonafide Certificates
 */
function PhysicalScanViewer({ formData, jobId, jobMeta, zoom = 1, includeMarks = true, documentType = 'grade_sheet', attributes = [] }) {
  const attrMap = {}
  if (Array.isArray(attributes)) {
    attributes.forEach((a) => {
      if (a.key) {
        attrMap[a.key.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')] = a.value
        attrMap[a.key.trim()] = a.value
      }
    })
  }

  const isTC = documentType === 'transfer_certificate'
  const isBonafide = documentType === 'bonafide_certificate'
  const isConduct = documentType === 'conduct_certificate'
  const isDegree = documentType === 'degree_certificate'
  const isGradeSheet = documentType === 'grade_sheet'

  return (
    <div
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'top center',
        transition: 'transform 0.15s ease',
        background: '#FAF6ED',
        color: '#2C2B29',
        border: '1px solid #D8CFC0',
        borderRadius: '4px',
        padding: '2.5rem 2rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08), inset 0 0 40px rgba(180, 160, 130, 0.12)',
        maxWidth: '560px',
        margin: '0 auto',
        fontFamily: "'Courier New', Courier, monospace",
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Stamp watermark */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '25px',
          border: '2px solid rgba(185, 28, 28, 0.65)',
          color: 'rgba(185, 28, 28, 0.75)',
          padding: '0.2rem 0.6rem',
          fontSize: '0.68rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          transform: 'rotate(-6deg)',
          borderRadius: 3,
        }}
      >
        {isTC ? 'TRANSFER RECORD ARCHIVE' : isBonafide ? 'BONAFIDE ARCHIVE' : isConduct ? 'CONDUCT ARCHIVE' : 'EXAM CELL ARCHIVE'}
      </div>

      {/* University Header */}
      <div style={{ textAlign: 'center', borderBottom: '2px double #8C8270', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', color: '#5A5346', textTransform: 'uppercase' }}>
          GOVERNMENT OF INDIA • HIGHER EDUCATION ARCHIVES
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.04em', margin: '0.25rem 0', fontFamily: 'serif', color: '#1E1D1A' }}>
          NATIONAL INSTITUTE OF TECHNOLOGY
        </div>
        <div style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#685F51' }}>
          {isTC ? 'Office of Academic Affairs • Student Transfer Cell' : 'Office of the Registrar & Controller of Examinations'}
        </div>
        <div style={{ marginTop: '0.35rem', fontWeight: 800, fontSize: '0.88rem', letterSpacing: '0.08em', color: '#881337', textTransform: 'uppercase' }}>
          {isTC ? 'TRANSFER CERTIFICATE' : isBonafide ? 'BONAFIDE CERTIFICATE' : isConduct ? 'CONDUCT & CHARACTER CERTIFICATE' : isDegree ? 'DEGREE CERTIFICATE' : 'GRADE REPORT & TRANSCRIPT'}
        </div>
      </div>

      {/* Certificate Body */}
      <div style={{ fontSize: '0.82rem', lineHeight: 1.6, textAlign: 'center', marginBottom: '1rem' }}>
        <p style={{ margin: '0 0 0.5rem 0' }}>This is to certify that</p>
        <div
          style={{
            fontSize: '1.2rem',
            fontWeight: 800,
            textDecoration: 'underline',
            margin: '0.4rem 0',
            fontFamily: 'serif',
            color: '#111827',
          }}
        >
          {formData.name || 'Candidate Name'}
        </div>
        <p style={{ margin: '0 0 0.35rem 0' }}>
          bearing Roll No. <strong>{formData.roll_number || '2021-CS-0428'}</strong> and Reg No. <strong>{formData.register_number || 'REG-987654'}</strong>
        </p>

        {isTC ? (
          <div style={{ textAlign: 'left', margin: '1rem 0', background: 'rgba(230, 220, 195, 0.4)', padding: '0.85rem', border: '1px solid #D2C7B6', borderRadius: 3 }}>
            <div style={{ marginBottom: '0.35rem' }}>
              <strong>Course / Class:</strong> {formData.degree || 'B.Tech in Computer Science & Engineering'}
            </div>
            <div style={{ marginBottom: '0.35rem' }}>
              <strong>Father&apos;s Name:</strong> {attrMap.father_name || attrMap.father_s_name || attrMap["Father's Name"] || 'Robert Doe'}
            </div>
            <div style={{ marginBottom: '0.35rem' }}>
              <strong>Date of Admission:</strong> {attrMap.date_of_admission || attrMap["Date of Admission"] || '2022-08-01'}
            </div>
            <div style={{ marginBottom: '0.35rem' }}>
              <strong>Date of Leaving:</strong> {attrMap.date_of_leaving || attrMap["Date of Leaving"] || '2026-05-30'}
            </div>
            <div style={{ marginBottom: '0.35rem' }}>
              <strong>Conduct &amp; Character:</strong> <strong>{attrMap.conduct || attrMap.character || attrMap["Conduct"] || 'Good'}</strong>
            </div>
            <div>
              <strong>Reason for Leaving:</strong> {attrMap.reason_for_leaving || attrMap["Reason for Leaving"] || 'Course Completed'}
            </div>
          </div>
        ) : isBonafide ? (
          <div style={{ margin: '0.75rem 0', textAlign: 'left', background: 'rgba(230, 220, 195, 0.35)', padding: '0.75rem', border: '1px solid #D2C7B6', borderRadius: 3 }}>
            <p style={{ margin: '0 0 0.4rem 0' }}>
              is a bonafide student of this Institute pursuing <strong>{formData.degree || 'B.Tech Program'}</strong>.
            </p>
            {attrMap.academic_year && <div><strong>Academic Year:</strong> {attrMap.academic_year}</div>}
            {attrMap.purpose && <div><strong>Purpose:</strong> {attrMap.purpose}</div>}
          </div>
        ) : isConduct ? (
          <div style={{ margin: '0.75rem 0', textAlign: 'left', background: 'rgba(230, 220, 195, 0.35)', padding: '0.75rem', border: '1px solid #D2C7B6', borderRadius: 3 }}>
            <p style={{ margin: '0 0 0.4rem 0' }}>
              has completed the program of <strong>{formData.degree || 'Undergraduate Study'}</strong>.
            </p>
            <div><strong>Conduct &amp; Character:</strong> <strong>{attrMap.conduct || 'Exemplary'}</strong></div>
          </div>
        ) : (
          <>
            <p style={{ margin: '0 0 0.5rem 0' }}>has fulfilled all curriculum requirements for the award of</p>
            <div
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                fontFamily: 'serif',
                color: '#1F2937',
                background: 'rgba(230, 220, 195, 0.4)',
                padding: '0.3rem 0.5rem',
                margin: '0.4rem 0',
                borderRadius: 2,
              }}
            >
              {formData.degree || 'Bachelor of Science in Computer Science & Engineering'}
            </div>
            {formData.cgpa && (
              <p style={{ margin: '0.5rem 0' }}>
                Cumulative Grade Point Average (CGPA): <strong>{formData.cgpa}</strong>
              </p>
            )}
          </>
        )}
      </div>

      {/* Marks Table Scan (Grade sheets only) */}
      {includeMarks && formData.marks && formData.marks.length > 0 && (
        <div style={{ margin: '1rem 0', border: '1px solid #BDB29F', background: '#F5EFE1', padding: '0.6rem', fontSize: '0.72rem' }}>
          <div style={{ fontWeight: 700, borderBottom: '1px solid #C8BDAB', paddingBottom: '0.2rem', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Official Ledger Grades Summary:
          </div>
          {formData.marks.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0', borderBottom: i < formData.marks.length - 1 ? '1px dotted #D2C7B6' : 'none' }}>
              <span>{m.code || `SUBJ-${i + 1}`} - {m.name}</span>
              <span>Credits: {m.credits || '4'} | <strong>Grade: {m.grade || 'A'}</strong></span>
            </div>
          ))}
        </div>
      )}

      {/* Custom Attributes on Scan */}
      {!isTC && attributes.length > 0 && (
        <div style={{ margin: '0.75rem 0', padding: '0.5rem', background: '#F5EFE1', border: '1px dotted #BDB29F', fontSize: '0.7rem', textAlign: 'left' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem', textTransform: 'uppercase' }}>Additional Verified Attributes:</div>
          {attributes.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.1rem 0' }}>
              <span style={{ color: '#5A5346' }}>{a.key}:</span>
              <strong>{a.value}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Footer Signatures and Physical Seal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '1.75rem', paddingTop: '1rem', borderTop: '1px solid #C8BDAB' }}>
        <div style={{ textAlign: 'left', fontSize: '0.72rem' }}>
          <div><strong>Date of Issue:</strong> {formData.issue_date || '2025-05-15'}</div>
          <div><strong>Ledger Folio:</strong> NIT-CONV-2025/892</div>
          <div style={{ fontSize: '0.65rem', color: '#786F60', marginTop: '0.25rem' }}>Scan ID: {jobId ? jobId.slice(0, 16) : 'PENDING-SCAN'}</div>
        </div>

        {/* Physical Blue Stamp / Signature */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '2px solid rgba(30, 64, 175, 0.7)',
              color: 'rgba(30, 64, 175, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.55rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              margin: '0 auto 0.25rem',
              transform: 'rotate(-4deg)',
              background: 'rgba(30, 64, 175, 0.04)',
            }}
          >
            <div>REGISTRAR</div>
            <div style={{ fontSize: '0.45rem' }}>EXAM CELL</div>
            <div>SEAL</div>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#1E3A8A', fontStyle: 'italic', fontFamily: 'serif' }}>
            Prof. K. R. Sharma
          </div>
          <div style={{ fontSize: '0.65rem', color: '#5A5346' }}>Controller of Examinations</div>
        </div>
      </div>
    </div>
  )
}

/**
 * High-Density Digital Credential Extracted Preview
 * Embeds official digital certificate format, live form values, and verifiable QR code
 */
function DigitalExtractedPreview({ formData, jobId, verifyUrl, includeMarks = true, documentType = 'grade_sheet', attributes = [] }) {
  const isTC = documentType === 'transfer_certificate'
  const isBonafide = documentType === 'bonafide_certificate'
  const isConduct = documentType === 'conduct_certificate'
  const isGradeSheet = documentType === 'grade_sheet'

  const certTitle = isTC
    ? 'Official Transfer Certificate'
    : isBonafide
    ? 'Student Bonafide Certificate'
    : isConduct
    ? 'Conduct & Character Certificate'
    : documentType === 'degree_certificate'
    ? 'Degree Certificate'
    : 'Verified Academic Transcript'

  return (
    <div className="certificate-mock-view" style={{ maxWidth: '540px', margin: '0 auto', textAlign: 'center', background: '#FFFFFF', padding: '2.5rem 2rem', border: '8px double #CBD5E1', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
      {/* University Digital Seal */}
      <div className="cert-seal" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--text-main)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
        <IconShield size={22} color="#FFFFFF" />
      </div>

      <div className="cert-uni-name" style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-main)', textTransform: 'uppercase' }}>
        NATIONAL INSTITUTE OF TECHNOLOGY
      </div>
      <div style={{ fontSize: '0.72rem', color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
        {certTitle} • Institutional Registry
      </div>

      <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.25rem' }}>
        This certifies that
      </div>

      <div className="cert-recipient" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', borderBottom: '1px dashed #CBD5E1', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
        {formData.name || 'Candidate Name'}
      </div>

      <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.25rem' }}>
        {isTC ? 'was a recognized student in the program:' : isBonafide ? 'is currently enrolled in the academic program:' : 'has successfully fulfilled the prescribed curriculum of:'}
      </div>

      <div className="cert-degree" style={{ fontSize: '1rem', fontWeight: 700, color: '#1E293B', marginBottom: '0.75rem' }}>
        {formData.degree || 'Academic Program'}
      </div>

      {formData.cgpa && !isTC && !isBonafide && !isConduct && (
        <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '1rem' }}>
          Cumulative Grade Point Average: <strong>{formData.cgpa}</strong>
        </div>
      )}

      {/* Flexible Attributes Badges */}
      {attributes && attributes.length > 0 && (
        <div style={{ textAlign: 'left', margin: '0.85rem 0', background: 'var(--bg-frost)', padding: '0.75rem 1rem', borderRadius: 6, fontSize: '0.75rem', color: '#334155' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
            Verified Document Records:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.4rem' }}>
            {attributes.map((a, i) => (
              <div key={i} style={{ background: '#FFFFFF', padding: '0.35rem 0.6rem', borderRadius: 4, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ color: '#64748B', fontWeight: 500 }}>{a.key}:</span>
                <strong style={{ color: '#0F172A' }}>{a.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extracted Course Marks */}
      {includeMarks && formData.marks && formData.marks.length > 0 && (
        <div style={{ textAlign: 'left', margin: '0.85rem 0', background: 'var(--bg-frost)', padding: '0.65rem 0.85rem', borderRadius: 6, fontSize: '0.72rem', color: '#334155' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-main)' }}>
            Verified Course Transcripts ({formData.marks.length} courses):
          </div>
          {formData.marks.slice(0, 3).map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #E2E8F0', padding: '0.2rem 0' }}>
              <span>{m.code || `Course ${i + 1}`}: {m.name}</span>
              <strong>Grade: {m.grade}</strong>
            </div>
          ))}
          {formData.marks.length > 3 && (
            <div style={{ fontSize: '0.68rem', color: '#64748B', textAlign: 'center', marginTop: '0.25rem' }}>
              + {formData.marks.length - 3} more transcript entries
            </div>
          )}
        </div>
      )}

      {/* Certificate Footer with Live QR Code */}
      <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1rem', marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
        <div style={{ fontSize: '0.72rem', color: '#64748B', lineHeight: 1.5 }}>
          <div><strong>Conferred:</strong> {formData.issue_date || 'N/A'}</div>
          <div><strong>Roll No:</strong> {formData.roll_number || 'N/A'}</div>
          <div><strong>Reg No:</strong> {formData.register_number || 'N/A'}</div>
          <div style={{ marginTop: '0.35rem', color: 'var(--status-emerald-text)', fontWeight: 600 }}>
            • Confirmed by Exam Cell Staff
          </div>
        </div>

        {/* Live Verifiable QR Code */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <QRCode value={verifyUrl} size={88} />
          <div style={{ fontSize: '0.62rem', color: '#64748B', marginTop: '0.25rem', fontWeight: 600 }}>
            Scan to Verify
          </div>
        </div>
      </div>
    </div>
  )
}


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
  const [activeViewerTab, setActiveViewerTab] = useState('scan') // 'scan' | 'preview' | 'split'
  const [zoomLevel, setZoomLevel] = useState(1)
  const [includeMarks, setIncludeMarks] = useState(false)
  const [publicVerificationId, setPublicVerificationId] = useState('')
  const [documentType, setDocumentType] = useState('grade_sheet')
  const [attributes, setAttributes] = useState([])

  // Form data for extracted record (defaults to empty so real documents are not masked)
  const [formData, setFormData] = useState({
    name: '',
    roll_number: '',
    register_number: '',
    degree: '',
    cgpa: '',
    issue_date: '',
    marks: [],
    reviewerNotes: 'Verified against university registrar ledger. Signatures authenticated.',
  })

  // Confidence indicators per field
  const [confidences, setConfidences] = useState({
    threshold: 0.85,
    fields: {},
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
    const targetId = requestedJobId || currentJobId || (queue.length > 0 ? queue[0].id : null)
    if (!targetId) {
      setCurrentJobId(null)
      setLoading(false)
      return
    }
    setCurrentJobId(targetId)
    setLoading(true)

    getReviewDetails(targetId, auth)
      .then((data) => {
        if (data?.job) {
          setJobMeta(data.job)
        }
        if (data?.read_sas_url) {
          setReadSasUrl(data.read_sas_url)
        }

        if (data?.record) {
          const rec = data.record
          if (rec.public_verification_id) {
            setPublicVerificationId(rec.public_verification_id)
            saveJobPublicIdMapping(targetId, rec.public_verification_id)
          }

          const recDocType = rec.document_type || 'grade_sheet'
          setDocumentType(recDocType)

          const hasMarks = Array.isArray(rec.marks_json) && rec.marks_json.length > 0
          setIncludeMarks(hasMarks)

          if (rec.attributes_json && typeof rec.attributes_json === 'object') {
            const attrList = Object.entries(rec.attributes_json).map(([k, v], idx) => ({
              id: `attr_${idx}_${k}`,
              key: k,
              value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
            }))
            setAttributes(attrList)
          } else {
            setAttributes([])
          }

          setFormData({
            name: rec.name || '',
            roll_number: rec.roll_number || '',
            register_number: rec.register_number || '',
            degree: rec.degree || '',
            cgpa: rec.cgpa || '',
            issue_date: rec.issue_date || '',
            marks: hasMarks ? rec.marks_json : [],
            reviewerNotes: rec.corrections_json?.notes || 'Verified against university registrar ledger. Signatures authenticated.',
          })

          if (rec.confidence_json?.fields) {
            setConfidences({
              threshold: rec.confidence_json.threshold || 0.85,
              fields: rec.confidence_json.fields,
              marks: rec.confidence_json.marks || {},
            })
          }
        } else {
          // If no record exists yet (e.g. queued, awaiting_upload, or failed)
          setDocumentType('grade_sheet')
          setAttributes([])
          setIncludeMarks(false)
          setFormData({
            name: '',
            roll_number: '',
            register_number: '',
            degree: '',
            cgpa: '',
            issue_date: '',
            marks: [],
            reviewerNotes: '',
          })
          setConfidences({
            threshold: 0.85,
            fields: {},
            marks: {},
          })
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

  const handleAddAttribute = (key = '', value = '') => {
    setAttributes((prev) => [
      ...prev,
      { id: `attr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, key, value },
    ])
  }

  const handleUpdateAttribute = (id, field, val) => {
    setAttributes((prev) =>
      prev.map((attr) => (attr.id === id ? { ...attr, [field]: val } : attr))
    )
  }

  const handleRemoveAttribute = (id) => {
    setAttributes((prev) => prev.filter((attr) => attr.id !== id))
  }

  const handleJobSelect = (jobId) => {
    setCurrentJobId(jobId)
    setSearchParams({ jobId })
    setActionDone(null)
  }

  const handleApprove = async () => {
    if (jobMeta?.status !== 'needs_review') {
      alert(`Approval disabled: this job is currently in "${jobMeta?.status || 'unknown'}" status. Only documents in "needs_review" status require manual human approval.`)
      return
    }

    setSaving(true)
    try {
      const attrsObj = {}
      attributes.forEach(({ key, value }) => {
        const k = (key || '').trim()
        if (k) {
          attrsObj[k] = (value || '').trim()
        }
      })

      const isNonDegree = ['transfer_certificate', 'bonafide_certificate', 'conduct_certificate'].includes(documentType)

      const payload = {
        document_type: documentType,
        name: formData.name,
        roll_number: formData.roll_number,
        register_number: formData.register_number,
        degree: formData.degree,
        cgpa: isNonDegree ? '' : formData.cgpa,
        issue_date: formData.issue_date,
        marks_json: includeMarks ? formData.marks : [],
        attributes_json: attrsObj,
        reviewer_notes: formData.reviewerNotes,
      }

      const res = await resolveReview(currentJobId, payload, auth)
      setResolvedResult(res)
      if (res?.public_verification_id) {
        setPublicVerificationId(res.public_verification_id)
        saveJobPublicIdMapping(currentJobId, res.public_verification_id)
      }
      setActionDone('approved')
    } catch (err) {
      console.error('Failed to approve review:', err)
      alert(`Approval failed: ${err.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }


  const handleConfirmReject = async () => {
    if (jobMeta?.status !== 'needs_review') {
      alert(`Rejection disabled: this job is currently in "${jobMeta?.status || 'unknown'}" status.`)
      return
    }

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

  const isImageBlob =
    readSasUrl &&
    (/\.(png|jpe?g|webp|gif)($|\?)/i.test(readSasUrl) ||
      (jobMeta?.filename && /\.(png|jpe?g|webp|gif)$/i.test(jobMeta.filename)))

  const targetVerifyId = publicVerificationId || currentJobId
  const verifyUrl = typeof window !== 'undefined' && targetVerifyId
    ? `${window.location.origin}/verify/${encodeURIComponent(targetVerifyId)}`
    : `https://credenviel.ac.in/verify/${encodeURIComponent(targetVerifyId || '')}`

  return (
    <div className="page-container">
      {/* Header with Navigation and Queue Selector */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/issuer" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              &larr; Exam Cell Queue
            </Link>
            <h1 className="page-title" id="review-screen-title" style={{ fontSize: '1.65rem' }}>
              <IconScale size={24} color="var(--slate-blue)" />
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
            <span style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>Target Job:</span>
            <code style={{ background: 'var(--bg-frost)', padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.8rem', color: 'var(--slate-blue-dark)', border: '1px solid var(--border-subtle)' }}>
              {currentJobId ? `${currentJobId.slice(0, 16)}...` : 'None (Queue Clear)'}
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
            <Link to={`/verify/${publicVerificationId || currentJobId}`} className="btn btn-success" id="btn-view-issued-proof">
              <IconShield size={16} />
              <span>View Public Verification Certificate</span>
            </Link>
            <Link to="/issuer" className="btn btn-secondary">
              Return to Exam Cell Queue
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
            Return to Exam Cell Queue
          </Link>
        </div>
      ) : !currentJobId && queue.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', background: '#FFFFFF', border: '1px solid var(--border-ice)', borderRadius: '12px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F0FDF4', border: '2px solid #86EFAC', margin: '0 auto 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
            <IconCheck size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Human Review Queue is Clear
          </h2>
          <p style={{ color: 'var(--text-sub)', maxWidth: '540px', margin: '0 auto 1.5rem', fontSize: '0.92rem', lineHeight: 1.6 }}>
            There are no documents currently requiring manual audit. Archival certificates uploaded by the Exam Cell with OCR field confidence below the 0.85 threshold will appear here for side-by-side inspection.
          </p>
          <Link to="/issuer" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconUpload size={16} />
            <span>Go to Archival Bulk Ingest</span>
          </Link>
        </div>
      ) : (
        <>
          {jobMeta && jobMeta.status !== 'needs_review' && (
            <div style={{
              marginBottom: '1.25rem',
              padding: '1rem 1.25rem',
              borderRadius: 8,
              border: jobMeta.status === 'processed' ? '1px solid #86EFAC' : jobMeta.status === 'failed' ? '1px solid #FDA4AF' : '1px solid #FCD34D',
              background: jobMeta.status === 'processed' ? '#F0FDF4' : jobMeta.status === 'failed' ? '#FFF1F2' : '#FFFBEB',
              color: jobMeta.status === 'processed' ? '#166534' : jobMeta.status === 'failed' ? '#9F1239' : '#92400E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {jobMeta.status === 'processed' ? <IconCheck size={22} color="#166534" /> : <IconAlertTriangle size={22} />}
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                    Document Status: {jobMeta.status.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.82rem', marginTop: '0.2rem', lineHeight: 1.4 }}>
                    {jobMeta.status === 'processed' && 'This credential has already been processed, cryptographically hashed, and issued in the registry. It does not require manual review.'}
                    {jobMeta.status === 'queued' && 'This document is in the Azure Service Bus processing queue. OCR extraction and confidence scoring are pending worker pickup.'}
                    {jobMeta.status === 'processing' && 'The worker is currently running OCR extraction, tamper detection, and confidence scoring. Please wait a moment.'}
                    {jobMeta.status === 'awaiting_upload' && 'This job was created but the document scan file was not received by Azure Blob Storage.'}
                    {jobMeta.status === 'failed' && `Processing failed: ${jobMeta.failure_reason || 'Rejected or unreadable scan'}`}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {jobMeta.status === 'processed' && (
                  <Link to={`/verify/${publicVerificationId || currentJobId}`} className="btn btn-success" style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}>
                    <IconShield size={14} />
                    <span>View Public Verification Proof & QR</span>
                  </Link>
                )}
                {(jobMeta.status === 'queued' || jobMeta.status === 'processing') && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
                    onClick={() => {
                      setLoading(true)
                      getReviewDetails(currentJobId, auth).then(d => {
                        if (d?.job) setJobMeta(d.job)
                        if (d?.record?.public_verification_id) {
                          setPublicVerificationId(d.record.public_verification_id)
                          saveJobPublicIdMapping(currentJobId, d.record.public_verification_id)
                        }
                      }).finally(() => setLoading(false))
                    }}
                  >
                    <IconRefresh size={14} />
                    <span>Refresh Status</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="review-grid">
          {/* Left Pane: Document Scan & Extracted Preview */}
          <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Viewer Controls Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn ${activeViewerTab === 'scan' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                  onClick={() => setActiveViewerTab('scan')}
                >
                  <IconFileText size={14} />
                  <span>Document Scan</span>
                </button>
                <button
                  type="button"
                  className={`btn ${activeViewerTab === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                  onClick={() => setActiveViewerTab('preview')}
                >
                  <IconGraduationCap size={14} />
                  <span>Extracted Preview</span>
                </button>
                <button
                  type="button"
                  className={`btn ${activeViewerTab === 'split' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                  onClick={() => setActiveViewerTab('split')}
                >
                  <span>Split View</span>
                </button>
              </div>

              {/* Zoom & Link Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {activeViewerTab !== 'preview' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.1))}
                      title="Zoom Out"
                    >
                      -
                    </button>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-sub)', minWidth: '40px', textAlign: 'center' }}>
                      {(zoomLevel * 100).toFixed(0)}%
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      onClick={() => setZoomLevel((z) => Math.min(1.6, z + 0.1))}
                      title="Zoom In"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}
                      onClick={() => setZoomLevel(1)}
                      title="Reset Zoom"
                    >
                      Reset
                    </button>
                  </div>
                )}

                {readSasUrl && (
                  <a
                    href={readSasUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.75rem', color: 'var(--soft-blue-dark)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.25rem' }}
                  >
                    <span>Open Raw</span>
                    <IconExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>

            {/* Viewer Display Frame */}
            <div
              className="document-viewer-frame"
              id="doc-viewer-frame"
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'auto',
                maxHeight: '680px',
                padding: '1rem',
                background: '#F1F5F9',
                borderRadius: 8,
              }}
            >
              {activeViewerTab === 'scan' && (
                <>
                  {readSasUrl ? (
                    isImageBlob ? (
                      <div style={{ textAlign: 'center' }}>
                        <img
                          src={readSasUrl}
                          alt="Scanned Academic Certificate"
                          style={{
                            transform: `scale(${zoomLevel})`,
                            transformOrigin: 'top center',
                            transition: 'transform 0.15s ease',
                            maxWidth: '100%',
                            borderRadius: 4,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                          }}
                        />
                      </div>
                    ) : (
                      <iframe
                        src={readSasUrl}
                        title="Original Certificate Document"
                        style={{ width: '100%', height: '620px', border: 'none', borderRadius: 8, background: '#fff' }}
                      />
                    )
                  ) : (
                    <PhysicalScanViewer formData={formData} jobId={currentJobId} jobMeta={jobMeta} zoom={zoomLevel} documentType={documentType} attributes={attributes} />
                  )}
                </>
              )}

              {activeViewerTab === 'preview' && (
                <DigitalExtractedPreview formData={formData} jobId={currentJobId} verifyUrl={verifyUrl} includeMarks={includeMarks} documentType={documentType} attributes={attributes} />
              )}

              {activeViewerTab === 'split' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-sub)', marginBottom: '0.5rem', textAlign: 'center' }}>
                      SOURCE DOCUMENT SCAN
                    </div>
                    {readSasUrl && isImageBlob ? (
                      <img src={readSasUrl} alt="Scan" style={{ width: '100%', borderRadius: 6 }} />
                    ) : (
                      <PhysicalScanViewer formData={formData} jobId={currentJobId} jobMeta={jobMeta} zoom={0.9} includeMarks={includeMarks} documentType={documentType} attributes={attributes} />
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-sub)', marginBottom: '0.5rem', textAlign: 'center' }}>
                      DIGITAL EXTRACTED CREDENTIAL
                    </div>
                    <DigitalExtractedPreview formData={formData} jobId={currentJobId} verifyUrl={verifyUrl} includeMarks={includeMarks} documentType={documentType} attributes={attributes} />
                  </div>
                </div>
              )}
            </div>

            {jobMeta?.blob_key && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--slate-blue)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                <p style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                  Fields with confidence below 0.85 are highlighted in amber.
                </p>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                Threshold: <span style={{ color: 'var(--status-emerald-text)', fontWeight: 700 }}>&ge; {(confidences.threshold * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Document Type Classification Selector */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <div className="form-label" style={{ marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700 }}>Document Classification</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
                  Selected: <strong>{DOCUMENT_TYPE_LABELS[documentType] || 'Custom Document'}</strong>
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.4rem' }}>
                {[
                  { id: 'grade_sheet', label: 'Grade Sheet', icon: IconGraduationCap },
                  { id: 'degree_certificate', label: 'Degree Certificate', icon: IconShield },
                  { id: 'transfer_certificate', label: 'Transfer Cert (TC)', icon: IconFileText },
                  { id: 'bonafide_certificate', label: 'Bonafide Cert', icon: IconCheckCircle },
                  { id: 'conduct_certificate', label: 'Conduct Cert', icon: IconScale },
                  { id: 'custom', label: 'Other Document', icon: IconFileText },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`btn ${documentType === opt.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', justifyContent: 'center', gap: '0.35rem' }}
                    onClick={() => {
                      setDocumentType(opt.id)
                      if (opt.id !== 'grade_sheet') {
                        setIncludeMarks(false)
                      }
                    }}
                  >
                    <opt.icon size={13} />
                    <span>{opt.label}</span>
                  </button>
                ))}
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

            {/* Field: Degree / Course Title */}
            <div className="form-group">
              <div className="form-label">
                <span>
                  {documentType === 'transfer_certificate'
                    ? 'Course / Class Attended'
                    : documentType === 'bonafide_certificate'
                    ? 'Academic Program / Branch'
                    : documentType === 'conduct_certificate'
                    ? 'Program / Course Completed'
                    : 'Degree Conferred'}
                </span>
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

            {/* Layout for CGPA & Issue Date (CGPA hidden for non-academic certificates) */}
            {['transfer_certificate', 'bonafide_certificate', 'conduct_certificate'].includes(documentType) ? (
              <div className="form-group">
                <div className="form-label">
                  <span>Certificate Issue Date (ISO)</span>
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
            ) : (
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
            )}

            {/* Dynamic Attributes Section */}
            <div style={{
              margin: '1rem 0',
              padding: '0.85rem 1rem',
              background: 'var(--bg-frost)',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    Document Attributes &amp; Metadata ({attributes.length})
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
                    Flexible fields extracted from OCR or verified from registrar records.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                  onClick={() => handleAddAttribute()}
                >
                  + Add Attribute
                </button>
              </div>

              {/* Quick Presets based on document type */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-sub)', alignSelf: 'center', marginRight: '0.2rem' }}>Quick Presets:</span>
                {(documentType === 'transfer_certificate'
                  ? ["Father's Name", 'Date of Admission', 'Date of Leaving', 'Conduct', 'Reason for Leaving']
                  : documentType === 'bonafide_certificate'
                  ? ['Academic Year', 'Purpose', 'Enrollment Status']
                  : documentType === 'conduct_certificate'
                  ? ['Period of Study', 'Conduct', 'Remarks']
                  : ["Father's Name", 'Academic Year', 'Remarks']
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 12,
                      padding: '0.15rem 0.5rem',
                      fontSize: '0.68rem',
                      color: 'var(--slate-blue-dark)',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      if (!attributes.some(a => a.key.toLowerCase() === preset.toLowerCase())) {
                        handleAddAttribute(preset, '')
                      }
                    }}
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              {attributes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {attributes.map((attr) => (
                    <div key={attr.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        className="form-input"
                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                        placeholder="Attribute Name (e.g. Father's Name)"
                        value={attr.key}
                        onChange={(e) => handleUpdateAttribute(attr.id, 'key', e.target.value)}
                      />
                      <input
                        className="form-input"
                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                        placeholder="Attribute Value (e.g. Robert Doe)"
                        value={attr.value}
                        onChange={(e) => handleUpdateAttribute(attr.id, 'value', e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveAttribute(attr.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--status-rose)', cursor: 'pointer', padding: '0.2rem' }}
                        title="Remove Attribute"
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '0.4rem', fontSize: '0.72rem', color: '#94A3B8', fontStyle: 'italic', textAlign: 'center' }}>
                  No extra attributes attached. Click a preset above or &quot;+ Add Attribute&quot; if needed.
                </div>
              )}
            </div>

            {/* Tabular Marks Section Toggle */}
            <div style={{
              marginTop: '1rem',
              marginBottom: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--bg-frost)',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Tabular Transcript Marks Breakdown
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
                  {documentType === 'grade_sheet'
                    ? 'Include for semester marksheets & transcripts. Uncheck for degree certificates & diplomas.'
                    : 'ℹ️ Course marks omitted for certificates. Check box if this document includes course grades.'}
                </div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={includeMarks}
                  onChange={(e) => setIncludeMarks(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span>{includeMarks ? 'Included' : 'Omitted'}</span>
              </label>
            </div>

            {includeMarks ? (
              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    <span>Verified Course Records ({formData.marks.length} courses)</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    onClick={handleAddMarkRow}
                  >
                    + Add Course
                  </button>
                </div>

                {formData.marks.length > 0 ? (
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
                ) : (
                  <div style={{ padding: '0.6rem 0.85rem', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 6, fontSize: '0.75rem', color: '#64748B' }}>
                    No courses added yet. Click &quot;+ Add Course&quot; to add transcript line items.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '0.65rem 0.85rem', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 6, fontSize: '0.75rem', color: '#64748B', marginBottom: '1rem', lineHeight: 1.5 }}>
                ℹ️ <strong>Degree / Diploma Mode:</strong> Tabular course marks are omitted. The tamper-evident proof seals the candidate name, degree conferral, CGPA, and registrar authentication.
              </div>
            )}

            {/* Reviewer Notes */}
            <div className="form-group">
              <label className="form-label">
                <span>Exam Cell Verification Ledger Notes</span>
              </label>
              <textarea
                id="input-reviewer-notes"
                className="form-input"
                rows="2"
                value={formData.reviewerNotes}
                onChange={(e) => handleInputChange('reviewerNotes', e.target.value)}
              />
            </div>

            {/* Human-in-the-loop decision actions */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
              {jobMeta?.status === 'needs_review' ? (
                <>
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
                </>
              ) : jobMeta?.status === 'processed' ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Link
                    to={`/verify/${publicVerificationId || currentJobId}`}
                    className="btn btn-success"
                    style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
                  >
                    <IconShield size={16} />
                    <span>View Public Verification Certificate & QR</span>
                  </Link>
                  <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                    This document was already verified and issued. No further approval required.
                  </div>
                </div>
              ) : (
                <div style={{ width: '100%', padding: '0.85rem 1rem', background: '#F8FAFC', border: '1px solid var(--border-subtle)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '0.4rem' }}>
                    Approval disabled: Job status is <code>{jobMeta?.status || 'unknown'}</code>.
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                    Only jobs in <strong>needs_review</strong> status require human approval.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
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
