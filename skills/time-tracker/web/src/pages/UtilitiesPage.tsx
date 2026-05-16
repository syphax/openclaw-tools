import { useState, useEffect } from 'react'
import { getProjects, getDefaults, addManualSession, deleteProject } from '../api/client.ts'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export default function UtilitiesPage() {
  const [projects, setProjects] = useState<string[]>([])
  const [defaults, setDefaults] = useState({ task: 'Unspecified', project: 'General', work_minutes: 25, cycle_minutes: 30 })

  // Manual entry form
  const [manualDate, setManualDate] = useState(todayStr)
  const [manualTask, setManualTask] = useState('')
  const [manualProject, setManualProject] = useState('')
  const [manualWork, setManualWork] = useState(25)
  const [manualRest, setManualRest] = useState(5)
  const [manualMsg, setManualMsg] = useState('')
  const [manualErr, setManualErr] = useState('')

  // Delete project
  const [deleteTarget, setDeleteTarget] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState('')
  const [deleteErr, setDeleteErr] = useState('')

  useEffect(() => {
    getDefaults().then(d => {
      setDefaults(d)
      setManualTask(d.task)
      setManualProject(d.project)
      setManualWork(d.work_minutes)
      setManualRest(d.cycle_minutes - d.work_minutes)
    }).catch(() => {})
    refreshProjects()
  }, [])

  function refreshProjects() {
    getProjects().then(p => {
      setProjects(p)
      setDeleteTarget(prev => {
        if (prev && p.includes(prev)) return prev
        const nonGeneral = p.filter(x => x !== 'General')
        return nonGeneral[0] ?? ''
      })
    }).catch(() => {})
  }

  const handleManualSubmit = async () => {
    setManualMsg('')
    setManualErr('')
    try {
      const cycle = manualWork + manualRest
      await addManualSession({
        task: manualTask || defaults.task,
        project: manualProject || defaults.project,
        date: manualDate,
        work: manualWork,
        cycle,
      })
      setManualMsg(`Session added for ${manualDate}`)
      refreshProjects()
    } catch (e: unknown) {
      setManualErr(e instanceof Error ? e.message : 'Failed to add session')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleteMsg('')
    setDeleteErr('')
    try {
      const result = await deleteProject(deleteTarget)
      setDeleteMsg(`Deleted "${deleteTarget}" — ${result.updated} session(s) moved to General`)
      setConfirmDelete(false)
      setDeleteTarget('')
      refreshProjects()
    } catch (e: unknown) {
      setDeleteErr(e instanceof Error ? e.message : 'Failed to delete project')
      setConfirmDelete(false)
    }
  }

  const deletableProjects = projects.filter(p => p !== 'General')

  return (
    <div>
      {/* Manual Time Entry */}
      <h2 style={{ marginBottom: '1.5rem' }}>Add Past Session</h2>
      <div className="start-form">
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={manualDate} max={todayStr()} onChange={e => setManualDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Task</label>
          <input value={manualTask} onChange={e => setManualTask(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Project</label>
          <select
            value={manualProject}
            onChange={e => setManualProject(e.target.value)}
          >
            {projects.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Work (min)</label>
          <input type="number" value={manualWork} min={1} onChange={e => setManualWork(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label>Rest (min)</label>
          <input type="number" value={manualRest} min={0} onChange={e => setManualRest(Number(e.target.value))} />
        </div>
        <div className="full-width" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <button className="btn btn-start" onClick={handleManualSubmit}>Add Session</button>
        </div>
      </div>
      {manualMsg && <div className="success">{manualMsg}</div>}
      {manualErr && <div className="error">{manualErr}</div>}

      {/* Delete Project */}
      <h2 style={{ marginTop: '3rem', marginBottom: '1.5rem' }}>Delete Project</h2>
      {deletableProjects.length === 0 ? (
        <p style={{ color: '#666' }}>No projects to delete (only "General" exists).</p>
      ) : (
        <div className="start-form">
          <div className="form-group">
            <label>Project</label>
            <select
              value={deleteTarget}
              onChange={e => { setDeleteTarget(e.target.value); setConfirmDelete(false) }}
            >
              {deletableProjects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="full-width" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            {confirmDelete ? (
              <div>
                <p style={{ color: '#e74c3c', marginBottom: '0.5rem' }}>
                  Are you sure? All sessions under "{deleteTarget}" will be moved to "General".
                </p>
                <button className="btn btn-stop" onClick={handleDelete}>Yes, Delete</button>
                <button className="btn btn-extend" style={{ marginLeft: '0.5rem' }} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-stop" onClick={handleDelete}>Delete Project</button>
            )}
          </div>
        </div>
      )}
      {deleteMsg && <div className="success">{deleteMsg}</div>}
      {deleteErr && <div className="error">{deleteErr}</div>}
    </div>
  )
}
