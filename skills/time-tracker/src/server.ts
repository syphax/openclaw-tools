import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { initDb } from './db.js';
import { createRouter } from './router.js';
import { restoreTimers } from './timer.js';
import type { Config } from './types.js';

const cfgPath = path.join(import.meta.dirname, '..', 'cfg', 'time-tracker-config.json');
const config: Config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
const PORT = config.port || 3100;

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', createRouter());

// Serve built React frontend
const publicDir = path.join(import.meta.dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

async function main() {
  await initDb();
  await restoreTimers();

  app.listen(PORT, () => {
    console.log(`🍅 Time tracker running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('Failed to start time tracker:', err);
  process.exit(1);
});
