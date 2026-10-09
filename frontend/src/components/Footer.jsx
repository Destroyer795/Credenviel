import React from 'react'
import { Link } from 'react-router-dom'
import { Logo } from './Logo'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="app-footer">
      <div className="footer-container">
        {/* Top Section */}
        <div className="footer-top">
          {/* Brand & Overview */}
          <div className="footer-brand-col">
            <Link to="/" className="footer-brand-link">
              <Logo size={24} />
              <span className="footer-brand-name">Credenviel</span>
            </Link>
            <p className="footer-brand-desc">
              Zero-trust academic credential issuance and cryptographic verification platform powered by tamper-evident event pipelines.
            </p>
            <div className="footer-status-tag">
              <span className="footer-status-dot" />
              <span>System Operational</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="footer-nav-col">
            <h4 className="footer-heading">Platform</h4>
            <ul className="footer-link-list">
              <li><Link to="/">Home Overview</Link></li>
              <li><Link to="/student">Student Document Portal</Link></li>
              <li><Link to="/issuer">Registrar Dashboard</Link></li>
              <li><Link to="/issuer/review">Review Station</Link></li>
              <li><Link to="/verify">Public Verifier</Link></li>
            </ul>
          </div>

          {/* Institutional Security Standards */}
          <div className="footer-nav-col">
            <h4 className="footer-heading">Security Standards</h4>
            <ul className="footer-link-list">
              <li><span className="footer-static-item">Zero-Trust SAS Ingestion</span></li>
              <li><span className="footer-static-item">Human-in-the-Loop Gate</span></li>
              <li><span className="footer-static-item">SHA-256 Tamper-Proof Seals</span></li>
              <li><span className="footer-static-item">Hardware Security Module Isolation</span></li>
              <li><span className="footer-static-item">FERPA Privacy Preserved</span></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <div className="footer-copyright">
            © {currentYear} Credenviel. All rights reserved.
          </div>
          <div className="footer-meta">
            <span>Academic Credential Verification System</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
