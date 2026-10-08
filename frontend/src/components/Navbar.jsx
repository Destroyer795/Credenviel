import React, { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Logo } from './Logo'
import { IconMenu, IconX, IconRefresh } from './Icons'

export function Navbar() {
  const { user, isStudent, switchDemoUser, loginWithEntra, isEntraConfigured, authMode } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleTogglePersona = () => {
    if (isStudent) {
      switchDemoUser('issuer')
    } else {
      switchDemoUser('student')
    }
  }

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
  }

  return (
    <header className="app-header">
      <div className="header-container">
        {/* Brand */}
        <Link to="/" className="brand-link" id="nav-brand-logo" onClick={closeMobileMenu}>
          <Logo size={30} />
          <span className="brand-name">Credenviel</span>
        </Link>

        {/* Center Navigation Segment */}
        <nav className="nav-links" id="main-navigation">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-home" end>
            Home
          </NavLink>
          <NavLink to="/student" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-student">
            Student
          </NavLink>
          <NavLink to="/issuer" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-issuer" end>
            Registrar
          </NavLink>
          <NavLink to="/issuer/review" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-review">
            Review
          </NavLink>
          <NavLink to="/verify/demo-cert" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-verify">
            Verify
          </NavLink>
        </nav>

        {/* Right Controls: Unified Persona Switcher */}
        <div className="user-controls">
          <div className="persona-switcher" id="persona-switcher-container">
            <button
              id="btn-toggle-persona"
              className="persona-switch-btn"
              onClick={handleTogglePersona}
              title={`Active as ${user?.role || (isStudent ? 'student' : 'issuer')}. Click to switch persona.`}
            >
              <span className="persona-indicator" />
              <span className="persona-name">{user?.name || (isStudent ? 'Alice Chen' : 'Registrar Office')}</span>
              <span className={`persona-role-badge ${isStudent ? 'student' : 'issuer'}`}>
                {isStudent ? 'Student' : 'Registrar'}
              </span>
              <IconRefresh size={12} style={{ color: 'var(--slate-blue)', marginLeft: '2px' }} />
            </button>
          </div>

          {isEntraConfigured && authMode !== 'entra' && (
            <button
              id="btn-login-entra"
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.38rem 0.75rem' }}
              onClick={loginWithEntra}
            >
              Entra ID
            </button>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            className="mobile-nav-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <IconX size={18} /> : <IconMenu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-menu-drawer">
          <NavLink
            to="/"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
            end
          >
            Home
          </NavLink>
          <NavLink
            to="/student"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            Student Portal
          </NavLink>
          <NavLink
            to="/issuer"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
            end
          >
            Registrar Dashboard
          </NavLink>
          <NavLink
            to="/issuer/review"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            Review Station
          </NavLink>
          <NavLink
            to="/verify/demo-cert"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            Public Verifier
          </NavLink>
        </div>
      )}
    </header>
  )
}
