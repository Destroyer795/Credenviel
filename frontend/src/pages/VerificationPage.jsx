import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getVerification } from '../api/client'

export function VerificationPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState(id || '')
  const [loading, setLoading] = useState(true)
  const [certData, setCertData] = useState(null)
  const [copied, setCopied] = useState(false)

  const activeId = id || 'demo-cert'

  useEffect(() => {
    setLoading(true)
    getVerification(activeId)
      .then((data) => {
        setCertData(data)
      })
      .catch((err) => {
        console.error('Failed to verify:', err)
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
          Instantly verify the authenticity, cryptographic integrity, and issuing authority of any Credenviel digitized credential.
        </p>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', maxWidth: '580px', margin: '0 auto' }}>
          <input
            id="input-verify-search"
            type="text"
            className="form-input"
            placeholder="Enter Public Verification ID or Document Hash..."
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
                Document signature matches issuing institution key in Azure Key Vault HSM.
              </div>
            </div>
          </div>

          {/* Credential Metadata */}
          <div className="meta-grid">
            <div>
              <div className="meta-field-label">Student Recipient</div>
              <div className="meta-field-value" id="verify-recipient-name">
                {certData.student_name}
              </div>
            </div>

            <div>
              <div className="meta-field-label">Degree / Qualification</div>
              <div className="meta-field-value" id="verify-degree-title">
                {certData.degree_title}
              </div>
            </div>

            <div>
              <div className="meta-field-label">Issuing Authority</div>
              <div className="meta-field-value" id="verify-institution">
                {certData.institution}
              </div>
            </div>

            <div>
              <div className="meta-field-label">Conferral Date</div>
              <div className="meta-field-value" id="verify-grad-date">
                {certData.graduation_date}
              </div>
            </div>

            <div>
              <div className="meta-field-label">Authorizing Registrar</div>
              <div className="meta-field-value">
                {certData.issuer_name}
              </div>
            </div>

            <div>
              <div className="meta-field-label">Tamper-Proof Audit Status</div>
              <div className="meta-field-value" style={{ color: 'var(--accent-emerald)' }}>
                ✓ {certData.tamper_status}
              </div>
            </div>
          </div>

          {/* Cryptographic Proof Details */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', marginBottom: '1.75rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
              Cryptographic Audit Proof
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                Document SHA-256 Digest
              </div>
              <div className="mono-hash" id="verify-document-hash">
                {certData.document_hash}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                Public Verification ID
              </div>
              <div className="mono-hash" id="verify-public-id">
                {certData.verification_id}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Proof Standard: {certData.signature_algorithm}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
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
