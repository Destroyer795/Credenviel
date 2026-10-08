import React, { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  IconShield,
  IconGraduationCap,
  IconBuilding,
  IconScale,
  IconMenu,
  IconX,
  IconRefresh,
} from './Icons'

export function Navbar() {
  const { user, isStudent, isIssuer, switchDemoUser, loginWithEntra, isEntraConfigured, authMode } = useAuth()
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
        <Link to="/" className="brand-link" id="nav-brand-logo" onClick={closeMobileMenu}>
          <div className="brand-icon">
            <IconShield size={20} color="#ffffff" />
          </div>
          <span className="brand-name">Credenviel</span>
          <span className="brand-badge">Azure Native</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="nav-links" id="main-navigation">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-home" end>
            Home
          </NavLink>
          <NavLink to="/student" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-student">
            <IconGraduationCap size={16} className="nav-item-icon" />
            Student Portal
          </NavLink>
          <NavLink to="/issuer" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-issuer">
            <IconBuilding size={16} className="nav-item-icon" />
            Issuer Dashboard
          </NavLink>
          <NavLink to="/issuer/review" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-review">
            <IconScale size={16} className="nav-item-icon" />
            Review Station
          </NavLink>
          <NavLink to="/verify/demo-cert" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-verify">
            <IconShield size={16} className="nav-item-icon" />
            Public Verifier
          </NavLink>
        </nav>

        {/* User Controls & Persona Switch */}
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
                    <span style={{ fontSize: '0.65rem', color: 'var(--soft-blue-dark)' }}>Entra</span>
                  ) : (
                    <span style={{ fontSize: '0.65rem', color: 'var(--slate-blue)' }}>Dev Mode</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <button
            id="btn-toggle-persona"
            className="persona-btn"
            onClick={handleTogglePersona}
            title="Switch Persona for Testing"
          >
            <IconRefresh size={14} />
            <span>Switch to {isStudent ? 'Issuer' : 'Student'}</span>
          </button>

          {isEntraConfigured && authMode !== 'entra' && (
            <button
              id="btn-login-entra"
              className="persona-btn"
              style={{ borderColor: 'var(--border-ice)', color: 'var(--slate-blue-dark)' }}
              onClick={loginWithEntra}
            >
              Microsoft Entra
            </button>
          )}

          {/* Mobile Hamburger Button */}
          <button
            className="mobile-nav-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="mobile-menu-drawer">
          <NavLink
            to="/"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
            end
          >
            Home
          </NavLink>
          <NavLink
            to="/student"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <IconGraduationCap size={16} className="nav-item-icon" />
            Student Portal
          </NavLink>
          <NavLink
            to="/issuer"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <IconBuilding size={16} className="nav-item-icon" />
            Issuer Dashboard
          </NavLink>
          <NavLink
            to="/issuer/review"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <IconScale size={16} className="nav-item-icon" />
            Review Station
          </NavLink>
          <NavLink
            to="/verify/demo-cert"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            <IconShield size={16} className="nav-item-icon" />
            Public Verifier
          </NavLink>
        </div>
      )}
    </header>
  )
}
