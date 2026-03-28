import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Config } from './types.js';

const cfgPath = path.join(import.meta.dirname, '..', 'cfg', 'time-tracker-config.json');
const config: Config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));

export function sendNotification(message: string, origin: string): void {
  console.log(`📤 Notification [${origin}]: ${message}`);

  if (origin === 'whatsapp' || origin === 'all') {
    runOpenclawMessage('whatsapp', config.phoneWhatsapp, message);
  }
  if (origin === 'telegram' || origin === 'all') {
    runOpenclawMessage('telegram', config.telegramChatId, message);
  }
  // Web UI picks up status changes via polling — no push needed
}

function runOpenclawMessage(channel: 'whatsapp' | 'telegram', target: string, body: string): void {
  console.log(`  📤 openclaw message send --channel ${channel} --target ${target.slice(0, 6)}... (${body.length} chars)`);

  const oc = spawnSync(
    'openclaw',
    ['message', 'send', '--channel', channel, '--target', target, '--message', body],
    { env: process.env },
  );

  if (oc.status !== 0) {
    console.error(`  ❌ openclaw message send failed (exit ${oc.status}): ${oc.stderr?.toString()}`);
  }
}
