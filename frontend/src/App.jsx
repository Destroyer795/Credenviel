import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

function Layout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link> |{' '}
        <Link to="/issuer">Issuer Dashboard</Link> |{' '}
        <Link to="/student">Student Dashboard</Link> |{' '}
        <Link to="/issuer/review">Review</Link> |{' '}
        <Link to="/verify/example-id">Verify</Link>
      </nav>
      <hr />
    </div>
  )
}

function Home() {
  return (
    <div>
      <Layout />
      <h1>Certificate Digitization & Verification Pipeline</h1>
      <p>Login to get started.</p>
    </div>
  )
}

function IssuerDashboard() {
  return (
    <div>
      <Layout />
      <h1>Issuer Dashboard</h1>
      <p>Bulk upload, view all jobs, resolve needs_review flags.</p>
    </div>
  )
}

function StudentDashboard() {
  return (
    <div>
      <Layout />
      <h1>Student Dashboard</h1>
      <p>Upload own documents, view own job status.</p>
    </div>
  )
}

function ReviewScreen() {
  return (
    <div>
      <Layout />
      <h1>Review Screen</h1>
      <p>Resolve needs_review flags and confirm student uploads.</p>
    </div>
  )
}

function VerificationPage() {
  return (
    <div>
      <h1>Public Verification</h1>
      <p>Verify a certificate by its public verification ID.</p>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/issuer" element={<IssuerDashboard />} />
        <Route path="/issuer/review" element={<ReviewScreen />} />
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/verify/:id" element={<VerificationPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
