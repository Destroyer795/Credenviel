import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { Home } from './pages/Home'
import { StudentPortal } from './pages/StudentPortal'
import { IssuerPortal } from './pages/IssuerPortal'
import { ReviewScreen } from './pages/ReviewScreen'
import { VerificationPage } from './pages/VerificationPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import './style.css'

function Layout({ children }) {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/student"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <StudentPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/issuer"
              element={
                <ProtectedRoute allowedRoles={['issuer']}>
                  <IssuerPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/issuer/review"
              element={
                <ProtectedRoute allowedRoles={['issuer']}>
                  <ReviewScreen />
                </ProtectedRoute>
              }
            />
            <Route path="/verify" element={<VerificationPage />} />
            <Route path="/verify/:id" element={<VerificationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
