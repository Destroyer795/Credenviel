import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth'

const env = import.meta.env

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyBWo2LDtob1yRjZ2yMwCKD1VapWQDJ6oB4',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'credenviel.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'credenviel',
  appId: env.VITE_FIREBASE_APP_ID || '1:562746294362:web:fd30ac3f5a41d8ae1f1863',
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)

export const firebaseAuth = isFirebaseConfigured ? getAuth(initializeApp(firebaseConfig)) : null

// Local development against the Firebase Auth Emulator (never active in production builds).
const emulatorHost = env.DEV ? env.VITE_FIREBASE_AUTH_EMULATOR_HOST : ''
if (firebaseAuth && emulatorHost) {
  connectAuthEmulator(firebaseAuth, `http://${emulatorHost}`, { disableWarnings: true })
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
