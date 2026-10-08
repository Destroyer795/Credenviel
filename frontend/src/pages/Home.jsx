import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
  IconDatabase,
  IconArrowRight,
  IconSparkles,
} from '../components/Icons'

export function Home() {
  const [apiOnline, setApiOnline] = useState(null)
  const [activeStep, setActiveStep] = useState(3)

  useEffect(() => {
    checkHealth().then(setApiOnline)
  }, [])

  return (
    <div className="page-container">
      {/* Hero Section */}
      <div className="hero-wrapper">
        <div className="hero-pill-tag">
          <IconActivity size={14} color="var(--ice-blue)" />
          <span>Azure Zero-Trust Architecture</span>
          <span style={{ color: 'var(--slate-blue-light)' }}>•</span>
          <span style={{ color: apiOnline ? 'var(--status-emerald)' : apiOnline === false ? 'var(--status-rose)' : 'var(--slate-blue-light)' }}>
            {apiOnline ? 'Backend API Active' : apiOnline === false ? 'API Standby (Interactive Demo)' : 'Checking Health...'}
          </span>
        </div>

        <h1 className="hero-title">
          Cryptographic Certificate Digitization & <span className="hero-title-highlight">Tamper-Evident Verification</span>
        </h1>

        <p className="hero-desc">
          Cloud-native event pipeline ingesting academic credentials via direct SAS storage, extracting records with dual-engine OCR, enforcing registrar human-in-the-loop review, and sealing immutable SHA-256 proofs.
        </p>

        <div className="hero-cta-group">
          <Link to="/student" className="btn btn-primary" id="btn-hero-student">
            <IconGraduationCap size={18} />
            <span>Submit Document</span>
          </Link>
          <Link to="/issuer" className="btn btn-secondary" id="btn-hero-issuer">
            <IconBuilding size={18} />
            <span>Registrar Dashboard</span>
          </Link>
          <Link to="/verify/demo-cert" className="btn btn-secondary" id="btn-hero-verify">
            <IconShield size={18} />
            <span>Verify Credential</span>
          </Link>
        </div>

        {/* Live Interactive Pipeline Preview Card */}
        <div className="hero-pipeline-preview">
          <div className="pipeline-preview-header">
            <div className="pipeline-terminal-dots">
              <div className="terminal-dot dot-red" />
              <div className="terminal-dot dot-amber" />
              <div className="terminal-dot dot-green" />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--slate-blue-light)' }}>
              PIPELINE TELEMETRY: AZURE_SERVICE_BUS // SESSION_DISPATCH
            </div>
          </div>

          <div className="pipeline-flow-chips">
            <div
              className={`pipeline-chip ${activeStep === 1 ? 'active' : ''}`}
              onClick={() => setActiveStep(1)}
              style={{ cursor: 'pointer' }}
            >
              <div className="chip-step-num">Step 01</div>
              <div className="chip-step-title">Direct Blob SAS</div>
              <div className="chip-step-sub">0 ms API compute ingest</div>
            </div>

            <div
              className={`pipeline-chip ${activeStep === 2 ? 'active' : ''}`}
              onClick={() => setActiveStep(2)}
              style={{ cursor: 'pointer' }}
            >
              <div className="chip-step-num">Step 02</div>
              <div className="chip-step-title">Event Grid Routing</div>
              <div className="chip-step-sub">Decoupled queue dispatch</div>
            </div>

            <div
              className={`pipeline-chip ${activeStep === 3 ? 'active' : ''}`}
              onClick={() => setActiveStep(3)}
              style={{ cursor: 'pointer' }}
            >
              <div className="chip-step-num">Step 03</div>
              <div className="chip-step-title">Dual-Engine OCR</div>
              <div className="chip-step-sub">0.85 Confidence threshold</div>
            </div>

            <div
              className={`pipeline-chip ${activeStep === 4 ? 'active' : ''}`}
              onClick={() => setActiveStep(4)}
              style={{ cursor: 'pointer' }}
            >
              <div className="chip-step-num">Step 04</div>
              <div className="chip-step-title">QR & HSM Seal</div>
              <div className="chip-step-sub">SHA-256 tamper proof</div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance & Architectural Metrics Ribbon */}
      <div className="metrics-ribbon">
        <div className="metric-stat-card">
          <div className="metric-stat-value">0.0 ms</div>
          <div className="metric-stat-label">API Compute Ingest</div>
          <div className="metric-stat-sub">Direct client-to-blob SAS PUT</div>
        </div>
        <div className="metric-stat-card">
          <div className="metric-stat-value">&lt; 1.2s</div>
          <div className="metric-stat-label">Queue Latency</div>
          <div className="metric-stat-sub">Azure Service Bus messaging</div>
        </div>
        <div className="metric-stat-card">
          <div className="metric-stat-value">0.85</div>
          <div className="metric-stat-label">Confidence Threshold</div>
          <div className="metric-stat-sub">Registrar audit review gate</div>
        </div>
        <div className="metric-stat-card">
          <div className="metric-stat-value">256-bit</div>
          <div className="metric-stat-label">Cryptographic Proofs</div>
          <div className="metric-stat-sub">SHA-256 canonical hashing</div>
        </div>
      </div>

      {/* Core Architectural Pillars Grid */}
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
            Azure Event Grid captures blob creations and triggers Azure Functions to enqueue jobs into Azure Service Bus, enabling KEDA worker auto-scaling from 0 to N replicas.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-wrapper">
            <IconScale size={22} />
          </div>
          <h3 className="feature-title">Registrar Human-in-the-Loop Gate</h3>
          <p className="feature-desc">
            Documents with optical character recognition confidence below 0.85 route to the split-screen review station for registrar verification, ledger audit, and approval.
          </p>
        </div>

        <div className="feature-box">
          <div className="feature-icon-wrapper">
            <IconLock size={22} />
          </div>
          <h3 className="feature-title">Cryptographic Tamper Detection</h3>
          <p className="feature-desc">
            Canonical field normalization and SHA-256 source hashing guarantee that any subsequent alteration of marks, grades, or names renders the verification invalid.
          </p>
        </div>
      </div>

      {/* End-to-End Visual Stepper */}
      <div className="glass-panel" style={{ padding: '2.5rem', marginBottom: '3.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
            Verification Lifecycle Architecture
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            From raw document ingestion to cryptographic verification
          </p>
        </div>

        <div className="stepper">
          <div className="step-item completed">
            <div className="step-circle">1</div>
            <div>
              <div className="step-label">SAS Generation</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>API creates bounded token</div>
            </div>
          </div>
          <div className="step-item completed">
            <div className="step-circle">2</div>
            <div>
              <div className="step-label">Direct Storage PUT</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Bypasses web compute</div>
            </div>
          </div>
          <div className="step-item completed">
            <div className="step-circle">3</div>
            <div>
              <div className="step-label">Event Grid Queue</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Service Bus enqueue</div>
            </div>
          </div>
          <div className="step-item completed">
            <div className="step-circle">4</div>
            <div>
              <div className="step-label">Worker OCR Extract</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Confidence score gate</div>
            </div>
          </div>
          <div className="step-item active">
            <div className="step-circle">5</div>
            <div>
              <div className="step-label">Review or Seal</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>QR-stamped PDF output</div>
            </div>
          </div>
        </div>
      </div>

      {/* Institutional Trust & Security Standards */}
      <div className="glass-panel" style={{ padding: '2.25rem', borderColor: 'var(--border-slate)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ice-blue-light)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
              <IconLock size={16} />
              <span>Azure Key Vault HSM</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Hardware security module key storage with role-based access control and managed identity isolation.
            </p>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ice-blue-light)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
              <IconCheckCircle size={16} />
              <span>FERPA Privacy Preserved</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Public verification endpoints omit student registration numbers and granular grade rosters by design.
            </p>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ice-blue-light)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
              <IconSparkles size={16} />
              <span>Zero Cloud Cost Trap</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Offline mocks and serverless scale-to-zero configurations protect cloud credits during idle periods.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
