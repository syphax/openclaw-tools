import { insertSession, updateSession, getActiveSession } from './db.js';
import { sendNotification } from './notify.js';
import type { Session, TimerStatus } from './types.js';

let currentSession: Session | null = null;
let workTimer: ReturnType<typeof setTimeout> | null = null;
let cycleTimer: ReturnType<typeof setTimeout> | null = null;
let pausedAt: number | null = null;         // timestamp when paused
let statusBeforePause: string | null = null; // 'working' or 'resting'

/** Round an ISO timestamp to the second (strip milliseconds). */
function toSecond(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function startTimer(
  task: string,
  project: string,
  workMinutes: number,
  cycleMinutes: number,
  origin: string,
  backMinutes: number = 0,
): Promise<Session> {
  if (currentSession) {
    throw new Error('A timer is already active. Stop it first with pomo -s.');
  }

  if (backMinutes >= workMinutes) {
    throw new Error(`Back time (${backMinutes}m) must be less than work time (${workMinutes}m).`);
  }

  const start = new Date(Date.now() - backMinutes * 60_000);
  const workEnd = new Date(start.getTime() + workMinutes * 60_000);
  const cycleEnd = new Date(start.getTime() + cycleMinutes * 60_000);

  const sessionData = {
    task,
    project,
    started_at: toSecond(start),
    work_end_at: toSecond(workEnd),
    cycle_end_at: toSecond(cycleEnd),
    status: 'working' as const,
    origin,
    work_minutes: workMinutes,
    cycle_minutes: cycleMinutes,
  };

  const id = await insertSession(sessionData);
  currentSession = { id, stopped_at: null, ...sessionData };
  pausedAt = null;
  statusBeforePause = null;

  armTimers();
  console.log(`⏱️  Timer started: "${task}" [${project}] — ${workMinutes}m work / ${cycleMinutes - workMinutes}m rest`);
  return currentSession;
}

export async function stopTimer(): Promise<Session> {
  if (!currentSession) {
    throw new Error('No active timer to stop.');
  }

  clearTimers();
  const nowDate = new Date();
  const now = toSecond(nowDate);

  // If paused, treat the effective status as what it was before pausing
  const effectiveStatus = currentSession.status === 'paused' ? statusBeforePause : currentSession.status;

  if (effectiveStatus === 'resting') {
    // Stopping during rest = completed (just skipping/shortening the break)
    currentSession.stopped_at = now;
    currentSession.status = 'completed';

    await updateSession(currentSession.id, {
      stopped_at: now,
      status: 'completed',
    });
  } else {
    // Stopping during work = record actual work time
    const startedAt = new Date(currentSession.started_at).getTime();
    const actualWorkMs = nowDate.getTime() - startedAt;
    const actualWorkMinutes = Math.round(actualWorkMs / 60_000);

    currentSession.stopped_at = now;
    currentSession.work_end_at = now;
    currentSession.work_minutes = actualWorkMinutes;
    currentSession.status = 'stopped';

    await updateSession(currentSession.id, {
      stopped_at: now,
      work_end_at: now,
      work_minutes: actualWorkMinutes,
      status: 'stopped',
    });
  }

  const stopped = currentSession;
  currentSession = null;
  pausedAt = null;
  statusBeforePause = null;
  console.log(`⏹️  Timer stopped: "${stopped.task}"`);
  return stopped;
}

export async function pauseTimer(): Promise<Session> {
  if (!currentSession) {
    throw new Error('No active timer to pause.');
  }
  if (currentSession.status === 'paused') {
    throw new Error('Timer is already paused.');
  }

  clearTimers();
  pausedAt = Date.now();
  statusBeforePause = currentSession.status;
  currentSession.status = 'paused';
  await updateSession(currentSession.id, { status: 'paused' });

  console.log(`⏸️  Timer paused: "${currentSession.task}"`);
  return currentSession;
}

export async function resumeTimer(): Promise<Session> {
  if (!currentSession) {
    throw new Error('No active timer to resume.');
  }
  if (currentSession.status !== 'paused' || pausedAt === null || statusBeforePause === null) {
    throw new Error('Timer is not paused.');
  }

  // Shift end times forward by the pause duration
  const pauseDuration = Date.now() - pausedAt;
  const newWorkEnd = new Date(new Date(currentSession.work_end_at).getTime() + pauseDuration);
  const newCycleEnd = new Date(new Date(currentSession.cycle_end_at).getTime() + pauseDuration);

  currentSession.work_end_at = toSecond(newWorkEnd);
  currentSession.cycle_end_at = toSecond(newCycleEnd);
  currentSession.status = statusBeforePause as Session['status'];

  await updateSession(currentSession.id, {
    work_end_at: currentSession.work_end_at,
    cycle_end_at: currentSession.cycle_end_at,
    status: currentSession.status,
  });

  pausedAt = null;
  statusBeforePause = null;
  armTimers();

  console.log(`▶️  Timer resumed: "${currentSession.task}" — work ends ${currentSession.work_end_at}`);
  return currentSession;
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

  currentSession.work_end_at = toSecond(newWorkEnd);
  currentSession.cycle_end_at = toSecond(newCycleEnd);
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

  if (currentSession.status === 'paused') {
    // Show remaining time frozen at the moment of pause
    const workEnd = new Date(currentSession.work_end_at).getTime();
    const cycleEnd = new Date(currentSession.cycle_end_at).getTime();
    const frozenAt = pausedAt ?? Date.now();

    if (statusBeforePause === 'working') {
      return {
        active: true,
        session: currentSession,
        phase: 'paused',
        remaining_seconds: Math.max(0, Math.round((workEnd - frozenAt) / 1000)),
      };
    }
    return {
      active: true,
      session: currentSession,
      phase: 'paused',
      remaining_seconds: Math.max(0, Math.round((cycleEnd - frozenAt) / 1000)),
    };
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

  if (session.status === 'paused') {
    // Stay paused — user needs to resume manually
    currentSession = session;
    // We don't know exactly when it was paused, so freeze at now
    pausedAt = now;
    statusBeforePause = workEnd > now ? 'working' : 'resting';
    console.log(`🔄 Restored paused session: "${session.task}"`);
    return;
  }

  if (cycleEnd <= now) {
    await updateSession(session.id, { status: 'completed' });
    console.log(`⏹️  Recovered expired session "${session.task}" — marked completed`);
    return;
  }

  if (workEnd <= now) {
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
