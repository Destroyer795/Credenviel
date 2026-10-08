import React from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Navbar() {
  const { user, isStudent, isIssuer, switchDemoUser, loginWithEntra, isEntraConfigured, authMode } = useAuth()

  const handleTogglePersona = () => {
    if (isStudent) {
      switchDemoUser('issuer')
    } else {
      switchDemoUser('student')
    }
  }

  return (
    <header className="app-header">
      <div className="header-container">
        <Link to="/" className="brand-link" id="nav-brand-logo">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <span>Credenviel</span>
          <span className="brand-badge">Azure Pipeline</span>
        </Link>

        <nav className="nav-links" id="main-navigation">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-home" end>
            Home
          </NavLink>
          <NavLink to="/student" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-student">
            🎓 Student Portal
          </NavLink>
          <NavLink to="/issuer" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-issuer">
            🏛️ Issuer Dashboard
          </NavLink>
          <NavLink to="/issuer/review" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-review">
            ⚖️ Review Station
          </NavLink>
          <NavLink to="/verify/demo-cert" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-verify">
            🛡️ Public Verifier
          </NavLink>
        </nav>

        <div className="user-controls">
          {user && (
            <div className="user-pill" id="current-user-pill">
              <div className="avatar">
                {user.name ? user.name[0] : 'U'}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.1 }}>
                  {user.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
                  <span className={`role-tag ${user.role}`}>
                    {user.role}
                  </span>
                  {authMode === 'entra' ? (
                    <span style={{ fontSize: '0.65rem', color: '#38bdf8' }}>● Entra</span>
                  ) : (
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>● Dev Mode</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <button
            id="btn-toggle-persona"
            className="persona-btn"
            onClick={handleTogglePersona}
            title="Switch Persona for Testing & Viva"
          >
            {isStudent ? 'Switch to Issuer 🏛️' : 'Switch to Student 🎓'}
          </button>

          {isEntraConfigured && authMode !== 'entra' && (
            <button
              id="btn-login-entra"
              className="persona-btn"
              style={{ borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
              onClick={loginWithEntra}
            >
              Sign in with Microsoft
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
