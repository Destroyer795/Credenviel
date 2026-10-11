import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut,
} from 'firebase/auth'
import { firebaseAuth, googleProvider, isFirebaseConfigured } from './firebaseConfig'
import { getCurrentUser, getApiBaseUrl, setTokenProvider, ApiError } from '../api/client'

const AuthContext = createContext(null)

const TITLES = {
  student: 'Student Candidate',
  issuer: 'Exam Cell Staff & Issuer',
}

const ERROR_MESSAGES = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/missing-password': 'Please enter your password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact your administrator.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  'auth/popup-blocked': 'The sign-in popup was blocked by your browser. Allow popups and try again.',
  'auth/internal-error':
    'Sign-in hit an unexpected error. Please try again; if it persists, allow popups and turn off content blockers (e.g. Brave Shields) for this site.',
  'auth/unauthorized-domain': 'This domain is not authorized for sign-in. Add it in the Firebase console.',
}

export function describeAuthError(err) {
  if (err?.code && ERROR_MESSAGES[err.code]) return ERROR_MESSAGES[err.code]
  if (err instanceof TypeError || /failed to fetch|networkerror/i.test(err?.message || '')) {
    return `The server (${getApiBaseUrl()}) is unreachable right now. Please check your connection and retry.`
  }
  if (err instanceof ApiError) return err.message
  return err?.message || 'Authentication failed. Please try again.'
}

function requireAuth() {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured. Set the VITE_FIREBASE_* variables (see frontend/.env.example).')
  }
  return firebaseAuth
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState('')
  // True until Firebase has restored (or ruled out) a persisted session
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [sessionError, setSessionError] = useState('')
  const latestRun = useRef(0)
  // While true, the token listener ignores sign-in events: explicit sign-ins sync once themselves,
  // so they can report a failed profile check back to the sign-in form.
  const explicitAuth = useRef(false)

  // The API client asks for a fresh token per request; Firebase refreshes it when near expiry.
  useEffect(() => {
    setTokenProvider(async () => (firebaseAuth?.currentUser ? firebaseAuth.currentUser.getIdToken() : ''))
    return () => setTokenProvider(null)
  }, [])

  // Verifies the Firebase session with the API and publishes the resulting profile.
  const syncSession = useCallback(async (fbUser) => {
    const run = ++latestRun.current
    if (!fbUser) {
      setUser(null)
      setToken('')
      setSessionError('')
      setLoading(false)
      return { ok: true }
    }

    try {
      const idToken = await fbUser.getIdToken()
      // The backend verifies the token and decides the role; the client never picks it.
      const profile = await getCurrentUser(idToken)
      if (run !== latestRun.current) return { ok: true }
      setToken(idToken)
      setUser({
        uid: fbUser.uid,
        name: profile.name || fbUser.displayName || fbUser.email || 'Campus User',
        email: fbUser.email || '',
        emailVerified: fbUser.emailVerified,
        role: profile.role,
        title: TITLES[profile.role] || 'Campus User',
      })
      setSessionError('')
      return { ok: true }
    } catch (err) {
      if (run !== latestRun.current) return { ok: true }
      const message = describeAuthError(err)
      setUser(null)
      setToken('')
      setSessionError(message)
      // A rejected token means the session is unusable; a network failure may recover on retry.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        signOut(firebaseAuth).catch(() => {})
      }
      return { ok: false, message }
    } finally {
      if (run === latestRun.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!firebaseAuth) return undefined
    return onIdTokenChanged(firebaseAuth, (fbUser) => {
      if (explicitAuth.current && fbUser) return
      syncSession(fbUser)
    })
  }, [syncSession])

  // Runs a Firebase sign-in, then verifies the session with the API exactly once.
  // Throws (so the form can show the reason and re-enable itself) if either step fails.
  const runExplicitAuth = useCallback(
    async (action) => {
      explicitAuth.current = true
      try {
        const fbUser = await action()
        explicitAuth.current = false
        const result = await syncSession(fbUser)
        if (!result.ok) throw new Error(result.message)
      } finally {
        explicitAuth.current = false
      }
    },
    [syncSession],
  )

  const signInWithEmail = useCallback(
    (email, password) =>
      runExplicitAuth(async () => (await signInWithEmailAndPassword(requireAuth(), email.trim(), password)).user),
    [runExplicitAuth],
  )

  const signUpWithEmail = useCallback(
    ({ name, email, password }) =>
      runExplicitAuth(async () => {
        const cred = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password)
        await updateProfile(cred.user, { displayName: name.trim() })
        sendEmailVerification(cred.user).catch(() => {})
        // Force a token refresh so the saved display name is in the token the API sees
        await cred.user.getIdToken(true)
        return cred.user
      }),
    [runExplicitAuth],
  )

  const signInWithGoogle = useCallback(
    () => runExplicitAuth(async () => (await signInWithPopup(requireAuth(), googleProvider)).user),
    [runExplicitAuth],
  )

  const resetPassword = useCallback(async (email) => {
    await sendPasswordResetEmail(requireAuth(), email.trim())
  }, [])

  // Re-reads the Firebase account and forces a new ID token, so changes made elsewhere
  // (email verified via the emailed link, a role claim granted by an admin) take effect.
  const refreshSession = useCallback(async () => {
    const current = firebaseAuth?.currentUser
    if (!current) return
    await current.reload()
    await current.getIdToken(true)
    await syncSession(current)
  }, [syncSession])

  // Re-attempts the API handshake for a Firebase session that is still signed in
  // (e.g. after the API was briefly unreachable).
  const retrySession = useCallback(async () => {
    setLoading(true)
    await syncSession(firebaseAuth?.currentUser || null)
  }, [syncSession])

  const resendVerification = useCallback(async () => {
    if (firebaseAuth?.currentUser) await sendEmailVerification(firebaseAuth.currentUser)
  }, [])

  const logout = useCallback(async () => {
    if (firebaseAuth) await signOut(firebaseAuth)
  }, [])

  const isStudent = user?.role === 'student'
  const isIssuer = user?.role === 'issuer'
  const isAuthenticated = Boolean(user)

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        sessionError,
        isStudent,
        isIssuer,
        isAuthenticated,
        isFirebaseConfigured,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        resetPassword,
        refreshSession,
        retrySession,
        resendVerification,
        logout,
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
