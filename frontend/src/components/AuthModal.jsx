import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth, describeAuthError } from '../auth/AuthContext'
import { IconX } from './Icons'

const MODES = {
  signin: {
    title: 'Campus Identity Access',
    sub: 'Sign in with your university account',
    submit: 'Sign In to Campus Portal',
  },
  signup: {
    title: 'Create Campus Account',
    sub: 'Register your university profile for credential issuance and digitization',
    submit: 'Create Account & Enter',
  },
  reset: {
    title: 'Reset Password',
    sub: 'We will email you a link to choose a new password',
    submit: 'Send Reset Link',
  },
}

export function AuthModal({ isOpen, onClose }) {
  const {
    user,
    sessionError,
    isFirebaseConfigured,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resetPassword,
  } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMode('signin')
      setName('')
      setEmail('')
      setPassword('')
      setError('')
      setNotice('')
      setBusy(false)
    }
  }, [isOpen])

  // Once Firebase signs the user in and the API confirms their role, route to their portal.
  useEffect(() => {
    if (isOpen && user) {
      onClose()
      navigate(user.role === 'issuer' ? '/issuer' : '/student')
    }
  }, [isOpen, user, onClose, navigate])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const copy = MODES[mode]

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setNotice('')
  }

  const run = async (action) => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(describeAuthError(err))
      setBusy(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (mode === 'signup' && !name.trim()) {
      setError('Please provide your full name.')
      return
    }
    if (mode === 'reset') {
      run(async () => {
        await resetPassword(email)
        setNotice('If an account exists for that email, a reset link is on its way.')
        setBusy(false)
      })
      return
    }
    run(() =>
      mode === 'signup' ? signUpWithEmail({ name, email, password }) : signInWithEmail(email, password),
    )
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
              {copy.title}
            </h3>
            <p className="auth-modal-sub">{copy.sub}</p>
          </div>
          <button className="auth-modal-close" onClick={onClose} aria-label="Close modal">
            <IconX size={18} />
          </button>
        </div>

        {!isFirebaseConfigured && (
          <div className="auth-modal-error">
            Sign-in is unavailable: Firebase is not configured for this build.
          </div>
        )}
        {(error || sessionError) && <div className="auth-modal-error">{error || sessionError}</div>}
        {notice && <div className="auth-modal-notice">{notice}</div>}

        <form onSubmit={handleSubmit} className="auth-modal-form">
          {mode === 'signup' && (
            <div className="auth-field-group">
              <label className="auth-field-label" htmlFor="auth-name">
                Full Name
              </label>
              <input
                id="auth-name"
                type="text"
                className="auth-input"
                placeholder="e.g. Alice Chen"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-field-group">
            <label className="auth-field-label" htmlFor="auth-email">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              className="auth-input"
              placeholder="you@university.edu"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode !== 'reset' && (
            <div className="auth-field-group">
              <label className="auth-field-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                className="auth-input"
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-modal-actions">
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem' }}
              disabled={busy || !isFirebaseConfigured}
            >
              <span>{busy ? 'Please wait…' : copy.submit}</span>
            </button>
          </div>
        </form>

        {mode !== 'reset' && (
          <>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', padding: '0.7rem', justifyContent: 'center' }}
              disabled={busy || !isFirebaseConfigured}
              onClick={() => run(signInWithGoogle)}
            >
              <span>Continue with Google</span>
            </button>
          </>
        )}

        <div className="auth-modal-footer">
          {mode === 'signin' && (
            <>
              <button type="button" className="auth-toggle-mode" onClick={() => switchMode('signup')}>
                New student or exam cell staff? Create an account
              </button>
              <button type="button" className="auth-toggle-mode" onClick={() => switchMode('reset')}>
                Forgot your password?
              </button>
            </>
          )}
          {mode !== 'signin' && (
            <button type="button" className="auth-toggle-mode" onClick={() => switchMode('signin')}>
              Already registered? Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
