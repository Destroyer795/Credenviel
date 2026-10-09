import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { IconLock, IconAlertTriangle, IconGraduationCap, IconBuilding, IconShield, IconArrowRight } from './Icons'
import { AuthModal } from './AuthModal'

export function ProtectedRoute({ allowedRoles, children }) {
  const { user, isAuthenticated, logout } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const navigate = useNavigate()

  // 1. Unauthenticated state
  if (!isAuthenticated) {
    return (
      <div className="page-container" style={{ minHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ maxWidth: '540px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--ice-blue-light)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
              border: '1px solid var(--border-ice)',
            }}
          >
            <IconLock size={26} color="var(--ice-blue-dark)" />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Campus Authentication Required
          </h2>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-sub)', lineHeight: 1.55, marginBottom: '2rem' }}>
            This portal is restricted to authorized university students, registrars, and administrative staff. Please sign in or register your institutional profile to continue.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}
              onClick={() => setAuthModalOpen(true)}
            >
              <span>Sign In / Register Profile</span>
            </button>

            <Link
              to="/"
              className="btn btn-secondary"
              style={{ width: '100%', padding: '0.7rem', justifyContent: 'center' }}
            >
              <span>Return to Home Page</span>
            </Link>
          </div>
        </div>

        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      </div>
    )
  }

  // 2. Insufficient permissions state
  if (!allowedRoles.includes(user.role)) {
    const roleLabels = {
      student: 'Student',
      issuer: 'Registrar',
      admin: 'HITL Review Administrator',
    }

    const homePortalRoutes = {
      student: '/student',
      issuer: '/issuer',
      admin: '/issuer/review',
    }

    const requiredLabels = allowedRoles.map((r) => roleLabels[r] || r).join(' or ')

    return (
      <div className="page-container" style={{ minHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ maxWidth: '540px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--status-amber-tint)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
              border: '1px solid rgba(217, 119, 6, 0.3)',
            }}
          >
            <IconAlertTriangle size={26} color="var(--status-amber)" />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Restricted Portal Access
          </h2>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-sub)', lineHeight: 1.55, marginBottom: '1.25rem' }}>
            This station requires an active <strong>{requiredLabels}</strong> identity. You are currently authenticated as{' '}
            <strong>{user.name}</strong> ({roleLabels[user.role] || user.role}).
          </p>

          <div
            style={{
              background: 'var(--bg-frost)',
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1.75rem',
              fontSize: '0.8rem',
              color: 'var(--text-sub)',
              textAlign: 'left',
            }}
          >
            <div><strong>Active Account:</strong> {user.email || user.oid}</div>
            <div><strong>Granted Role:</strong> {roleLabels[user.role] || user.role}</div>
            <div><strong>Required Role:</strong> {requiredLabels}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link
              to={homePortalRoutes[user.role] || '/'}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}
            >
              <span>Navigate to My Authorized Portal</span>
              <IconArrowRight size={16} />
            </Link>

            <button
              className="btn btn-secondary"
              style={{ width: '100%', padding: '0.7rem', justifyContent: 'center' }}
              onClick={() => {
                logout()
                setAuthModalOpen(true)
              }}
            >
              <span>Switch Identity / Re-authenticate</span>
            </button>
          </div>
        </div>

        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      </div>
    )
  }

  // 3. Authorized — render children
  return children
}
