import React, { useState } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Logo } from './Logo'
import { IconMenu, IconX, IconUser, IconLogOut } from './Icons'
import { AuthModal } from './AuthModal'

export function Navbar() {
  const { user, isStudent, isIssuer, isAuthenticated, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [modalPreset, setModalPreset] = useState(null)
  const navigate = useNavigate()

  const handleOpenAuth = (preset = null) => {
    setModalPreset(preset)
    setAuthModalOpen(true)
  }

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
  }

  const handleSignOut = () => {
    logout()
    closeMobileMenu()
    navigate('/')
  }

  return (
    <header className="app-header">
      <div className="header-container">
        {/* Brand */}
        <Link to="/" className="brand-link" id="nav-brand-logo" onClick={closeMobileMenu}>
          <Logo size={28} />
          <span className="brand-name">Credenviel</span>
        </Link>

        {/* Center Navigation - Sleek, pure text, strictly role-based */}
        <nav className="nav-links" id="main-navigation">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-home" end>
            Home
          </NavLink>

          {isStudent && (
            <NavLink to="/student" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-student">
              My Certificates
            </NavLink>
          )}

          {isIssuer && (
            <>
              <NavLink to="/issuer" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-issuer" end>
                Exam Cell
              </NavLink>
              <NavLink to="/issuer/review" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-review">
                Review Station
              </NavLink>
            </>
          )}

          <NavLink to="/verify" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} id="nav-link-verify">
            Verify
          </NavLink>
        </nav>

        {/* Right Controls */}
        <div className="user-controls">
          {isAuthenticated ? (
            <div className="nav-user-pill">
              <div className="nav-user-avatar">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="nav-user-info">
                <span className="nav-user-name">{user.name}</span>
                <span className={`nav-user-role ${user.role}`}>
                  {user.role === 'issuer' ? 'Exam Cell' : 'Student'}
                </span>
              </div>
              <button
                id="btn-sign-out"
                className="nav-sign-out-btn"
                onClick={handleSignOut}
                title="Sign out of account"
              >
                <IconLogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              id="btn-open-auth-modal"
              className="nav-sign-in-btn"
              onClick={() => handleOpenAuth(null)}
            >
              Sign In
            </button>
          )}

          {/* Mobile Toggle */}
          <button
            className="mobile-nav-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
          </button>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialPreset={modalPreset}
        onClose={() => {
          setAuthModalOpen(false)
          setModalPreset(null)
        }}
      />

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

          {isStudent && (
            <NavLink
              to="/student"
              className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
              onClick={closeMobileMenu}
            >
              My Certificates
            </NavLink>
          )}

          {isIssuer && (
            <>
              <NavLink
                to="/issuer"
                className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
                onClick={closeMobileMenu}
                end
              >
                Exam Cell Dashboard
              </NavLink>
              <NavLink
                to="/issuer/review"
                className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                Review Station
              </NavLink>
            </>
          )}

          <NavLink
            to="/verify"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMobileMenu}
          >
            Verify Credential
          </NavLink>

          <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)', marginTop: '0.5rem' }}>
            {isAuthenticated ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                  Signed in as <strong>{user.name}</strong> ({user.role === 'issuer' ? 'Exam Cell' : 'Student'})
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  onClick={handleSignOut}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '0.85rem' }}
                onClick={() => {
                  closeMobileMenu()
                  handleOpenAuth(null)
                }}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
