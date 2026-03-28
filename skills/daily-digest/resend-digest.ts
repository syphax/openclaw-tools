#!/usr/bin/env npx tsx
/**
 * Manual Digest Resend Utility
 *
 * Resends a digest from preserved artifacts when delivery failed.
 *
 * Usage:
 *   npx tsx resend-digest.ts 2026-03-25
 *   npx tsx resend-digest.ts 2026-03-25 --channel email
 *   npx tsx resend-digest.ts 2026-03-25 --channel whatsapp
 *   npx tsx resend-digest.ts 2026-03-25 --channel telegram
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

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

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const addressCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'cfg', 'addresses.json'), 'utf-8'));

interface ResendResult {
  channel: string;
  ok: boolean;
  error?: string;
}

function resendEmail(date: string, artifactsDir: string): ResendResult {
  const emailArtifactPath = path.join(artifactsDir, `email-${date}.html`);

  if (!fs.existsSync(emailArtifactPath)) {
    return { channel: 'email', ok: false, error: `Email artifact not found: ${emailArtifactPath}` };
  }

  if (!RESOLVED_GOG_KEYRING_PASSWORD) {
    return { channel: 'email', ok: false, error: 'Missing GOG_KEYRING_PASSWORD in env/credentials.' };
  }

  const emailBody = fs.readFileSync(emailArtifactPath, 'utf-8');
  const emailSubject = `🦖 Rex Daily Brief: ${date}`;

  console.log(`📧 Resending email for ${date}...`);

  const gog = spawnSync(
    'gog',
    [
      'gmail',
      'send',
      '--account',
      addressCfg.emailFrom,
      '--to',
      addressCfg.emailTo,
      '--subject',
      emailSubject,
      '--body-html',
      emailBody,
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

  if (gog.status === 0) {
    console.log('✅ Email sent successfully.');
    return { channel: 'email', ok: true };
  } else {
    const error = gog.stderr?.toString() || `gog gmail send failed (exit ${gog.status})`;
    console.error('❌ Email delivery failed:', error);
    return { channel: 'email', ok: false, error };
  }
}

function resendWhatsApp(date: string, artifactsDir: string): ResendResult {
  const whatsappArtifactPath = path.join(artifactsDir, `whatsapp-${date}.txt`);

  if (!fs.existsSync(whatsappArtifactPath)) {
    return { channel: 'whatsapp', ok: false, error: `WhatsApp artifact not found: ${whatsappArtifactPath}` };
  }

  const whatsappBody = fs.readFileSync(whatsappArtifactPath, 'utf-8');

  console.log(`📱 Resending WhatsApp message for ${date}...`);

  const oc = spawnSync(
    'openclaw',
    ['message', 'send', '--channel', 'whatsapp', '--target', addressCfg.phoneWhatsapp, '--message', whatsappBody],
    { env: process.env },
  );

  if (oc.status === 0) {
    console.log('✅ WhatsApp message sent successfully.');
    return { channel: 'whatsapp', ok: true };
  } else {
    const error = oc.stderr?.toString() || `openclaw message send failed (exit ${oc.status})`;
    console.error('❌ WhatsApp delivery failed:', error);
    return { channel: 'whatsapp', ok: false, error };
  }
}

function resendTelegram(date: string, artifactsDir: string): ResendResult {
  const telegramArtifactPath = path.join(artifactsDir, `telegram-${date}.txt`);

  if (!fs.existsSync(telegramArtifactPath)) {
    return { channel: 'telegram', ok: false, error: `Telegram artifact not found: ${telegramArtifactPath}` };
  }

  const telegramBody = fs.readFileSync(telegramArtifactPath, 'utf-8');

  console.log(`📱 Resending Telegram message for ${date}...`);

  // Handle Telegram 4096-char limit
  const TELEGRAM_LIMIT = 4096;
  if (telegramBody.length <= TELEGRAM_LIMIT) {
    const oc = spawnSync(
      'openclaw',
      ['message', 'send', '--channel', 'telegram', '--target', addressCfg.telegramChatId, '--message', telegramBody],
      { env: process.env },
    );

    if (oc.status === 0) {
      console.log('✅ Telegram message sent successfully.');
      return { channel: 'telegram', ok: true };
    } else {
      const error = oc.stderr?.toString() || `openclaw message send failed (exit ${oc.status})`;
      console.error('❌ Telegram delivery failed:', error);
      return { channel: 'telegram', ok: false, error };
    }
  } else {
    console.log(`  📏 Telegram body ${telegramBody.length} chars > ${TELEGRAM_LIMIT} limit, sending in chunks...`);
    const sections = telegramBody.split('\n\n———\n\n');
    const chunks: string[] = [];
    let current = '';

    for (const section of sections) {
      const candidate = current ? current + '\n\n———\n\n' + section : section;
      if (candidate.length > TELEGRAM_LIMIT && current) {
        chunks.push(current);
        current = section;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);

    for (let i = 0; i < chunks.length; i++) {
      const oc = spawnSync(
        'openclaw',
        ['message', 'send', '--channel', 'telegram', '--target', addressCfg.telegramChatId, '--message', chunks[i]],
        { env: process.env },
      );

      if (oc.status !== 0) {
        const error = oc.stderr?.toString() || `openclaw message send failed on chunk ${i + 1} (exit ${oc.status})`;
        console.error('❌ Telegram delivery failed:', error);
        return { channel: 'telegram', ok: false, error };
      }
    }

    console.log(`✅ Telegram message sent successfully in ${chunks.length} chunks.`);
    return { channel: 'telegram', ok: true };
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npx tsx resend-digest.ts <date> [--channel <email|whatsapp|telegram>]');
    console.error('Example: npx tsx resend-digest.ts 2026-03-25');
    console.error('Example: npx tsx resend-digest.ts 2026-03-25 --channel email');
    process.exit(1);
  }

  const date = args[0];
  const channelIndex = args.indexOf('--channel');
  const specificChannel = channelIndex !== -1 ? args[channelIndex + 1] : null;

  const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
  const artifactsDir = path.join(outputDir, 'rendered-artifacts');

  if (!fs.existsSync(artifactsDir)) {
    console.error(`❌ Artifacts directory not found: ${artifactsDir}`);
    process.exit(1);
  }

  console.log(`🔄 Resending digest for ${date}...`);
  console.log(`📁 Using artifacts from: ${artifactsDir}`);

  const results: ResendResult[] = [];

  if (!specificChannel || specificChannel === 'email') {
    results.push(resendEmail(date, artifactsDir));
  }

  if (!specificChannel || specificChannel === 'whatsapp') {
    results.push(resendWhatsApp(date, artifactsDir));
  }

  if (!specificChannel || specificChannel === 'telegram') {
    results.push(resendTelegram(date, artifactsDir));
  }

  console.log('\n📊 Resend Summary:');
  for (const result of results) {
    console.log(`   ${result.ok ? '✅' : '❌'} ${result.channel}: ${result.ok ? 'success' : result.error}`);
  }

  const allSucceeded = results.every(r => r.ok);
  const anySucceeded = results.some(r => r.ok);

  if (allSucceeded) {
    console.log('\n✅ All channels resent successfully.');
    process.exit(0);
  } else if (anySucceeded) {
    console.warn('\n⚠️  Partial resend — some channels failed.');
    process.exit(0);
  } else {
    console.error('\n❌ All channels failed to resend.');
    process.exit(1);
  }
}

main();
