export interface Session {
  id: number
  task: string
  project: string
  started_at: string
  work_end_at: string
  cycle_end_at: string
  stopped_at: string | null
  status: 'working' | 'resting' | 'completed' | 'stopped'
  origin: string
  work_minutes: number
  cycle_minutes: number
}

export interface TimerStatus {
  active: boolean
  session: Session | null
  phase: 'working' | 'resting' | 'idle'
  remaining_seconds: number
}

export interface ProjectReport {
  project: string
  total_work_minutes: number
}
