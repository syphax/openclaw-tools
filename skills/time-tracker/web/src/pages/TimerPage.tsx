import { useState, useEffect, useCallback, useRef } from 'react'
import { getStatus, startPomo, stopPomo, pausePomo, resumePomo, extendPomo, getRecentSessions, getDefaults, getProjects } from '../api/client.ts'
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

function playPing() {
  try {
    const ctx = new AudioContext()
    // Two-tone ping
    for (const [freq, start] of [[880, 0], [1100, 0.15]] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + 0.3)
    }
  } catch {
    // AudioContext not available
  }
}

function showNotification(title: string, body: string) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body })
  }
}

export default function TimerPage() {
  const [status, setStatus] = useState<TimerStatus>({ active: false, session: null, phase: 'idle', remaining_seconds: 0 })
  const [history, setHistory] = useState<Session[]>([])
  const [error, setError] = useState('')

  // Form state
  const [task, setTask] = useState('')
  const [project, setProject] = useState('')
  const [projects, setProjects] = useState<string[]>([])
  const [showNewProject, setShowNewProject] = useState(false)
  const [work, setWork] = useState(25)
  const [rest, setRest] = useState(5)
  const [extendMin, setExtendMin] = useState(5)

  // Track previous phase to detect transitions
  const prevPhase = useRef(status.phase)
  useEffect(() => {
    const prev = prevPhase.current
    const curr = status.phase
    prevPhase.current = curr

    if (prev === 'working' && curr === 'resting') {
      playPing()
      showNotification('Time\'s up!', 'Take a break.')
    } else if (prev === 'resting' && curr === 'idle') {
      playPing()
      showNotification('Cycle complete!', 'Start working!')
    }
  }, [status.phase])

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Load defaults and projects on mount
  useEffect(() => {
    getDefaults().then(d => {
      setTask(d.task)
      setProject(d.project)
      setWork(d.work_minutes)
      setRest(d.cycle_minutes - d.work_minutes)
    }).catch(() => {})
    getProjects().then(setProjects).catch(() => {})
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
      await startPomo({ task, project, work, rest })
      setShowNewProject(false)
      getProjects().then(setProjects).catch(() => {})
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

  const handlePause = async () => {
    setError('')
    try {
      await pausePomo()
      refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to pause')
    }
  }

  const handleResume = async () => {
    setError('')
    try {
      await resumePomo()
      refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to resume')
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
            <div className="timer-phase">
              {status.phase === 'working' ? 'Working' : status.phase === 'paused' ? 'Paused' : 'Resting'}
            </div>
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
          {status.phase === 'paused' ? (
            <button className="btn btn-start" onClick={handleResume}>Resume</button>
          ) : (
            <button className="btn btn-pause" onClick={handlePause}>Pause</button>
          )}
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
              {showNewProject ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    value={project}
                    onChange={e => setProject(e.target.value)}
                    placeholder="New project name"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-extend"
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => { setShowNewProject(false); setProject(projects[0] ?? '') }}
                  >Cancel</button>
                </div>
              ) : (
                <select
                  value={project}
                  onChange={e => {
                    if (e.target.value === '__new__') {
                      setShowNewProject(true)
                      setProject('')
                    } else {
                      setProject(e.target.value)
                    }
                  }}
                >
                  {projects.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  <option value="__new__">+ New Project</option>
                </select>
              )}
            </div>
            <div className="form-group">
              <label>Work (min)</label>
              <input type="number" value={work} min={1} onChange={e => setWork(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Rest (min)</label>
              <input type="number" value={rest} min={1} onChange={e => setRest(Number(e.target.value))} />
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
