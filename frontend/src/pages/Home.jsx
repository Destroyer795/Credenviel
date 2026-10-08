import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { checkHealth } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function Home() {
  const { isStudent } = useAuth()
  const [apiOnline, setApiOnline] = useState(null)

  useEffect(() => {
    checkHealth().then(setApiOnline)
  }, [])

  return (
    <div className="page-container">
      <div style={{ textAlign: 'center', maxWidth: '850px', margin: '1rem auto 3.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.85rem', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '999px', fontSize: '0.8rem', color: '#a5b4fc', marginBottom: '1.25rem' }}>
          <span>Azure Native Architecture</span>
          <span>•</span>
          <span style={{ color: apiOnline ? '#10b981' : apiOnline === false ? '#f43f5e' : '#94a3b8' }}>
            {apiOnline ? '● Backend API Connected' : apiOnline === false ? '○ Backend API Standby' : 'Checking Health...'}
          </span>
        </div>

        <h1 style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: '1.25rem' }}>
          Zero-Trust Certificate Digitization & Cryptographic Verification
        </h1>

        <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2.5rem' }}>
          Credenviel is an event-driven, cloud-native document pipeline that ingests academic credentials, extracts structured records using OCR, flags low-confidence anomalies for human review, and seals tamper-evident proofs.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/student" className="btn btn-primary" id="btn-hero-student">
            🎓 Open Student Portal
          </Link>
          <Link to="/issuer" className="btn btn-secondary" id="btn-hero-issuer">
            🏛️ Open Issuer Dashboard
          </Link>
          <Link to="/verify/demo-cert" className="btn btn-secondary" id="btn-hero-verify">
            🛡️ Verify Certificate
          </Link>
        </div>
      </div>

      {/* Feature Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div className="glass-panel">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', marginBottom: '1rem', fontSize: '1.25rem' }}>
            ☁️
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Direct-to-Blob Uploads</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Client uploads bypass the API compute layer entirely via short-lived Azure Blob Storage SAS tokens with strict mime-type and size bounds.
          </p>
        </div>

        <div className="glass-panel">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', marginBottom: '1rem', fontSize: '1.25rem' }}>
            ⚡
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Asynchronous Event Processing</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Azure Event Grid notifies serverless Azure Functions upon blob creation, enqueueing jobs onto Azure Service Bus for Python worker auto-scaling via KEDA.
          </p>
        </div>

        <div className="glass-panel">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: '1rem', fontSize: '1.25rem' }}>
            ⚖️
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Human-in-the-Loop Review</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Records with extraction confidence below the 0.85 threshold are automatically flagged for registrar review in the split-screen comparison station.
          </p>
        </div>
      </div>

      {/* Pipeline Flow Stepper Overview */}
      <div className="glass-panel" style={{ padding: '2.5rem' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem', textAlign: 'center' }}>
          End-to-End Pipeline Architecture
        </h3>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem', marginBottom: '2rem' }}>
          From raw document submission to cryptographic verification
        </p>

        <div className="stepper">
          <div className="step-item completed">
            <div className="step-circle">1</div>
            <div className="step-label">SAS Request</div>
          </div>
          <div className="step-item completed">
            <div className="step-circle">2</div>
            <div className="step-label">Direct Blob PUT</div>
          </div>
          <div className="step-item completed">
            <div className="step-circle">3</div>
            <div className="step-label">Event Grid & Queue</div>
          </div>
          <div className="step-item completed">
            <div className="step-circle">4</div>
            <div className="step-label">Worker OCR</div>
          </div>
          <div className="step-item active">
            <div className="step-circle">5</div>
            <div className="step-label">Review / Proof</div>
          </div>
        </div>
      </div>
    </div>
  )
}
