import { useState, useEffect } from 'react'
import { getReportByProject } from '../api/client.ts'
import type { ProjectReport } from '../api/types.ts'

function thisMonthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function ReportPage() {
  const [start, setStart] = useState(thisMonthStart)
  const [end, setEnd] = useState(today)
  const [data, setData] = useState<ProjectReport[]>([])

  useEffect(() => {
    getReportByProject(start, end).then(setData).catch(() => setData([]))
  }, [start, end])

  const total = data.reduce((sum, r) => sum + r.total_work_minutes, 0)

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Work Time by Project</h2>

      <div className="report-filters">
        <label>From</label>
        <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        <label>To</label>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
      </div>

      {data.length === 0 ? (
        <p style={{ color: '#666' }}>No sessions in this date range.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th style={{ textAlign: 'right' }}>Work Time</th>
                <th style={{ textAlign: 'right' }}>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.project}>
                  <td>{r.project}</td>
                  <td style={{ textAlign: 'right' }}>{formatMinutes(r.total_work_minutes)}</td>
                  <td style={{ textAlign: 'right' }}>{r.session_count}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid #444' }}>
                <td>Total</td>
                <td style={{ textAlign: 'right' }}>{formatMinutes(total)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
