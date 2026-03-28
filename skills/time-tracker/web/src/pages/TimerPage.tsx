import { useState, useEffect, useCallback } from 'react'
import { getStatus, startPomo, stopPomo, extendPomo, getRecentSessions, getDefaults } from '../api/client.ts'
import type { TimerStatus, Session } from '../api/types.ts'

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function TimerPage() {
  const [status, setStatus] = useState<TimerStatus>({ active: false, session: null, phase: 'idle', remaining_seconds: 0 })
  const [history, setHistory] = useState<Session[]>([])
  const [error, setError] = useState('')

  // Form state
  const [task, setTask] = useState('')
  const [project, setProject] = useState('')
  const [work, setWork] = useState(25)
  const [cycle, setCycle] = useState(30)
  const [extendMin, setExtendMin] = useState(5)

  // Load defaults on mount
  useEffect(() => {
    getDefaults().then(d => {
      setTask(d.task)
      setProject(d.project)
      setWork(d.work_minutes)
      setCycle(d.cycle_minutes)
    }).catch(() => {})
  }, [])

  // Poll status
  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([getStatus(), getRecentSessions()])
      setStatus(s)
      setHistory(h)
    } catch {
      // server might be down
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, status.active ? 1000 : 5000)
    return () => clearInterval(interval)
  }, [status.active, refresh])

  const handleStart = async () => {
    setError('')
    try {
      await startPomo({ task, project, work, cycle })
      refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start')
    }
  }

  const handleStop = async () => {
    setError('')
    try {
      await stopPomo()
      refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to stop')
    }
  }

  const handleExtend = async () => {
    setError('')
    try {
      await extendPomo(extendMin)
      refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to extend')
    }
  }

  return (
    <div>
      {/* Timer display */}
      <div className="timer-display">
        {status.active && status.session ? (
          <>
            <div className="timer-phase">{status.phase === 'working' ? 'Working' : 'Resting'}</div>
            <div className={`timer-countdown ${status.phase}`}>
              {formatTime(status.remaining_seconds)}
            </div>
            <div className="timer-task">{status.session.task}</div>
            <div className="timer-project">{status.session.project}</div>
            <div className="timer-times">
              <span>Started: {formatTimestamp(status.session.started_at)}</span>
              <span>Work ends: {formatTimestamp(status.session.work_end_at)}</span>
              <span>Cycle ends: {formatTimestamp(status.session.cycle_end_at)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="timer-phase">Idle</div>
            <div className="timer-countdown idle">00:00</div>
          </>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {/* Controls */}
      {status.active ? (
        <div className="action-bar">
          <button className="btn btn-stop" onClick={handleStop}>Stop</button>
          {status.phase === 'working' && (
            <>
              <input
                type="number"
                className="extend-input"
                value={extendMin}
                min={1}
                onChange={e => setExtendMin(Number(e.target.value))}
              />
              <button className="btn btn-extend" onClick={handleExtend}>Extend</button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="start-form">
            <div className="form-group">
              <label>Task</label>
              <input value={task} onChange={e => setTask(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Project</label>
              <input value={project} onChange={e => setProject(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Work (min)</label>
              <input type="number" value={work} min={1} onChange={e => setWork(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Cycle (min)</label>
              <input type="number" value={cycle} min={1} onChange={e => setCycle(Number(e.target.value))} />
            </div>
            <div className="full-width" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              <button className="btn btn-start" onClick={handleStart}>Start</button>
            </div>
          </div>
        </>
      )}

      {/* Recent sessions */}
      {history.length > 0 && (
        <div className="history">
          <h2>Recent Sessions</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Task</th>
                <th>Project</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map(s => (
                <tr key={s.id}>
                  <td>{formatDate(s.started_at)} {formatTimestamp(s.started_at)}</td>
                  <td>{s.task}</td>
                  <td>{s.project}</td>
                  <td>{s.work_minutes}m</td>
                  <td><span className={`status-badge ${s.status}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
