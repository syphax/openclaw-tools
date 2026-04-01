import type { TimerStatus, Session, ProjectReport } from './types.ts'

const BASE = '/api'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
  return data as T
}

export async function getStatus(): Promise<TimerStatus> {
  return json('/pomo/status')
}

export async function startPomo(opts: {
  task?: string
  project?: string
  work?: number
  rest?: number
  cycle?: number
}): Promise<{ ok: boolean; session: Session }> {
  return json('/pomo/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...opts, origin: 'web' }),
  })
}

export async function stopPomo(): Promise<{ ok: boolean; session: Session }> {
  return json('/pomo/stop', { method: 'POST' })
}

export async function pausePomo(): Promise<{ ok: boolean; session: Session }> {
  return json('/pomo/pause', { method: 'POST' })
}

export async function resumePomo(): Promise<{ ok: boolean; session: Session }> {
  return json('/pomo/resume', { method: 'POST' })
}

export async function extendPomo(minutes: number): Promise<{ ok: boolean; session: Session }> {
  return json('/pomo/extend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes }),
  })
}

export async function getRecentSessions(): Promise<Session[]> {
  return json('/sessions/recent')
}

export async function getReportByProject(start?: string, end?: string): Promise<ProjectReport[]> {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const qs = params.toString()
  return json(`/reports/by-project${qs ? `?${qs}` : ''}`)
}

export async function getProjects(): Promise<string[]> {
  return json('/projects')
}

export async function getDefaults(): Promise<{
  work_minutes: number
  cycle_minutes: number
  project: string
  task: string
}> {
  return json('/config/defaults')
}
