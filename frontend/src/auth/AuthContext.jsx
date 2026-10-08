import React, { createContext, useContext, useState, useEffect } from 'react'
import { isEntraConfigured, msalInstance, loginRequest } from './msalConfig'

const AuthContext = createContext(null)

export const DEMO_USERS = {
  student: {
    oid: 'student-oid-alice',
    name: 'Alice Chen',
    role: 'student',
    email: 'alice.chen@student.university.edu',
    title: 'Candidate for B.S. Computer Science',
  },
  issuer: {
    oid: 'issuer-oid-eleanor',
    name: 'Dr. Eleanor Vance',
    role: 'issuer',
    email: 'e.vance@university.edu',
    title: 'University Dean of Academic Affairs & Registrar',
  },
}

// Generates a mock HS256 / Base64 JWT token for local testing and offline viva presentations
function createMockJWT(user) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    oid: user.oid,
    sub: user.oid,
    name: user.name,
    email: user.email,
    roles: [user.role === 'issuer' ? 'Issuer' : 'Student'],
    role: user.role === 'issuer' ? 'Issuer' : 'Student',
    iat: now,
    exp: now + 86400, // 24h
    iss: 'https://credenviel.local/v2.0',
    aud: 'api://credenviel',
  }

  const b64 = (obj) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

  const headPart = b64(header)
  const payloadPart = b64(payload)
  // Standard mock signature part
  const sigPart = 'mock-signature-for-development-and-viva'

  return `${headPart}.${payloadPart}.${sigPart}`
}

export function AuthProvider({ children }) {
  // Default to student persona for immediate out-of-the-box readiness
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('credenviel_user')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // ignore
      }
    }
    return DEMO_USERS.student
  })

  const [token, setToken] = useState(() => {
    return localStorage.getItem('credenviel_token') || createMockJWT(DEMO_USERS.student)
  })

  const [authMode, setAuthMode] = useState(() => {
    return isEntraConfigured ? 'entra' : 'demo'
  })

  useEffect(() => {
    if (user) {
      localStorage.setItem('credenviel_user', JSON.stringify(user))
      const tok = createMockJWT(user)
      setToken(tok)
      localStorage.setItem('credenviel_token', tok)
    }
  }, [user])

  // Fast persona switcher for testing and viva presentation
  const switchDemoUser = (roleKey) => {
    const selected = DEMO_USERS[roleKey] || DEMO_USERS.student
    setUser(selected)
    const tok = createMockJWT(selected)
    setToken(tok)
    setAuthMode('demo')
  }

  // Real Entra ID login via MSAL popup
  const loginWithEntra = async () => {
    if (!msalInstance) {
      console.warn('MSAL instance is not configured. Falling back to Demo mode.')
      return
    }

    try {
      const response = await msalInstance.loginPopup(loginRequest)
      const claims = response.idTokenClaims || {}
      const roleClaim = claims.roles?.[0] || 'student'
      const normalizedRole = roleClaim.toLowerCase().includes('issuer') ? 'issuer' : 'student'

      const entraUser = {
        oid: response.account.homeAccountId || claims.oid || claims.sub,
        name: response.account.name || claims.name || 'Entra User',
        email: response.account.username || claims.preferred_username || '',
        role: normalizedRole,
        title: normalizedRole === 'issuer' ? 'Verified Entra Issuer' : 'Verified Entra Student',
      }

      setUser(entraUser)
      setToken(response.idToken || response.accessToken)
      setAuthMode('entra')
    } catch (err) {
      console.error('Entra login error:', err)
      alert(`Microsoft Entra login failed: ${err.message}`)
    }
  }

  const logout = () => {
    setUser(null)
    setToken('')
    localStorage.removeItem('credenviel_user')
    localStorage.removeItem('credenviel_token')
  }

  const isStudent = user?.role === 'student'
  const isIssuer = user?.role === 'issuer'
  const isAuthenticated = Boolean(user)

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        authMode,
        isStudent,
        isIssuer,
        isAuthenticated,
        switchDemoUser,
        loginWithEntra,
        logout,
        isEntraConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
