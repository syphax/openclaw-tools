import { Router } from 'express';
import { startTimer, stopTimer, extendTimer, getStatus } from './timer.js';
import { getRecentSessions, getWorkTimeByProject } from './db.js';
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
        work = config.defaults.work_minutes,
        cycle = config.defaults.cycle_minutes,
        origin = 'web',
      } = req.body || {};

      const session = await startTimer(task, project, work, cycle, origin);
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
        { flag: '-c <minutes>', description: `Cycle time in minutes (default: ${config.defaults.cycle_minutes})` },
        { flag: '-s',           description: 'Stop the active timer' },
        { flag: '-e <minutes>', description: 'Extend work time by N minutes (rest period stays the same)' },
        { flag: '-h',           description: 'Show this help' },
      ],
      examples: [
        'pomo                              — start with defaults (25m work / 5m rest)',
        'pomo -t "write tests" -p openclaw — start a named task under a project',
        'pomo -w 45 -c 55                  — custom 45m work / 10m rest',
        'pomo -e 10                        — extend current work phase by 10 minutes',
        'pomo -s                           — stop the active timer',
      ],
      web_ui: `http://localhost:${config.port}`,
    });
  });

  return router;
}
