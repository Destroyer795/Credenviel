import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { checkHealth } from '../api/client'
import {
  IconShield,
  IconGraduationCap,
  IconBuilding,
  IconScale,
  IconCloudUpload,
  IconCpu,
  IconLock,
  IconCheckCircle,
  IconActivity,
  IconArrowRight,
  IconSearch,
  IconExternalLink,
} from '../components/Icons'
import { AuthModal } from '../components/AuthModal'

export function Home() {
  const { user, isStudent, isIssuer, isAuthenticated, switchDemoUser } = useAuth()
  const navigate = useNavigate()
  const [apiOnline, setApiOnline] = useState(null)
  const [activeStep, setActiveStep] = useState(3)
  const [searchVerifyId, setSearchVerifyId] = useState('')
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalPreset, setAuthModalPreset] = useState(null)
  const [authModalRole, setAuthModalRole] = useState('student')

  useEffect(() => {
    checkHealth().then(setApiOnline)
  }, [])

  const handleOpenAuth = (role = 'student', preset = null) => {
    setAuthModalRole(role)
    setAuthModalPreset(preset)
    setAuthModalOpen(true)
  }

  const handlePresetOneClick = (roleKey) => {
    switchDemoUser(roleKey)
    if (roleKey === 'student') navigate('/student')
    else if (roleKey === 'issuer') navigate('/issuer')
  }

  const handleQuickVerify = (e) => {
    e.preventDefault()
    const clean = searchVerifyId.trim()
    if (clean) {
      navigate(`/verify/${encodeURIComponent(clean)}`)
    } else {
      navigate('/verify')
    }
  }

  return (
    <div className="page-container">
      {/* Hero Section */}
      <div className="hero-wrapper">
        <div className="hero-pill-tag">
          <IconActivity size={14} color="var(--soft-blue)" />
          <span>Azure Zero-Trust Architecture</span>
          <span style={{ color: 'var(--border-slate)' }}>•</span>
          <span style={{ color: apiOnline ? 'var(--status-emerald)' : 'var(--slate-blue)' }}>
            {apiOnline ? 'Backend API Active' : 'Connecting to Cloud Pipeline...'}
          </span>
        </div>

        <h1 className="hero-title">
          Cryptographic Certificate Digitization & <span className="hero-title-highlight">Tamper-Evident Verification</span>
        </h1>

        <p className="hero-desc">
          Official institutional credential platform ingesting degree documents via direct SAS storage, extracting records with dual-engine OCR, enforcing human-in-the-loop review, and sealing canonical SHA-256 digests with issuer confirmation (DPDP Act 2023).
        </p>

        {/* Dynamic Role-Based CTAs */}
        <div className="hero-cta-group">
          {!isAuthenticated ? (
            <>
              <button
                className="btn btn-primary"
                id="btn-hero-signin"
                onClick={() => handleOpenAuth('student', null)}
              >
                <IconGraduationCap size={18} />
                <span>Student Portal</span>
              </button>

              <button
                className="btn btn-secondary"
                id="btn-hero-admin"
                onClick={() => handleOpenAuth('issuer', null)}
              >
                <IconBuilding size={18} />
                <span>Exam Cell & Issuer</span>
              </button>

              <Link to="/verify" className="btn btn-secondary" id="btn-hero-verify">
                <IconSearch size={18} />
                <span>Verify Credential</span>
              </Link>
            </>
          ) : isStudent ? (
            <>
              <Link to="/student" className="btn btn-primary" id="btn-hero-my-portal">
                <IconGraduationCap size={18} />
                <span>My Certificates</span>
                <IconArrowRight size={16} />
              </Link>
              <Link to="/verify" className="btn btn-secondary" id="btn-hero-verify">
                <IconSearch size={18} />
                <span>Public Verifier</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/issuer" className="btn btn-primary" id="btn-hero-my-portal">
                <IconBuilding size={18} />
                <span>Exam Cell Dashboard</span>
                <IconArrowRight size={16} />
              </Link>
              <Link to="/issuer/review" className="btn btn-secondary">
                <IconScale size={18} />
                <span>Review Station</span>
              </Link>
              <Link to="/verify" className="btn btn-secondary" id="btn-hero-verify">
                <IconSearch size={18} />
                <span>Public Verifier</span>
              </Link>
            </>
          )}
        </div>

        {/* Instant Evaluation Quick-Access Presets */}
        <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Quick 1-Click Evaluation Presets:
          </span>
          <button
            type="button"
            className="auth-preset-chip"
            onClick={() => handlePresetOneClick('student')}
            title="Authenticate instantly as Student Alice Chen"
          >
            <IconGraduationCap size={13} style={{ marginRight: '4px' }} />
            Student (Alice Chen)
          </button>
          <button
            type="button"
            className="auth-preset-chip"
            onClick={() => handlePresetOneClick('issuer')}
            title="Authenticate instantly as University Exam Cell Staff"
          >
            <IconBuilding size={13} style={{ marginRight: '4px' }} />
            Exam Cell Staff (Issuer)
          </button>
        </div>

        {/* Public Verifier Quick Lookup Box */}
        <div
          className="glass-panel"
          style={{
            maxWidth: '680px',
            margin: '2.5rem auto 0 auto',
            padding: '1.25rem 1.75rem',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <IconSearch size={16} color="var(--soft-blue-dark)" />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Public Credential Verification Engine
            </span>
          </div>
          <form onSubmit={handleQuickVerify} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="auth-input"
              style={{ flex: 1, minWidth: '240px' }}
              placeholder="Enter Public Verification ID (UUID)..."
              value={searchVerifyId}
              onChange={(e) => setSearchVerifyId(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.65rem 1.25rem' }}>
              <span>Verify Integrity</span>
            </button>
          </form>
        </div>

        {/* Interactive Pipeline Steps */}
        <div className="hero-pipeline-preview" id="pipeline-showcase" style={{ marginTop: '2.5rem' }}>
          <div className="pipeline-preview-header">
            <div className="pipeline-header-badge">
              <IconActivity size={16} color="var(--soft-blue)" />
              <span>Institutional Processing Pipeline</span>
            </div>
            <div className="pipeline-header-indicator">
              <span>Pipeline Stage {activeStep} of 4</span>
            </div>
          </div>

          <div className="pipeline-flow-chips">
            <div
              className={`pipeline-chip ${activeStep === 1 ? 'active' : ''}`}
              onClick={() => setActiveStep(1)}
              role="button"
              tabIndex={0}
              id="pipeline-step-1"
            >
              <div className="chip-step-num">Stage 01</div>
              <div className="chip-step-title">Direct Blob SAS</div>
              <div className="chip-step-sub">0 ms API compute ingest</div>
            </div>

            <div
              className={`pipeline-chip ${activeStep === 2 ? 'active' : ''}`}
              onClick={() => setActiveStep(2)}
              role="button"
              tabIndex={0}
              id="pipeline-step-2"
            >
              <div className="chip-step-num">Stage 02</div>
              <div className="chip-step-title">Event Grid Routing</div>
              <div className="chip-step-sub">Decoupled queue dispatch</div>
            </div>

            <div
              className={`pipeline-chip ${activeStep === 3 ? 'active' : ''}`}
              onClick={() => setActiveStep(3)}
              role="button"
              tabIndex={0}
              id="pipeline-step-3"
            >
              <div className="chip-step-num">Stage 03</div>
              <div className="chip-step-title">Dual-Engine OCR</div>
              <div className="chip-step-sub">0.85 Confidence threshold</div>
            </div>

            <div
              className={`pipeline-chip ${activeStep === 4 ? 'active' : ''}`}
              onClick={() => setActiveStep(4)}
              role="button"
              tabIndex={0}
              id="pipeline-step-4"
            >
              <div className="chip-step-num">Stage 04</div>
              <div className="chip-step-title">Canonical Digest & QR</div>
              <div className="chip-step-sub">SHA-256 tamper proof</div>
            </div>
          </div>

          {/* Interactive Stage Detail */}
          <div className="pipeline-step-detail">
            <div className="pipeline-detail-header">
              <div className="pipeline-detail-title">
                <span className="pipeline-detail-tag">
                  {activeStep === 1 ? 'Direct-to-Storage Ingest' : activeStep === 2 ? 'Asynchronous Decoupling' : activeStep === 3 ? 'Human-in-the-Loop Gate' : 'Cryptographic Integrity'}
                </span>
                <strong>
                  {activeStep === 1 ? 'Zero-Compute Client Upload' : activeStep === 2 ? 'Azure Service Bus Queue' : activeStep === 3 ? 'Dual-Engine OCR & Verification' : 'Canonical SHA-256 Digest & QR Code'}
                </strong>
              </div>
              <div className="pipeline-detail-metric">
                {activeStep === 1 ? '0.0 ms API Latency' : activeStep === 2 ? '< 1.2s Queue Dispatch' : activeStep === 3 ? '0.85 Confidence Threshold' : '256-bit Immutable Seal'}
              </div>
            </div>
            <p className="pipeline-detail-desc">
              {activeStep === 1 && 'Client payloads upload directly to Azure Blob Storage via short-lived SAS tokens with strict mime-type validation and 4 MB limits, completely bypassing API web servers.'}
              {activeStep === 2 && 'Azure Event Grid captures storage container creation events and triggers serverless functions to enqueue processing tasks to Azure Service Bus with guaranteed delivery.'}
              {activeStep === 3 && 'High-accuracy OCR extracts transcript records. Extractions with confidence scores below 0.85 automatically route to the Exam Cell review station for human verification.'}
              {activeStep === 4 && 'Canonical normalization generates a deterministic SHA-256 hash linked to the university issuer under DPDP Act 2023, embedded into a tamper-evident certificate with a public QR code.'}
            </p>
          </div>
        </div>
      </div>

      {/* Institutional Gateway Portal Cards - Aligned with strict 2-Role model */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.75rem', marginBottom: '3.5rem' }}>
        {/* Exam Cell & Issuer Gateway */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--border-ice)' }}>
          <div>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'var(--slate-blue-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', border: '1px solid var(--border-slate)' }}>
              <IconBuilding size={24} color="var(--slate-blue-dark)" />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.6rem' }}>
              University Exam Cell (Issuer)
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: '1rem' }}>
              The primary institutional gateway. Bulk-upload historical scanned degree sheets and paper archives (Scenario A), inspect OCR confidence anomalies on the side-by-side Review Station, and issue cryptographically sealed credentials.
            </p>
            <div style={{ fontSize: '0.78rem', color: 'var(--slate-blue)', fontWeight: 600 }}>
              • Archival Batch Ingest • 0.85 Confidence Gate • Audit Ledger
            </div>
          </div>
          <div style={{ marginTop: '1.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {user?.role === 'issuer' ? (
              <>
                <Link to="/issuer" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  <span>Dashboard</span>
                  <IconArrowRight size={15} />
                </Link>
                <Link to="/issuer/review" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                  <span>Review Station</span>
                </Link>
              </>
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => handleOpenAuth('issuer', null)}
              >
                <span>Exam Cell Staff Access</span>
                <IconArrowRight size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Student Gateway */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'var(--ice-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', border: '1px solid var(--border-ice)' }}>
              <IconGraduationCap size={24} color="var(--ice-blue-dark)" />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.6rem' }}>
              Student Portal (Candidate)
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Self-service credential management for enrolled graduates and alumni. Upload individual graduation certificates for automated OCR digitization, view processing status, and access verified grade sheets with scannable QR verification.
            </p>
            <div style={{ fontSize: '0.78rem', color: 'var(--slate-blue)', fontWeight: 600 }}>
              • Direct Blob Upload • Real-Time Pipeline Telemetry • Official QR View
            </div>
          </div>
          <div style={{ marginTop: '1.75rem' }}>
            {user?.role === 'student' ? (
              <Link to="/student" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <span>Enter Student Portal</span>
                <IconArrowRight size={15} />
              </Link>
            ) : (
              <button
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => handleOpenAuth('student', null)}
              >
                <span>Student / Graduate Access</span>
              </button>
            )}
          </div>
        </div>

        {/* Public Verifier Gateway */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'var(--status-emerald-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', border: '1px solid rgba(22, 128, 84, 0.25)' }}>
              <IconShield size={24} color="var(--status-emerald)" />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.6rem' }}>
              Public Credential Verifier
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Zero-knowledge background verification for employers, embassies, and universities. Instantly verify genuine conferral and tamper-proof status by scanning the certificate QR code or entering the unguessable Public Verification ID.
            </p>
            <div style={{ fontSize: '0.78rem', color: 'var(--status-emerald-text)', fontWeight: 600 }}>
              • DPDP Act 2023 Compliant • Rate-Limited Lookups • No Account Required
            </div>
          </div>
          <div style={{ marginTop: '1.75rem' }}>
            <Link to="/verify" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
              <IconSearch size={15} />
              <span>Open Public Verifier</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Security Architecture & Institutional Pillars */}
      <div className="features-grid">
        <div className="feature-box">
          <div className="feature-icon-wrapper">
            <IconCloudUpload size={22} />
          </div>
          <h3 className="feature-title">Direct-to-Blob Zero Compute Ingest</h3>
          <p className="feature-desc">
            Client document payloads bypass the API compute layer entirely using short-lived Azure Blob Storage SAS tokens with strict mime-type constraints and 4 MB limits.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-wrapper">
            <IconCpu size={22} />
          </div>
          <h3 className="feature-title">Event-Driven Asynchronous Pipeline</h3>
          <p className="feature-desc">
            Azure Event Grid captures blob creations and triggers Azure Functions to enqueue jobs into Azure Service Bus, enabling worker processing with zero server idling.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-wrapper">
            <IconScale size={22} />
          </div>
          <h3 className="feature-title">Human-in-the-Loop Review Station</h3>
          <p className="feature-desc">
            Documents with optical character recognition confidence below 0.85 route to the split-screen review station for administrative verification, ledger audit, and approval.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-wrapper">
            <IconLock size={22} />
          </div>
          <h3 className="feature-title">Canonical SHA-256 Tamper Detection</h3>
          <p className="feature-desc">
            Deterministic JSON normalization and SHA-256 digest hashing guarantee that any alteration of grades, marks, or names renders the cryptographic verification invalid.
          </p>
        </div>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        initialPreset={authModalPreset}
        initialRole={authModalRole}
        onClose={() => {
          setAuthModalOpen(false)
          setAuthModalPreset(null)
        }}
      />
    </div>
  )
}
