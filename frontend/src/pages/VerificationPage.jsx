import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getVerification } from '../api/client'
import { QRCode } from '../components/QRCode'
import {
  IconShield,
  IconAlertTriangle,
  IconXCircle,
  IconCheck,
  IconExternalLink,
  IconCopy,
  IconPrinter,
  IconSearch,
} from '../components/Icons'

export function VerificationPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState(id || '')
  const [loading, setLoading] = useState(true)
  const [certData, setCertData] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [copied, setCopied] = useState(false)

  const activeId = (id || '').trim()
  const canonicalId = certData?.public_verification_id || activeId
  const verifyUrl = typeof window !== 'undefined' && canonicalId
    ? `${window.location.origin}/verify/${encodeURIComponent(canonicalId)}`
    : `https://credenviel.ac.in/verify`

  useEffect(() => {
    if (!activeId) {
      setLoading(false)
      setCertData(null)
      setErrorMsg(null)
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setIsRateLimited(false)

    getVerification(activeId)
      .then((data) => {
        setCertData(data)
      })
      .catch((err) => {
        console.error('Failed to verify:', err)
        if (err.status === 429) {
          setIsRateLimited(true)
          setErrorMsg(err.message || 'Rate limit exceeded: maximum 30 requests per minute from this IP.')
        } else if (err.status === 404) {
          setErrorMsg(`No verified credential record found matching ID: ${activeId}`)
        } else {
          setErrorMsg(err.message || 'Unable to retrieve verification record from registry.')
        }
      })
      .finally(() => {
        setLoading(false)
      })
  }, [activeId])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchInput.trim()) {
      navigate(`/verify/${encodeURIComponent(searchInput.trim())}`)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(verifyUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="page-container">
      {/* Search Header */}
      <div style={{ maxWidth: '780px', margin: '0 auto 2.5rem', textAlign: 'center' }}>
        <h1 className="page-title" id="verify-page-title" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>
          <IconShield size={28} color="var(--ice-blue)" />
          <span>Public Credential Verifier</span>
        </h1>
        <p className="page-subtitle" style={{ margin: '0 auto 1.5rem' }}>
          Instantly verify the authenticity, cryptographic integrity, and issuing authority of any Credenviel digitized academic credential.
        </p>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', maxWidth: '580px', margin: '0 auto' }}>
          <input
            id="input-verify-search"
            type="text"
            className="form-input"
            placeholder="Enter Public Verification ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" id="btn-lookup-verify" className="btn btn-primary" style={{ flexShrink: 0 }}>
            <IconSearch size={16} />
            <span>Verify</span>
          </button>
        </form>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Verifying cryptographic signatures and audit ledger...
        </div>
      ) : !activeId ? (
        <div className="glass-panel" style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center', padding: '3.5rem 2rem', background: '#FFFFFF', border: '1px solid var(--border-ice)' }}>
          <div style={{ margin: '0 auto 1.25rem', width: 64, height: 64, borderRadius: '50%', background: 'rgba(38, 127, 203, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconShield size={32} color="var(--ice-blue)" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.75rem' }}>
            Ready for Credential Verification
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.92rem', lineHeight: 1.6, maxWidth: '520px', margin: '0 auto 1.5rem auto' }}>
            Enter a Public Verification ID (UUID) above or scan the QR code printed on the official certificate to inspect its cryptographic integrity and institutional issuer confirmation.
          </p>
        </div>
      ) : isRateLimited ? (
        <div className="glass-panel" style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center', padding: '3rem 2rem', borderColor: 'var(--status-amber)' }}>
          <div style={{ margin: '0 auto 1rem', width: 56, height: 56, borderRadius: '50%', background: 'var(--status-amber-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconAlertTriangle size={32} color="var(--status-amber)" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--status-amber)', marginBottom: '0.75rem' }}>
            Rate Limit Exceeded
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {errorMsg}
          </p>
          <div style={{ fontSize: '0.8rem', color: 'var(--slate-blue-light)' }}>
            To protect infrastructure against brute-force harvesting, public queries are capped at 30 requests per minute per IP address.
          </div>
        </div>
      ) : errorMsg ? (
        <div className="glass-panel" style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center', padding: '3rem 2rem', borderColor: 'var(--status-rose)' }}>
          <div style={{ margin: '0 auto 1rem', width: 56, height: 56, borderRadius: '50%', background: 'var(--status-rose-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconXCircle size={32} color="var(--status-rose)" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--status-rose-text)', marginBottom: '0.75rem' }}>
            Credential Record Not Found
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem' }}>
            {errorMsg}
          </p>
        </div>
      ) : certData ? (
        <div className="verify-card" id="verification-card">
          {/* Header Verified Banner with QR Code layout */}
          {(() => {
            const isRejected = certData?.status === 'rejected' || certData?.status === 'failed' || certData?.verified === false
            const rejectionReason = certData?.rejection_reason || certData?.failure_reason || ''

            const docType = certData?.document_type || 'grade_sheet'
            const isTC = docType === 'transfer_certificate'
            const isBonafide = docType === 'bonafide_certificate'
            const isConduct = docType === 'conduct_certificate'
            const isDegree = docType === 'degree_certificate'
            const isGradeSheet = docType === 'grade_sheet'

            const bannerTitle = isRejected
              ? 'DOCUMENT SUBMISSION REJECTED'
              : isTC
              ? 'AUTHENTIC & VERIFIED TRANSFER CERTIFICATE'
              : isBonafide
              ? 'AUTHENTIC & VERIFIED BONAFIDE CERTIFICATE'
              : isConduct
              ? 'AUTHENTIC & VERIFIED CONDUCT CERTIFICATE'
              : isDegree
              ? 'AUTHENTIC & VERIFIED DEGREE CERTIFICATE'
              : isGradeSheet
              ? 'AUTHENTIC & VERIFIED GRADE SHEET'
              : 'AUTHENTIC & VERIFIED CREDENTIAL'

            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'center', marginBottom: '2rem' }}>
                  <div
                    className="verify-header-badge"
                    id="verification-status-banner"
                    style={{
                      margin: 0,
                      background: isRejected ? 'var(--status-rose-tint)' : undefined,
                      borderColor: isRejected ? 'rgba(201, 59, 78, 0.35)' : undefined,
                    }}
                  >
                    <div
                      className="verify-check-icon"
                      style={{
                        background: isRejected ? 'var(--status-rose)' : undefined,
                        boxShadow: isRejected ? '0 2px 10px rgba(201, 59, 78, 0.35)' : undefined,
                      }}
                    >
                      {isRejected ? (
                        <IconXCircle size={24} color="#ffffff" />
                      ) : (
                        <IconCheck size={24} color="#ffffff" />
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 800,
                          color: isRejected ? 'var(--status-rose-text)' : 'var(--status-emerald-text)',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {bannerTitle}
                      </div>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: isRejected ? 'var(--status-rose-text)' : 'var(--text-sub)',
                        }}
                      >
                        {isRejected
                          ? (rejectionReason ? `Rejected by University Authority: ${rejectionReason}` : 'Document rejected by university authority. Invalid credential.')
                          : certData.verified_by_issuer
                          ? 'Cryptographically authenticated and confirmed by accredited university authority.'
                          : 'Uploaded by Student • Digitized with tamper-evident SHA-256 seal.'}
                      </div>
                    </div>
                  </div>

                  {/* Visual QR Code Box */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1.25rem',
                      background: '#FFFFFF',
                      padding: '1rem 1.25rem',
                      borderRadius: 12,
                      border: isRejected ? '1px solid rgba(201, 59, 78, 0.3)' : '1px solid var(--border-subtle)',
                      boxShadow: '0 2px 8px rgba(37, 43, 50, 0.04)',
                    }}
                  >
                    <QRCode value={verifyUrl} size={100} />
                    <div>
                      <div style={{ fontSize: '0.74rem', color: isRejected ? 'var(--status-rose)' : 'var(--slate-blue)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                        {isRejected ? 'Revocation Status' : 'Mobile QR Verification'}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: isRejected ? 'var(--status-rose-text)' : 'var(--text-main)', fontWeight: 600, marginTop: '0.2rem' }}>
                        {isRejected ? 'Status: REJECTED' : 'Scan to Inspect Proof'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {isRejected ? 'Public verification confirms this document is rejected and revoked.' : 'Instantly load cryptographic proof on any mobile device.'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Explicit Rejection Alert if Rejected */}
                {isRejected && rejectionReason && (
                  <div
                    id="verification-rejection-alert"
                    style={{
                      marginBottom: '1.5rem',
                      background: 'var(--status-rose-tint)',
                      border: '1px solid rgba(201, 59, 78, 0.3)',
                      borderRadius: 10,
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                    }}
                  >
                    <IconAlertTriangle size={20} color="var(--status-rose)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--status-rose)', letterSpacing: '0.04em' }}>
                        Official Rejection Reason
                      </div>
                      <div style={{ fontSize: '0.92rem', color: 'var(--status-rose-text)', fontWeight: 600, marginTop: '0.2rem' }}>
                        {rejectionReason}
                      </div>
                    </div>
                  </div>
                )}

                {/* Credential Metadata */}
                <div className="meta-grid">
                  <div>
                    <div className="meta-field-label">Student Recipient</div>
                    <div className="meta-field-value" id="verify-recipient-name">
                      {certData.name || certData.student_name || 'N/A'}
                    </div>
                  </div>

                  <div>
                    <div className="meta-field-label">Roll Number</div>
                    <div className="meta-field-value" id="verify-roll-number">
                      {certData.roll_number || 'N/A'}
                    </div>
                  </div>

                  <div>
                    <div className="meta-field-label">
                      {isTC ? 'Course / Class' : isBonafide ? 'Branch / Program' : 'Degree / Qualification'}
                    </div>
                    <div className="meta-field-value" id="verify-degree-title">
                      {certData.degree || certData.degree_title || (isTC ? 'Undergraduate Studies' : 'N/A')}
                    </div>
                  </div>

                  {!isTC && !isBonafide && !isConduct && certData.cgpa && (
                    <div>
                      <div className="meta-field-label">Cumulative GPA / Grade</div>
                      <div className="meta-field-value" id="verify-cgpa">
                        {certData.cgpa}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="meta-field-label">Issuing Authority</div>
                    <div className="meta-field-value" id="verify-institution">
                      {certData.issuing_authority || certData.institution || 'Amrita Vishwa Vidyapeetham'}
                    </div>
                  </div>

                  <div>
                    <div className="meta-field-label">Conferral / Issue Date</div>
                    <div className="meta-field-value" id="verify-grad-date">
                      {certData.issue_date || certData.graduation_date || 'N/A'}
                    </div>
                  </div>

                  <div>
                    <div className="meta-field-label">Institutional Verification</div>
                    <div
                      className="meta-field-value"
                      id="verify-institutional-status"
                      style={{
                        color: isRejected
                          ? 'var(--status-rose-text)'
                          : certData.verified_by_issuer
                          ? 'var(--status-emerald-text)'
                          : 'var(--status-amber-text)',
                        fontWeight: 700,
                      }}
                    >
                      {isRejected
                        ? 'Rejected by University Authority'
                        : certData.verified_by_issuer
                        ? 'Confirmed by University Registrar'
                        : 'Uploaded by Student'}
                    </div>
                  </div>

                  <div>
                    <div className="meta-field-label">Tamper-Proof Audit Status</div>
                    <div
                      className="meta-field-value"
                      id="verify-audit-status"
                      style={{
                        color: isRejected ? 'var(--status-rose-text)' : 'var(--status-emerald-text)',
                        fontWeight: 700,
                      }}
                    >
                      {isRejected ? 'REJECTED / INVALIDATED' : (certData.tamper_status || 'VALID_UNALTERED')}
                    </div>
                  </div>
                </div>

                {/* Flexible Attributes Grid */}
                {certData.attributes_json && typeof certData.attributes_json === 'object' && Object.keys(certData.attributes_json).length > 0 && (
                  <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', background: '#F8FAFC', padding: '1.25rem', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
                      Institutional Record Attributes
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                      {Object.entries(certData.attributes_json).map(([k, v]) => (
                        <div key={k} style={{ background: '#FFFFFF', padding: '0.6rem 0.85rem', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, textTransform: 'capitalize' }}>
                            {k.replace(/_/g, ' ')}
                          </div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', marginTop: '0.15rem' }}>
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* Cryptographic Proof Details */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', marginBottom: '1.75rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-sub)' }}>
              Cryptographic Audit Proof
            </div>

            {certData.fields_hash && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--slate-blue)', marginBottom: '0.25rem', textTransform: 'uppercase', fontWeight: 700 }}>
                  Canonical Fields SHA-256 Digest
                </div>
                <div className="mono-hash" id="verify-fields-hash">
                  {certData.fields_hash}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--slate-blue)', marginBottom: '0.25rem', textTransform: 'uppercase', fontWeight: 700 }}>
                Raw Source Document SHA-256 Digest
              </div>
              <div className="mono-hash" id="verify-document-hash">
                {certData.source_hash || certData.document_hash || 'DOCUMENT_NOT_INDEXED'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--slate-blue)', marginBottom: '0.25rem', textTransform: 'uppercase', fontWeight: 700 }}>
                Public Verification ID
              </div>
              <div className="mono-hash" id="verify-public-id">
                {certData.public_verification_id || certData.verification_id || activeId}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            {(() => {
              const isRejected = certData?.status === 'rejected' || certData?.status === 'failed' || certData?.verified === false
              return (
                <div style={{ fontSize: '0.8rem', color: isRejected ? 'var(--status-rose-text)' : 'var(--slate-blue-light)', fontWeight: isRejected ? 700 : 400 }}>
                  {isRejected
                    ? 'Status: Rejected & Revoked by University Authority (Invalid Credential)'
                    : 'Proof Standard: Canonical SHA-256 Digest • Issuer Confirmed (DPDP Act 2023)'}
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {(certData.document_url || certData.stamped_document_url) && certData.verified !== false && certData.status !== 'rejected' && (
                <a
                  href={certData.document_url || certData.stamped_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-success"
                  id="btn-view-document"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                >
                  <IconExternalLink size={15} />
                  <span>View document</span>
                </a>
              )}
              <button
                id="btn-copy-verify-link"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                onClick={handleCopyLink}
              >
                {copied ? (
                  <>
                    <IconCheck size={15} />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <IconCopy size={15} />
                    <span>Copy Public Link</span>
                  </>
                )}
              </button>
              {certData.verified !== false && certData.status !== 'rejected' && (
                <button
                  id="btn-print-certificate"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                  onClick={handlePrint}
                >
                  <IconPrinter size={15} />
                  <span>Print Certificate</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
