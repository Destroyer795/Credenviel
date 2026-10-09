import React, { createContext, useContext, useState, useEffect } from 'react'
import { isEntraConfigured, msalInstance, loginRequest } from './msalConfig'

const AuthContext = createContext(null)

export const DEMO_USERS = {
  issuer: {
    oid: 'issuer-oid-examcell',
    name: 'University Exam Cell',
    role: 'issuer',
    email: 'examcell@university.edu',
    title: 'Exam Cell Staff & Issuer',
  },
  student: {
    oid: 'student-oid-alice',
    name: 'Alice Chen',
    role: 'student',
    email: 'alice.chen@student.university.edu',
    title: 'Student Candidate',
  },
}

// Generates a mock HS256 / Base64 JWT token for local testing and offline viva presentations
function createMockJWT(user) {
  if (!user) return ''
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const isBackendIssuer = user.role === 'issuer'
  const payload = {
    oid: user.oid,
    sub: user.oid,
    name: user.name,
    email: user.email,
    roles: [isBackendIssuer ? 'Issuer' : 'Student'],
    role: isBackendIssuer ? 'Issuer' : 'Student',
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
  const sigPart = 'mock-signature-for-development-and-viva'

  return `${headPart}.${payloadPart}.${sigPart}`
}

export function AuthProvider({ children }) {
  // Unauthenticated by default for clean institutional landing page
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('credenviel_user')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // ignore
      }
    }
    return null
  })

  const [token, setToken] = useState(() => {
    const savedTok = localStorage.getItem('credenviel_token')
    if (savedTok) return savedTok
    const saved = localStorage.getItem('credenviel_user')
    if (saved) {
      try {
        return createMockJWT(JSON.parse(saved))
      } catch {}
    }
    return ''
  })

  const [authMode, setAuthMode] = useState(() => {
    return localStorage.getItem('credenviel_user') ? 'college_account' : 'guest'
  })

  useEffect(() => {
    if (user) {
      localStorage.setItem('credenviel_user', JSON.stringify(user))
      const tok = createMockJWT(user)
      setToken(tok)
      localStorage.setItem('credenviel_token', tok)
    } else {
      localStorage.removeItem('credenviel_user')
      localStorage.removeItem('credenviel_token')
      setToken('')
    }
  }, [user])

  // Real College Account login and registration
  const login = ({ name, email, role }) => {
    const cleanEmail = (email || '').toLowerCase().trim()
    const cleanName = (name || '').trim() || cleanEmail.split('@')[0] || 'Campus User'
    const normalizedRole = (role || 'student').toLowerCase() === 'issuer' ? 'issuer' : 'student'

    const titles = {
      student: 'Student Candidate',
      issuer: 'Exam Cell Staff & Issuer',
    }

    const newUser = {
      oid: cleanEmail,
      name: cleanName,
      email: cleanEmail,
      role: normalizedRole,
      title: titles[normalizedRole] || 'Campus User',
    }
    setUser(newUser)
    const tok = createMockJWT(newUser)
    setToken(tok)
    setAuthMode('college_account')
    return newUser
  }

  const logout = () => {
    localStorage.removeItem('credenviel_user')
    localStorage.removeItem('credenviel_token')
    setUser(null)
    setToken('')
    setAuthMode('guest')
  }

  // Fast persona switcher for testing and viva presentation
  const switchDemoUser = (roleKey) => {
    const selected = DEMO_USERS[roleKey] || DEMO_USERS.issuer
    setUser(selected)
    const tok = createMockJWT(selected)
    setToken(tok)
    setAuthMode('demo')
    return selected
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
        login,
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
