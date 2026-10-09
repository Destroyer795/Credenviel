import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getVerification } from '../api/client'
import { QRCode } from '../components/QRCode'
import {
  IconShield,
  IconAlertTriangle,
  IconXCircle,
  IconCheck,
  IconDownload,
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
            const docType = certData?.document_type || 'grade_sheet'
            const isTC = docType === 'transfer_certificate'
            const isBonafide = docType === 'bonafide_certificate'
            const isConduct = docType === 'conduct_certificate'
            const isDegree = docType === 'degree_certificate'
            const isGradeSheet = docType === 'grade_sheet'

            const bannerTitle = isTC
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
                  <div className="verify-header-badge" id="verification-status-banner" style={{ margin: 0 }}>
                    <div className="verify-check-icon">
                      <IconCheck size={24} color="#ffffff" />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--status-emerald-text)', letterSpacing: '-0.02em' }}>
                        {bannerTitle}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                        {certData.verified_by_issuer
                          ? 'Cryptographically authenticated and confirmed by accredited university authority.'
                          : 'Document digitized with tamper-evident SHA-256 seal.'}
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
                      border: '1px solid var(--border-subtle)',
                      boxShadow: '0 2px 8px rgba(37, 43, 50, 0.04)',
                    }}
                  >
                    <QRCode value={verifyUrl} size={100} />
                    <div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--slate-blue)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                        Mobile QR Verification
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: 600, marginTop: '0.2rem' }}>
                        Scan to Inspect Proof
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Instantly load cryptographic proof on any mobile device.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Credential Metadata */}
                <div className="meta-grid">
                  <div>
                    <div className="meta-field-label">Student Recipient</div>
                    <div className="meta-field-value" id="verify-recipient-name">
                      {certData.name || certData.student_name}
                    </div>
                  </div>

                  <div>
                    <div className="meta-field-label">Roll Number</div>
                    <div className="meta-field-value" id="verify-roll-number">
                      {certData.roll_number || 'Official Ledger ID'}
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
                      {certData.issue_date || certData.graduation_date}
                    </div>
                  </div>

                  <div>
                    <div className="meta-field-label">Institutional Verification</div>
                    <div className="meta-field-value" style={{ color: certData.verified_by_issuer ? 'var(--status-emerald-text)' : 'var(--status-amber-text)' }}>
                      {certData.verified_by_issuer ? 'Confirmed by University Registrar' : 'Pending Registrar Review'}
                    </div>
                  </div>

                  <div>
                    <div className="meta-field-label">Tamper-Proof Audit Status</div>
                    <div className="meta-field-value" style={{ color: 'var(--status-emerald-text)' }}>
                      {certData.tamper_status || 'VALID_UNALTERED'}
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
                {certData.source_hash || certData.document_hash}
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
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-blue-light)' }}>
              Proof Standard: Canonical SHA-256 Digest • Issuer Confirmed (DPDP Act 2023)
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {(certData.document_url || certData.stamped_document_url) && (
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
              <button
                id="btn-print-certificate"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                onClick={handlePrint}
              >
                <IconPrinter size={15} />
                <span>Print Certificate</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
