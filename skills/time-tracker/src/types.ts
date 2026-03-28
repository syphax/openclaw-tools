export interface Session {
  id: number;
  task: string;
  project: string;
  started_at: string;       // ISO timestamp
  work_end_at: string;      // ISO timestamp
  cycle_end_at: string;     // ISO timestamp
  stopped_at: string | null;
  status: 'working' | 'resting' | 'completed' | 'stopped';
  origin: string;           // 'web' | 'telegram' | 'whatsapp' | 'cli'
  work_minutes: number;
  cycle_minutes: number;
}

export interface TimerStatus {
  active: boolean;
  session: Session | null;
  phase: 'working' | 'resting' | 'idle';
  remaining_seconds: number;  // seconds until current phase ends
}

export interface Config {
  defaults: {
    work_minutes: number;
    cycle_minutes: number;
    project: string;
    task: string;
  };
  port: number;
  phoneWhatsapp: string;
  telegramChatId: string;
}

export interface ProjectReport {
  project: string;
  total_work_minutes: number;
}
