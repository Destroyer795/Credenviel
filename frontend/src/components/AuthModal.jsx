import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { IconX, IconGraduationCap, IconBuilding, IconCheckCircle, IconLock } from './Icons'

export function AuthModal({ isOpen, onClose, initialPreset = null, initialRole = 'issuer' }) {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(initialRole || 'issuer')
  const [error, setError] = useState('')

  const handleQuickLoad = (targetRole) => {
    if (targetRole === 'student') {
      setName('Alice Chen')
      setEmail('alice.chen@student.university.edu')
      setRole('student')
    } else {
      setName('University Exam Cell')
      setEmail('examcell@university.edu')
      setRole('issuer')
    }
    setError('')
  }

  useEffect(() => {
    if (isOpen) {
      setError('')
      if (initialPreset === 'student') {
        handleQuickLoad('student')
      } else if (initialPreset === 'issuer') {
        handleQuickLoad('issuer')
      } else {
        setName('')
        setEmail('')
        setRole(initialRole || 'issuer')
      }
    }
  }, [isOpen, initialPreset, initialRole])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const cleanEmail = email.trim()
    const cleanName = name.trim()

    if (!cleanEmail) {
      setError('Please provide a valid institutional email address.')
      return
    }

    if (!cleanEmail.includes('@')) {
      setError('Please enter a valid institutional email address.')
      return
    }

    if (!cleanName) {
      setError('Please provide your full name.')
      return
    }

    login({
      name: cleanName,
      email: cleanEmail,
      role: role,
    })

    onClose()

    if (role === 'student') {
      navigate('/student')
    } else {
      navigate('/issuer')
    }
  }

  const modalContent = (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div
        className="auth-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <div className="auth-modal-header">
          <div>
            <h3 id="auth-modal-title" className="auth-modal-title">
              {isSignUp ? 'Create Campus Account' : 'Campus Identity Access'}
            </h3>
            <p className="auth-modal-sub">
              {isSignUp
                ? 'Register your university profile for credential issuance and digitization'
                : 'Sign in with your university college email'}
            </p>
          </div>
          <button className="auth-modal-close" onClick={onClose} aria-label="Close modal">
            <IconX size={18} />
          </button>
        </div>

        {error && <div className="auth-modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-modal-form">
          {/* Role Selector Tabs - Exactly 2 Roles */}
          <div className="auth-role-group">
            <label className="auth-field-label">Select University Role</label>
            <div className="auth-role-selector">
              <button
                type="button"
                className={`auth-role-btn ${role === 'issuer' ? 'active' : ''}`}
                onClick={() => setRole('issuer')}
              >
                <IconBuilding size={16} />
                <span>Exam Cell (Issuer)</span>
              </button>
              <button
                type="button"
                className={`auth-role-btn ${role === 'student' ? 'active' : ''}`}
                onClick={() => setRole('student')}
              >
                <IconGraduationCap size={16} />
                <span>Student</span>
              </button>
            </div>
          </div>

          {/* Full Name */}
          <div className="auth-field-group">
            <label className="auth-field-label" htmlFor="auth-name">
              Full Name
            </label>
            <input
              id="auth-name"
              type="text"
              className="auth-input"
              placeholder={role === 'issuer' ? 'e.g. Exam Cell Staff / Registrar' : 'e.g. Alice Chen'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* College Email */}
          <div className="auth-field-group">
            <label className="auth-field-label" htmlFor="auth-email">
              Institutional Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              className="auth-input"
              placeholder={role === 'issuer' ? 'examcell@university.edu' : 'student@university.edu'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-modal-actions">
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
              <span>{isSignUp ? 'Create Profile & Enter' : 'Sign In to Campus Portal'}</span>
            </button>
          </div>
        </form>

        {/* Quick Testing Presets */}
        <div className="auth-quick-presets">
          <span className="auth-presets-label">Testing Presets:</span>
          <div className="auth-presets-btns">
            <button
              type="button"
              className="auth-preset-chip"
              onClick={() => handleQuickLoad('issuer')}
            >
              <IconBuilding size={13} style={{ marginRight: '4px' }} />
              Exam Cell Staff (Issuer)
            </button>
            <button
              type="button"
              className="auth-preset-chip"
              onClick={() => handleQuickLoad('student')}
            >
              <IconGraduationCap size={13} style={{ marginRight: '4px' }} />
              Alice Chen (Student)
            </button>
            <button
              type="button"
              className="auth-preset-chip"
              style={{ color: 'var(--text-muted)' }}
              onClick={() => {
                setName('')
                setEmail('')
                setError('')
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="auth-modal-footer">
          <button
            type="button"
            className="auth-toggle-mode"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError('')
            }}
          >
            {isSignUp
              ? 'Already registered? Click to Sign In'
              : 'New student or exam cell staff? Click to Register'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
