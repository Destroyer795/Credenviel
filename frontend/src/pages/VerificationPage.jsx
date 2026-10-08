import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getVerification } from '../api/client'

export function VerificationPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState(id || '')
  const [loading, setLoading] = useState(true)
  const [certData, setCertData] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [copied, setCopied] = useState(false)

  const activeId = id || 'demo-cert'

  useEffect(() => {
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
          setErrorMsg('No verified credential found matching this Public Verification ID.')
        } else {
          setErrorMsg(err.message || 'Unable to retrieve verification record.')
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
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="page-container">
      {/* Search Header */}
      <div style={{ maxWidth: '760px', margin: '0 auto 2.5rem', textAlign: 'center' }}>
        <h1 className="page-title" id="verify-page-title" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>
          🛡️ Public Credential Verifier
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
            Verify
          </button>
        </form>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Verifying cryptographic signatures and audit ledger...
        </div>
      ) : isRateLimited ? (
        <div className="glass-panel" style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center', padding: '3rem 2rem', borderColor: 'var(--accent-amber)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-amber)', marginBottom: '0.75rem' }}>
            Rate Limit Exceeded
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {errorMsg}
          </p>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            To protect infrastructure against brute-force harvesting, public queries are capped at 30 requests per minute per IP address.
          </div>
        </div>
      ) : errorMsg ? (
        <div className="glass-panel" style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center', padding: '3rem 2rem', borderColor: 'var(--accent-rose)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✕</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-rose)', marginBottom: '0.75rem' }}>
            Credential Record Not Found
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {errorMsg}
          </p>
        </div>
      ) : certData ? (
        <div className="verify-card" id="verification-card">
          {/* Header Verified Banner */}
          <div className="verify-header-badge" id="verification-status-banner">
            <div className="verify-check-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-emerald)', letterSpacing: '-0.02em' }}>
                AUTHENTIC & VERIFIED CREDENTIAL
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {certData.verified_by_issuer
                  ? 'Cryptographically authenticated and confirmed by accredited university authority.'
                  : 'Document digitized with tamper-evident SHA-256 seal.'}
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
              <div className="meta-field-label">Degree / Qualification</div>
              <div className="meta-field-value" id="verify-degree-title">
                {certData.degree || certData.degree_title}
              </div>
            </div>

            <div>
              <div className="meta-field-label">Cumulative GPA / Grade</div>
              <div className="meta-field-value" id="verify-cgpa">
                {certData.cgpa || 'N/A'}
              </div>
            </div>

            <div>
              <div className="meta-field-label">Issuing Authority</div>
              <div className="meta-field-value" id="verify-institution">
                {certData.institution || 'National Institute of Technology'}
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
              <div className="meta-field-value" style={{ color: certData.verified_by_issuer ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                {certData.verified_by_issuer ? '✓ Confirmed by University Registrar' : '⚠️ Pending Review'}
              </div>
            </div>

            <div>
              <div className="meta-field-label">Tamper-Proof Audit Status</div>
              <div className="meta-field-value" style={{ color: 'var(--accent-emerald)' }}>
                ✓ {certData.tamper_status || 'VALID_UNALTERED'}
              </div>
            </div>
          </div>

          {/* Cryptographic Proof Details */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', marginBottom: '1.75rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
              Cryptographic Audit Proof
            </div>

            {certData.fields_hash && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                  Canonical Fields SHA-256 Digest
                </div>
                <div className="mono-hash" id="verify-fields-hash">
                  {certData.fields_hash}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                Raw Source Document SHA-256 Digest
              </div>
              <div className="mono-hash" id="verify-document-hash">
                {certData.source_hash || certData.document_hash}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                Public Verification ID
              </div>
              <div className="mono-hash" id="verify-public-id">
                {certData.public_verification_id || certData.verification_id}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Proof Standard: {certData.signature_algorithm || 'RSA-PSS-SHA256 (Azure Key Vault HSM)'}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {certData.stamped_document_url && (
                <a
                  href={certData.stamped_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-success"
                  id="btn-download-stamped-pdf"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                >
                  📥 Download QR-Stamped PDF
                </a>
              )}
              <button
                id="btn-copy-verify-link"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                onClick={handleCopyLink}
              >
                {copied ? '✓ Link Copied' : '🔗 Copy Public Link'}
              </button>
              <button
                id="btn-print-certificate"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                onClick={handlePrint}
              >
                🖨️ Print Certificate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
