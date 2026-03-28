#!/usr/bin/env npx tsx
/**
 * Gmail Auth Preflight Check
 *
 * Validates Gmail authentication before attempting digest delivery.
 * Returns exit code 0 if auth is valid, 1 if invalid.
 *
 * Usage:
 *   npx tsx gmail-auth-check.ts
 *   GOG_KEYRING_PASSWORD=xxx GOG_KEYRING_BACKEND=file npx tsx gmail-auth-check.ts
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function readCredentialsEnv(): string {
  try {
    const p = path.join(process.env.HOME || '', '.openclaw/credentials/.env');
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

function readEnvVarFromText(content: string, key: string): string | undefined {
  const re = new RegExp(`^${key}=(.*)$`, 'm');
  const m = content.match(re);
  return m?.[1]?.trim();
}

const credentialsEnv = readCredentialsEnv();
const RESOLVED_GOG_KEYRING_PASSWORD =
  process.env.GOG_KEYRING_PASSWORD || readEnvVarFromText(credentialsEnv, 'GOG_KEYRING_PASSWORD');
const RESOLVED_GOG_KEYRING_BACKEND =
  process.env.GOG_KEYRING_BACKEND || readEnvVarFromText(credentialsEnv, 'GOG_KEYRING_BACKEND') || 'file';

// Load addresses config
const addressCfgPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'cfg', 'addresses.json');
const addressCfg = JSON.parse(fs.readFileSync(addressCfgPath, 'utf-8'));

function checkGmailAuth(): { ok: boolean; error?: string; stderr?: string } {
  if (!RESOLVED_GOG_KEYRING_PASSWORD) {
    return { ok: false, error: 'Missing GOG_KEYRING_PASSWORD in env/credentials.' };
  }

  console.log('🔐 Checking Gmail authentication...');

  // Use 'gog gmail labels list' as a lightweight auth check
  const gog = spawnSync(
    'gog',
    [
      'gmail',
      'labels',
      'list',
      '--account',
      addressCfg.emailFrom,
      '--no-input',
    ],
    {
      env: {
        ...process.env,
        GOG_KEYRING_BACKEND: RESOLVED_GOG_KEYRING_BACKEND,
        GOG_KEYRING_PASSWORD: RESOLVED_GOG_KEYRING_PASSWORD,
      },
    },
  );

  const stderr = gog.stderr?.toString() || '';
  const stdout = gog.stdout?.toString() || '';

  if (gog.status !== 0) {
    const errorMsg = stderr || `gog gmail labels failed (exit ${gog.status})`;

    // Check for specific auth errors
    if (/invalid_grant|expired or revoked|expired|revoked/i.test(stderr)) {
      console.error('❌ Gmail auth has expired or been revoked.');
      console.error('   Run: ~/.openclaw/workspace/scripts/gog-reauth-helper.sh --print-auth-url');
      return { ok: false, error: 'Gmail auth expired/revoked', stderr };
    }

    console.error('❌ Gmail auth check failed:', errorMsg);
    return { ok: false, error: errorMsg, stderr };
  }

  console.log('✅ Gmail authentication is valid.');
  return { ok: true };
}

// Run check if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkGmailAuth();
  process.exit(result.ok ? 0 : 1);
}

export { checkGmailAuth };
