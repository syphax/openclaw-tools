import { Router } from 'express';
import { startTimer, stopTimer, pauseTimer, resumeTimer, extendTimer, getStatus } from './timer.js';
import { getRecentSessions, getWorkTimeByProject, getDistinctProjects, insertManualSession, deleteProject } from './db.js';
import type { Config } from './types.js';
import fs from 'fs';
import path from 'path';

const cfgPath = path.join(import.meta.dirname, '..', 'cfg', 'time-tracker-config.json');
const config: Config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));

export function createRouter(): Router {
  const router = Router();

  // Start a timer
  router.post('/pomo/start', async (req, res) => {
    try {
      const {
        task = config.defaults.task,
        project = config.defaults.project,
        origin = 'web',
      } = req.body || {};

      const hasWork  = req.body?.work  != null;
      const hasRest  = req.body?.rest  != null;
      const hasCycle = req.body?.cycle != null;

      let work:  number;
      let cycle: number;

      if (hasWork && hasRest && hasCycle) {
        // All three given — only valid if work + rest == cycle
        work = req.body.work;
        const rest = req.body.rest;
        cycle = req.body.cycle;
        if (work + rest !== cycle) {
          res.status(400).json({ ok: false, error: `Conflicting flags: work (${work}) + rest (${rest}) != cycle (${cycle})` });
          return;
        }
      } else if (hasWork && hasRest) {
        work = req.body.work;
        cycle = work + req.body.rest;
      } else if (hasRest && hasCycle) {
        cycle = req.body.cycle;
        work = cycle - req.body.rest;
        if (work <= 0) {
          res.status(400).json({ ok: false, error: `Rest (${req.body.rest}) must be less than cycle (${cycle})` });
          return;
        }
      } else if (hasWork && hasCycle) {
        work = req.body.work;
        cycle = req.body.cycle;
      } else if (hasWork) {
        work = req.body.work;
        cycle = work + (config.defaults.cycle_minutes - config.defaults.work_minutes);
      } else if (hasRest) {
        work = config.defaults.work_minutes;
        cycle = work + req.body.rest;
      } else if (hasCycle) {
        work = config.defaults.work_minutes;
        cycle = req.body.cycle;
      } else {
        work = config.defaults.work_minutes;
        cycle = config.defaults.cycle_minutes;
      }

      const back = req.body?.back ?? 0;
      const session = await startTimer(task, project, work, cycle, origin, back);
      res.json({ ok: true, session });
    } catch (err: any) {
      res.status(409).json({ ok: false, error: err.message });
    }
  });

  // Stop the active timer
  router.post('/pomo/stop', async (_req, res) => {
    try {
      const session = await stopTimer();
      res.json({ ok: true, session });
    } catch (err: any) {
      res.status(409).json({ ok: false, error: err.message });
    }
  });

  // Pause the active timer
  router.post('/pomo/pause', async (_req, res) => {
    try {
      const session = await pauseTimer();
      res.json({ ok: true, session });
    } catch (err: any) {
      res.status(409).json({ ok: false, error: err.message });
    }
  });

  // Resume the paused timer
  router.post('/pomo/resume', async (_req, res) => {
    try {
      const session = await resumeTimer();
      res.json({ ok: true, session });
    } catch (err: any) {
      res.status(409).json({ ok: false, error: err.message });
    }
  });

  // Extend the active timer
  router.post('/pomo/extend', async (req, res) => {
    try {
      const { minutes } = req.body || {};
      if (!minutes || minutes <= 0) {
        res.status(400).json({ ok: false, error: 'minutes must be a positive number' });
        return;
      }
      const session = await extendTimer(minutes);
      res.json({ ok: true, session });
    } catch (err: any) {
      res.status(409).json({ ok: false, error: err.message });
    }
  });

  // Get current timer status
  router.get('/pomo/status', (_req, res) => {
    res.json(getStatus());
  });

  // Get recent sessions
  router.get('/sessions/recent', async (_req, res) => {
    const sessions = await getRecentSessions(10);
    res.json(sessions);
  });

  // Get work time by project
  router.get('/reports/by-project', async (req, res) => {
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const report = await getWorkTimeByProject(start, end);
    res.json(report);
  });

  // Get distinct projects for dropdown
  router.get('/projects', async (_req, res) => {
    const projects = await getDistinctProjects();
    res.json(projects);
  });

  // Add a manual (past) session
  router.post('/sessions/manual', async (req, res) => {
    try {
      const {
        task = config.defaults.task,
        project = config.defaults.project,
        date,
        work = config.defaults.work_minutes,
        cycle,
      } = req.body || {};

      if (!date) {
        res.status(400).json({ ok: false, error: 'date is required (YYYY-MM-DD)' });
        return;
      }

      const cycleMinutes = cycle ?? work + (config.defaults.cycle_minutes - config.defaults.work_minutes);
      const id = await insertManualSession(task, project, date, work, cycleMinutes);
      res.json({ ok: true, id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Delete a project (reassign sessions to "General")
  router.delete('/projects/:name', async (req, res) => {
    try {
      const projectName = decodeURIComponent(req.params.name);
      if (projectName === 'General') {
        res.status(400).json({ ok: false, error: 'Cannot delete the General project' });
        return;
      }
      const updated = await deleteProject(projectName);
      res.json({ ok: true, updated });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Get config defaults (for frontend form pre-fill)
  router.get('/config/defaults', (_req, res) => {
    res.json(config.defaults);
  });

  // Help
  router.get('/pomo/help', (_req, res) => {
    res.json({
      usage: 'pomo [options]',
      commands: [
        { flag: '-t <task>',    description: `Task name (default: "${config.defaults.task}")` },
        { flag: '-p <project>', description: `Project name (default: "${config.defaults.project}")` },
        { flag: '-w <minutes>', description: `Work time in minutes (default: ${config.defaults.work_minutes})` },
        { flag: '-r <minutes>', description: 'Rest time in minutes (alternative to -c)' },
        { flag: '-c <minutes>', description: `Cycle time in minutes (default: ${config.defaults.cycle_minutes})` },
        { flag: '-b <minutes>', description: 'Back-date start time by N minutes (timer counts remaining)' },
        { flag: '-s',           description: 'Stop the active timer (records actual work time)' },
        { flag: '-e <minutes>', description: 'Extend work time by N minutes (rest period stays the same)' },
        { flag: '-h',           description: 'Show this help' },
      ],
      examples: [
        'pomo                              — start with defaults (25m work / 5m rest)',
        'pomo -t "write tests" -p openclaw — start a named task under a project',
        'pomo -w 45 -c 55                  — custom 45m work / 10m rest',
        'pomo -w 25 -r 5                   — 25m work / 5m rest (cycle = 30m)',
        'pomo -r 10 -c 40                  — 30m work / 10m rest (work = cycle - rest)',
        'pomo -b 5 -w 20                   — started 5m ago, 15m remaining',
        'pomo -e 10                        — extend current work phase by 10 minutes',
        'pomo -s                           — stop the active timer',
      ],
      web_ui: `http://localhost:${config.port}`,
    });
  });

  return router;
}
