import { Routes, Route, Link } from 'react-router-dom'
import TimerPage from './pages/TimerPage.tsx'
import ReportPage from './pages/ReportPage.tsx'

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" className="nav-link">Timer</Link>
        <Link to="/report" className="nav-link">Reports</Link>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<TimerPage />} />
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </main>
    </div>
  )
}
