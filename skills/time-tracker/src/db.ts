import { Database } from 'duckdb-async';
import fs from 'fs';
import path from 'path';
import type { Session, ProjectReport } from './types.js';

const DB_DIR = path.join(process.env.HOME || '~', '.openclaw', 'data', 'time-tracker');
const DB_PATH = path.join(DB_DIR, 'pomodoro.duckdb');

let db: Database;

export async function initDb(): Promise<void> {
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = await Database.create(DB_PATH);

  await db.run(`
    CREATE SEQUENCE IF NOT EXISTS session_seq START 1
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id              INTEGER PRIMARY KEY DEFAULT nextval('session_seq'),
      task            VARCHAR NOT NULL,
      project         VARCHAR NOT NULL,
      started_at      TIMESTAMP NOT NULL,
      work_end_at     TIMESTAMP NOT NULL,
      cycle_end_at    TIMESTAMP NOT NULL,
      stopped_at      TIMESTAMP,
      status          VARCHAR NOT NULL,
      origin          VARCHAR NOT NULL,
      work_minutes    INTEGER NOT NULL,
      cycle_minutes   INTEGER NOT NULL
    )
  `);
}

export async function insertSession(session: Omit<Session, 'id' | 'stopped_at'>): Promise<number> {
  const result = await db.all(`
    INSERT INTO sessions (task, project, started_at, work_end_at, cycle_end_at, status, origin, work_minutes, cycle_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, session.task, session.project, session.started_at, session.work_end_at, session.cycle_end_at,
     session.status, session.origin, session.work_minutes, session.cycle_minutes);
  return (result[0] as any).id;
}

export async function updateSession(id: number, updates: Partial<Session>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id') continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return;
  values.push(id);
  await db.run(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, ...values);
}

export async function getActiveSession(): Promise<Session | null> {
  const rows = await db.all(`
    SELECT * FROM sessions
    WHERE status IN ('working', 'resting')
    ORDER BY started_at DESC
    LIMIT 1
  `);
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

export async function getRecentSessions(limit: number = 10): Promise<Session[]> {
  const rows = await db.all(`
    SELECT * FROM sessions
    ORDER BY started_at DESC
    LIMIT ?
  `, limit);
  return rows.map(mapRow);
}

export async function getWorkTimeByProject(startDate?: string, endDate?: string): Promise<ProjectReport[]> {
  let query = `
    SELECT project,
           SUM(work_minutes) as total_work_minutes
    FROM sessions
    WHERE status IN ('completed', 'stopped', 'resting')
  `;
  const params: any[] = [];

  if (startDate) {
    query += ` AND started_at >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND started_at <= ?`;
    params.push(endDate);
  }

  query += ` GROUP BY project ORDER BY total_work_minutes DESC`;

  const rows = await db.all(query, ...params);
  return rows.map(r => ({
    project: (r as any).project,
    total_work_minutes: (r as any).total_work_minutes,
  }));
}

function mapRow(row: any): Session {
  return {
    id: row.id,
    task: row.task,
    project: row.project,
    started_at: row.started_at,
    work_end_at: row.work_end_at,
    cycle_end_at: row.cycle_end_at,
    stopped_at: row.stopped_at,
    status: row.status,
    origin: row.origin,
    work_minutes: row.work_minutes,
    cycle_minutes: row.cycle_minutes,
  };
}
