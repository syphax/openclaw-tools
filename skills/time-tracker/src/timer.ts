import { insertSession, updateSession, getActiveSession } from './db.js';
import { sendNotification } from './notify.js';
import type { Session, TimerStatus } from './types.js';

let currentSession: Session | null = null;
let workTimer: ReturnType<typeof setTimeout> | null = null;
let cycleTimer: ReturnType<typeof setTimeout> | null = null;

export async function startTimer(
  task: string,
  project: string,
  workMinutes: number,
  cycleMinutes: number,
  origin: string,
): Promise<Session> {
  if (currentSession) {
    throw new Error('A timer is already active. Stop it first with pomo -s.');
  }

  const now = new Date();
  const workEnd = new Date(now.getTime() + workMinutes * 60_000);
  const cycleEnd = new Date(now.getTime() + cycleMinutes * 60_000);

  const sessionData = {
    task,
    project,
    started_at: now.toISOString(),
    work_end_at: workEnd.toISOString(),
    cycle_end_at: cycleEnd.toISOString(),
    status: 'working' as const,
    origin,
    work_minutes: workMinutes,
    cycle_minutes: cycleMinutes,
  };

  const id = await insertSession(sessionData);
  currentSession = { id, stopped_at: null, ...sessionData };

  armTimers();
  console.log(`⏱️  Timer started: "${task}" [${project}] — ${workMinutes}m work / ${cycleMinutes - workMinutes}m rest`);
  return currentSession;
}

export async function stopTimer(): Promise<Session> {
  if (!currentSession) {
    throw new Error('No active timer to stop.');
  }

  clearTimers();
  const now = new Date().toISOString();
  currentSession.stopped_at = now;
  currentSession.status = 'stopped';
  await updateSession(currentSession.id, { stopped_at: now, status: 'stopped' });

  const stopped = currentSession;
  currentSession = null;
  console.log(`⏹️  Timer stopped: "${stopped.task}"`);
  return stopped;
}

export async function extendTimer(minutes: number): Promise<Session> {
  if (!currentSession) {
    throw new Error('No active timer to extend.');
  }
  if (currentSession.status !== 'working') {
    throw new Error('Can only extend during the work phase.');
  }

  const extendMs = minutes * 60_000;
  const newWorkEnd = new Date(new Date(currentSession.work_end_at).getTime() + extendMs);
  const newCycleEnd = new Date(new Date(currentSession.cycle_end_at).getTime() + extendMs);

  currentSession.work_end_at = newWorkEnd.toISOString();
  currentSession.cycle_end_at = newCycleEnd.toISOString();
  currentSession.work_minutes += minutes;
  currentSession.cycle_minutes += minutes;

  await updateSession(currentSession.id, {
    work_end_at: currentSession.work_end_at,
    cycle_end_at: currentSession.cycle_end_at,
    work_minutes: currentSession.work_minutes,
    cycle_minutes: currentSession.cycle_minutes,
  });

  clearTimers();
  armTimers();
  console.log(`⏱️  Timer extended by ${minutes}m — new work end: ${currentSession.work_end_at}`);
  return currentSession;
}

export function getStatus(): TimerStatus {
  if (!currentSession) {
    return { active: false, session: null, phase: 'idle', remaining_seconds: 0 };
  }

  const now = Date.now();
  const workEnd = new Date(currentSession.work_end_at).getTime();
  const cycleEnd = new Date(currentSession.cycle_end_at).getTime();

  if (currentSession.status === 'working') {
    return {
      active: true,
      session: currentSession,
      phase: 'working',
      remaining_seconds: Math.max(0, Math.round((workEnd - now) / 1000)),
    };
  }

  // resting
  return {
    active: true,
    session: currentSession,
    phase: 'resting',
    remaining_seconds: Math.max(0, Math.round((cycleEnd - now) / 1000)),
  };
}

export async function restoreTimers(): Promise<void> {
  const session = await getActiveSession();
  if (!session) return;

  const now = Date.now();
  const workEnd = new Date(session.work_end_at).getTime();
  const cycleEnd = new Date(session.cycle_end_at).getTime();

  if (cycleEnd <= now) {
    // Cycle already passed while server was down — mark completed silently
    await updateSession(session.id, { status: 'completed' });
    console.log(`⏹️  Recovered expired session "${session.task}" — marked completed`);
    return;
  }

  if (workEnd <= now) {
    // Work ended but rest hasn't — resume in resting phase
    session.status = 'resting';
    await updateSession(session.id, { status: 'resting' });
  }

  currentSession = session;
  armTimers();
  console.log(`🔄 Restored active session: "${session.task}" [${session.status}]`);
}

function armTimers(): void {
  if (!currentSession) return;

  const now = Date.now();
  const workEnd = new Date(currentSession.work_end_at).getTime();
  const cycleEnd = new Date(currentSession.cycle_end_at).getTime();

  if (currentSession.status === 'working' && workEnd > now) {
    workTimer = setTimeout(() => onWorkEnd(), workEnd - now);
  }

  if (cycleEnd > now) {
    cycleTimer = setTimeout(() => onCycleEnd(), cycleEnd - now);
  }
}

function clearTimers(): void {
  if (workTimer) { clearTimeout(workTimer); workTimer = null; }
  if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
}

async function onWorkEnd(): Promise<void> {
  if (!currentSession) return;
  workTimer = null;

  currentSession.status = 'resting';
  await updateSession(currentSession.id, { status: 'resting' });

  const restMinutes = currentSession.cycle_minutes - currentSession.work_minutes;
  sendNotification(
    `⏰ Time's up! Take a ${restMinutes}-minute break. (${currentSession.task} — ${currentSession.project})`,
    currentSession.origin,
  );
  console.log(`☕ Work phase ended for "${currentSession.task}" — resting`);
}

async function onCycleEnd(): Promise<void> {
  if (!currentSession) return;
  cycleTimer = null;

  currentSession.status = 'completed';
  await updateSession(currentSession.id, { status: 'completed' });

  sendNotification(
    `🔔 Cycle complete! Start working! (${currentSession.task} — ${currentSession.project})`,
    currentSession.origin,
  );
  console.log(`✅ Cycle complete for "${currentSession.task}"`);
  currentSession = null;
}
